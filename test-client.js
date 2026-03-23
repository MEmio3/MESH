// test-client.js — Standalone handshake verification
// Task-Do-Verify: proves the WS join handshake works before wiring to React UI.
// Usage: node test-client.js

const { WebSocket } = require('ws')
const { startHost } = require('./src/main/network')

// --- Start the host ---
const { ws_url } = startHost({ name: 'TestRoom', port: 5555, password: '', headless_relay: false })
console.log(`[TEST] Host started: ${ws_url}`)

// --- Timeout guard ---
const timeout = setTimeout(() => {
  console.error('[TEST] TIMEOUT — no response within 5s')
  process.exit(1)
}, 5000)

// --- Connect a test client ---
const client = new WebSocket(ws_url)

client.on('open', () => {
  const joinPayload = {
    type: 'join',
    uid: 'test-uid-001',
    nick: 'Tester',
    password: '',
    dp: '',
    bio: 'standalone test',
  }
  console.log('[TEST] Sending join payload...')
  client.send(JSON.stringify(joinPayload))
})

client.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  console.log('[TEST] Received:', JSON.stringify(msg, null, 2))

  if (msg.type === 'accepted') {
    const ok = msg.room_code && msg.room_name === 'TestRoom' && Array.isArray(msg.history)
    if (ok) {
      console.log('[TEST] ✓ Handshake verified — accepted payload is correct')
    } else {
      console.error('[TEST] ✗ accepted payload missing expected fields')
      clearTimeout(timeout)
      client.close()
      process.exit(1)
    }
  }

  if (msg.type === 'user_list') {
    const me = msg.users.find((u) => u.uid === 'test-uid-001')
    if (me && me.is_host) {
      console.log('[TEST] ✓ user_list verified — first joiner is host')
    } else {
      console.error('[TEST] ✗ user_list missing or is_host flag incorrect')
      clearTimeout(timeout)
      client.close()
      process.exit(1)
    }
    // user_list is the last expected message — all checks passed
    clearTimeout(timeout)
    client.close()
    console.log('[TEST] All checks passed. Exiting.')
    process.exit(0)
  }
})

client.on('error', (err) => {
  console.error('[TEST] WebSocket error:', err.message)
  clearTimeout(timeout)
  process.exit(1)
})
