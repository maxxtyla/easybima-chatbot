// Mirrors the pattern in lib/api.ts. The staff_token auth cookie is
// httpOnly and set by the backend on login — credentials: 'include' is
// what actually sends it on each request, there's no token handling here.
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api`;

export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  ticket_number: string;
  session_id: string;
  channel: 'web' | 'whatsapp';
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  category: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  priority_score: number;
  source: string;
  assigned_to: string | null;
  assigned_agent_name: string | null;
  branch_name: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  sub: string;
  email: string;
  role: 'agent' | 'supervisor' | 'admin';
  fullName: string;
}

export interface ReplySnippet {
  id: string;
  role: string;
  content: string;
}

export interface TicketMessage {
  id?: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: { replyTo?: ReplySnippet } | null;
}

export interface TicketEvent {
  id: string;
  actor_type: string;
  actor_name: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

async function staffFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  if (response.status === 401) {
    const error = new Error('Not authenticated') as Error & { status?: number };
    error.status = 401;
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function login(email: string, password: string): Promise<{ agent: Agent }> {
  return staffFetch('/staff/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await staffFetch('/staff/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<{ agent: Agent }> {
  return staffFetch('/staff/auth/me');
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: string;
  assignedTo?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

export async function listTickets(filters: TicketFilters = {}): Promise<{ tickets: Ticket[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return staffFetch(`/staff/tickets${query ? `?${query}` : ''}`);
}

export async function getTicket(id: string): Promise<{ ticket: Ticket }> {
  return staffFetch(`/staff/tickets/${id}`);
}

export async function getTicketMessages(id: string): Promise<{ messages: TicketMessage[]; source: 'live' | 'snapshot' }> {
  return staffFetch(`/staff/tickets/${id}/messages`);
}

export async function getTicketEvents(id: string): Promise<{ events: TicketEvent[] }> {
  return staffFetch(`/staff/tickets/${id}/events`);
}

export async function updateTicketStatus(id: string, status: TicketStatus): Promise<{ ticket: Ticket }> {
  return staffFetch(`/staff/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function updateTicketPriority(id: string, priority: TicketPriority): Promise<{ ticket: Ticket }> {
  return staffFetch(`/staff/tickets/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority }) });
}

export async function assignTicket(id: string, agentId: string): Promise<{ ticket: Ticket }> {
  return staffFetch(`/staff/tickets/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ agentId }) });
}

// Self-service accept: the signed-in agent takes this ticket for
// themselves. Must happen before sendTicketMessage will succeed — the
// backend enforces this too (see ticketService.sendAgentMessage's guard).
export async function acceptTicket(id: string): Promise<{ ticket: Ticket }> {
  return staffFetch(`/staff/tickets/${id}/accept`, { method: 'PATCH' });
}

export async function addTicketNote(id: string, note: string): Promise<{ success: boolean }> {
  return staffFetch(`/staff/tickets/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) });
}

export async function sendTicketMessage(
  id: string,
  content: string,
  replyToMessageId?: string
): Promise<{ message: TicketMessage; ticket: Ticket; deliveryWarning?: string }> {
  return staffFetch(`/staff/tickets/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, ...(replyToMessageId ? { replyToMessageId } : {}) }),
  });
}

export interface AgentStats {
  open: number;
  pending: number;
  closed: number;
  total: number;
}

export async function getMyStats(): Promise<{ stats: AgentStats }> {
  return staffFetch('/staff/tickets/stats/me');
}