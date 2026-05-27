# Session Management Architecture Diagrams

## 1️⃣ Session Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SESSION LIFECYCLE                                │
└─────────────────────────────────────────────────────────────────────────┘

START
  │
  ├─→ User sends first message
  │   └─→ generateSessionId() → new UUID
  │   └─→ initializeSession() 
  │       ├─→ Insert into conversations table
  │       └─→ Add to activeSessions Map { expiryTime, warningShown }
  │
  ├─→ Message processed
  │   └─→ getClaudeResponse()
  │   └─→ logMessage(sessionId)
  │   └─→ updateSessionActivity() 
  │       ├─→ Update last_activity_at in DB
  │       └─→ Reset expiry timer to NOW + 120s
  │
  ├─→ Build response
  │   └─→ checkSessionStatus(sessionId)
  │       ├─→ Is expired? → CREATE NEW SESSION
  │       ├─→ < 15s left? → ADD WARNING to response
  │       └─→ Return timeRemainingSeconds
  │
  └─→ Send to client with:
      {
        response: "...",
        sessionId: "abc123",
        session: { isActive: true, timeRemainingSeconds: 118 },
        warning?: { message: "...", timeRemainingSeconds: 8 }
      }

TIME PASSES
  │
  ├─→ Background cleanup every 60s
  │   └─→ cleanupExpiredSessions()
  │       ├─→ Find sessions in activeSessions where expiryTime < now
  │       └─→ Delete from Map + mark in DB
  │
  └─→ Next user message arrives
      └─→ Go to "User sends message" above

EXPIRATION
  │
  └─→ User inactive for 2 minutes
      └─→ checkSessionStatus() returns isExpired: true
      └─→ Auto-create new sessionId
      └─→ Return: { error: "session_expired", newSessionId: null }
      └─→ Frontend creates new session on next message
```

---

## 2️⃣ In-Memory Session State

```
activeSessions Map

┌────────────────────────────────────────────────────────────┐
│  Session ID: "abc-123"                                     │
├────────────────────────────────────────────────────────────┤
│  expiryTime: 1696245800000     (time when session expires) │
│  warningShown: false            (has user been warned?)    │
│  createdAt: 1696245680000      (when session started)      │
│  lastActivityAt: 1696245780000 (when user last messaged)   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Session ID: "def-456"                                     │
├────────────────────────────────────────────────────────────┤
│  expiryTime: 1696245900000                                 │
│  warningShown: true             ← Warning already shown    │
│  ...                                                        │
└────────────────────────────────────────────────────────────┘

Cleanup:
  If now() > expiryTime → Delete from Map
```

---

## 3️⃣ API Response Timeline

```
User sends message at T=0s on a fresh session

T=0s
  Client: POST /api/chat { message: "Hi", sessionId: null }
  Server: Create session "abc-123"
  ┌─────────────────────────────────────────┐
  │ Response:                               │
  │ {                                       │
  │   response: "Hello!",                   │
  │   sessionId: "abc-123",                 │
  │   session: {                            │
  │     isActive: true,                     │
  │     timeRemainingSeconds: 120           │
  │   }                                     │
  │ }                                       │
  └─────────────────────────────────────────┘

T=5s
  Client: User types response (no message yet)
  Timer client-side: 115s

T=10s
  Client: POST /api/chat { message: "How are you?", sessionId: "abc-123" }
  Server: Update last_activity_at, reset expiry to T+120s
  ┌─────────────────────────────────────────┐
  │ Response:                               │
  │ {                                       │
  │   response: "I'm doing great!",         │
  │   sessionId: "abc-123",                 │
  │   session: {                            │
  │     isActive: true,                     │
  │     timeRemainingSeconds: 120           │ ← RESET!
  │   }                                     │
  │ }                                       │
  └─────────────────────────────────────────┘

T=125s
  ⚠️ Session expires (no activity for 120s)
  
T=126s
  Client: POST /api/chat { message: "Still here?", sessionId: "abc-123" }
  Server: Session expired, create new one
  ┌─────────────────────────────────────────┐
  │ Response (Expired):                     │
  │ {                                       │
  │   error: "session_expired",             │
  │   message: "Your conversation has...",  │
  │   reason: "inactivity"                  │
  │ }                                       │
  └─────────────────────────────────────────┘

T=127s
  Client: Retry POST /api/chat with same message (new sessionId)
  Server: Create new session "def-456"
  ┌─────────────────────────────────────────┐
  │ Response:                               │
  │ {                                       │
  │   response: "Starting fresh!",          │
  │   sessionId: "def-456",                 │
  │   session: {                            │
  │     isActive: true,                     │
  │     timeRemainingSeconds: 120           │
  │   }                                     │
  │ }                                       │
  └─────────────────────────────────────────┘
```

---

## 4️⃣ Warning Trigger Timeline

```
Single session from creation to expiration with warning

T=0s:    Session starts (expiryTime = T+120s)
         timeRemaining: 120s

T=60s:   User goes idle (no messages)
         timeRemaining: 60s
         warningShown: false (no warning yet)

T=105s:  Still idle
         timeRemaining: 15s
         warningShown: false

T=105.1s: Next API call (or keep-alive)
         checkSessionStatus() finds:
         - isExpired: false (still 14.9s left)
         - warningNeeded: true (< 15s AND warningShown = false)
         - warningShown: true (mark shown to prevent spam)
         
         ┌──────────────────────────────────────────────┐
         │ Response includes:                           │
         │ {                                            │
         │   ...                                        │
         │   warning: {                                 │
         │     type: "session_expiring_soon",           │
         │     message: "Your conversation will...",    │
         │     timeRemainingSeconds: 14,                │
         │     action: "Send a message to reset..."     │
         │   }                                          │
         │ }                                            │
         └──────────────────────────────────────────────┘

T=105.5s: User sees warning and types response
         
T=107s:   User sends message: "I'm here"
         checkSessionStatus() returns:
         - isActive: true ✅
         - warningNeeded: false (fresh expiry)
         - timeRemainingSeconds: 120 (RESET!)
         - warningShown: false (reset for next timeout)
         
         ┌──────────────────────────────────────────────┐
         │ Response (NO warning):                       │
         │ {                                            │
         │   response: "Great!",                        │
         │   sessionId: "abc-123",                      │
         │   session: {                                 │
         │     isActive: true,                          │
         │     timeRemainingSeconds: 120                │
         │   }                                          │
         │ }                                            │
         └──────────────────────────────────────────────┘

T=227s:   Session expires again if still idle
         (cycle repeats)
```

---

## 5️⃣ Database Schema Architecture

```
CONVERSATIONS TABLE
┌─────────────────────────────────────────────────────────┐
│ id (UUID) PRIMARY KEY                                   │
│ session_id (VARCHAR) UNIQUE ← Used to link to messages  │
│ created_at (TIMESTAMP)                                  │
│ updated_at (TIMESTAMP)                                  │
│ last_activity_at (TIMESTAMP) ← Tracks user activity     │
│ metadata (JSONB) ← Stores state (archived, etc.)        │
└─────────────────────────────────────────────────────────┘
           │
           │ One-to-many
           ▼
MESSAGES TABLE
┌─────────────────────────────────────────────────────────┐
│ id (UUID) PRIMARY KEY                                   │
│ session_id (VARCHAR) FOREIGN KEY                        │
│ role (VARCHAR) - 'user' | 'assistant'                   │
│ content (TEXT)                                          │
│ created_at (TIMESTAMP)                                  │
└─────────────────────────────────────────────────────────┘

QUERY PATTERNS:

1. Get all messages for a session:
   SELECT * FROM messages 
   WHERE session_id = $1 
   ORDER BY created_at ASC
   (Uses index: idx_messages_session_created)

2. Find expired sessions:
   SELECT * FROM conversations 
   WHERE last_activity_at < (NOW() - INTERVAL '2 minutes')
   (Uses index: idx_conversations_last_activity)

3. Get session for resumption:
   SELECT * FROM conversations 
   WHERE session_id = $1
   (Uses index: idx_conversations_session)
```

---

## 6️⃣ Component Interaction Diagram

```
┌──────────────────┐
│   Frontend App   │
│  (React/Vue)     │
└────────┬─────────┘
         │ POST /api/chat
         │ { message, sessionId }
         ▼
┌──────────────────────────────────────┐
│    Express Route Handler             │
│  routes/chatV2.js (POST /api/chat)   │
└────────┬─────────────────────────────┘
         │ calls
         ▼
┌──────────────────────────────────────┐
│   chatControllerV2.js                │
│   handleChat() function              │
├──────────────────────────────────────┤
│ 1. validateInput()                   │
│ 2. checkSessionStatus()              │
│    ↓ calls sessionManager            │
│ 3. initializeSession() or            │
│    updateSessionActivity()            │
│    ↓ calls sessionManager            │
│ 4. getConversationWithExpiration()   │
│    ↓ queries database                │
│ 5. getClaudeResponse()               │
│    ↓ calls Claude API                │
│ 6. saveConversation()                │
│    ↓ updates database                │
│ 7. buildChatResponse()               │
│    ↓ calls responseBuilder           │
│ 8. return res.json()                 │
└────────┬─────────────────────────────┘
         │ JSON response with
         │ warnings/session status
         ▼
┌──────────────────┐
│   Frontend App   │
│ Update UI with:  │
│ - Chat message   │
│ - Timer          │
│ - Warning (if <15s)
└──────────────────┘
```

---

## 7️⃣ State Transitions

```
    ┌─────────────┐
    │   CREATED   │
    │  t = 0      │
    └──────┬──────┘
           │
           │ User sends message
           │ updateSessionActivity()
           │
    ┌──────▼──────┐
    │   ACTIVE    │
    │  0 < t < 120│ ← Most common state
    │  expiryTime │    (message just received)
    │  = now+120s │
    └──────┬──────┘
           │
           │ Time passes
           │ No new messages
           │
    ┌──────▼──────────────────┐
    │  EXPIRING_SOON          │
    │  105 < t < 120          │
    │  warningShown = false   │
    │                         │
    │  Next API check will    │
    │  trigger warning        │
    └──────┬──────────────────┘
           │
           ├─→ (If) User sends message
           │         expiryTime = now+120s
           │         ↓ BACK TO ACTIVE
           │
           └─→ (If) Time >= 120s
                    isExpired = true
                    activeSessions.delete()
                    ↓
            ┌──────────────┐
            │   EXPIRED    │
            │  t >= 120    │
            └──────┬───────┘
                   │
                   │ User sends message
                   │ generateSessionId()
                   │ initializeSession()
                   │ ↓ NEW ACTIVE SESSION
```

---

## 8️⃣ Error Handling Flow

```
POST /api/chat
    │
    ├─→ No message provided
    │   └─→ validateInput() middleware
    │       └─→ 400 Bad Request
    │
    ├─→ Session provided
    │   └─→ checkSessionStatus()
    │       ├─→ Not in memory?
    │       │   └─→ Get from database ✓
    │       │
    │       └─→ Expired?
    │           └─→ buildSessionExpiredResponse()
    │           └─→ 200 { error: "session_expired" }
    │           └─→ Frontend creates new session
    │
    ├─→ Database query fails
    │   └─→ catch error
    │   └─→ logAnalytics(sessionId, 'error')
    │   └─→ buildErrorResponse()
    │   └─→ 500 error response
    │
    ├─→ Claude API timeout
    │   └─→ catch error
    │   └─→ buildErrorResponse()
    │   └─→ 500 error response
    │
    └─→ Success!
        └─→ buildChatResponse()
        └─→ 200 with session info
```

---

## 9️⃣ Scaling Considerations

### Current Architecture (Single Server)

```
┌─────────────────────────────┐
│    Node.js Server           │
│  ┌───────────────────────┐  │
│  │  activeSessions Map   │  │ In-memory
│  │  (400MB for 100k)     │  │
│  └───────────────────────┘  │
│         │ queries            │
│  ┌──────▼──────────────────┐ │
│  │   PostgreSQL Database   │ │
│  │   (conversations,       │ │
│  │    messages tables)     │ │
│  └─────────────────────────┘ │
└─────────────────────────────┘

Pros: Simple, low latency
Cons: Limited to one server
```

### Scaling to Multiple Servers (Future)

```
┌──────────────────────────────────────────────────────┐
│            Load Balancer                             │
└──────┬───────────────┬───────────────┬───────────────┘
       │               │               │
   ┌───▼────┐  ┌───────▼──┐   ┌──────▼────┐
   │Server 1│  │ Server 2 │   │ Server 3  │
   │ (App)  │  │  (App)   │   │  (App)    │
   └────┬───┘  └────┬─────┘   └────┬──────┘
        │           │              │
        │    ┌──────▼──────────────▼─────┐
        │    │   Redis (Session Store)   │
        │    │  (replaces in-memory Map) │
        │    │  Key: sessionId           │
        │    │  TTL: 120 seconds         │
        │    │  Auto-expires             │
        │    └──────┬──────────────────┬─┘
        │           │                  │
        └───────────┼──────────────────┘
                    │
        ┌───────────▼──────────────┐
        │  PostgreSQL (Messages)   │
        │  (shared database)       │
        └──────────────────────────┘

To upgrade: Replace activeSessions Map with Redis SET operations
```

---

## 🔟 Monitoring & Observability

```
Application Events Logged:

✅ Session created
   console.log(`🆕 New session created: ${sessionId}`)

✅ Session expired
   console.log(`⏰ Session expired: ${sessionId}`)
   logAnalytics(sessionId, 'session_expired')

✅ Warning shown
   warningShown = true in activeSessions Map
   response includes warning object

✅ Escalation triggered
   logAnalytics(sessionId, 'escalation_requested')

❌ Error occurred
   logAnalytics(sessionId, 'error_occurred', error details)

📊 Session cleanup
   console.log(`🧹 Cleaned up ${count} expired sessions`)

Queries for Analysis:

1. Active sessions NOW:
   SELECT COUNT(*) FROM conversations
   WHERE updated_at > NOW() - INTERVAL '2 minutes'

2. Average session duration:
   SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))
   FROM conversations

3. Total messages per session:
   SELECT session_id, COUNT(*) as count
   FROM messages
   GROUP BY session_id

4. Peak usage times:
   SELECT DATE_TRUNC('hour', created_at),
          COUNT(*) as new_sessions
   FROM conversations
   GROUP BY DATE_TRUNC('hour', created_at)
```
