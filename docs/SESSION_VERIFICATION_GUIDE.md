# ✅ Session Management Verification Guide

## What You Just Did

✅ Fixed database schema by adding missing `is_active` columns  
✅ Session management system is installed and ready  
✅ Backend is configured to use session tracking  

---

## How Sessions Work (3-Minute Explanation)

### Frontend's Job
The **frontend must pass the sessionId** in every message after the first one:

```javascript
// Message 1 (no sessionId needed)
fetch('/api/chat', {
  body: JSON.stringify({ message: 'Hi there' })
})
// Response includes: sessionId: "abc-123"

// Message 2 (MUST pass same sessionId)
fetch('/api/chat', {
  body: JSON.stringify({ 
    message: 'Tell me more',
    sessionId: 'abc-123'  // ← IMPORTANT!
  })
})
```

### Backend's Job
1. ✅ Receives sessionId with each message
2. ✅ Tracks when user last sent a message
3. ✅ Stores messages in database
4. ✅ Returns timeRemainingSeconds in response

### Why Sessions Aren't Persisting
If you're seeing "every message is a new conversation", it's because:
- **Frontend is NOT passing sessionId back** in subsequent messages

---

## Testing It Works

### Option 1: Direct API Test (Recommended)

```bash
# STEP 1: Send first message (creates session)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi there"}' > response1.json

# Extract sessionId from response (copy it)
cat response1.json | jq '.sessionId'
# Example output: "20f28b6b-6ced-4a22-8533-7667535c7154"

# STEP 2: Send second message WITH sessionId
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me more","sessionId":"20f28b6b-6ced-4a22-8533-7667535c7154"}' > response2.json

# STEP 3: Check if SAME sessionId is returned
cat response2.json | jq '.sessionId'
# Should output the SAME sessionId from step 1
```

### Option 2: Using the Test File

Make sure backend is running:
```bash
npm start
```

Then in another terminal:
```bash
cd backend
node test-session-verify.js
```

Expected output:
```
✅ SUCCESS: Session ID persisted!
   Both requests used: 20f28b6b-6ced-4a22-8533-7667535c7154
```

---

## Fixing Your Frontend

Your frontend chat component needs to:

1. **Store the sessionId** after first message
2. **Pass it in all subsequent messages**
3. **Display timer countdownfrom response**

### React Example Fix

```jsx
import { useState } from 'react';

function ChatComponent() {
  const [sessionId, setSessionId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(120);

  async function sendMessage(text) {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        sessionId  // ← PASS THE SESSIONID!
      })
    });

    const data = await response.json();

    // Store the sessionId (even if same as before)
    setSessionId(data.sessionId);
    
    // Update timer
    setTimeRemaining(data.session.timeRemainingSeconds);

    // Show warning if present
    if (data.warning) {
      alert(data.warning.message);
    }
  }

  return (
    <div>
      <input onKeyPress={e => {
        if (e.key === 'Enter') {
          sendMessage(e.target.value);
          e.target.value = '';
        }
      }} />
      <div>Session: {timeRemaining}s remaining</div>
    </div>
  );
}
```

### Vue Example Fix

```vue
<template>
  <div>
    <input 
      @keydown.enter="sendMessage"
      placeholder="Type your message..."
    />
    <div>Session: {{ timeRemaining }}s remaining</div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      sessionId: null,
      timeRemaining: 120
    }
  },
  methods: {
    async sendMessage(event) {
      const text = event.target.value;
      event.target.value = '';

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: this.sessionId  // ← PASS THE SESSIONID!
        })
      });

      const data = await response.json();
      
      this.sessionId = data.sessionId;
      this.timeRemaining = data.session.timeRemainingSeconds;

      if (data.warning) {
        alert(data.warning.message);
      }
    }
  }
}
</script>
```

---

## What Response You Should See

### First Message (Creates Session)
```json
{
  "response": "Karibu! Hello...",
  "sessionId": "20f28b6b-6ced-4a22-8533-7667535c7154",
  "timestamp": "2026-05-27T20:22:14.289Z",
  "session": {
    "isActive": true,
    "timeRemainingSeconds": 112
  }
}
```

### Second Message (Same SessionId)
```json
{
  "response": "Sure! Here's more...",
  "sessionId": "20f28b6b-6ced-4a22-8533-7667535c7154",  // ← SAME!
  "timestamp": "2026-05-27T20:22:18.195Z",
  "session": {
    "isActive": true,
    "timeRemainingSeconds": 108
  }
}
```

### When Warning Shows (< 15s left)
```json
{
  "response": "...",
  "sessionId": "20f28b6b-6ced-4a22-8533-7667535c7154",
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

---

## Monitoring the Database

Check if messages are being stored in the database:

```sql
-- See all conversations
SELECT session_id, created_at, last_activity_at 
FROM conversations 
ORDER BY created_at DESC 
LIMIT 5;

-- See messages from a specific session
SELECT role, content, created_at
FROM messages
WHERE session_id = 'YOUR-SESSION-ID-HERE'
ORDER BY created_at;

-- Count messages
SELECT COUNT(*) as total_messages
FROM messages;
```

---

## Checklist: Verify Everything Works

**Backend:**
- [ ] Server running (`npm start`)
- [ ] No error messages in console
- [ ] "✅ Session cleanup scheduler started" appears in logs

**Database:**
- [ ] `products` table has `is_active` column
- [ ] `branches` table has `is_active` column
- [ ] `conversations` table has `last_activity_at` column
- [ ] `conversations` table has `metadata` column

**API:**
- [ ] First message returns a `sessionId`
- [ ] sessionId is a valid UUID (like `550e8400-e29b-41d4`)
- [ ] Timer starts at ~120 seconds
- [ ] Timer decreases each second

**Session Persistence:**
- [ ] Second message gets SAME sessionId when passed
- [ ] Timer resets to ~120s on new message
- [ ] Messages appear in database `messages` table

**Frontend:**
- [ ] After first message, display sessionId
- [ ] Display countdown timer
- [ ] Show warning when < 15 seconds
- [ ] **Pass sessionId in all subsequent messages** ← This is critical!

---

## Still Having Issues?

### Sessions still not persisting?
Check if your frontend is actually passing the sessionId:
```javascript
// ❌ WRONG
fetch('/api/chat', { body: JSON.stringify({ message: text }) })

// ✅ CORRECT
fetch('/api/chat', { 
  body: JSON.stringify({ message: text, sessionId: sessionId }) 
})
```

### Is_active column still missing?
Run the migration again:
```bash
node database/migration-add-is-active.js
```

### Timer not showing?
Make sure you're reading from response:
```javascript
// Wrong
const time = response.timeRemainingSeconds; 

// Correct
const time = response.session.timeRemainingSeconds;
```

---

## Summary

✅ **Database is fixed**  
✅ **Backend session management is installed**  
✅ **Sessions ARE being created**  

**Next Step:** Update your frontend to pass `sessionId` in all messages!

The system is working - your frontend just needs to store and reuse the sessionId. That's it!
