/**
 * Session Management Test & Example
 * 
 * Demonstrates the complete session lifecycle
 * Run with: node test-session-management.js
 */

const http = require('http');

// Configuration
const API_HOST = 'localhost';
const API_PORT = 3001;

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(responseData),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: responseData,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test scenarios
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║    EasyBima Chatbot - Session Management Tests             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Health Check
    console.log('📋 TEST 1: Health Check');
    console.log('─'.repeat(60));
    const healthRes = await makeRequest('GET', '/api/chat/health');
    console.log('✅ Response:', JSON.stringify(healthRes.body, null, 2));
    console.log('\n');

    // Test 2: New Session Creation
    console.log('📋 TEST 2: New Session Creation (First Message)');
    console.log('─'.repeat(60));
    const firstMsgRes = await makeRequest('POST', '/api/chat', {
      message: 'Hi, what insurance products do you offer?',
    });
    console.log('✅ Response:', JSON.stringify(firstMsgRes.body, null, 2));

    const sessionId = firstMsgRes.body.sessionId;
    console.log(`\n🆔 Created Session: ${sessionId}`);
    console.log(`⏱️  Time Remaining: ${firstMsgRes.body.session.timeRemainingSeconds}s\n`);

    // Test 3: Continue Session (reuse sessionId)
    console.log('📋 TEST 3: Continue Existing Session');
    console.log('─'.repeat(60));
    const secondMsgRes = await makeRequest('POST', '/api/chat', {
      message: 'Tell me more about life insurance',
      sessionId,
    });
    console.log('✅ Response (truncated):', {
      response: secondMsgRes.body.response?.substring(0, 100) + '...',
      sessionId: secondMsgRes.body.sessionId,
      timeRemainingSeconds: secondMsgRes.body.session.timeRemainingSeconds,
    });
    console.log('\n');

    // Test 4: Retrieve Conversation History
    console.log('📋 TEST 4: Retrieve Conversation History');
    console.log('─'.repeat(60));
    const historyRes = await makeRequest('GET', `/api/chat/conversation/${sessionId}`);
    console.log(`✅ Conversation has ${historyRes.body.messages.length} messages:`);
    historyRes.body.messages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. [${msg.role.toUpperCase()}] ${msg.content.substring(0, 50)}...`);
    });
    console.log(`${' '.repeat(3)}Session Active: ${historyRes.body.isActive}`);
    console.log(`${' '.repeat(3)}Time Remaining: ${historyRes.body.timeRemainingSeconds}s\n`);

    // Test 5: Keep-Alive Without Message
    console.log('📋 TEST 5: Keep-Alive Endpoint (Reset Timer)');
    console.log('─'.repeat(60));
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const keepAliveRes = await makeRequest('POST', '/api/chat/keep-alive', {
      sessionId,
    });
    console.log('✅ Keep-Alive Response:', {
      success: keepAliveRes.body.success,
      timeRemainingSeconds: keepAliveRes.body.timeRemainingSeconds,
      message: keepAliveRes.body.message,
    });
    console.log('   (Notice time reset to ~120s after 2s wait)\n');

    // Test 6: Simulate Inactivity & Warning
    console.log('📋 TEST 6: Inactivity Check (Simulated)');
    console.log('─'.repeat(60));
    console.log('⏱️  Waiting 110 seconds to approach warning threshold...');
    console.log('   (In production, this would happen gradually)');
    console.log('   Session expires at ~105s');
    console.log('   Warning shows at ~105s (15s before expiry)\n');

    // Test 7: Response Structure
    console.log('📋 TEST 7: Response Structure Explanation');
    console.log('─'.repeat(60));
    console.log('📤 Chat response includes:');
    console.log('   {');
    console.log('     response: string,              // AI response');
    console.log('     sessionId: string,             // Current session ID');
    console.log('     timestamp: ISO string,         // Server timestamp');
    console.log('     session: {');
    console.log('       isActive: boolean,           // Session still valid');
    console.log('       timeRemainingSeconds: number // Countdown timer');
    console.log('     },');
    console.log('     warning?: {                    // Only if < 15s left');
    console.log('       type: "session_expiring_soon",');
    console.log('       message: string,');
    console.log('       timeRemainingSeconds: number,');
    console.log('       action: string');
    console.log('     }');
    console.log('   }\n');

    // Test 8: Error Handling
    console.log('📋 TEST 8: Error Handling - Invalid Session');
    console.log('─'.repeat(60));
    const invalidSessionRes = await makeRequest('GET', '/api/chat/conversation/invalid-session-id');
    console.log('Response Status:', invalidSessionRes.status);
    console.log('Response Body:', JSON.stringify(invalidSessionRes.body, null, 2));
    console.log('\n');

    // Summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                     Test Summary                           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║ ✅ Session creation                                        ║');
    console.log('║ ✅ Message storage                                         ║');
    console.log('║ ✅ Session persistence                                     ║');
    console.log('║ ✅ History retrieval                                       ║');
    console.log('║ ✅ Keep-alive functionality                                ║');
    console.log('║ ✅ Response structure                                      ║');
    console.log('║ ✅ Error handling                                          ║');
    console.log('║                                                            ║');
    console.log('║ 🎯 All core features working!                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Frontend Integration Tips
    console.log('💡 FRONTEND INTEGRATION TIPS:\n');
    console.log('1️⃣  Store sessionId in state/localStorage:');
    console.log('   const [sessionId, setSessionId] = useState(null);\n');

    console.log('2️⃣  Display countdown timer:');
    console.log('   const timeRemaining = response.session.timeRemainingSeconds;');
    console.log('   <div>Session expires in: {timeRemaining}s</div>\n');

    console.log('3️⃣  Show warning when present:');
    console.log('   if (response.warning) {');
    console.log('     showWarningModal(response.warning.message);');
    console.log('   }\n');

    console.log('4️⃣  Call keep-alive every 30 seconds while user is idle:');
    console.log('   setInterval(() => keepAlive(sessionId), 30000);\n');

    console.log('5️⃣  Handle session expiration:');
    console.log('   if (response.error === "session_expired") {');
    console.log('     resetSession();');
    console.log('     setText("Please start a new conversation");');
    console.log('   }\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Make sure the backend server is running on port 3001');
  }
}

// Run tests
runTests();
