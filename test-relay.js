// test-relay.js — Headless relay + direct message routing verification
// Task-Do-Verify: proves guest_relay_join and direct_message routing before UI wiring.
// Usage: node test-relay.js

const { WebSocket } = require('ws')
const { startHost } = require('./src/main/network')

const RELAY_PORT    = 9999
const GUEST_A_UID   = 'guest-a-uid-001'
const GUEST_B_UID   = 'guest-b-uid-002'
const DM_CONTENT    = 'Hello B, this is a direct message!'
const UNKNOWN_UID   = 'uid-does-not-exist'

// --- Start headless relay ---
const { ws_url } = startHost({ name: 'TestRelay', port: RELAY_PORT, password: '', headless_relay: true })
console.log(`[TEST] Relay started: ${ws_url}`)

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

// ─── Guest A ───────────────────────────────────────────────────────────────

const guestA = new WebSocket(ws_url)
let guestAReady = false

guestA.on('open', () => {
  guestA.send(JSON.stringify({
    type: 'guest_relay_join', uid: GUEST_A_UID, nick: 'GuestA', dp: '',
  }))
})

guestA.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  if (msg.type === 'accepted' && !guestAReady) {
    guestAReady = true
    console.log('[TEST] Guest A: ✓ accepted by relay')
    // A is ready — connect Guest B
    connectGuestB()
  }

  if (msg.type === 'dm_error') {
    console.log('[TEST] Guest A: ✓ dm_error received for unknown target')
  }
})

guestA.on('error', (err) => fail(`Guest A error: ${err.message}`))

// ─── Guest B ───────────────────────────────────────────────────────────────

function connectGuestB() {
  const guestB = new WebSocket(ws_url)
  let guestBReady = false

  guestB.on('open', () => {
    guestB.send(JSON.stringify({
      type: 'guest_relay_join', uid: GUEST_B_UID, nick: 'GuestB', dp: '',
    }))
  })

  guestB.on('message', (data) => {
    const msg = JSON.parse(data.toString())

    if (msg.type === 'accepted' && !guestBReady) {
      guestBReady = true
      console.log('[TEST] Guest B: ✓ accepted by relay')

      // Both guests are in — Guest A sends a DM to Guest B
      console.log('[TEST] Guest A sending direct_message to Guest B...')
      guestA.send(JSON.stringify({
        type: 'direct_message',
        target_uid: GUEST_B_UID,
        content: DM_CONTENT,
      }))

      // Also test offline target — send DM to unknown UID
      console.log('[TEST] Guest A sending direct_message to unknown UID...')
      guestA.send(JSON.stringify({
        type: 'direct_message',
        target_uid: UNKNOWN_UID,
        content: 'should not arrive',
      }))
    }

    // Guest B receives the DM forwarded by the relay
    if (msg.type === 'direct_message') {
      console.log('[TEST] Guest B received:', JSON.stringify(msg, null, 2))

      if (msg.from !== GUEST_A_UID)
        fail(`Expected from=${GUEST_A_UID}, got from=${msg.from}`)

      if (msg.content !== DM_CONTENT)
        fail(`Expected content="${DM_CONTENT}", got "${msg.content}"`)

      if (msg.target_uid !== GUEST_B_UID)
        fail(`Expected target_uid=${GUEST_B_UID}, got ${msg.target_uid}`)

      console.log('[TEST] Guest B: ✓ direct_message verified (from, content, target_uid all correct)')
      console.log('[TEST] All checks passed. Exiting.')
      clearTimeout(timeout)
      process.exit(0)
    }
  })

  guestB.on('error', (err) => fail(`Guest B error: ${err.message}`))
}
