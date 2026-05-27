# Session Management & Message Storage Implementation Guide

## 📋 Overview

This guide explains the professional session management architecture for your EasyBima chatbot. The system provides:

✅ **Automatic session creation** when user sends first message  
✅ **Inactivity tracking** with 2-minute timeout  
✅ **Pre-expiration warnings** at 15 seconds remaining  
✅ **Message persistence** in database  
✅ **Session history retrieval**  
✅ **Keep-alive mechanism** for UI interactions  

---

## 🏗️ Architecture Overview

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React/Vue)                 │
│  • Displays countdown timer                              │
│  • Sends keep-alive pings                                │
│  • Shows warning notifications                           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼ HTTP Requests
┌─────────────────────────────────────────────────────────┐
│        Express Backend (sessionManager.js)              │
│  • Validates session status                              │
│  • Updates last_activity_at                              │
│  • Manages in-memory session store                        │
│  • Checks for pre-expiration warnings                     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼ Queries
┌─────────────────────────────────────────────────────────┐
│          PostgreSQL Database                            │
│  • Stores messages                                       │
│  • Tracks session metadata                               │
│  • Logs analytics                                        │
└─────────────────────────────────────────────────────────┘
```

### Session Lifecycle

```
User sends message
       ↓
[Session not in memory?] 
  → Create new entry in activeSessions Map
  → Set expiryTime = now + 120s
  → Insert into conversations table
       ↓
Store message in messages table
       ↓
[Time to respond?]
  → Generate AI response
  → Log response in messages table
       ↓
[Build response]
  → Include session status
  → Check if warning needed (< 15s remaining)
  → Add warning to response if necessary
       ↓
Return to client with:
  {
    response: "...",
    sessionId: "...",
    warning: { ... } // Only if < 15s remaining
  }
```

---

## 🚀 Implementation Steps

### Step 1: Run Database Migration

```bash
cd backend
node database/migration-session-management.js
```

This will:
- ✅ Add `last_activity_at` column to conversations table
- ✅ Add `metadata` JSONB column for session state
- ✅ Create indexes for performance
- ✅ Create trigger to auto-update `last_activity_at`

### Step 2: Update server.js

Add session cleanup scheduler startup:

```javascript
// In server.js, add:
const { startCleanupScheduler } = require('./services/sessionManager');

// After setting up routes
startCleanupScheduler();

// On shutdown (graceful)
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  const { stopCleanupScheduler } = require('./services/sessionManager');
  stopCleanupScheduler();
  process.exit(0);
});
```

### Step 3: Update Your Routes

Option A: **Gradually migrate** (keep both versions working)
```javascript
// In server.js
const chatRoutesV1 = require('./routes/chat');         // Old routes
const chatRoutesV2 = require('./routes/chatV2');       // New routes

app.use('/api/chat', chatRoutesV2);      // Use new version
app.use('/api/chat-legacy', chatRoutesV1); // Keep old for compatibility
```

Option B: **Full migration** (replace entirely)
```javascript
// In server.js
const chatRoutes = require('./routes/chatV2');
app.use('/api/chat', chatRoutes);
```

### Step 4: Update Frontend Client

```typescript
// Frontend React/Vue code
const API_BASE = 'http://localhost:3001/api';

interface ChatMessage {
  response: string;
  sessionId: string;
  timestamp: string;
  session: {
    isActive: boolean;
    timeRemainingSeconds: number;
  };
  warning?: {
    type: 'session_expiring_soon';
    message: string;
    timeRemainingSeconds: number;
    action: string;
  };
}

class ChatClient {
  private sessionId: string | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;

  async sendMessage(message: string): Promise<ChatMessage> {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId: this.sessionId,
      }),
    });

    const data = await response.json();

    // Handle session expiration on client
    if (data.error === 'session_expired') {
      this.sessionId = null;
      this.clearTimer();
      // Show message to user to start new conversation
      return this.sendMessage(message); // Retry with new session
    }

    this.sessionId = data.sessionId;

    // Show warning if present
    if (data.warning) {
      this.showWarning(data.warning);
    }

    // Update UI countdown
    this.updateCountdown(data.session.timeRemainingSeconds);

    return data;
  }

  private updateCountdown(seconds: number) {
    // Clear existing timer
    if (this.expiryTimer) clearInterval(this.expiryTimer);

    let remaining = seconds;
    
    // Update UI every second
    this.expiryTimer = setInterval(() => {
      remaining--;
      this.updateUITimer(remaining);

      if (remaining <= 0) {
        clearInterval(this.expiryTimer!);
      }
    }, 1000);
  }

  private updateUITimer(seconds: number) {
    // Update your UI here (e.g., show timer)
    console.log(`⏱️ Session expires in: ${seconds}s`);
  }

  private showWarning(warning: any) {
    // Show user-friendly warning
    console.warn('⚠️', warning.message);
    // You can show a modal, toast, or banner here
  }

  // Optional: Keep session alive without sending a message
  async keepAlive() {
    if (!this.sessionId) return;

    const response = await fetch(`${API_BASE}/chat/keep-alive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId }),
    });

    const data = await response.json();
    if (data.success) {
      this.updateCountdown(data.timeRemainingSeconds);
    }
  }

  private clearTimer() {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }
  }
}
```

---

## 📊 Database Schema (Post-Migration)

```sql
-- Conversations table (updated)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- ✨ NEW
    metadata JSONB DEFAULT '{}',                              -- ✨ NEW
);

-- Messages table (unchanged but optimized)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (session_id) REFERENCES conversations(session_id)
);

-- Indexes
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity_at DESC);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_messages_session_created ON messages(session_id, created_at);
```

---

## ⚙️ Configuration

Update `SESSION_CONFIG` in `services/sessionManager.js`:

```javascript
const SESSION_CONFIG = {
  TIMEOUT_MS: 120000,           // 🔧 2 minutes
  WARNING_THRESHOLD_MS: 15000,  // 🔧 Warn at 1m 45s
  CLEANUP_INTERVAL_MS: 60000,   // 🔧 Cleanup every 60s
};
```

**Tuning recommendations:**
- **Development:** 5-10 minutes timeout for easier testing
- **Production:** 2 minutes for optimized DB usage
- **Warning threshold:** 15-30 seconds before expiry

---

## 🔌 API Endpoints

### POST /api/chat
Send a message and interact with session

**Request:**
```json
{
  "message": "Hi, what policies do you offer?",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000" // optional
}
```

**Response (Normal):**
```json
{
  "response": "We offer life insurance, health insurance...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-05-27T10:30:00Z",
  "session": {
    "isActive": true,
    "timeRemainingSeconds": 118
  }
}
```

**Response (With Warning):**
```json
{
  "response": "...",
  "sessionId": "...",
  "timestamp": "2024-05-27T10:30:00Z",
  "session": {
    "isActive": true,
    "timeRemainingSeconds": 8
  },
  "warning": {
    "type": "session_expiring_soon",
    "message": "Your conversation will close in 8 seconds due to inactivity.",
    "timeRemainingSeconds": 8,
    "action": "Send a message to reset the timer"
  }
}
```

**Response (Expired):**
```json
{
  "error": "session_expired",
  "message": "Your conversation has expired due to inactivity. A new session will be started.",
  "reason": "inactivity",
  "timestamp": "2024-05-27T10:30:00Z"
}
```

### GET /api/chat/conversation/:sessionId
Retrieve conversation history

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "id": "...",
      "role": "user",
      "content": "Hi, what policies...",
      "created_at": "2024-05-27T10:25:00Z"
    },
    {
      "id": "...",
      "role": "assistant",
      "content": "We offer life insurance...",
      "created_at": "2024-05-27T10:25:05Z"
    }
  ],
  "isActive": true,
  "timeRemainingSeconds": 95,
  "createdAt": "2024-05-27T10:25:00Z",
  "lastActivityAt": "2024-05-27T10:27:00Z"
}
```

### POST /api/chat/keep-alive
Reset inactivity timer without sending a message

**Request:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Session keep-alive successful",
  "timeRemainingSeconds": 120,
  "timestamp": "2024-05-27T10:30:00Z"
}
```

---

## 🛡️ Professional Best Practices Implemented

### 1. **Session Management**
- ✅ In-memory session tracking + database persistence
- ✅ Automatic cleanup of expired sessions
- ✅ Non-blocking cleanup runs on separate interval

### 2. **User Experience**
- ✅ Clear pre-expiration warnings
- ✅ Keep-alive endpoint for user interactions
- ✅ Graceful session expiration handling
- ✅ Clear session history retrieval

### 3. **Performance**
- ✅ Indexed queries on `session_id` and `created_at`
- ✅ Efficient in-memory Map for active sessions
- ✅ Batch cleanup to avoid individual deletes
- ✅ Database triggers for automatic timestamp updates

### 4. **Security**
- ✅ Session IDs are UUIDs (cryptographically secure)
- ✅ Sessions isolated by `session_id`
- ✅ Inactivity timeout prevents session hijacking
- ✅ Analytics logging for audit trail

### 5. **Observability**
- ✅ Detailed logging at each session lifecycle step
- ✅ Analytics events for monitoring
- ✅ Reference IDs for error tracking
- ✅ Session stats endpoint for monitoring

---

## 📈 Monitoring & Analytics

Query active sessions:
```sql
SELECT COUNT(*) as active_sessions,
       AVG(EXTRACT(EPOCH FROM (now() - created_at))) as avg_duration_seconds
FROM conversations
WHERE updated_at > now() - interval '2 minutes';
```

Query expiration events:
```sql
SELECT DATE_TRUNC('hour', created_at) as hour,
       COUNT(*) as expiration_count
FROM chat_analytics
WHERE event_type = 'session_expired'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

---

## 🐛 Troubleshooting

### Sessions expiring too quickly
- ↳ Check `SESSION_CONFIG.TIMEOUT_MS` in `sessionManager.js`
- ↳ Verify `last_activity_at` is being updated in database

### Warnings not showing
- ↳ Check `WARNING_THRESHOLD_MS` (should be < `TIMEOUT_MS`)
- ↳ Verify frontend is listening to `warning` field in response

### Memory leaks with session store
- ↳ Ensure `cleanupExpiredSessions()` is running
- ↳ Check cleanup scheduler is started in server.js

### Database query timeouts
- ↳ Verify indexes exist: `idx_conversations_last_activity`
- ↳ Run `SELECT * FROM pg_stat_user_indexes` to check index usage

---

## 🚀 Next Steps

1. ✅ Run migration
2. ✅ Update server.js with session manager
3. ✅ Migrate routes (gradual or full)
4. ✅ Update frontend client
5. ✅ Test session creation and expiration
6. ✅ Monitor database performance
7. ✅ Adjust timeout configs based on UX feedback

---

## 📚 File Structure

```
backend/
├── services/
│   ├── sessionManager.js          ← NEW: Session lifecycle management
│   ├── conversationService.js     ← Existing: Message persistence
│   └── claudeService.js           ← Existing: AI integration
├── controllers/
│   ├── chatControllerV2.js        ← NEW: Enhanced chat handler
│   └── chatController.js          ← OLD: Keep for reference
├── routes/
│   ├── chatV2.js                  ← NEW: Updated endpoints
│   └── chat.js                    ← OLD: Keep for compatibility
├── utils/
│   └── responseBuilder.js         ← NEW: Session-aware responses
└── database/
    ├── migration-session-management.js ← NEW: DB migration
    └── schema.sql                 ← Keep: Base schema
```

---

## ✨ Summary

This architecture provides a **production-ready** session management system that:

- 🎯 Creates sessions automatically on first message
- ⏱️ Expires sessions after 2 minutes of inactivity
- ⚠️ Warns users 15 seconds before expiration
- 💾 Stores all messages in database permanently
- 🔄 Allows replay of conversation history
- 📊 Tracks analytics for monitoring
- 🛡️ Uses standard security practices
- 📈 Scales efficiently with database indexes
