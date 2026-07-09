-- Migration: staff ticketing feature (agents, tickets, ticket_events)
-- Run with: npm run db:migrate:ticketing  (see package.json script added below)
--
-- Assumes update_updated_at_column() already exists in the DB — it's
-- referenced by the existing conversations/faq_entries triggers in the
-- base schema, so this just reuses it rather than redefining it.

BEGIN;

CREATE TYPE ticket_status AS ENUM (
    'open', 'assigned', 'in_progress', 'pending_customer', 'resolved', 'closed'
);
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ── agents ──────────────────────────────────────────────────────────────
CREATE TABLE public.agents (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    staff_no varchar(50) NOT NULL,
    full_name varchar(150) NOT NULL,
    email varchar(150) NOT NULL,
    password_hash text NOT NULL,
    department varchar(100),
    branch_id uuid REFERENCES public.branches(id),
    role varchar(20) NOT NULL DEFAULT 'agent',
    is_active bool DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT agents_pkey PRIMARY KEY (id),
    CONSTRAINT agents_staff_no_key UNIQUE (staff_no),
    CONSTRAINT agents_email_key UNIQUE (email),
    CONSTRAINT agents_role_check CHECK (role IN ('agent', 'supervisor', 'admin'))
);

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON public.agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── tickets ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START WITH 1;

CREATE TABLE public.tickets (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    ticket_number varchar(20),
    session_id varchar(64) NOT NULL REFERENCES public.conversations(session_id),
    channel varchar(20) NOT NULL,
    customer_name varchar(150),
    customer_phone varchar(30),
    customer_email varchar(150),
    category varchar(50),
    subject text NOT NULL,
    status ticket_status NOT NULL DEFAULT 'open',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    priority_score int NOT NULL DEFAULT 0,
    source varchar(30) NOT NULL,
    assigned_to uuid REFERENCES public.agents(id),
    branch_id uuid REFERENCES public.branches(id),
    sla_due_at timestamptz,
    resolved_at timestamptz,
    -- Safety copy of the transcript at creation time (see note in
    -- chatEngine.js patch) — messages.session_id cascade-deletes on
    -- expiry/end-chat, so this survives that even if a ticket is open.
    transcript_snapshot jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT tickets_pkey PRIMARY KEY (id),
    CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number)
);

CREATE INDEX idx_tickets_status_priority ON public.tickets (status, priority, created_at);
CREATE INDEX idx_tickets_assigned ON public.tickets (assigned_to);
CREATE INDEX idx_tickets_session ON public.tickets (session_id);
CREATE INDEX idx_tickets_sla_due ON public.tickets (sla_due_at) WHERE status NOT IN ('resolved', 'closed');

CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS trigger AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := 'TCK-' || LPAD(nextval('public.ticket_number_seq')::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tickets_ticket_number
    BEFORE INSERT ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── ticket_events (append-only audit trail) ────────────────────────────
CREATE TABLE public.ticket_events (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    actor_type varchar(20) NOT NULL,
    actor_id uuid REFERENCES public.agents(id),
    event_type varchar(30) NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT ticket_events_pkey PRIMARY KEY (id),
    CONSTRAINT ticket_events_actor_type_check CHECK (actor_type IN ('system', 'agent', 'customer'))
);

CREATE INDEX idx_ticket_events_ticket ON public.ticket_events (ticket_id, created_at);

COMMIT;
