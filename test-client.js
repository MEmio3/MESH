// test-client.js — Multi-client chat room verification
// Task-Do-Verify: proves 2-client chat broadcast before wiring to React UI.
// Usage: node test-client.js

const { WebSocket } = require('ws')
const { startHost } = require('./src/main/network')

// --- Start the host ---
const { ws_url } = startHost({ name: 'TestRoom', port: 5555, password: '', headless_relay: false })

// --- Timeout guard ---
const timeout = setTimeout(() => {
  console.error('[TEST] TIMEOUT — scenario incomplete within 8s')
  process.exit(1)
}, 8000)

function fail(reason) {
  console.error(`[TEST] ✗ FAIL: ${reason}`)
  clearTimeout(timeout)
  process.exit(1)
}

// --- Client A ---
const clientA = new WebSocket(ws_url)
let clientAReady = false

clientA.on('open', () => {
  console.log('[TEST] Client A connected, joining...')
  clientA.send(JSON.stringify({
    type: 'join', uid: 'client-a', nick: 'ClientA', password: '', dp: '', bio: '',
  }))
})

clientA.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  if (msg.type === 'accepted') {
    console.log('[TEST] Client A: ✓ accepted')
  }

  if (msg.type === 'user_list' && !clientAReady) {
    clientAReady = true
    // A's join is complete — now connect Client B
    console.log('[TEST] Client B connecting...')
    connectClientB()
  }

  if (msg.type === 'mesh_peer_joined') {
    if (msg.uid !== 'client-b') fail(`Expected mesh_peer_joined for client-b, got ${msg.uid}`)
    console.log('[TEST] Client A: ✓ mesh_peer_joined for client-b')
  }

  if (msg.type === 'chat') {
    if (msg.uid !== 'client-b') fail(`Expected chat from client-b, got uid=${msg.uid}`)
    if (msg.msg !== 'Hello MESH!') fail(`Expected msg "Hello MESH!", got "${msg.msg}"`)
    console.log(`[TEST] Client A: ✓ chat received — "${msg.msg}"`)
    console.log('[TEST] All checks passed. Exiting.')
    clearTimeout(timeout)
    process.exit(0)
  }
})

clientA.on('error', (err) => fail(`Client A error: ${err.message}`))

// --- Client B (connected after Client A is ready) ---
function connectClientB() {
  const clientB = new WebSocket(ws_url)
  let clientBReady = false

  clientB.on('open', () => {
    clientB.send(JSON.stringify({
      type: 'join', uid: 'client-b', nick: 'ClientB', password: '', dp: '', bio: '',
    }))
  })

  clientB.on('message', (data) => {
    const msg = JSON.parse(data.toString())

    if (msg.type === 'accepted') {
      console.log('[TEST] Client B: ✓ accepted')
    }

    if (msg.type === 'user_list' && !clientBReady) {
      clientBReady = true
      // B's join is complete — send chat message
      console.log('[TEST] Client B sending chat...')
      clientB.send(JSON.stringify({
        type: 'chat',
        uid: 'client-b',
        nick: 'ClientB',
        msg: 'Hello MESH!',
        msg_id: 'msg00001',
      }))
    }
  })

  clientB.on('error', (err) => fail(`Client B error: ${err.message}`))
}
