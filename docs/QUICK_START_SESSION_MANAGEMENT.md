# 🚀 Quick Start: Session Management Implementation

## High-Level Overview

Your chatbot now has **professional session management** with these features:

✅ **Auto-session creation** - New sessions start automatically on first message  
✅ **Inactivity timeout** - Sessions expire after 2 minutes without activity  
✅ **Pre-warning system** - Users warned 15 seconds before expiration  
✅ **Message persistence** - All conversations stored in database  
✅ **History retrieval** - Users can reload their conversation  
✅ **Keep-alive option** - Frontend can prevent expiration during editing  

---

## 📋 Implementation Steps (15-30 minutes)

### Step 1: Run Database Migration (5 min)

```bash
cd backend
npm run db:migrate:sessions
```

**Output should show:**
```
✔ last_activity_at column added
✔ metadata column added  
✔ Index created for faster queries
✔ Trigger created
✔ 0 conversations updated (or more if you have existing data)
✨ Migration completed successfully!
```

### Step 2: Update server.js (3 min)

Add these lines to `backend/server.js`:

```javascript
// After line: const chatRoutes = require('./routes/chat');
const { startCleanupScheduler, stopCleanupScheduler } = require('./services/sessionManager');

// After line: app.listen(PORT, () => {
// Around line 65, BEFORE the console.log banner:
startCleanupScheduler();

// Add graceful shutdown (before app.listen):
process.on('SIGTERM', () => {
  console.log('⏹️  Shutting down gracefully...');
  stopCleanupScheduler();
  process.exit(0);
});
```

### Step 3: Update Routes (2 min)

**Option A: Gradual Migration (Recommended for safety)**

In `backend/server.js`, replace:
```javascript
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);
```

With:
```javascript
const chatRoutesV2 = require('./routes/chatV2');
const chatRoutesV1 = require('./routes/chat');

// Use new version
app.use('/api/chat', chatRoutesV2);

// Keep old version for fallback during transition
app.use('/api/chat-legacy', chatRoutesV1);
```

**Option B: Full Migration (Clean, but riskier)**

Replace immediately:
```javascript
const chatRoutes = require('./routes/chatV2');
app.use('/api/chat', chatRoutes);
```

### Step 4: Test Backend (3 min)

```bash
# Start your backend server
npm start    # or: npm run dev

# In another terminal, run the test suite
npm run test:sessions
```

**Expected output:**
```
✅ TEST 1: Health Check
✅ TEST 2: New Session Creation
✅ TEST 3: Continue Existing Session
✅ TEST 4: Retrieve Conversation History
✅ TEST 5: Keep-Alive Endpoint
✅ TEST 6: Inactivity Check
✅ TEST 7: Response Structure
✅ TEST 8: Error Handling

🎯 All core features working!
```

### Step 5: Update Frontend (5-10 min)

Replace your chat client with this pattern:

**React Example:**

```jsx
import { useState, useEffect, useRef } from 'react';

export function ChatComponent() {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(120);
  const [showWarning, setShowWarning] = useState(false);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Send message
  async function handleSendMessage(text) {
    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId, // Include sessionId if exists
        }),
      });

      const data = await response.json();

      // Handle expired session
      if (data.error === 'session_expired') {
        setSessionId(null);
        setShowWarning(false);
        // Retry with new session
        return handleSendMessage(text);
      }

      // Update session
      setSessionId(data.sessionId);

      // Add messages to chat
      setMessages(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: data.response },
      ]);

      // Update timer
      setTimeRemaining(data.session.timeRemainingSeconds);

      // Show warning if present
      if (data.warning) {
        setShowWarning(true);
      }

      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  // Update countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    let count = timeRemaining;
    timerRef.current = setInterval(() => {
      count--;
      setTimeRemaining(count);
      
      if (count <= 0) {
        clearInterval(timerRef.current);
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeRemaining]);

  // Keep-alive every 30 seconds (optional)
  useEffect(() => {
    if (!sessionId) return;

    const keepAliveInterval = setInterval(async () => {
      try {
        await fetch('http://localhost:3001/api/chat/keep-alive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch (error) {
        console.error('Keep-alive failed:', error);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(keepAliveInterval);
  }, [sessionId]);

  return (
    <div className="chat-container">
      {/* Messages */}
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      {/* Timer */}
      <div className={`timer ${timeRemaining < 30 ? 'warning' : ''}`}>
        ⏱️ Session: {timeRemaining}s
      </div>

      {/* Pre-expiration warning */}
      {showWarning && (
        <div className="warning-banner">
          ⚠️ Your conversation will close soon. Please reply to keep it open.
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        placeholder="Type your message..."
        onKeyPress={e => {
          if (e.key === 'Enter') {
            handleSendMessage(e.target.value);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}
```

**CSS (Styling):**

```css
.timer {
  padding: 8px 12px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
  margin: 10px 0;
}

.timer.warning {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffc107;
  animation: pulse 1s infinite;
}

.warning-banner {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 10px;
  animation: slideIn 0.3s ease-out;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes slideIn {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

### Step 6: Verify Everything Works

1. **Start backend:**
   ```bash
   npm start
   ```

2. **Check logs for:**
   ```
   ✅ Session cleanup scheduler started
   ```

3. **Send a test message via frontend or curl:**
   ```bash
   curl -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message":"Hi there"}' | jq
   ```

4. **Expected response:**
   ```json
   {
     "response": "...",
     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
     "session": {
       "isActive": true,
       "timeRemainingSeconds": 119
     }
   }
   ```

---

## 🔍 Testing Checklist

- [ ] Backend migration runs without errors
- [ ] Server starts successfully (see "Session cleanup scheduler started" in logs)
- [ ] First message creates a session ID
- [ ] Second message reuses the same session ID
- [ ] Messages appear in conversation history
- [ ] Timer decreases every second on frontend
- [ ] Keep-alive resets the timer
- [ ] Warning appears when < 15 seconds remain
- [ ] New session created after expiration

---

## 📊 Database Queries (For Monitoring)

**Check active sessions:**
```sql
SELECT COUNT(*) as active_sessions
FROM conversations
WHERE updated_at > NOW() - INTERVAL '2 minutes';
```

**View conversation history:**
```sql
SELECT m.created_at, m.role, m.content
FROM messages m
JOIN conversations c ON c.session_id = m.session_id
WHERE c.session_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY m.created_at ASC;
```

**Count messages per session:**
```sql
SELECT c.session_id, COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON c.session_id = m.session_id
GROUP BY c.session_id
ORDER BY message_count DESC;
```

---

## 🐛 Common Issues & Solutions

### Issue: "Session cleanup scheduler started" doesn't appear in logs

**Solution:**
```javascript
// Make sure you have this BEFORE app.listen:
const { startCleanupScheduler } = require('./services/sessionManager');
startCleanupScheduler(); // Add this!

app.listen(PORT, () => {
  // ... rest of code
});
```

### Issue: Sessions expiring immediately

**Solution:** Check SESSION_CONFIG:
```javascript
// In services/sessionManager.js
const SESSION_CONFIG = {
  TIMEOUT_MS: 120000,           // ← Should be 120000 (120 seconds)
  WARNING_THRESHOLD_MS: 15000,  // ← Should be 15000
  CLEANUP_INTERVAL_MS: 60000,   // ← Should be 60000
};
```

### Issue: Timer not updating on frontend

**Solution:** Make sure you're listening to `session.timeRemainingSeconds`:
```javascript
// In your chat component, after receiving response:
if (data.session && data.session.timeRemainingSeconds) {
  setTimeRemaining(data.session.timeRemainingSeconds);
}
```

### Issue: Database migration fails with "column already exists"

**Solution:** This is fine! The migration checks before adding. Just verify columns exist:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='conversations' 
ORDER BY column_name;
```

---

## 📚 File Reference

| File | Purpose |
|------|---------|
| `services/sessionManager.js` | Core session tracking logic |
| `controllers/chatControllerV2.js` | Enhanced chat handler |
| `routes/chatV2.js` | Updated API endpoints |
| `utils/responseBuilder.js` | Response formatting with warnings |
| `database/migration-session-management.js` | Database schema updates |
| `docs/SESSION_MANAGEMENT_GUIDE.md` | Detailed architecture documentation |

---

## ✅ You're Done!

Your chatbot now has:
- ✅ Professional session management
- ✅ Automatic message storage
- ✅ Conversation history retrieval
- ✅ Inactivity timeout with pre-warning
- ✅ Production-ready architecture

**Next steps:**
1. Customize timeout values in `SESSION_CONFIG`
2. Adjust warning UI based on UX feedback
3. Monitor analytics for usage patterns
4. Scale to Redis when needed (for multi-server deployment)

---

## 📞 Questions?

See the full documentation at: `docs/SESSION_MANAGEMENT_GUIDE.md`
