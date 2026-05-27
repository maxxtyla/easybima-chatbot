const http = require('http');

console.log('🧪 TESTING SESSION PERSISTENCE\n');
console.log('Make sure backend is running on port 3001!\n');

// Test 1: Send first message (creates session)
console.log('📝 TEST 1: Sending first message...\n');

const req1 = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('Response 1:');
      console.log(JSON.stringify(response, null, 2));
      
      const sessionId = response.sessionId;
      
      if (!sessionId) {
        console.log('❌ ERROR: No sessionId returned!');
        process.exit(1);
      }
      
      console.log(`\n✅ Got sessionId: ${sessionId}`);
      console.log(`⏱️  Time remaining: ${response.session.timeRemainingSeconds}s`);
      console.log('\n' + '='.repeat(60));
      console.log('📝 TEST 2: Sending second message with SAME sessionId...\n');
      
      // Test 2: Send second message with same sessionId
      const req2 = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data2 = '';
        res.on('data', chunk => data2 += chunk);
        res.on('end', () => {
          try {
            const response2 = JSON.parse(data2);
            console.log('Response 2:');
            console.log(JSON.stringify(response2, null, 2));
            
            if (response2.sessionId === sessionId) {
              console.log(`\n✅ SUCCESS: Session ID persisted!`);
              console.log(`   Both requests used: ${sessionId}`);
            } else {
              console.log(`\n❌ FAILED: Got different sessionId!`);
              console.log(`   Request 1: ${sessionId}`);
              console.log(`   Request 2: ${response2.sessionId}`);
            }
            process.exit(0);
          } catch (e) {
            console.error('Parse error:', e);
            process.exit(1);
          }
        });
      });
      
      req2.write(JSON.stringify({ 
        message: 'Tell me more about that',
        sessionId: sessionId  // IMPORTANT: Pass sessionId!
      }));
      req2.end();
      
    } catch(e) {
      console.error('Parse error:', e);
      process.exit(1);
    }
  });
});

req1.on('error', (e) => {
  console.error('❌ Connection error:', e.message);
  console.error('Make sure the backend server is running on port 3001');
  console.error('Run: npm start (in backend folder)');
  process.exit(1);
});

req1.write(JSON.stringify({ message: 'Hi there' }));
req1.end();
