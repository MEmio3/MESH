// network.js — WebSocket Host Engine
// Derived strictly from .claude/rules/ (state-models.md, network-schemas.md, core-flows.md)
// Pure Node.js module — no Electron dependencies so it can be tested standalone.

const { WebSocketServer } = require('ws')
const { MSG_TYPES, DEFAULTS } = require('../shared/constants')

// --- Global Registry ---
// active_servers: Map<port, ServerState>
// Derived from state-models.md: "Active Servers Registry"
const active_servers = new Map()

// --- Helpers ---

function send(ws, obj) {
  ws.send(JSON.stringify(obj))
}

function broadcast(serverState, obj, excludeWs) {
  for (const peer of serverState.connected_peers.values()) {
    if (peer.ws !== excludeWs) {
      send(peer.ws, obj)
    }
  }
}

// broadcastAll: covers connected_peers AND guest_peers (required for chat)
function broadcastAll(serverState, obj, excludeWs) {
  for (const peer of serverState.connected_peers.values()) {
    if (peer.ws !== excludeWs) send(peer.ws, obj)
  }
  for (const peer of serverState.guest_peers.values()) {
    if (peer.ws !== excludeWs) send(peer.ws, obj)
  }
}

// --- Core Handlers ---

function handleClose(ws, serverState) {
  const uid = ws._mesh_uid
  if (!uid) return // Client closed before completing join

  if (serverState.connected_peers.delete(uid)) {
    // Announce departure to remaining room peers
    broadcast(serverState, { type: MSG_TYPES.PEER_LEFT, uid })
  } else {
    // Guest on a relay — no broadcast needed (relay is headless)
    serverState.guest_peers.delete(uid)
  }
  console.log(`[MESH] Peer disconnected: ${uid}`)
}

function handleMessage(data, ws, serverState) {
  let payload
  try {
    payload = JSON.parse(data.toString())
  } catch {
    console.warn('[MESH] Received non-JSON message — ignoring')
    return
  }

  if (payload.type === MSG_TYPES.JOIN) {
    // --- Password validation ---
    if (serverState.password !== '' && payload.password !== serverState.password) {
      send(ws, { type: MSG_TYPES.REJECTED, reason: 'invalid_password' })
      ws.close()
      return
    }

    // --- UID uniqueness check ---
    if (serverState.connected_peers.has(payload.uid)) {
      send(ws, { type: MSG_TYPES.REJECTED, reason: 'uid_taken' })
      ws.close()
      return
    }

    // --- Build PeerObject ---
    // PeerObject shape from state-models.md
    const peer = {
      ws,
      nick: payload.nick,
      dp: payload.dp ?? '',
      is_host: serverState.connected_peers.size === 0, // first joiner is the host
      is_live: true,
      status: 'online',
      remote_ip: ws._remote_ip,
    }

    // Tag the socket so handleClose can look up the uid
    ws._mesh_uid = payload.uid

    // --- Announce new peer to ALL existing connected peers (before adding) ---
    // network-schemas.md: "Host -> All Existing (Join Announce)"
    broadcast(serverState, {
      type: MSG_TYPES.PEER_JOINED,
      uid: payload.uid,
      ip: ws._remote_ip,
    })

    // --- Add to registry ---
    serverState.connected_peers.set(payload.uid, peer)

    // --- Send accepted to new client ---
    // network-schemas.md: "Host -> New Client (Accepted)"
    send(ws, {
      type: MSG_TYPES.ACCEPTED,
      room_code: serverState.room_code,
      room_name: serverState.room_name,
      history: serverState.history,
    })

    // --- Send user_list to new client ---
    // network-schemas.md: "Host -> New Client (User List)"
    const users = []
    for (const [uid, p] of serverState.connected_peers.entries()) {
      users.push({ uid, nick: p.nick, dp: p.dp, is_host: p.is_host, status: p.status })
    }
    send(ws, { type: MSG_TYPES.USER_LIST, users })

    // --- Send existing peers to new client ---
    // network-schemas.md: "Host -> New Client (Existing Peers)" — mesh_peer_joined for each
    for (const [uid, p] of serverState.connected_peers.entries()) {
      if (uid !== payload.uid) {
        send(ws, { type: MSG_TYPES.PEER_JOINED, uid, ip: p.remote_ip })
      }
    }

    console.log(`[MESH] Peer joined: ${payload.nick} (${payload.uid}) on port ${serverState.port}`)
    return
  }

  if (payload.type === MSG_TYPES.CHAT) {
    // Only registered peers may broadcast chat
    if (!serverState.connected_peers.has(ws._mesh_uid)) return

    // Append to history — trim to DEFAULTS.HISTORY_LIMIT
    // History shape from state-models.md
    serverState.history.push({
      uid:       payload.uid,
      nick:      payload.nick,
      msg:       payload.msg,
      msg_id:    payload.msg_id,
      reactions: [],
      seen_by:   [],
    })
    if (serverState.history.length > DEFAULTS.HISTORY_LIMIT) {
      serverState.history.shift()
    }

    // Broadcast exact payload to all peers (connected + guest), excluding sender
    broadcastAll(serverState, payload, ws)
    console.log(`[MESH] Chat from ${payload.nick}: ${payload.msg}`)
    return
  }

  if (payload.type === MSG_TYPES.GUEST_RELAY_JOIN) {
    // Only valid on headless relay servers — network-schemas.md "Relay Routing"
    if (!serverState.is_headless_relay) {
      send(ws, { type: MSG_TYPES.REJECTED, reason: 'not_a_relay' })
      ws.close()
      return
    }

    // UID uniqueness across both registries
    if (serverState.guest_peers.has(payload.uid) || serverState.connected_peers.has(payload.uid)) {
      send(ws, { type: MSG_TYPES.REJECTED, reason: 'uid_taken' })
      ws.close()
      return
    }

    const guestPeer = {
      ws,
      nick:       payload.nick,
      dp:         payload.dp ?? '',
      is_host:    false,
      is_live:    true,
      status:     'online',
      remote_ip:  ws._remote_ip,
    }
    ws._mesh_uid  = payload.uid
    ws._is_guest  = true

    serverState.guest_peers.set(payload.uid, guestPeer)
    console.log(`[MESH RELAY] Guest joined: ${payload.nick} (${payload.uid}) on port ${serverState.port}`)

    // Acknowledge with accepted shape — gives client the relay code
    send(ws, {
      type:      MSG_TYPES.ACCEPTED,
      room_code: serverState.room_code,
      room_name: serverState.room_name,
      history:   [],
    })
    return
  }

  if (payload.type === MSG_TYPES.DIRECT_MESSAGE) {
    // network-schemas.md: host inspects target_uid and forwards exact payload to target WS
    const senderUid = ws._mesh_uid
    const targetPeer =
      serverState.connected_peers.get(payload.target_uid) ??
      serverState.guest_peers.get(payload.target_uid)

    if (!targetPeer) {
      send(ws, { type: MSG_TYPES.DM_ERROR })
      console.log(`[MESH RELAY] DM failed — target offline: ${payload.target_uid}`)
      return
    }

    // Inject from: sender_uid and forward the payload exactly as-is
    send(targetPeer.ws, { ...payload, from: senderUid })
    console.log(`[MESH RELAY] DM routed: ${senderUid} → ${payload.target_uid}`)
    return
  }

  console.log(`[MESH] Unhandled message type: ${payload.type}`)
}

function handleConnection(ws, req, serverState) {
  ws._remote_ip = req.socket.remoteAddress
  ws.on('message', (data) => handleMessage(data, ws, serverState))
  ws.on('close', () => handleClose(ws, serverState))
}

// --- Public API ---

/**
 * Start a WebSocket server and register it in active_servers.
 * Derived from core-flows.md: "Hosting a Room"
 *
 * @param {{ name: string, port: number, password: string, headless_relay: boolean }} args
 * @returns {{ code: string, history: Array, ws_url: string }}
 */
function startHost({ name, port, password = '', headless_relay = false }) {
  if (active_servers.has(port)) {
    throw new Error('PORT_IN_USE')
  }

  const room_code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const wss = new WebSocketServer({ port })

  // ServerState: NetworkNode fields + per-server peer registries
  // Derived from state-models.md
  const serverState = {
    port,
    room_name: name,
    room_code,
    password,
    is_headless_relay: headless_relay,
    relay_auto_approve: false,
    running: true,
    wss,
    connected_peers: new Map(),
    guest_peers:     new Map(),
    pending_guests:  new Map(),
    history:         [],
  }

  active_servers.set(port, serverState)
  wss.on('connection', (ws, req) => handleConnection(ws, req, serverState))

  console.log(`[MESH] Server started on port ${port} (code: ${room_code})`)
  return { code: room_code, history: [], ws_url: `ws://localhost:${port}` }
}

/**
 * Stop a running WebSocket server and remove it from active_servers.
 * @param {number} port
 */
function stopHost(port) {
  const serverState = active_servers.get(port)
  if (!serverState) throw new Error('SERVER_NOT_FOUND')

  serverState.wss.close()
  serverState.running = false
  active_servers.delete(port)
  console.log(`[MESH] Server stopped on port ${port}`)
}

module.exports = { startHost, stopHost, active_servers }
