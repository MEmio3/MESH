// network.js — WebSocket Host Engine
// Derived strictly from .claude/rules/ (state-models.md, network-schemas.md, core-flows.md)
// Pure Node.js module — no Electron dependencies so it can be tested standalone.

const { WebSocketServer } = require('ws')
const { MSG_TYPES, DEFAULTS } = require('../shared/constants')
const config = require('./config')
const { encrypt, decrypt } = require('./crypto')
const media = require('./media')
const fs = require('fs')
const path = require('path')

// --- Chat Log Persistence ---
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs')

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true })
}

function saveHistory(serverState) {
  ensureLogsDir()
  const filePath = path.join(LOGS_DIR, `room_${serverState.room_code}.json`)
  const uid = config.getConfig().uid
  const encrypted = encrypt(serverState.history, uid)
  fs.writeFileSync(filePath, encrypted)
}

/**
 * Load persisted history for a room_code from disk (if it exists).
 * Decrypts using the host's UID. Falls back to plain JSON for legacy logs.
 * @param {string} roomCode
 * @returns {Array}
 */
function loadHistory(roomCode) {
  const filePath = path.join(LOGS_DIR, `room_${roomCode}.json`)
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const uid = config.getConfig().uid
    try {
      return decrypt(raw, uid)
    } catch {
      // Fallback: try parsing as legacy plain JSON
      try { return JSON.parse(raw) } catch { return [] }
    }
  }
  return []
}

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

function handleMessage(data, isBinary, ws, serverState) {
  // Binary frame: media upload from client
  if (isBinary) {
    return handleBinaryMessage(data, ws, serverState)
  }

  let payload
  try {
    const raw = data.toString()
    payload = JSON.parse(raw)
    // Trace: log raw payload for chat/edit/delete to debug persistence
    if (payload.type === 'chat' || payload.type === 'msg_edit' || payload.type === 'msg_delete') {
      console.log(`[MESH TRACE] ${payload.type} raw keys: [${Object.keys(payload).join(',')}] reply_to=${JSON.stringify(payload.reply_to ?? 'ABSENT').slice(0,100)} forwarded=${payload.forwarded}`)
    }
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

    // --- Send accepted to new client (paginated) ---
    const histSlice = serverState.history.slice(-DEFAULTS.PAGE_SIZE)
    console.log(`[MESH] Sending accepted with ${histSlice.length} history entries (total: ${serverState.history.length})`)
    histSlice.forEach((h, i) => {
      const flags = [h.reply_to ? 'reply' : '', h.forwarded ? 'fwd' : '', h.edited ? 'edit' : ''].filter(Boolean).join(',')
      console.log(`  [${i}] ${h.msg_id} uid=${h.uid?.slice(0,6)} "${(h.msg || '').slice(0,30)}" ${flags || '-'}`)
    })
    send(ws, {
      type: MSG_TYPES.ACCEPTED,
      room_code: serverState.room_code,
      room_name: serverState.room_name,
      history: histSlice,
      has_more: serverState.history.length > DEFAULTS.PAGE_SIZE,
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

    // Debug: log full payload to verify reply_to/forwarded arrive from client
    console.log(`[MESH] Chat payload keys: ${Object.keys(payload).join(',')}`)
    if (payload.reply_to) console.log(`[MESH] Chat has reply_to: ${JSON.stringify(payload.reply_to).slice(0, 200)}`)
    if (payload.forwarded) console.log(`[MESH] Chat is forwarded`)

    // Append to history — trim to DEFAULTS.HISTORY_LIMIT
    // History shape from state-models.md
    serverState.history.push({
      uid:       payload.uid,
      nick:      payload.nick,
      msg:       payload.msg,
      msg_id:    payload.msg_id,
      media:     payload.media ?? null,
      reply_to:  payload.reply_to ?? null,
      forwarded: payload.forwarded ?? false,
      reactions: {},
      seen_by:   [],
    })
    if (serverState.history.length > DEFAULTS.HISTORY_LIMIT) {
      serverState.history.shift()
    }

    // Persist to disk
    saveHistory(serverState)

    // Broadcast exact payload to all peers (connected + guest), excluding sender
    broadcastAll(serverState, payload, ws)
    console.log(`[MESH] Chat from ${payload.nick}: ${payload.msg}`)
    return
  }

  if (payload.type === MSG_TYPES.REACTION) {
    if (!serverState.connected_peers.has(ws._mesh_uid)) return

    const entry = serverState.history.find((h) => h.msg_id === payload.msg_id)
    if (entry) {
      if (!entry.reactions) entry.reactions = {}
      // Toggle: same emoji removes it, different emoji updates it
      if (entry.reactions[payload.uid] === payload.emoji) {
        delete entry.reactions[payload.uid]
      } else {
        entry.reactions[payload.uid] = payload.emoji
      }
      saveHistory(serverState)
    }

    // Broadcast to all peers (including sender so their UI updates)
    broadcastAll(serverState, payload)
    return
  }

  if (payload.type === MSG_TYPES.MSG_EDIT) {
    console.log(`[MESH] msg_edit received: msg_id=${payload.msg_id} uid=${payload.uid} ws._mesh_uid=${ws._mesh_uid} inPeers=${serverState.connected_peers.has(ws._mesh_uid)}`)
    if (!serverState.connected_peers.has(ws._mesh_uid)) { console.log('[MESH] msg_edit rejected: not in connected_peers'); return }
    const entry = serverState.history.find((h) => h.msg_id === payload.msg_id && h.uid === payload.uid)
    if (entry) {
      entry.msg = payload.new_msg
      entry.edited = true
      saveHistory(serverState)
      console.log(`[MESH] Message edited: ${payload.msg_id} → "${payload.new_msg?.slice(0, 50)}"`)
    } else {
      console.log(`[MESH] Edit failed — msg ${payload.msg_id} not found for uid ${payload.uid}. History msg_ids: ${serverState.history.map(h => h.msg_id).join(',')}`)
    }
    broadcastAll(serverState, { type: MSG_TYPES.MSG_EDIT, msg_id: payload.msg_id, uid: payload.uid, new_msg: payload.new_msg })
    return
  }

  if (payload.type === MSG_TYPES.MSG_DELETE) {
    console.log(`[MESH] msg_delete received: msg_id=${payload.msg_id} uid=${payload.uid} ws._mesh_uid=${ws._mesh_uid} inPeers=${serverState.connected_peers.has(ws._mesh_uid)}`)
    if (!serverState.connected_peers.has(ws._mesh_uid)) { console.log('[MESH] msg_delete rejected: not in connected_peers'); return }
    const idx = serverState.history.findIndex((h) => h.msg_id === payload.msg_id && h.uid === payload.uid)
    if (idx !== -1) {
      serverState.history.splice(idx, 1)
      saveHistory(serverState)
      console.log(`[MESH] Message deleted: ${payload.msg_id} (history now ${serverState.history.length} entries)`)
    } else {
      console.log(`[MESH] Delete failed — msg ${payload.msg_id} not found for uid ${payload.uid}`)
      console.log(`[MESH] History entries: ${serverState.history.map(h => `${h.msg_id}(uid:${h.uid?.slice(0,6)})`).join(', ')}`)
    }
    broadcastAll(serverState, { type: MSG_TYPES.MSG_DELETE, msg_id: payload.msg_id, uid: payload.uid })
    return
  }

  if (payload.type === MSG_TYPES.MEDIA_FETCH) {
    if (!serverState.connected_peers.has(ws._mesh_uid)) return

    const fileBuf = media.loadMedia(serverState.room_code, payload.media_id)
    if (!fileBuf) {
      send(ws, { type: MSG_TYPES.MEDIA_ERROR, media_id: payload.media_id })
      return
    }

    // Look up mime/filename from history
    const histEntry = serverState.history.find((h) => h.media?.media_id === payload.media_id)
    const respHeader = {
      type: MSG_TYPES.MEDIA_DATA,
      media_id: payload.media_id,
      mime: histEntry?.media?.mime || 'application/octet-stream',
      filename: histEntry?.media?.filename || 'file',
    }
    const respHeaderStr = JSON.stringify(respHeader)
    const respHeaderBuf = Buffer.from(respHeaderStr, 'utf-8')
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(respHeaderBuf.length)
    ws.send(Buffer.concat([lenBuf, respHeaderBuf, fileBuf]))
    console.log(`[MESH] Media sent: ${payload.media_id}`)
    return
  }

  if (payload.type === MSG_TYPES.HISTORY_FETCH) {
    const idx = serverState.history.findIndex((h) => h.msg_id === payload.before_msg_id)
    if (idx <= 0) {
      send(ws, { type: MSG_TYPES.HISTORY_BATCH, messages: [], has_more: false })
      return
    }
    const start = Math.max(0, idx - DEFAULTS.PAGE_SIZE)
    const batch = serverState.history.slice(start, idx)
    send(ws, {
      type: MSG_TYPES.HISTORY_BATCH,
      messages: batch,
      has_more: start > 0,
    })
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

  // --- WebRTC Signaling Router (Phase 2) ---
  // webrtc-schemas.md: pure router — inject from_uid, forward to target, never parse sdp/candidate
  if (
    payload.type === MSG_TYPES.WEBRTC_OFFER ||
    payload.type === MSG_TYPES.WEBRTC_ANSWER ||
    payload.type === MSG_TYPES.WEBRTC_ICE ||
    payload.type === MSG_TYPES.WEBRTC_HANGUP
  ) {
    const senderUid = ws._mesh_uid
    const targetPeer =
      serverState.connected_peers.get(payload.target_uid) ??
      serverState.guest_peers.get(payload.target_uid)

    if (!targetPeer) {
      send(ws, { type: MSG_TYPES.WEBRTC_ERROR, reason: 'peer_offline', target_uid: payload.target_uid })
      console.log(`[MESH] WebRTC ${payload.type} failed — target offline: ${payload.target_uid}`)
      return
    }

    send(targetPeer.ws, { ...payload, from_uid: senderUid })
    console.log(`[MESH] WebRTC ${payload.type} routed: ${senderUid} → ${payload.target_uid}`)
    return
  }

  console.log(`[MESH] Unhandled message type: ${payload.type}`)
}

function handleBinaryMessage(data, ws, serverState) {
  try {
    const headerLen = data.readUInt32BE(0)
    const headerStr = data.subarray(4, 4 + headerLen).toString('utf-8')
    const header = JSON.parse(headerStr)
    const binaryData = data.subarray(4 + headerLen)

    if (header.type === MSG_TYPES.MEDIA_UPLOAD) {
      if (!serverState.connected_peers.has(ws._mesh_uid)) return

      const mediaId = media.generateMediaId()
      media.saveMedia(serverState.room_code, mediaId, binaryData)

      let thumbnail = null
      if (header.mime && header.mime.startsWith('image/')) {
        thumbnail = media.generateImageThumbnail(binaryData)
      } else if (header.mime && header.mime.startsWith('video/') && header.videoThumbnail) {
        thumbnail = header.videoThumbnail
      }

      send(ws, {
        type: MSG_TYPES.MEDIA_UPLOADED,
        media_id: mediaId,
        thumbnail,
      })
      console.log(`[MESH] Media saved: ${mediaId} (${header.filename}, ${binaryData.length} bytes, thumbnail: ${thumbnail ? thumbnail.length + ' chars' : 'none'})`)
      return
    }

    console.log(`[MESH] Unhandled binary message type: ${header.type}`)
  } catch (err) {
    console.error('[MESH] Binary message parse error:', err.message)
  }
}

function handleConnection(ws, req, serverState) {
  ws._remote_ip = req.socket.remoteAddress
  ws.on('message', (data, isBinary) => handleMessage(data, isBinary, ws, serverState))
  ws.on('close', () => handleClose(ws, serverState))
}

// --- Public API ---

/**
 * Start a WebSocket server and register it in active_servers.
 * Derived from core-flows.md: "Hosting a Room"
 *
 * If room_code is provided (re-launch of a saved channel), pre-loads persisted history.
 * Always saves the channel to the user's config.saved_channels.
 *
 * @param {{ name: string, port: number, password: string, headless_relay: boolean, room_code?: string }} args
 * @returns {{ code: string, history: Array, ws_url: string }}
 */
function startHost({ name, port, password = '', headless_relay = false, room_code }) {
  if (active_servers.has(port)) {
    throw new Error('PORT_IN_USE')
  }

  // Use provided room_code (re-launch) or generate a fresh one
  const code = room_code || Math.random().toString(36).slice(2, 8).toUpperCase()

  // Pre-load persisted history if this channel was previously used
  const history = loadHistory(code)

  const wss = new WebSocketServer({ port, maxPayload: 50 * 1024 * 1024 })

  // ServerState: NetworkNode fields + per-server peer registries
  // Derived from state-models.md
  const serverState = {
    port,
    room_name: name,
    room_code: code,
    password,
    is_headless_relay: headless_relay,
    relay_auto_approve: false,
    running: true,
    wss,
    connected_peers: new Map(),
    guest_peers:     new Map(),
    pending_guests:  new Map(),
    history,
  }

  active_servers.set(port, serverState)
  wss.on('connection', (ws, req) => handleConnection(ws, req, serverState))

  // Persist this channel to saved_channels in the user's config
  if (!headless_relay) {
    config.addChannel({ room_code: code, name, port, password })
  }

  console.log(`[MESH] Server started on port ${port} (code: ${code})`)
  return {
    code,
    history: history.slice(-DEFAULTS.PAGE_SIZE),
    has_more: history.length > DEFAULTS.PAGE_SIZE,
    ws_url: `ws://localhost:${port}`,
  }
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

/**
 * Gracefully shutdown a server: disconnect all peers, close WSS, save history, remove from registry.
 * @param {number} port
 */
function shutdownServer(port) {
  const serverState = active_servers.get(port)
  if (!serverState) throw new Error('SERVER_NOT_FOUND')

  // Close every connected peer's socket
  for (const peer of serverState.connected_peers.values()) {
    try { peer.ws.close(1000, 'server_shutdown') } catch {}
  }
  for (const peer of serverState.guest_peers.values()) {
    try { peer.ws.close(1000, 'server_shutdown') } catch {}
  }

  // Persist final history
  if (serverState.history.length > 0) saveHistory(serverState)

  // Close the WebSocket server itself
  serverState.wss.close()
  serverState.running = false
  active_servers.delete(port)
  console.log(`[MESH] Server shutdown on port ${port}`)
}

/**
 * Return a snapshot of all running servers for the UI.
 * @returns {Array<{ port: number, name: string, code: string, peerCount: number, isRelay: boolean }>}
 */
function getActiveServers() {
  const servers = []
  for (const [port, state] of active_servers.entries()) {
    servers.push({
      port,
      name:      state.room_name,
      code:      state.room_code,
      peerCount: state.connected_peers.size + state.guest_peers.size,
      isRelay:   state.is_headless_relay,
    })
  }
  return servers
}

/**
 * Return connection info for an already-running server so the host can re-enter.
 * @param {number} port
 * @returns {{ code: string, history: Array, ws_url: string }}
 */
function reenterRoom(port) {
  const serverState = active_servers.get(port)
  if (!serverState) throw new Error('SERVER_NOT_FOUND')
  return {
    code:    serverState.room_code,
    history: serverState.history.slice(-DEFAULTS.PAGE_SIZE),
    has_more: serverState.history.length > DEFAULTS.PAGE_SIZE,
    ws_url:  `ws://localhost:${port}`,
  }
}

module.exports = { startHost, stopHost, shutdownServer, getActiveServers, reenterRoom, active_servers }
