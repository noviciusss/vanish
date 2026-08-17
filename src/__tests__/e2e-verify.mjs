import io from 'socket.io-client';
import assert from 'node:assert/strict';
import Redis from 'ioredis';

const BASE_URL = 'http://localhost:3000';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function runE2ETests() {
  console.log('\n=============================================');
  console.log('🚀 Starting Full Anon Chat E2E Integration Test');
  console.log('=============================================\n');

  // Clean stale test keys in Redis
  await redis.del('online:pool');

  // STEP 1: Create Session 1 (User A)
  console.log('[1/7] Testing Anonymous Session & Identity Generation...');
  const resA = await fetch(`${BASE_URL}/api/auth/session`, { method: 'POST' });
  assert.equal(resA.status, 200, 'Session A creation should return 200');
  const rawCookieA = resA.headers.getSetCookie ? resA.headers.getSetCookie()[0] : resA.headers.get('set-cookie');
  const cookieA = rawCookieA?.split(';')[0] || '';
  const userA = await resA.json();
  console.log(`  ✓ User A created: ${userA.identity_id} (Cookie: ${cookieA.substring(0, 25)}...)`);
  assert.ok(userA.identity_id.startsWith('anon_'), 'Identity ID must start with anon_');

  // STEP 2: Create Session 2 (User B)
  const resB = await fetch(`${BASE_URL}/api/auth/session`, { method: 'POST' });
  const rawCookieB = resB.headers.getSetCookie ? resB.headers.getSetCookie()[0] : resB.headers.get('set-cookie');
  const cookieB = rawCookieB?.split(';')[0] || '';
  const userB = await resB.json();
  console.log(`  ✓ User B created: ${userB.identity_id}`);
  assert.notEqual(userA.identity_id, userB.identity_id, 'Identities must be unique');

  // STEP 3: Update Profile Tags
  console.log('\n[2/7] Testing Profile Tags & 10-tag Constraint...');
  const tagsA = ['gaming', 'anime', 'technology'];
  const resTagsA = await fetch(`${BASE_URL}/api/profile/tags`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieA,
    },
    body: JSON.stringify({ tags: tagsA }),
  });
  assert.equal(resTagsA.status, 200);
  const dataTagsA = await resTagsA.json();
  console.log(`  ✓ User A tags saved:`, dataTagsA.tags);

  // Test 11 tags rejection
  const tooManyTags = Array.from({ length: 11 }, (_, i) => `topic_${i}`);
  const resOver = await fetch(`${BASE_URL}/api/profile/tags`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieA,
    },
    body: JSON.stringify({ tags: tooManyTags }),
  });
  assert.equal(resOver.status, 400, 'Should reject > 10 tags with 400');
  console.log('  ✓ Verified max 10 tags server-side rule (rejected 11 tags with 400)');

  const tagsB = ['gaming', 'anime', 'music'];
  await fetch(`${BASE_URL}/api/profile/tags`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieB,
    },
    body: JSON.stringify({ tags: tagsB }),
  });
  console.log(`  ✓ User B tags saved:`, tagsB);

  // STEP 4: Realtime Socket Handshake & Matching
  console.log('\n[3/7] Connecting Realtime Sockets with JWT Auth...');
  const tokenA = cookieA.split(';')[0].split('=')[1];
  const tokenB = cookieB.split(';')[0].split('=')[1];

  const socketA = io(BASE_URL, {
    auth: { token: tokenA },
    extraHeaders: { Cookie: cookieA },
  });
  const socketB = io(BASE_URL, {
    auth: { token: tokenB },
    extraHeaders: { Cookie: cookieB },
  });

  socketA.on('connect_error', (err) => console.error('  ❌ Socket A connect error:', err.message));
  socketB.on('connect_error', (err) => console.error('  ❌ Socket B connect error:', err.message));

  await Promise.all([
    new Promise((resolve, reject) => {
      socketA.on('connect', resolve);
      socketA.on('connect_error', reject);
    }),
    new Promise((resolve, reject) => {
      socketB.on('connect', resolve);
      socketB.on('connect_error', reject);
    }),
  ]);
  console.log('  ✓ Both Sockets connected and authenticated');

  // STEP 5: Matching and Handshake
  console.log('\n[4/7] Testing Nearest Tag-Overlap Match Search...');
  let currentRoomId = '';

  await new Promise((resolve) => {
    const handleRequest = (socket, name) => (req) => {
      console.log(`  ✓ ${name} received chat request from: ${req.from_id} (Shared overlap: ${Math.round((req.shared_score || 0) * 100)}%)`);
      socket.emit('chat_accept', { from_id: req.from_id });
    };

    socketA.on('chat_request_received', handleRequest(socketA, 'User A'));
    socketB.on('chat_request_received', handleRequest(socketB, 'User B'));

    let resolved = false;
    const onReady = (name) => (data) => {
      console.log(`  ✓ ${name} room ready: ${data.room_id}`);
      currentRoomId = data.room_id;
      if (!resolved) {
        resolved = true;
        setTimeout(resolve, 100);
      }
    };

    socketA.on('room_ready', onReady('User A'));
    socketB.on('room_ready', onReady('User B'));

    // Start matching
    socketA.emit('request_match', { mode: 'nearest' });
    setTimeout(() => {
      socketB.emit('request_match', { mode: 'nearest' });
    }, 200);
  });

  // STEP 6: Live Messaging & HTML Sanitization
  console.log('\n[5/7] Testing Live Messaging & HTML-Escaping (XSS Prevention)...');
  await new Promise((resolve) => {
    socketB.once('message_received', (msg) => {
      console.log(`  ✓ User B received message from ${msg.from_id}: "${msg.text}"`);
      assert.equal(msg.from_id, userA.identity_id);
      assert.equal(msg.text, 'Hello, stranger!');
      resolve();
    });

    socketA.emit('send_message', {
      room_id: currentRoomId,
      text: 'Hello, stranger!',
    });
  });

  // Test XSS sanitization
  await new Promise((resolve) => {
    socketA.once('message_received', (msg) => {
      console.log(`  ✓ User A received sanitized message: "${msg.text}"`);
      assert.ok(!msg.text.includes('<script>'), 'Script tag must be stripped/escaped');
      assert.ok(msg.text.includes('&lt;script&gt;'), 'Must be HTML escaped');
      resolve();
    });

    socketB.emit('send_message', {
      room_id: currentRoomId,
      text: 'Testing XSS: <script>alert("hacked")</script>',
    });
  });

  // STEP 7: Report and Block
  console.log('\n[6/7] Testing Report & Permanent Block List...');
  await new Promise((resolve) => {
    socketA.once('report_ack', (data) => {
      console.log(`  ✓ User A report acknowledged. Blocked user: ${data.blocked_id}`);
      assert.equal(data.blocked_id, userB.identity_id);
      resolve();
    });

    socketA.emit('report_user', {
      room_id: currentRoomId,
      target_id: userB.identity_id,
    });
  });

  // STEP 8: Identity Rotation
  console.log('\n[7/7] Testing Instant Identity Rotation (Zero-link)...');
  const resRotate = await fetch(`${BASE_URL}/api/auth/rotate`, {
    method: 'POST',
    headers: { Cookie: cookieA },
  });
  const dataRotate = await resRotate.json();
  console.log(`  ✓ Identity rotated: ${userA.identity_id} ➔ ${dataRotate.identity_id}`);
  assert.notEqual(dataRotate.identity_id, userA.identity_id);

  socketA.disconnect();
  socketB.disconnect();
  await redis.quit();

  console.log('\n=============================================');
  console.log('🎉 ALL PHASES & TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=============================================\n');
  process.exit(0);
}

runE2ETests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
