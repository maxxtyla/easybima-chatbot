# ✅ Implementation Checklist

Use this checklist to ensure all steps are completed correctly.

---

## 📋 Phase 1: Database Migration

- [ ] Navigate to backend directory: `cd backend`
- [ ] Run migration: `npm run db:migrate:sessions`
- [ ] Verify output includes:
  - [ ] "✅ last_activity_at column added" (or "already exists")
  - [ ] "✅ metadata column added" (or "already exists")
  - [ ] "✅ Index created for faster queries" (or "already exists")
  - [ ] "✅ Trigger created" (or "already exists")
  - [ ] "✨ Migration completed successfully!"
- [ ] No error messages displayed
- [ ] Database connection still works

---

## 🔧 Phase 2: Backend Configuration

### 2.1: Update server.js

- [ ] Open `backend/server.js`
- [ ] Add import at top:
  ```javascript
  const { startCleanupScheduler, stopCleanupScheduler } = require('./services/sessionManager');
  ```
- [ ] Add this BEFORE `app.listen()`:
  ```javascript
  startCleanupScheduler();
  ```
- [ ] Add this BEFORE the listen call:
  ```javascript
  process.on('SIGTERM', () => {
    console.log('⏹️  Shutting down gracefully...');
    stopCleanupScheduler();
    process.exit(0);
  });
  ```
- [ ] Verify syntax: No red squiggly lines
- [ ] Save the file

### 2.2: Update Routes

- [ ] Open `backend/server.js`
- [ ] Find: `const chatRoutes = require('./routes/chat');`
- [ ] Replace with ONE of these options:

**OPTION A (Recommended - Gradual Migration):**
```javascript
const chatRoutesV2 = require('./routes/chatV2');
const chatRoutesV1 = require('./routes/chat');
app.use('/api/chat', chatRoutesV2);      // New version
app.use('/api/chat-legacy', chatRoutesV1); // Old version for fallback
```

**OPTION B (Full Migration - Replace Immediately):**
```javascript
const chatRoutes = require('./routes/chatV2');
app.use('/api/chat', chatRoutes);
```

- [ ] Verify syntax is correct
- [ ] Save the file

### 2.3: Verify Configuration Values

- [ ] Open `backend/services/sessionManager.js`
- [ ] Check SESSION_CONFIG:
  ```javascript
  const SESSION_CONFIG = {
    TIMEOUT_MS: 120000,           // ← Should be 120000
    WARNING_THRESHOLD_MS: 15000,  // ← Should be 15000
    CLEANUP_INTERVAL_MS: 60000,   // ← Should be 60000
  };
  ```
- [ ] Values match expected timeouts

---

## 🧪 Phase 3: Backend Testing

### 3.1: Start Server

- [ ] Terminal open in `backend` directory
- [ ] Run: `npm start` (or `npm run dev`)
- [ ] Wait for startup message
- [ ] Look for: `✅ Session cleanup scheduler started` in logs
- [ ] Server running on port 3001
- [ ] No error messages

### 3.2: Run Test Suite

- [ ] Open new terminal in `backend` directory
- [ ] Run: `npm run test:sessions`
- [ ] All tests should pass:
  - [ ] ✅ TEST 1: Health Check
  - [ ] ✅ TEST 2: New Session Creation
  - [ ] ✅ TEST 3: Continue Existing Session
  - [ ] ✅ TEST 4: Retrieve Conversation History
  - [ ] ✅ TEST 5: Keep-Alive Endpoint
  - [ ] ✅ TEST 6: Inactivity Check
  - [ ] ✅ TEST 7: Response Structure
  - [ ] ✅ TEST 8: Error Handling
- [ ] Final message: `🎯 All core features working!`
- [ ] No timeout errors

### 3.3: Manual API Test

- [ ] Open yet another terminal (or use curl/Postman)
- [ ] Test endpoint:
  ```bash
  curl -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"Hi, describe your session management"}'
  ```
- [ ] Response contains:
  - [ ] "response" field with AI message
  - [ ] "sessionId" field (a UUID)
  - [ ] "session" object with "timeRemainingSeconds"
  - [ ] "timestamp" field
  - [ ] No error message
- [ ] Copy the sessionId for next test
- [ ] Test keep-alive:
  ```bash
  curl -X POST http://localhost:3001/api/chat/keep-alive \
    -H "Content-Type: application/json" \
    -d '{"sessionId":"PASTE-SESSION-ID-HERE"}'
  ```
- [ ] Response shows "success": true
- [ ] Response shows "timeRemainingSeconds": 120 (reset)

---

## 🎨 Phase 4: Frontend Integration

### 4.1: Update Chat Component

- [ ] Open frontend chat component file
- [ ] Add state for session management:
  ```javascript
  const [sessionId, setSessionId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(120);
  const [showWarning, setShowWarning] = useState(false);
  ```
- [ ] Verify code compiles (no TypeScript errors)

### 4.2: Update Chat API Call

- [ ] Find message send handler
- [ ] Add sessionId to API request:
  ```javascript
  body: JSON.stringify({
    message: text,
    sessionId: sessionId, // Add this line
  })
  ```
- [ ] Extract sessionId from response:
  ```javascript
  setSessionId(data.sessionId);
  ```
- [ ] Verify code compiles

### 4.3: Add Timer Display

- [ ] Add UI element to show countdown:
  ```jsx
  <div className="session-timer">
    ⏱️ Session: {timeRemaining}s
  </div>
  ```
- [ ] Update timer on each response:
  ```javascript
  setTimeRemaining(data.session.timeRemainingSeconds);
  ```
- [ ] Add CSS styling for timer
- [ ] Verify UI renders correctly

### 4.4: Add Warning Display

- [ ] Add warning element:
  ```jsx
  {showWarning && (
    <div className="warning">
      ⚠️ Your conversation will close soon. Please reply to keep it open.
    </div>
  )}
  ```
- [ ] Handle warning in response:
  ```javascript
  if (data.warning) {
    setShowWarning(true);
  } else {
    setShowWarning(false);
  }
  ```
- [ ] Verify warning UI renders

### 4.5: Handle Session Expiration

- [ ] Check for expiration error in response:
  ```javascript
  if (data.error === 'session_expired') {
    setSessionId(null);
    setShowWarning(false);
    // Retry with new session
    return handleSendMessage(text);
  }
  ```
- [ ] Verify code compiles

### 4.6: Test Frontend

- [ ] Start frontend dev server
- [ ] Open chat interface in browser
- [ ] Send a message
- [ ] Verify:
  - [ ] Do you see the message in chat?
  - [ ] Does timer display and count down?
  - [ ] Is there no "undefined" in the response?
  - [ ] Can you see the sessionId in browser console?
  - [ ] Does sending another message show a response?
- [ ] Wait 2 minutes of inactivity (or adjust SESSION_CONFIG for testing)
- [ ] Send another message
- [ ] Verify: New sessionId generated

---

## 📊 Phase 5: Verification & Monitoring

### 5.1: Database Verification

- [ ] Open database tool (pgAdmin, psql, etc.)
- [ ] Check conversations table has new columns:
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name='conversations' 
  ORDER BY column_name;
  ```
- [ ] Results include:
  - [ ] "created_at"
  - [ ] "last_activity_at" ← NEW
  - [ ] "metadata" ← NEW
  - [ ] "updated_at"

### 5.2: Messages Storage Verification

- [ ] Query messages table:
  ```sql
  SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
  ```
- [ ] See recent messages from tests
- [ ] Messages have:
  - [ ] "session_id"
  - [ ] "role" (user or assistant)
  - [ ] "content"
  - [ ] "created_at"

### 5.3: Cleanup Verification

- [ ] Check server logs for cleanup messages:
  ```
  🧹 Cleaned up X expired sessions
  ```
- [ ] If no messages, cleanup might not have expired any yet (normal)
- [ ] Verify function is being called

### 5.4: Performance Verification

- [ ] Load test the API:
  ```bash
  # Multiple concurrent messages (testing with 10 simultaneous)
  for i in {1..10}; do
    curl -X POST http://localhost:3001/api/chat \
      -H "Content-Type: application/json" \
      -d '{"message":"Test message"}' &
  done
  ```
- [ ] Server responds without hanging
- [ ] No "connection pool exhausted" errors
- [ ] All responses succeed

---

## 📝 Phase 6: Documentation & Ready

### 6.1: Documentation Review

- [ ] You've read and understood:
  - [ ] QUICK_START_SESSION_MANAGEMENT.md (this file)
  - [ ] SESSION_MANAGEMENT_GUIDE.md (detailed docs)
  - [ ] ARCHITECTURE_DIAGRAMS.md (visual guides)

### 6.2: Configuration Tuning

- [ ] Configured SESSION_CONFIG for your use case:
  - [ ] Development: 600000 (10 min) timeout
  - [ ] Production: 120000 (2 min) timeout
  - [ ] Adjust WARNING_THRESHOLD as needed

### 6.3: Team Communication

- [ ] Team members understand:
  - [ ] How sessions work
  - [ ] 2-minute inactivity timeout
  - [ ] Warning at 15 seconds
  - [ ] Where logs appear
  - [ ] How to debug issues

---

## 🚀 Phase 7: Production Deployment

### 7.1: Pre-Deployment Checklist

- [ ] All tests pass locally
- [ ] No console errors in frontend
- [ ] No console errors in backend
- [ ] Database migration tested
- [ ] Response structure verified
- [ ] Timer functionality works
- [ ] Warning displays correctly
- [ ] Session expiration handled

### 7.2: Deployment Steps

- [ ] Deploy backend changes first
- [ ] Wait 5 minutes for servers to stabilize
- [ ] Monitor backend logs for errors
- [ ] Deploy frontend changes
- [ ] Monitor both frontend and backend
- [ ] Check for increased error rates

### 7.3: Post-Deployment Verification

- [ ] Test in production environment
- [ ] Monitor database query performance
- [ ] Check session cleanup running
- [ ] Verify new messages stored in database
- [ ] Alert team that system is ready

---

## 🐛 Phase 8: Troubleshooting (If Needed)

### Common Issues

**Issue: "Session cleanup scheduler started" not in logs**
- [ ] Check server.js for startCleanupScheduler() call
- [ ] Verify it's BEFORE app.listen()
- [ ] Restart server

**Issue: Sessions expiring too quickly (or not at all)**
- [ ] Check SESSION_CONFIG values
- [ ] Verify migrations ran
- [ ] Check last_activity_at column exists
- [ ] Restart server

**Issue: Timer not counting down**
- [ ] Check frontend state update: `setTimeRemaining(...)`
- [ ] Verify useEffect hook running
- [ ] Check browser console for errors
- [ ] Verify response includes `session.timeRemainingSeconds`

**Issue: Warnings not showing**
- [ ] Check response includes `warning` field
- [ ] Verify frontend checking for `data.warning`
- [ ] Check CSS isn't hiding warning div
- [ ] Check browser console logs

**Issue: Database errors**
- [ ] Run migration again: `npm run db:migrate:sessions`
- [ ] Check PostgreSQL connection string
- [ ] Verify indexes exist
- [ ] Check query logs for errors

---

## ✅ Final Sign-Off

When all checkboxes are complete:

- [ ] **Phase 1**: Database migration successful
- [ ] **Phase 2**: Backend configuration complete
- [ ] **Phase 3**: All backend tests pass
- [ ] **Phase 4**: Frontend integration complete
- [ ] **Phase 5**: Verification successful
- [ ] **Phase 6**: Documentation reviewed
- [ ] **Phase 7**: Production deployment ready
- [ ] **Phase 8**: Troubleshooting (if applicable)

🎉 **You're Ready for Production!**

---

## 📞 Quick Help

If you get stuck, check:

1. **Log files** - Backend console output
2. **Browser console** - Frontend JavaScript errors
3. **Database tool** - Verify schema changes
4. **Network tab** - Check API responses
5. **Documentation** - See SESSION_MANAGEMENT_GUIDE.md

---

## 🎯 Success Criteria

Your implementation is successful when:

✅ Sessions created automatically on first message  
✅ Messages stored and retrievable from database  
✅ Timer displays and counts down  
✅ Warning appears at 15 seconds  
✅ Sessions expire after 2 minutes of inactivity  
✅ New session created after expiration  
✅ No console errors  
✅ No database errors  
✅ Keep-alive endpoint works  
✅ All tests pass  

**Once all criteria are met, you're done!** 🚀
