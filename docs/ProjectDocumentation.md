# EasyBima Chatbot & Ticketing Service — Codebase Documentation

**Project:** `easybima-chatbot-ticketingservice`
**Owner:** CIC Insurance Group ("Bima" AI assistant)
**Stack:** Node.js/Express backend · PostgreSQL · Next.js 15 (React 19) frontend · OpenRouter (Claude models) · Twilio WhatsApp

This document explains what the system does, how its pieces fit together, and
what every source file is responsible for. It is meant for a developer who is
new to the repository and needs to get productive quickly, and for anyone
maintaining or extending the chatbot/ticketing pipeline.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack & Key Dependencies](#3-tech-stack--key-dependencies)
4. [Database Schema](#4-database-schema)
5. [Backend — File by File](#5-backend--file-by-file)
6. [Frontend — File by File](#6-frontend--file-by-file)
7. [Environment Variables](#7-environment-variables)
8. [Running the Project Locally](#8-running-the-project-locally)
9. [API Reference (Summary)](#9-api-reference-summary)
10. [Testing](#10-testing)
11. [Known Design Decisions & Gotchas](#11-known-design-decisions--gotchas)

---

## 1. What This System Does

**EasyBima** is an AI customer-support system for CIC Insurance Group built
around a chatbot persona called **"Bima."** It has three connected parts:

1. **A web chat widget** embedded on the CIC marketing site (Next.js) where
   customers ask insurance questions and get AI-generated answers grounded in
   CIC's own product/FAQ/branch data (Retrieval-Augmented Generation, "RAG").
2. **A WhatsApp channel** (via Twilio) that runs the *exact same* AI pipeline,
   so a customer gets identical answers whether they use the website widget
   or WhatsApp.
3. **A staff ticketing dashboard** where CIC customer-care agents pick up
   conversations that the bot has escalated (angry customers, explicit
   requests for a human, complex claims, etc.), reply to customers in real
   time, and track tickets through a status/priority workflow with SLAs.

The unifying idea: **one pipeline, many channels.** `backend/services/chatEngine.js`
is the single place that does session handling, RAG retrieval, and calls the
LLM. Both `chatControllerV2.js` (web) and `whatsappController.js` (WhatsApp)
are thin adapters around it, so the two channels can never drift apart in
behavior.

---

## 2. High-Level Architecture

```
                        ┌────────────────────────┐
                        │   Next.js Frontend      │
                        │  (chat widget + staff   │
                        │   ticket dashboard)     │
                        └───────────┬─────────────┘
                                    │ REST/JSON (fetch)
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│                        Express Backend (Node.js)                    │
│                                                                       │
│  routes/*.js  ──▶  controllers/*.js  ──▶  services/*.js             │
│                                                                       │
│  • chatV2.js        chatControllerV2.js     chatEngine.js (core)    │
│  • whatsapp.js       whatsappController.js  claudeService.js        │
│  • tickets.js        ticketController.js    policyService.js        │
│  • staffAuth.js      agentAuthController.js ticketService.js        │
│                                              sessionManager.js       │
│                                              conversationService.js  │
│                                              priorityService.js      │
│                                              agentAuthService.js     │
│                                              whatsappService.js      │
└──────────────┬───────────────────────────────────────┬──────────────┘
               │                                        │
               ▼                                        ▼
      ┌────────────────┐                       ┌──────────────────┐
      │  PostgreSQL     │                       │  OpenRouter API   │
      │  (config/       │                       │  (Claude models,  │
      │   database.js)  │                       │   via claudeService)│
      └────────────────┘                       └──────────────────┘
               ▲
               │
      ┌────────┴─────────┐
      │  Twilio WhatsApp   │  (inbound webhook + outbound REST send)
      └────────────────────┘
```

**Request flow for a single chat turn (web or WhatsApp):**

1. Controller receives the raw message → calls `chatEngine.processMessage()`.
2. `chatEngine` validates/creates the session (`sessionManager.js`), loads
   history, logs the inbound message (`conversationService.js`).
3. It checks whether the session has already been **handed off** to a human
   agent (`ticketService.isSessionHandedOff` / `hasOpenTicket`) — if so, the
   bot stays silent.
4. It checks **escalation triggers** and **sentiment** (`claudeService.js`).
   If escalation is needed, a support **ticket** is created
   (`ticketService.createTicket`, prioritized by `priorityService.js`).
5. Otherwise, it classifies **intent** (`utils/IntentRouter.js`) to decide
   which knowledge tables are worth querying, retrieves and ranks context
   (`policyService.js` + `utils/rankResults.js`), and calls the LLM
   (`claudeService.js` → OpenRouter → Claude).
6. The reply is sanitized (`utils/sanitizeResponse.js`) to guarantee no
   internal model "reasoning" ever reaches the customer, then persisted and
   returned.
7. The controller formats the result for its transport (JSON for web, TwiML
   + Twilio REST send for WhatsApp).

Staff replies from the ticket dashboard flow the other way: an agent's
message is saved via `ticketService.sendAgentMessage`, and for WhatsApp
tickets it's pushed out immediately over Twilio's REST API
(`whatsappService.sendWhatsAppMessage`); for the web widget, the customer's
browser picks it up by polling `GET /api/chat/conversation/:sessionId`.

---

## 3. Tech Stack & Key Dependencies

### Backend (`/backend`)
| Package | Purpose |
|---|---|
| `express` | HTTP server / routing |
| `pg` | PostgreSQL client (connection pooling) |
| `helmet`, `cors`, `express-rate-limit` | Security headers, CORS, rate limiting |
| `jsonwebtoken`, `bcryptjs` | Staff authentication (JWT + password hashing) |
| `twilio` | WhatsApp webhook validation, TwiML replies, outbound REST sends |
| `validator` | Input validation helpers |
| `dotenv`, `cookie-parser` | Env loading, cookie parsing |
| `jest`, `supertest`, `nodemon` (dev) | Testing & local dev reload |

Note: `@anthropic-ai/sdk` is listed as a dependency but the actual LLM calls
in `claudeService.js` go through **OpenRouter's REST API** directly via
`fetch`, not the Anthropic SDK — OpenRouter lets the deployment swap models
(e.g. `anthropic/claude-3.5-sonnet` or a free model) via the
`OPENROUTER_MODEL` env var without a code change.

### Frontend (`/frontend`)
| Package | Purpose |
|---|---|
| `next` (v15), `react`/`react-dom` (v19) | App framework |
| `react-markdown`, `remark-gfm` | Rendering the bot's Markdown-formatted replies |
| `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge` | Styling |
| `typescript` | Type safety |

The frontend has **no state-management library** and **no websocket** —
real-time updates (agent replies, ticket status changes) are done via
short-interval polling (`setInterval` + `fetch`), which is simple and
sufficient at this scale.

---

## 4. Database Schema

PostgreSQL, `public` schema. Extension-generated UUID primary keys
(`uuid_generate_v4()` / `gen_random_uuid()`). The base schema is chatbot/RAG
data; the ticketing tables were added later by
`backend/database/migrations/2026_07_add_ticketing.sql`.

### Core chatbot tables

| Table | Purpose |
|---|---|
| `conversations` | One row per chat session (`session_id`). Tracks `messages` (legacy jsonb blob, largely superseded by the `messages` table), `metadata`, and `last_activity_at` — the field session expiry is computed from. Triggers auto-update `updated_at` and `last_activity_at`. |
| `messages` | The real, queryable message log. `role` ∈ `user, assistant, system, agent` (the `agent` role is what lets a human's replies live in the same transcript as the bot's). FK cascade-deletes when its parent `conversations` row is removed. |
| `analytics` | Free-form event log (`event_type` + jsonb `event_data`) — escalations, session expiry, ticket closes, errors, etc. Never blocks the main chat flow if a write fails. |
| `faq_entries` | Support/process Q&A ("how do I renew," "how do I claim"). Has a `priority` column and a GIN index on `keywords` for fast array-overlap search. |
| `insurance_products` | CIC's product catalog (category/sub_category/description/benefits + `keywords[]`). |
| `branches` | Physical branch offices — `city`, `region`, `address`, `phone`, plus a `keywords[]` array of aliases/landmarks used for fuzzy location search. |
| `company_knowledge` | General "about CIC" content (history, leadership, subsidiaries, sustainability, careers) tagged with `tags[]`. |

### Ticketing tables (added by the migration)

| Table | Purpose |
|---|---|
| `agents` | Staff accounts. `role` ∈ `agent, supervisor, admin`. `password_hash` is bcrypt. Unique on `email` and `staff_no`. |
| `tickets` | The support ticket itself. `status` (`ticket_status` enum: `open, assigned, in_progress, pending_customer, resolved, closed`), `priority` (`ticket_priority` enum: `low, medium, high, urgent`), `priority_score` (numeric, from `priorityService.js`), `sla_due_at`, `transcript_snapshot` (jsonb copy of the conversation at creation time — survives even if the live `messages` rows are later deleted by session expiry), `human_handled` flag, `channel` (`web`/`whatsapp`). `ticket_number` is a human-friendly `TCK-000123` string generated from the `ticket_number_seq` sequence (either by the `set_ticket_number()` trigger or explicitly in `ticketService.createTicket`, as a defense against the trigger being missing in some environments). |
| `ticket_events` | Append-only audit trail for every ticket mutation (`created`, `assigned`, `accepted`, `status_changed`, `priority_changed`, `message_sent`, `note_added`, `closed_by_customer`, …). `actor_type` ∈ `system, agent, customer`. |

### Entity relationships

```
conversations 1───* messages
conversations 1───* tickets (via session_id)
agents        1───* tickets (assigned_to)
branches      1───* agents (branch_id)
branches      1───* tickets (branch_id)
tickets       1───* ticket_events
agents        1───* ticket_events (actor_id, nullable)
```

Key indexes worth knowing about:
- `idx_tickets_session_handoff (session_id, human_handled, status)` — backs
  the hot-path "has this session been handed to a human?" check that runs on
  every single inbound chat message.
- `idx_tickets_sla_due` — partial index (`WHERE status NOT IN ('resolved','closed')`)
  for the staff queue's SLA countdown sort.
- `idx_faq_keywords` / GIN indexes on the various `keywords`/`tags` arrays —
  back the `&&` (array overlap) queries in `policyService.js`.

---

## 5. Backend — File by File

### 5.1 Entry point & configuration

#### `backend/server.js`
The Express app bootstrap. Responsibilities, in order:
- Applies `helmet` (CSP locked to `'self'`), `cors` (env-driven allow-list —
  production only allows the CIC domains, dev allows `localhost:3000/5173`),
  JSON/urlencoded body parsing (10 MB limit), and `cookie-parser`.
- Exposes `GET /health` (no rate limiting) for uptime checks.
- Mounts routes with **layered rate limiting**: `/api/chat` gets its own
  lenient, session-keyed `chatRateLimiter` mounted *before* the generic
  `rateLimiter`; `/api/whatsapp`, `/api/staff/auth`, and
  `/api/staff/tickets` are mounted after. `/api/staff/tickets` specifically
  runs `requireAgent` (auth) *before* `staffRateLimiter`, so the limiter can
  key off the authenticated agent's id rather than a shared office IP (see
  the comment in `rateLimiter.js` for the bug this fixes).
- Registers a 404 handler and the global `errorHandler` middleware.
- Starts `sessionManager`'s periodic cleanup scheduler on boot and stops it
  on `SIGTERM` for graceful shutdown.

#### `backend/config/database.js`
Central PostgreSQL access point. Validates that `DB_HOST`, `DB_USER`,
`DB_NAME` are set (throws at startup otherwise — fails loudly rather than
mysteriously at first query). Exports:
- `pool` — a `pg.Pool` (max 20 connections) used directly by most services.
- `query(text, params)` — a logging wrapper around `pool.query` (logs the
  first 50 chars of SQL + duration + row count).
- `transaction(callback)` — `BEGIN`/`COMMIT`/`ROLLBACK` helper that hands the
  callback a checked-out client.
- `testConnection()` — a one-off connectivity check.

### 5.2 Prompts

#### `backend/prompts/systemPrompt.js`
The single large `SYSTEM_PROMPT` string sent to the LLM on every call. It
defines Bima's persona (warm, Kenyan-friendly, non-robotic), a strict
"DO / DO NOT" rule list (never invent prices, never guess, never say
"database"/"records"/"source," no Swahili, no markdown `**bold**`, never
leak internal reasoning), the human-escalation trigger list and scripted
escalation response, a "hallucination prevention" self-check the model is
asked to run before answering, two full worked examples (motor & family
medical insurance), and CIC's official contact details repeated at the end
for reinforcement (LLMs weight information near the start/end of a long
prompt more heavily — hence "front-loaded" and "reinforced at the end"
section headers in the file itself).

### 5.3 Middleware

#### `backend/middleware/validateInput.js`
Runs on `POST /api/chat` before the controller. Rejects missing/empty/too-long
(`>2000` chars) messages, blocks obvious `<script>`/`javascript:`/`on*=`
injection patterns, and validates `sessionId` as a UUID (silently nulling it
out if it isn't, rather than erroring — a malformed sessionId just becomes
"start a new session"). Important: it uses plain `.trim()`, **not**
`validator.escape()`, because HTML-escaping apostrophes/quotes would corrupt
the plain-text prompt sent to the LLM.

#### `backend/middleware/rateLimiter.js`
Defines five `express-rate-limit` instances, each tuned for a different
traffic shape:
- `rateLimiter` — strict, IP-keyed, 30 req/min, for generic public endpoints.
  Explicitly `skip`s any `/api/staff/*` path so staff traffic isn't
  double-counted against it.
- `chatRateLimiter` — lenient, **session-id-keyed** (falls back to IP), 100
  req/min, so a fast back-and-forth conversation never trips it. Skips
  `/api/whatsapp` (Twilio's shared IP pool would otherwise throttle every
  WhatsApp user together).
- `staffRateLimiter` — lenient, **agent-id-keyed**, 300 req/min (configurable
  via `STAFF_RATE_LIMIT_MAX`). Exists specifically because the staff
  dashboard polls its ticket queue every 30s and an open ticket's transcript
  every 5s, and multiple agents behind the same office NAT/IP were
  previously all sharing (and exhausting) one public-IP bucket.
- `strictRateLimiter` — 10 req/min, used on the login endpoint.
- `whatsappRateLimiter` — keyed by the sender's WhatsApp number (`From`),
  20 req/min by default, responds with plain text (not JSON) since Twilio
  just needs *a* response, not a structured error.

#### `backend/middleware/twilioAuth.js`
Verifies every inbound WhatsApp webhook actually came from Twilio, using
`twilio.validateRequest(authToken, signature, fullUrl, body)`. Rebuilds the
exact URL Twilio signed from `PUBLIC_BASE_URL` env var + `req.originalUrl`
rather than trusting `req.protocol`/`req.host` (reverse proxies/tunnels
commonly rewrite those, which is documented as the #1 cause of "valid
request rejected" bugs). Can be bypassed for local dev only via
`TWILIO_SKIP_SIGNATURE_VALIDATION=true` (logs a loud warning when used).

#### `backend/middleware/agentAuth.js`
- `requireAgent` — reads the `staff_token` httpOnly cookie (or a `Bearer`
  header, for Postman/scripts), verifies the JWT via
  `agentAuthService.verifyToken`, and attaches the decoded claims to
  `req.agent`. 401s on missing/invalid/expired tokens.
- `requireRole(...roles)` — a factory returning middleware that 403s unless
  `req.agent.role` is in the allowed list. Must run after `requireAgent`.
  Used to restrict `PATCH /:id/assign` to `supervisor`/`admin`.

#### `backend/middleware/errorHandler.js`
The global Express error handler (4-arg signature). Maps known error shapes
to sensible HTTP codes/messages: Anthropic/AI errors → 503 with
`escalation: true` (tells the frontend to treat it as a "please contact us"
moment), Postgres connection-class error codes (`28*`/`08*`) → 503, a custom
`ValidationError` → 400, rate-limit errors → 429, everything else → 500. In
development, the real error message is included in the JSON body; in
production it's replaced with a generic message.

### 5.4 Routes

Routes are intentionally thin — they wire URL + HTTP verb + middleware to a
controller function and hold the endpoint's JSDoc contract. See
[Section 9](#9-api-reference-summary) for the full endpoint list; each route
file (`chatV2.js`, `staffAuth.js`, `tickets.js`, `whatsapp.js`) largely
mirrors its controller 1:1 and is documented there.

### 5.5 Controllers

#### `backend/controllers/chatControllerV2.js`
The HTTP adapter for the **web widget**. All six exported handlers are thin
wrappers that call into services and shape the JSON response:
- `handleChat` — calls `chatEngine.processMessage`, then branches on the
  result: `humanHandled` (bot stays silent, returns ticket/agent info so the
  widget can render the handoff state), `escalation` (returns the bot's
  handoff message + new ticket info), or a normal reply
  (`utils/responseBuilder.buildChatResponse`, which also attaches a
  "wrap-up" warning if the session is about to expire).
- `getConversationHistory` — `GET /api/chat/conversation/:sessionId`, used
  both for the frontend's own history restore on page load and as the
  polling endpoint that detects new agent replies (see `useChat.ts`).
  Recovers an in-memory-forgotten-but-DB-valid session before declaring it
  expired.
- `keepAliveSession` — resets the inactivity timer without sending a real
  message (the frontend pings this every 4 minutes).
- `endSession` — explicit, user-confirmed "end this conversation": wipes
  stored messages (`conversationService.deleteConversationData`) and drops
  the in-memory session entry.
- `getTicketStatus` — lightweight poll so the widget can see staff-side
  ticket changes (agent accepted, ticket closed) without the customer
  needing to send a new message. Deliberately uses
  `ticketService.getLatestTicketWithAgent` (not the "active only" variant)
  so a just-closed ticket's terminal status is still visible to the poll —
  see the inline bug-fix comment in the source for the failure mode this
  avoids.
- `closeTicket` — customer-initiated permanent close of their own ticket,
  scoped by `sessionId` (not a raw ticket id) so a customer can't close
  someone else's ticket by guessing an id.

#### `backend/controllers/whatsappController.js`
The Twilio webhook handler. Key behaviors:
- Maps Twilio's `From` field directly to `sessionId` — WhatsApp has no
  client-side session management, so the phone number *is* the session key
  (and is permanent, unlike the web widget's random UUID).
- Handles unsupported media messages (images/voice/documents) gracefully.
- Implements two **text-command flows** entirely outside `chatEngine` (no
  LLM call needed): "end chat" (with a yes/no confirmation step tracked in
  `whatsappSessionState.js`) and "close ticket" (WhatsApp's equivalent of
  the web widget's "Close ticket" button, since there's no button UI on
  WhatsApp).
- **Responds to Twilio immediately** with empty TwiML, then runs the actual
  RAG/Claude pipeline in an async IIFE and delivers the real reply via the
  Twilio REST API (`sendWhatsAppMessage`). This exists specifically because
  Twilio silently drops the webhook connection after ~15s, and the RAG+LLM
  pipeline can occasionally exceed that — this pattern removes the timeout
  pressure entirely.
- Appends channel-specific hints to the reply that the web widget doesn't
  need: a "reply *close ticket* to close this" note on escalation, and a
  proactive countdown warning when the session is close to timing out
  (`result.sessionStatus.warningNeeded`).

#### `backend/controllers/ticketController.js`
The staff dashboard's REST surface (mounted behind `requireAgent`, and
`assign` additionally behind `requireRole('supervisor','admin')`).
Highlights beyond simple CRUD-to-service pass-throughs:
- `updateStatus` — after a successful transition to `resolved`/`closed`,
  proactively pushes a WhatsApp closure notice via
  `whatsappService.sendWhatsAppMessage` for `whatsapp`-channel tickets
  (web-channel customers already see it via their own poll of
  `getTicketStatus`, so no push is needed there).
- `assign` / `accept` — similarly push a "X has joined your ticket"
  WhatsApp notice, since WhatsApp has no "agent joined" UI element the way
  the widget does.
- `sendMessage` — persists the agent's reply
  (`ticketService.sendAgentMessage`, which enforces "you must accept the
  ticket before you can message the customer"), then for WhatsApp tickets
  sends it over the Twilio REST API, prefixing a plain-text quoted snippet
  if the agent was replying to a specific earlier message (Twilio's REST
  send API has no native "quote message" feature). If the WhatsApp send
  fails, the response still returns 201 (the message is saved either way)
  but with a `deliveryWarning` field so the UI can flag it.
- `getMyStats` — powers the agent's profile page's open/pending/closed
  counters.

#### `backend/controllers/agentAuthController.js`
Three handlers: `handleLogin` (validates credentials via
`agentAuthService.login`, sets an httpOnly `staff_token` cookie —
deliberately returns a generic 401 on any failure so the API never reveals
whether an email exists), `handleLogout` (clears the cookie), `handleMe`
(returns the JWT payload as-is for "am I logged in / what's my role" UI
checks — not a fresh DB read, so anything permission-sensitive is still
re-checked server-side per endpoint).

### 5.6 Services (the core logic layer)

#### `backend/services/chatEngine.js` — **the heart of the system**
Channel-agnostic pipeline: `processMessage({ message, sessionId, meta })`.
Steps, in order (see inline `STEP 1..7` comments in the source):

1. **Session validation** — new session if none given; if given but expired
   in-memory, attempt DB recovery; if genuinely expired (or a permanent
   WhatsApp sessionId reused after a real timeout), archive the old messages
   and reinitialize.
2. **Load conversation history** from Postgres.
3. **Log the inbound user message.**
4. **Human-handoff check** — if the session already has an open ticket
   (regardless of whether an agent has replied yet), the bot stays
   completely silent and returns `humanHandled: true` with whatever ticket/
   agent info is available. This intentionally checks `hasOpenTicket`, not
   just `human_handled`, to close a gap where a customer's follow-up message
   sent *before* an agent's first reply used to get an unrelated fresh bot
   answer talked over an in-progress escalation.
5. **Escalation & sentiment check** — keyword/pattern matching
   (`claudeService.checkEscalationTriggers`/`detectSentiment`). On a hit, a
   ticket is created (failure here never blocks the reply — the customer
   still gets a phone/email fallback) and a scripted handoff message
   (`utils/responseBuilder.buildEscalationResponse`) is returned with the
   ticket number appended.
6. **Intent-routed RAG retrieval** — `utils/IntentRouter.classifyIntent`
   decides which of FAQ / products / branches / company-knowledge tables are
   worth querying (rather than always querying all four), the relevant
   `policyService` functions run in parallel, and results are ranked
   (`utils/rankResults.js`) and trimmed before being assembled into
   `contextData`.
7. **LLM call** — `claudeService.getClaudeResponse(message, history, contextData)`,
   result run through `sanitizeForUser` as a final safety net; if sanitation
   fails (looks like leaked internal reasoning), the whole request throws
   rather than ever forwarding it.
8. **Persist & return** — updated history saved, assistant message logged,
   full session status returned to the caller.

#### `backend/services/claudeService.js`
Talks to **OpenRouter** (not the Anthropic SDK directly, despite the file
name — this is a legacy name kept for continuity). Responsibilities:
- `buildContextMessage(contextData)` — turns the RAG results (company info,
  FAQs, products, branch locations) into one formatted system message,
  explicitly instructing the model to answer *only* from this data and cite
  `source_url`s where present.
- `extractContent(choice)` — the security-critical function. Some
  reasoning-capable free models served via OpenRouter put their raw
  internal monologue directly into the answer field (sometimes duplicating
  it into a separate `reasoning` field, sometimes not). This function
  refuses to treat `content === reasoning` as a valid answer, strips
  `<think>`-style tags via `sanitizeForUser`, and **never** falls back to
  the `reasoning`/`reasoning_details` fields as a substitute answer.
- `callOpenRouter(messages, opts)` — the actual `fetch` to
  `https://openrouter.ai/api/v1/chat/completions`, requesting
  `reasoning: { exclude: true }` (best-effort, not universally honored).
- `getClaudeResponse(...)` — assembles `[SYSTEM_PROMPT, grounding instructions,
  contextMessage?, ...last 8 history messages, userMessage]`, calls
  OpenRouter, and if the first attempt produces no customer-safe content
  (extraction failure), **retries once** with an explicit "your last reply
  was rejected, answer only as Bima" reminder before finally throwing.
- `checkEscalationTriggers(message)` — a broad keyword list plus a regex
  pattern (`(talk|speak|chat|connect) ... (agent|human|person|rep|...)`) so
  paraphrased requests for a human ("can I talk to an agent") are caught,
  not just exact phrases. This was deliberately widened after a bug where
  the system prompt's *own* escalation instructions made the bot say "let
  me connect you" without a ticket actually being created, because this
  function's older keyword list didn't catch the phrasing that triggered
  the prompt's language.
- `detectSentiment(message)` — simple keyword-count classifier returning
  `angry`/`happy`/`neutral`.

#### `backend/services/sessionManager.js`
In-memory session tracking with a Postgres fallback, since the in-memory
`Map` is wiped on every server restart. Key exports:
- `SESSION_CONFIG` — 5-minute timeout, 2-minute warning threshold, 60s sweep
  interval.
- `initializeSession` / `updateSessionActivity` — upsert
  `conversations.last_activity_at` and refresh the in-memory expiry entry.
- `checkSessionStatus(sessionId)` — **synchronous**, in-memory-only fast
  path. Returns `isExpired:true, reason:'not_in_memory'` when the session
  simply isn't cached (e.g. right after a restart) rather than assuming it's
  actually gone — callers must then await `recoverSessionFromDB`.
- `recoverSessionFromDB(sessionId)` — async DB fallback that restores a
  still-valid session into the in-memory Map, or confirms it's genuinely
  expired.
- `getConversationWithExpirationCheck(sessionId)` — the main read path for
  a session's message history (last 200 rows, chronological). The 200-row
  cap (rather than 20) exists specifically so the widget's "did new
  messages arrive" length-comparison poll (see `useChat.ts`) doesn't stall
  out on long handed-off conversations.
- `cleanupExpiredSessions()` — periodic sweep (via `startCleanupScheduler`)
  that evicts expired in-memory entries, emits `'expired'`/`'warning'`
  events on the shared `sessionEvents` `EventEmitter` (consumed by
  `whatsappSessionWatcher.js` for proactive WhatsApp nudges), and flags
  DB rows older than 24h as archived in `metadata`.
- `endSessionInMemory(sessionId)` — immediate eviction for an explicit
  user-initiated end (as opposed to idle timeout).

#### `backend/services/conversationService.js`
Lower-level Postgres access for conversations/messages/analytics:
`getConversation`, `saveConversation` (delete-then-reinsert full history —
simple but not incremental), `logMessage` (single-row insert, the common
path), `logAnalytics` (never throws — analytics failures must not break
chat), `generateSessionId` (`crypto.randomUUID()`), `deleteConversationData`
(explicit user end-chat: deletes messages, flags the conversation row
`endedByUser`), `archiveExpiredConversation` (genuine inactivity timeout:
deletes messages, flags `expiredArchivedAt` — necessary because WhatsApp
sessionIds are permanent, so without clearing old rows a "new" session would
silently inherit the entire prior conversation).

#### `backend/services/policyService.js`
The RAG **retrieval** layer — one function per knowledge table, all built on
a shared `buildIlikeConditions` helper that turns a keyword array into
per-word `ILIKE` OR-conditions plus a Postgres array-overlap (`&&`) check
against the row's `keywords`/`tags` column. Every search function has the
same shape: try keyword search → if zero rows, **fall back** to a
"top rows regardless of match" query, so the LLM always has *some* context
to reason over rather than an empty prompt. Exports: `searchFAQ`,
`searchInsuranceProducts`, `getProducts` (legacy/simple version),
`findBranches` (also strips "noise words" like "branch"/"claim"/"help" that
would otherwise ILIKE-match almost every row, and checks for a
`source_url` column via `information_schema` before selecting it, since
older branch data may not have it), `searchCompanyKnowledge`,
`getRecommendation` (wraps `searchInsuranceProducts` into a friendlier
shape), `getQuickFact` (tiny static lookup, mostly vestigial).

#### `backend/services/priorityService.js`
Deterministic (not ML-based, by design — every score must be explainable to
a human supervisor) rule engine: `computeTicketPriority({ message,
sentiment, category, isRepeatEscalation })` sums points for angry sentiment
(+2), urgent keywords like "accident"/"emergency" (+2), complaint keywords
like "manager"/"terrible" (+2), sensitive category (+1), and repeat
escalation in the same session (+1), then maps the total score to a tier
(`urgent ≥6`, `high ≥4`, `medium ≥2`, else `low`) and an SLA due time
(`urgent`=1h, `high`=4h, `medium`=24h, `low`=72h).

#### `backend/services/ticketService.js`
All ticket CRUD/state-machine logic, almost every write wrapped in an
explicit transaction with `FOR UPDATE` row locks to prevent races (e.g. two
agents accepting the same ticket simultaneously). Highlights:
- `createTicket(...)` — computes priority, snapshots the current transcript
  into `tickets.transcript_snapshot` (a safety copy independent of the
  `messages` table's lifecycle), and explicitly generates the
  `TCK-######` number via `nextval()` rather than relying solely on the DB
  trigger (defensive against the trigger being missing in some deployed
  environments — see the migration file's comment).
- `listTickets(filters)` — the staff queue query; sorts by priority tier,
  then SLA due date, then creation date.
- `updateTicketStatus` — enforces that `resolved`/`closed` are **terminal**
  (a ticket can never be reopened), using `SELECT ... FOR UPDATE` to avoid a
  race between a concurrent close and a status change.
- `acceptTicket` — self-service "I'm taking this ticket," moves straight to
  `in_progress`. Throws tagged errors (`ALREADY_ASSIGNED`, `TICKET_CLOSED`)
  the controller maps to specific HTTP responses.
- `assignTicket` — supervisor/admin-only reassignment.
- `isSessionHandedOff` vs `hasOpenTicket` — two related-but-distinct checks;
  `chatEngine` uses the OR of both (see the inline bug-fix comment
  explaining why `human_handled` alone wasn't sufficient).
- `getActiveTicketWithAgent` (excludes terminal statuses) vs
  `getLatestTicketWithAgent` (returns the most recent ticket regardless of
  status) — the latter exists specifically so the customer-facing status
  poll can still report a "closed" transition instead of silently reporting
  "no ticket" the instant a ticket is closed.
- `sendAgentMessage` — enforces "you must accept before you can message,"
  enforces "only the assigned agent can message," re-creates the
  `conversations` row if it was cleared by expiry/end-chat before the
  message insert would otherwise fail on the FK, and resolves a
  `replyToMessageId` into an embedded snippet (scoped to the same session,
  so an agent can't reference/leak a message from a different customer's
  conversation).
- `closeTicketByCustomer` — customer self-close, scoped by `sessionId`.
- `getAgentStats` — dashboard counters for the profile page.

#### `backend/services/agentAuthService.js`
Password hashing (`bcrypt`, 12 salt rounds) and JWT issuance/verification
for staff logins. Throws at **module load time** if `STAFF_JWT_SECRET` is
unset — deliberately fails the whole server startup rather than silently
signing tokens with `undefined`. `login(email, password)` returns `null`
(not a specific error) for both "no such user" and "wrong password," so the
controller's 401 response is always generic.

#### `backend/services/whatsappService.js`
Twilio client wrapper plus WhatsApp-specific text formatting:
`formatForWhatsApp` converts `**bold**` → `*bold*` (WhatsApp's own bold
syntax), rewrites `[label](url)` markdown links into `"label: url"` (no
clickable-link rendering on WhatsApp), strips markdown headers, and
collapses excess blank lines. `splitForWhatsApp` chunks any message over
~1500 chars at a paragraph or sentence boundary (WhatsApp/Twilio rejects
messages over ~1600 chars). `sendWhatsAppMessage` sends each chunk via the
Twilio REST API sequentially.

#### `backend/services/whatsappSessionState.js`
A tiny in-memory `Map` tracking which WhatsApp numbers are mid-way through
the "are you sure you want to end this chat? reply YES" confirmation flow.
Kept separate from the controller so `whatsappSessionWatcher.js` can also
touch it without a circular require. Entries expire after 5 minutes if never
confirmed.

#### `backend/services/whatsappSessionWatcher.js`
Subscribes to `sessionManager`'s `'warning'` event and, only for
WhatsApp-prefixed session ids, proactively pushes a natural "Is there
anything else I can help you with?" message — because unlike the web
widget (which polls and reads `response.warning` off its own requests),
WhatsApp has no client-side code that could ever ask "is my session about
to expire?" Does **not** react to the `'expired'` event by design — a timed
out session should just quietly reset on the user's next message, with no
"your session expired" framing.

#### `backend/services/GeneratebranchKeywords.js`
A one-off/occasional **CLI seeding script** (not used by the running
server), run manually with `node services/GeneratebranchKeywords.js
[--write]`. For every active branch, it asks the LLM (via OpenRouter) to
suggest 6–12 lowercase location-search keyword tags (landmarks, nicknames,
common misspellings) and, with `--write`, saves them into
`branches.keywords`. Without `--write` it's a dry run that only prints
suggestions — a safety default so an unreviewed LLM output can't silently
overwrite production data.

### 5.7 Utilities

#### `backend/utils/IntentRouter.js`
`classifyIntent(message)` decides which of the four RAG tables are worth
querying for a given message, using static keyword lists per category
(`FAQ_KEYWORDS`, `PRODUCT_KEYWORDS`, `COMPANY_KEYWORDS`, `BRANCH_KEYWORDS`)
plus a dynamically-cached (5-minute TTL) set of known branch
city/region/keyword terms pulled from the database — so mentioning a place
name alone ("accident in Bungoma") correctly triggers branch retrieval even
without a generic word like "branch" anywhere in the message. If nothing
matches at all (small talk, "hi," "thanks"), it defaults `wantsFAQ` and
`wantsCompanyInfo` to `true` as the safest general-purpose fallback rather
than querying every table blindly. Also extracts a `cityHint` via a simple
`(?:in|at|near|around)\s+(\w+)` regex or the matched known-location term.

#### `backend/utils/Keywords.js`
Shared `extractKeywords(text)` — lowercases, splits on non-word characters,
drops tokens ≤2 chars and a large hand-maintained `STOP_WORDS` set. Used by
both `policyService.js` (building search conditions) and `IntentRouter.js`
(deciding what to search for) so the two never define keyword extraction
differently.

#### `backend/utils/rankResults.js`
`rankResults(results, userMessage)` — post-retrieval relevance scoring. For
each row, concatenates all its text-ish fields (question/answer/title/
content/description/benefits/name/city/region/address/keywords) into one
haystack, counts how many of the user's message words appear in it, scores
`matchCount / totalWords`, drops zero-score rows, and sorts descending. A
lightweight, dependency-free substitute for a real search-relevance engine.

#### `backend/utils/responseBuilder.js`
Shapes the JSON payloads controllers send back: `buildChatResponse` (attaches
a "wrap_up_prompt" warning if under 2 minutes remain on the session),
`buildSessionExpiredResponse`, `buildNewSessionResponse`,
`buildEscalationResponse` (the scripted handoff message with CIC's contact
details), `buildErrorResponse` (includes the raw error message only outside
production).

#### `backend/utils/sanitizeResponse.js`
The **last line of defense** against a model's internal chain-of-thought
leaking into a customer-facing message (used both right after extracting the
model's reply in `claudeService.js` and again defensively before persisting
in the controller layer). `stripThinkTags` removes `<think>`/`<reasoning>`/
etc. tags (closed or dangling/unclosed, for output truncated mid-thought).
`sanitizeForUser(text)` additionally pattern-matches a handful of
"this reads like raw reasoning" openers (e.g. "We need...", "Let me
think...", "The user is asking...") anchored to the start of the trimmed
text, and returns `null` — a **hard signal the caller must treat as a failed
generation**, never display it — rather than trying to salvage a partial
answer.

### 5.8 Database scripts

#### `backend/database/migrations/2026_07_add_ticketing.sql`
The migration that added the entire staff-ticketing feature: `ticket_status`
and `ticket_priority` enum types, the `agents`, `tickets`, and
`ticket_events` tables (see [Section 4](#4-database-schema)), their indexes,
the `set_ticket_number()` trigger function + trigger, and reuses the
pre-existing `update_updated_at_column()` trigger function from the base
schema. Run via `npm run db:migrate:ticketing` (`psql -f ...`).

#### `backend/database/seed-agent.js`
CLI for provisioning/updating staff accounts — there is deliberately **no
public signup form** for the dashboard. Usage:
```
node database/seed-agent.js --staffNo=CIC1042 --name="Jane Wanjiru" \
  --email=jane.wanjiru@cic.co.ke --password='TempPass123!' \
  --role=agent --department="Customer Care"
```
Upserts on `email` conflict (so re-running with the same email is how you
reset a password), hashes the password via `agentAuthService.hashPassword`,
and validates `role` is one of `agent`/`supervisor`/`admin` before writing.

---

## 6. Frontend — File by File

The frontend is a Next.js 15 App Router project. There are two independent
UIs sharing the same backend: the **public chat widget** (embedded on the
marketing homepage) and the **staff ticketing dashboard** (`/staff/*`,
authenticated).

### 6.1 App shell

#### `frontend/src/app/layout.tsx`
Root layout — sets page metadata (title/description/favicon, all pointing
at the CIC brand), wraps the app in `ClientProviders`.

#### `frontend/src/app/page.tsx`
The public marketing homepage (nav bar, hero, services grid, stats, CTA,
footer — all static/presentational placeholder content for CIC Insurance)
with the `<ChatWidget />` mounted at the bottom so it floats over every
section.

#### `frontend/src/app/providers.tsx`
A minimal client-side wrapper component (`'use client'`) — currently a
pass-through, kept as the single place to add future context providers
(theme, analytics, etc.) without touching `layout.tsx`.

### 6.2 Shared libraries (`frontend/src/lib/`)

#### `lib/api.ts`
Fetch wrappers for the **customer-facing** chat API (`/api/chat/*`):
`sendMessage`, `keepAliveSession`, `endSession`, `getConversationHistory`
(throws a tagged `status: 410` error on session expiry so the caller can
special-case it), `getTicketStatus`, `closeTicket`. All hit
`${NEXT_PUBLIC_API_URL}/api`. No auth — this is the public widget.

#### `lib/staffApi.ts`
Fetch wrappers for the **staff dashboard API** (`/api/staff/*`). Every call
goes through a shared `staffFetch` helper that sets `credentials: 'include'`
(so the httpOnly `staff_token` cookie set by the backend on login is sent
automatically — no token handling lives in this file at all) and normalizes
a `401` into a tagged `Error` with `status: 401` so pages can redirect to
`/staff/login`. Exports typed CRUD functions for the whole ticket lifecycle:
`login`, `logout`, `getMe`, `listTickets`, `getTicket`, `getTicketMessages`,
`getTicketEvents`, `updateTicketStatus`, `updateTicketPriority`,
`assignTicket`, `acceptTicket`, `addTicketNote`, `sendTicketMessage`,
`getMyStats`, plus the `Ticket`/`Agent`/`TicketMessage`/`TicketEvent`
TypeScript interfaces mirroring the backend's shapes.

#### `lib/config.ts`
`getWhatsAppChatUrl(prefillOverride?)` — builds a `https://wa.me/<number>?text=...`
deep link for the "Chat on WhatsApp" button, reading the target number and
default prefill text from `NEXT_PUBLIC_WHATSAPP_NUMBER` /
`NEXT_PUBLIC_WHATSAPP_PREFILL` env vars so sandbox vs. production WhatsApp
senders can be swapped without a code change.

#### `lib/formatBimaMessages.ts`
`cleanBimaText(rawText)` — a chain of regex cleanups applied to the bot's
raw reply before it's handed to `react-markdown`: strips decorative
separator lines (`***`, `═══`, etc.) and stray standalone asterisks,
normalizes emoji/unicode bullets (checkmarks, arrows, dots) into markdown
`- ` list items, strips `[x]`/`[ ]` checkbox markers, ensures a blank line
precedes list blocks (so the markdown parser actually recognizes them as
lists), auto-links bare URLs into `[url](url)`, and collapses 3+ blank
lines to 2. This exists because LLM output is inconsistent about strict
Markdown syntax and this normalizes it before rendering.

#### `lib/quickLinks.ts`
A hand-edited array (`QUICK_LINKS`) of the shortcut buttons shown on the
widget's Home tab (get a quote, open an MMF account, view pension plans).
No admin UI — this file is the single source of truth; each entry has an
`id`, `label`, `url` (absolute = opens in a new tab, relative = in-page
navigation), and an `icon` key matching `QuickLinkIcon.tsx`.

#### `lib/utils.ts`
Small generic helpers: `cn(...)` (naive class-name joiner — a lighter
alternative to `clsx`/`tailwind-merge` used in a few spots), `generateId()`
(timestamp + random suffix, used for local message ids — **not** the
session id, which comes from the backend/`crypto.randomUUID()`),
`formatTime(timestamp)` (relative "5m ago" formatting), `truncateText`.

### 6.3 Types (`frontend/src/types/chat.ts`)
Central TypeScript definitions shared across the widget: `MessageRole`
(`user | assistant | agent | system`), `TicketStatus`, `Message` (includes
an optional `replyTo` snippet for the reply-to-a-message feature),
`AssignedAgent`, `TicketData`, `ChatState` (the shape `useChat` manages),
`QuickQuestion`, `QuickLink`/`QuickLinkIconKey` (a closed union of icon keys
so `QuickLinkIcon.tsx` can exhaustively handle every case).

### 6.4 The chat hook — `frontend/src/hooks/useChat.ts`

This is the frontend's equivalent of `chatEngine.js` — nearly all client-side
chat state and behavior lives here, and `ChatWindow`/`ChatWidget` are mostly
presentational consumers of it. Responsibilities:

- **Session bootstrap** — reads/creates a `sessionId` in `localStorage`
  (`cic-chat-session` key) on mount.
- **Keep-alive** — pings `POST /api/chat/keep-alive` every 4 minutes so an
  idle-but-open tab doesn't expire server-side.
- **State restore on mount** — fetches both conversation history and ticket
  status in parallel so a page refresh mid-ticket doesn't lose the ticket
  card / agent info / message history.
- **`addMessage`** — the single function that appends to local message state
  (used for both real replies and synthetic "system" notices like "Agent X
  has joined").
- **Wrap-up nudge** — after `WRAP_UP_IDLE_MS` (3 minutes) of no new
  messages, injects an assistant "Is there anything else I can help you
  with?" prompt — but never while `isEscalated`, so it can't interrupt an
  active human handoff.
- **Agent-reply polling (`pollForAgentReplies`)** — once a conversation is
  escalated, polls `getConversationHistory` and `getTicketStatus` every 4
  seconds. Uses a running `backendMessageCountRef` to only render *new*
  rows with `role === 'agent'` (user/assistant messages are already shown
  locally the moment they're sent). Also announces "agent joined" (once per
  agent, via `announcedAgentIdRef`) and a terminal-status transition
  ("ticket resolved/closed") exactly once, using
  `lastKnownTicketStatusRef` to detect the transition rather than firing on
  every poll tick.
- **`handleSendMessage`** — posts to `/api/chat`, reconciles a
  backend-issued new `sessionId` (happens when the old one had truly
  expired), surfaces any `response.warning`, and branches on
  `humanHandled` / `escalation` / normal-reply the same way the backend's
  three response shapes imply — including the same "only announce
  'connecting you...' once" guard the backend comments describe on the
  server side.
- **`clearMessages`** vs **`endChatSession`** — `clearMessages` is a purely
  local reset (new session id, empty state, no backend call); `endChatSession`
  is the real "user confirmed they want to end the chat" flow that also
  tells the backend to wipe stored messages, always resetting local state
  even if that network call fails.
- **`closeTicket`** — customer self-service ticket close; only affects
  ticket status, does not end the chat session itself.

### 6.5 Chat widget components (`frontend/src/components/chat/`)

| File | Role |
|---|---|
| `ChatWidget.tsx` | Top-level floating button + panel. Owns the *open/closed* state and the "confirm before closing an active conversation" flow (`requestClose`/`confirmClose`/`cancelClose`), including a click-outside handler that's disabled while a conversation is active (so an accidental outside click can't silently discard it). |
| `ChatWindow.tsx` | The panel's internal layout: header, ticket-info banner, tab bar (Home/Conversation), message list or home content, input bar. Tracks an unread-badge on the "Conversation" tab when a message arrives while the user is browsing "Home". Owns the currently-selected `replyTo` message state and wires it through to `InputBar`/`MessageBubble`. |
| `Header.tsx` | Top bar — CIC logo, "Bima CIC'S AI Support" title, live status text ("Online and ready to help" vs "Connected to agent" + agent name badge), close (X) button. |
| `TabBar.tsx` | Two-tab bottom nav (Home / Conversation) with an unread-dot on Conversation. |
| `HomeTab.tsx` | The widget's landing content: a greeting card, a "Start/Continue conversation" button, the `QuickLinks` list, and a "Reach us on WhatsApp" deep link (`getWhatsAppChatUrl`). |
| `QuickLinks.tsx` / `QuickLinkIcon.tsx` | Renders the `QUICK_LINKS` array as a list of icon+label buttons; `QuickLinkIcon` maps each closed icon-key to its inline SVG path. |
| `QuickQuestions.tsx` | The grid of starter-question buttons shown when a conversation is empty (in `ChatWindow`, list defined inline: "Get an insurance quote," "Buy an insurance Cover," "Tell me about CIC insurance Group"). |
| `MessageList.tsx` | Scroll container with careful auto-scroll heuristics: user's own new message always scrolls fully into view; an incoming bot/agent message only nudges the scroll (rather than jumping) if the user is already near the bottom, and otherwise shows a "new message" pill instead of yanking their scroll position while they're reading history. |
| `MessageBubble.tsx` | Renders one message — different bubble styling per role (`user`/`assistant`/`agent`/`system`), an avatar badge ("B" for bot, "A" for agent), a quoted reply-snippet block when `message.replyTo` is set, and a hover-revealed reply button. |
| `MessageContent.tsx` | Renders the actual text: plain `<p>` for `user`/`system` roles, full `react-markdown` (with `remark-gfm` and custom compact styling for headings/lists/paragraphs) for bot/agent messages, after running the text through `cleanBimaText`. |
| `TypingIndicator.tsx` | Three bouncing dots shown while waiting for a bot reply. |
| `InputBar.tsx` | The text input + send button, plus the `ReplyPreview` bar when replying to a specific message (Escape key cancels the reply). |
| `ReplyPreview.tsx` | The small "Replying to Bima / Agent / yourself" preview shown above the input when a reply is staged. |
| `TicketInfo.tsx` | The compact status banner shown once a ticket exists: ticket number, color-coded status pill, live "time open" counter, and (for non-terminal tickets) a "Close ticket" button with its own inline confirm step. |
| `ConfirmEndChatModal.tsx` | The "End this conversation?" confirmation dialog shown when closing the widget with an active conversation, with an extra warning if there's still an open support ticket. |
| `UiIcons.tsx` | A shared set of small inline SVG icon components (reply, pencil, trash, plus, check, X, chevrons, home, message, WhatsApp) used throughout the widget instead of an icon library dependency. |

### 6.6 Staff dashboard pages (`frontend/src/app/staff/`)

#### `staff/login/page.tsx`
A simple email/password form. Calls `staffApi.login`, then
`router.push('/staff/tickets')` on success; renders the backend's error
message (kept generic by design — see `agentAuthController.js`) on failure.

#### `staff/tickets/page.tsx`
The **ticket queue** — the agent's main working view. Fetches the logged-in
agent (`getMe`, redirecting to `/staff/login` on 401), then loads tickets
via `listTickets` filtered by `status` (defaults to `open`, since the
backend query already sorts urgent-first within a status) and `priority`.
Auto-refreshes every 30 seconds (a polling backstop, with a comment noting
this should be swapped for websockets if true real-time becomes necessary).
Renders a filterable table with color-coded priority/status badges and a
live SLA countdown (`formatSlaCountdown`, computed client-side from
`sla_due_at` so it updates between polls without extra requests).

#### `staff/tickets/[id]/page.tsx`
The **ticket workspace** — where an agent actually handles a conversation.
Loads the ticket, its message transcript (live or a snapshot fallback, per
`getTicketMessages`'s `source` field), and its audit-trail events in
parallel. Lets the agent: accept the ticket (`acceptTicket`, required before
sending any message — mirrors the backend's `sendAgentMessage` guard),
change status/priority (`updateTicketStatus`/`updateTicketPriority`), add
internal notes (`addTicketNote`), and send replies to the customer
(`sendTicketMessage`, supporting the same reply-to-a-specific-message
feature as the customer widget, via `replyToMessageId`). Surfaces a
`deliveryWarning` inline if a WhatsApp send succeeded in saving the message
but failed to actually deliver it.

#### `staff/profile/page.tsx`
The agent's own profile — loads `getMe` + `getMyStats` in parallel, renders
four stat cards (open / pending-customer / closed / total tickets handled)
and a logout button.

### 6.7 Styling & config

- `frontend/tailwind.config.ts` — defines the CIC brand palette
  (`cic-red`/`cic-red-dark`/`cic-gray`/`cic-light`/`cic-white`), a custom
  type scale, and content globs covering `app/`, `components/`, `pages/`.
- `frontend/src/styles/globals.css` — global styles/animations (message
  slide-in, typing-dot pulse, etc.) layered on top of Tailwind.
- `frontend/next.config.ts` — enables React strict mode and exposes
  `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:5000` here, though
  the rest of the app's `.env.example` and `lib/*.ts` default to `3001` —
  **make sure your actual `.env` sets this explicitly** to avoid the
  mismatch between these two defaults).

---

## 7. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (default `3001`) | HTTP port |
| `NODE_ENV` | no | `production` tightens CORS origins and hides error detail |
| `DB_HOST`, `DB_USER`, `DB_NAME` | **yes** | Postgres connection (server throws at startup if missing) |
| `DB_PORT` | no (default `5432`) | |
| `DB_PASSWORD` | no | |
| `DB_SSL` | no | `'true'` enables SSL (`rejectUnauthorized: false`) |
| `OPENROUTER_API_KEY` | **yes** (for chat to work) | OpenRouter auth |
| `OPENROUTER_MODEL` | no (default `anthropic/claude-3.5-sonnet`) | Which model OpenRouter routes to |
| `CLAUDE_MAX_TOKENS` | no (default `2048`) | Response length cap |
| `CLAUDE_TEMPERATURE` | no (default `0.2`) | Sampling temperature |
| `STAFF_JWT_SECRET` | **yes** (for staff auth) | JWT signing secret — server refuses to start without it |
| `STAFF_JWT_TTL` | no (default `8h`) | Staff session length |
| `STAFF_RATE_LIMIT_MAX` | no (default `300`) | Staff dashboard req/min |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | for WhatsApp | Twilio credentials + sender number |
| `PUBLIC_BASE_URL` | for WhatsApp | Exact public origin Twilio calls, used to validate webhook signatures |
| `TWILIO_SKIP_SIGNATURE_VALIDATION` | no | `'true'` bypasses signature checks — **local dev only** |
| `WHATSAPP_RATE_LIMIT_MAX` | no (default `20`) | Per-number WhatsApp req/min |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | no | Public rate limiter tuning |

### Frontend (`frontend/.env.local`, see `frontend/.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Backend base URL, e.g. `http://localhost:3001` (no trailing slash, no `/api`) |
| `NEXT_PUBLIC_CHAT_ENABLED` | no | Feature flag placeholder (not currently read by the widget code) |
| `NEXT_PUBLIC_CHAT_POSITION` | no | Same — placeholder for a future configurable widget position |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | no (default `254700000000`) | Number the "Chat on WhatsApp" button opens |
| `NEXT_PUBLIC_WHATSAPP_PREFILL` | no | Custom pre-filled WhatsApp message text |

---

## 8. Running the Project Locally

```bash
# 1. Database
createdb easybima            # or your DB of choice
psql -d easybima -f <base schema — provided separately / by your DBA>
psql -d easybima -f backend/database/migrations/2026_07_add_ticketing.sql

# 2. Backend
cd backend
cp .env.example .env         # then fill in DB_*, OPENROUTER_API_KEY, STAFF_JWT_SECRET, etc.
npm install
npm run dev                  # nodemon server.js, http://localhost:3001

# Seed a staff account so you can log into the dashboard:
node database/seed-agent.js --staffNo=CIC0001 --name="Test Agent" \
  --email=agent@example.com --password='ChangeMe123!' --role=admin

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev                  # http://localhost:3000

# 4. WhatsApp (optional, for local testing)
# Expose the backend publicly (e.g. a tunnel), set PUBLIC_BASE_URL to that
# URL, and configure it as the Twilio WhatsApp Sender's inbound webhook:
#   https://<PUBLIC_BASE_URL>/api/whatsapp/webhook
```

Visit `http://localhost:3000` for the public site + chat widget, and
`http://localhost:3000/staff/login` for the staff dashboard.

---

## 9. API Reference (Summary)

### Public chat (`/api/chat`, mounted with `chatRateLimiter`)
| Method & Path | Purpose |
|---|---|
| `POST /api/chat` | Main chat turn. Body: `{ message, sessionId? }`. |
| `GET /api/chat/conversation/:sessionId` | Full message history for a session. |
| `POST /api/chat/keep-alive` | Reset the inactivity timer. Body: `{ sessionId }`. |
| `POST /api/chat/end-session` | User-confirmed end: wipes messages, clears session. Body: `{ sessionId }`. |
| `GET /api/chat/ticket/:sessionId` | Poll for ticket/agent state changes. |
| `POST /api/chat/ticket/close` | Customer closes their own open ticket. Body: `{ sessionId }`. |
| `GET /api/chat/health` | Liveness check. |

### WhatsApp (`/api/whatsapp`)
| Method & Path | Purpose |
|---|---|
| `POST /api/whatsapp/webhook` | Twilio inbound webhook (signature-verified). |
| `GET /api/whatsapp/health` | Reports whether Twilio env vars are configured. |

### Staff auth (`/api/staff/auth`)
| Method & Path | Purpose |
|---|---|
| `POST /api/staff/auth/login` | Body: `{ email, password }`. Sets `staff_token` cookie. |
| `POST /api/staff/auth/logout` | Clears the cookie. |
| `GET /api/staff/auth/me` | Returns the current agent's JWT claims (requires auth). |

### Staff tickets (`/api/staff/tickets`, all require `requireAgent`)
| Method & Path | Purpose |
|---|---|
| `GET /` | Filterable/paginated ticket queue. Query: `status, priority, category, assignedTo, branchId, page, pageSize`. |
| `GET /stats/me` | Signed-in agent's ticket counters. |
| `GET /:id` | Single ticket. |
| `GET /:id/messages` | Transcript (live or snapshot). |
| `POST /:id/messages` | Agent replies to the customer. Body: `{ content, replyToMessageId? }`. |
| `GET /:id/events` | Audit trail. |
| `PATCH /:id/status` | Body: `{ status }`. |
| `PATCH /:id/priority` | Body: `{ priority }`. |
| `PATCH /:id/accept` | Self-service accept. |
| `PATCH /:id/assign` | **supervisor/admin only.** Body: `{ agentId }`. |
| `POST /:id/notes` | Body: `{ note }`. |

### Misc
| Method & Path | Purpose |
|---|---|
| `GET /health` | Root-level liveness check (no rate limit). |

---

Run with:
```bash
cd backend && npm test          # jest --coverage
```

---

## 11. Known Design Decisions & Gotchas

A few things that look surprising at first read but are intentional (or are
documented trade-offs worth knowing before you touch the surrounding code):

- **`claudeService.js` talks to OpenRouter, not Anthropic directly.** The
  `@anthropic-ai/sdk` package dependency is unused by the live code path;
  OpenRouter lets `OPENROUTER_MODEL` be swapped without a deploy.
- **Sessions are dual-tracked (in-memory + Postgres)** specifically so a
  server restart doesn't wrongly expire every active session — always check
  `sessionManager.js`'s DB-fallback path before assuming "not in the Map"
  means "expired."
- **WhatsApp session IDs are permanent** (the phone number itself), unlike
  the web widget's random UUID — this is why "session expired" for WhatsApp
  means *clearing old messages*, not generating a new ID, and why
  `archiveExpiredConversation` exists as a distinct function from
  `deleteConversationData`.
- **The bot goes silent once *any* open ticket exists for a session**, not
  just once an agent has actually replied — see the `hasOpenTicket` vs
  `isSessionHandedOff` distinction in `chatEngine.js`/`ticketService.js`.
- **`resolved`/`closed` ticket statuses are permanent** — there is no
  "reopen" path anywhere in the API by design.
- **Every LLM response is passed through `sanitizeForUser` and can return
  `null`**, which callers must treat as a hard failure (retry or error),
  never as "empty but safe to show."
- **The web widget has no websocket** — all real-time behavior (agent
  replies, ticket status changes, the staff ticket queue) is
  polling-based (`setInterval` + `fetch`), which is simple to reason about
  at this traffic scale but is the first thing to reconsider if load grows.
- **`frontend/next.config.ts`'s default `NEXT_PUBLIC_API_URL` (`:5000`)
  disagrees with `frontend/.env.example`'s default (`:3001`)**, which is
  also the backend's actual default port — always set this explicitly in
  your local `.env.local` rather than relying on either default.