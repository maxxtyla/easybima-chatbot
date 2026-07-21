# EasyBima — Bima AI Chatbot & Ticketing Service

**Bima** is CIC Insurance Group's AI customer-support assistant. It answers
insurance questions on the CIC website and on WhatsApp using the same
underlying pipeline, and hands off to a human agent — through a full
ticketing dashboard — whenever a conversation needs one.

> One pipeline, many channels: the web widget and WhatsApp both run through
> `backend/services/chatEngine.js`, so behavior never drifts between the two.

For a full technical deep-dive (architecture, every file's responsibility,
database schema, API reference, and known gotchas), see
**[docs/ProjectDocumentation.md](docs/ProjectDocumentation.md)**.

---

## What's in this repo

| Part | Where | Stack |
|---|---|---|
| Chat backend + API | [`backend/`](backend) | Node.js, Express, PostgreSQL |
| Web chat widget + staff dashboard | [`frontend/`](frontend) | Next.js 15, React 19, TypeScript, Tailwind |
| Tests | [`tests/`](tests) | Jest, Supertest |
| Docs | [`docs/`](docs) | — |

**Core capabilities**
- 🤖 RAG-grounded chatbot ("Bima") answering from CIC's own product/FAQ/branch
  knowledge base — no hallucinated policy details.
- 💬 Web chat widget with a Home tab (product carousel, WhatsApp deep link)
  and a Conversation tab, session keep-alive, and message reply-to.
- 📲 WhatsApp channel via Twilio, sharing the exact same chat engine as the web widget.
- 🎫 Escalation → ticketing: angry customers, explicit agent requests, or
  complex claims automatically open a support ticket with a priority score
  and SLA.
- 🖥️ Staff dashboard: JWT-authenticated ticket queue, per-ticket transcript
  and reply UI, status/priority workflow, notes, and new-message alerts
  (sound + flashing tab title).

---

## Prerequisites

- Node.js ≥ 18
- PostgreSQL (any recent version with `uuid-ossp`/`pgcrypto` extension support)
- An [OpenRouter](https://openrouter.ai) API key (chat replies are generated
  through OpenRouter, not the Anthropic API directly)
- A Twilio account with a WhatsApp sender — only needed if you're testing the
  WhatsApp channel

## Quick start

```bash
# 1. Database — create it and load the schema (see docs for the full DDL)
createdb easybima
psql -d easybima -f <path-to-schema.sql>

# 2. Backend
cd backend
cp .env.example .env     # fill in DB_*, OPENROUTER_API_KEY, STAFF_JWT_SECRET
npm install
npm run dev               # http://localhost:3001

# Create a staff account so you can log into the dashboard
node database/seed-agent.js --staffNo=CIC0001 --name="Test Agent" \
  --email=agent@example.com --password='ChangeMe123!' --role=admin

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev               # http://localhost:3000
```

Then open:
- `http://localhost:3000` — public site + chat widget
- `http://localhost:3000/staff/login` — staff ticketing dashboard

Full environment-variable reference, WhatsApp webhook setup, and the
database schema live in **[docs/ProjectDocumentation.md](docs/ProjectDocumentation.md#7-environment-variables)**.

## Available scripts

**Backend** (`backend/package.json`)
| Script | Purpose |
|---|---|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start for production |
| `npm test` | Run Jest test suite with coverage |
| `npm run db:seed:agent` | Create/update a staff account |

**Frontend** (`frontend/package.json`)
| Script | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` / `npm start` | Production build / start |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |

## Testing

```bash
cd backend && npm test
```

Unit tests live under `tests/unit`, integration tests under
`tests/integration`.

## Project structure

```
easybima-chatbot-newUI/
├── backend/
│   ├── controllers/     # thin request handlers (chat, whatsapp, tickets, auth)
│   ├── services/        # chatEngine.js is the core pipeline; everything else
│   │                     # supports it (LLM calls, sessions, tickets, WhatsApp)
│   ├── routes/           # Express route definitions
│   ├── middleware/       # auth, rate limiting, validation, error handling
│   ├── utils/             # intent routing, ranking, response sanitization
│   ├── prompts/           # the Bima system prompt
│   └── database/          # one-off CLI/maintenance scripts
├── frontend/
│   └── src/
│       ├── app/            # Next.js App Router pages (public site + /staff/*)
│       ├── components/chat/ # chat widget UI
│       ├── hooks/useChat.ts # client-side chat state machine
│       └── lib/              # API clients, formatting, notification helpers
├── tests/
└── docs/ProjectDocumentation.md
```

## Contributing

This is an internal CIC Insurance Group project. Keep changes minimal and
targeted — see the "Known Design Decisions & Gotchas" section in the full
documentation before touching session handling, rate limiting, or the
chat/WhatsApp pipeline, since several past bugs came from reordering things
that look reorderable but aren't.

## License

Proprietary — © CIC Insurance Group. Internal use only.
