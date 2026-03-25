import { useState, useEffect, useRef } from 'react'
import { useMeshSocket } from './useMeshSocket'
import { ChatRoom } from './components/ChatRoom'
import { RelayActive } from './components/RelayActive'
import { SetupProfile } from './components/SetupProfile'
import { TitleBar } from './components/TitleBar'

/** Dashboard header avatar with onError fallback for broken data URLs */
function DashboardAvatar({ dpDataurl }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="w-9 h-9 rounded-xl border border-[rgba(16,124,16,0.25)] bg-[rgba(8,12,8,0.6)] overflow-hidden shrink-0 group-hover:border-[#107C10] group-hover:shadow-[0_0_16px_rgba(16,124,16,0.3)] transition-all">
      {dpDataurl && !failed ? (
        <img src={dpDataurl} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <svg className="w-full h-full p-1.5 text-[#3d5441]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      )}
    </div>
  )
}

export default function App() {
  // Profile config — loaded from disk on boot
  const [config, setConfig] = useState(null) // null = loading, { uid, nickname, ... }

  // Connection state
  const [session, setSession]   = useState(null)   // null | { uid, nick, isHost, roomCode, roomName }
  const [messages, setMessages] = useState([])     // { type, uid, nick, msg, msg_id, isMine }[]
  const [users, setUsers]       = useState([])     // { uid, nick, is_host, status }[]
  const [relay, setRelay]       = useState(null)   // null | { port, roomCode, name }

  // Dashboard form state
  const [hostForm, setHostForm] = useState({ name: '', port: '8765', password: '' })
  const [joinForm, setJoinForm] = useState({ ip: '', port: '8765', password: '' })
  const [log, setLog]           = useState([])
  const [editingProfile, setEditingProfile] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)

  const socket = useMeshSocket()
  const pendingUploadRef = useRef(null)

  // --- Load config on boot ---
  useEffect(() => {
    window.meshBridge.getConfig().then((cfg) => setConfig(cfg))
  }, [])

  function addLog(msg) {
    console.log('[MESH UI]', msg)
    setLog((prev) => [...prev.slice(-9), msg])
  }

  // --- Convert server history items into UI message shape ---
  function historyToMessages(history, myUid) {
    return (history || []).map((h) => ({
      type: 'chat',
      uid: h.uid,
      nick: h.nick,
      msg: h.msg,
      msg_id: h.msg_id,
      media: h.media ?? null,
      reply_to: h.reply_to ?? null,
      forwarded: h.forwarded ?? false,
      edited: h.edited ?? false,
      reactions: h.reactions ?? {},
      isMine: h.uid === myUid,
    }))
  }

  // --- Single message router — handles ALL WS message types ---
  function makeMessageHandler(nick, isHost) {
    return function handleMessage(msg) {
      switch (msg.type) {
        case 'accepted':
          setSession({ uid: config.uid, nick, isHost, roomCode: msg.room_code, roomName: msg.room_name })
          // Load chat history from server — always replace to get latest state
          {
            const hist = msg.history || []
            console.log(`[MESH] accepted: ${hist.length} history entries`)
            hist.forEach((h, i) => {
              const flags = [h.reply_to ? 'reply' : '', h.forwarded ? 'fwd' : '', h.edited ? 'edit' : ''].filter(Boolean).join(',')
              console.log(`  [${i}] ${h.msg_id} uid=${h.uid?.slice(0,6)} msg="${(h.msg || '').slice(0,30)}" ${flags || '-'}`)
            })
            setMessages(historyToMessages(hist, config.uid))
          }
          setHasMoreHistory(msg.has_more ?? false)
          addLog(`Connected — ${msg.room_name} (${msg.room_code})`)
          break

        case 'user_list':
          setUsers(msg.users)
          break

        case 'chat':
          setMessages((prev) => [...prev, { ...msg, isMine: false, edited: msg.edited ?? false }])
          setUsers((prev) => prev.map((u) => u.uid === msg.uid ? { ...u, nick: msg.nick } : u))
          break

        case 'reaction':
          // Skip if this is our own reaction echoing back (already handled optimistically)
          if (msg.uid === config.uid) break
          setMessages((prev) => prev.map((m) => {
            if (m.msg_id !== msg.msg_id) return m
            const reactions = { ...(m.reactions || {}) }
            if (reactions[msg.uid] === msg.emoji) delete reactions[msg.uid]
            else reactions[msg.uid] = msg.emoji
            return { ...m, reactions }
          }))
          break

        case 'msg_edit':
          console.log(`[MESH] Received msg_edit: msg_id=${msg.msg_id} uid=${msg.uid} myUid=${config.uid} skipping=${msg.uid === config.uid}`)
          if (msg.uid === config.uid) break // already handled optimistically
          setMessages((prev) => prev.map((m) =>
            m.msg_id === msg.msg_id ? { ...m, msg: msg.new_msg, edited: true } : m
          ))
          break

        case 'msg_delete':
          console.log(`[MESH] Received msg_delete: msg_id=${msg.msg_id} uid=${msg.uid} myUid=${config.uid} skipping=${msg.uid === config.uid}`)
          if (msg.uid === config.uid) break // already handled optimistically
          setMessages((prev) => prev.filter((m) => m.msg_id !== msg.msg_id))
          break

        case 'mesh_peer_joined':
          setUsers((prev) => {
            if (prev.find((u) => u.uid === msg.uid)) return prev
            return [...prev, { uid: msg.uid, nick: `peer-${msg.uid.slice(0, 6)}`, is_host: false, status: 'online' }]
          })
          break

        case 'mesh_peer_left':
          setUsers((prev) => prev.filter((u) => u.uid !== msg.uid))
          break

        case 'media_uploaded':
          if (pendingUploadRef.current) {
            pendingUploadRef.current.resolve(msg)
            pendingUploadRef.current = null
          }
          break

        case 'history_batch':
          setMessages((prev) => [...historyToMessages(msg.messages, config.uid), ...prev])
          setHasMoreHistory(msg.has_more ?? false)
          break

        default:
          console.log('[MESH UI] unhandled message type:', msg.type)
      }
    }
  }

  // --- Hosting a Room — core-flows.md ---
  async function handleStartRoom(overrides) {
    const name = overrides?.name ?? hostForm.name
    const port = overrides?.port ?? hostForm.port
    const password = overrides?.password ?? hostForm.password
    const room_code = overrides?.room_code ?? undefined

    if (!name || !port) { addLog('Name and Port are required.'); return }

    addLog(`Starting server on port ${port}...`)
    const result = await window.meshBridge.startHost({
      name, port: Number(port), password, headless_relay: false, room_code,
    })

    if (result.error) { addLog(`Error: ${result.error}`); return }
    addLog(`Server started — ${result.ws_url}`)

    // Refresh config — startHost saves the channel to saved_channels
    const freshConfig = await window.meshBridge.getConfig()
    setConfig(freshConfig)

    // Pre-load persisted history so it appears immediately
    if (result.history && result.history.length > 0) {
      setMessages(historyToMessages(result.history, config.uid))
    }
    setHasMoreHistory(result.has_more ?? false)

    const nick = config.nickname
    const joinPayload = { type: 'join', uid: config.uid, nick, password, dp: config.dp_dataurl, bio: config.bio }
    socket.connect(result.ws_url, joinPayload, makeMessageHandler(nick, true))
  }

  // --- Joining a Room — core-flows.md ---
  async function handleJoinRoom() {
    const { ip, port, password } = joinForm
    if (!ip || !port) { addLog('IP and Port are required.'); return }

    addLog(`Connecting to ${ip}:${port}...`)
    const result = await window.meshBridge.startClient({ ip, port: Number(port), password })

    if (!result.ws_url) { addLog('Error: no ws_url returned'); return }

    const nick = config.nickname
    const joinPayload = { type: 'join', uid: config.uid, nick, password, dp: config.dp_dataurl, bio: config.bio }
    socket.connect(result.ws_url, joinPayload, makeMessageHandler(nick, false))
  }

  // --- Chat actions passed to ChatRoom ---
  async function handleSendChat(text, media = null, extra = null) {
    if ((!text.trim() && !media) || !session) return
    const msg_id = Date.now().toString(36).slice(-8).toUpperCase()

    let mediaRef = null
    if (media?.arrayBuffer) {
      const uploadHeader = { type: 'media_upload', filename: media.filename, mime: media.mime, videoThumbnail: media.videoThumbnail || undefined }
      socket.sendBinary(uploadHeader, media.arrayBuffer)
      try {
        const uploaded = await new Promise((resolve, reject) => {
          pendingUploadRef.current = { resolve, reject }
          setTimeout(() => {
            if (pendingUploadRef.current) {
              pendingUploadRef.current = null
              reject(new Error('Upload timeout'))
            }
          }, 30000)
        })
        mediaRef = {
          media_id: uploaded.media_id,
          type: media.type,
          filename: media.filename,
          mime: media.mime,
          size: media.size,
          thumbnail: uploaded.thumbnail || media.videoThumbnail || null,
        }
      } catch (err) {
        console.error('[MESH] Media upload failed:', err)
        return
      }
    } else if (media) {
      mediaRef = media
    }

    const payload = {
      type: 'chat', uid: session.uid, nick: session.nick, msg: text.trim(), msg_id, media: mediaRef,
      ...(extra?.reply_to ? { reply_to: extra.reply_to } : {}),
      ...(extra?.forwarded ? { forwarded: true } : {}),
    }
    console.log(`[MESH] handleSendChat: extra=${JSON.stringify(extra)?.slice(0,200)} payload.reply_to=${!!payload.reply_to} payload.forwarded=${!!payload.forwarded}`)
    socket.sendMessage(payload)
    setMessages((prev) => [...prev, { ...payload, isMine: true, reactions: {} }])
  }

  function handleEditMessage(msg_id, new_msg) {
    if (!session) { console.warn('[MESH] handleEditMessage: no session'); return }
    console.log(`[MESH] handleEditMessage: msg_id=${msg_id} new_msg="${new_msg}" uid=${session.uid}`)
    socket.sendMessage({ type: 'msg_edit', msg_id, uid: session.uid, new_msg })
    setMessages((prev) => {
      const found = prev.find((m) => m.msg_id === msg_id)
      console.log(`[MESH] Edit optimistic: found=${!!found} msg_id=${msg_id}`)
      return prev.map((m) =>
        m.msg_id === msg_id ? { ...m, msg: new_msg, edited: true } : m
      )
    })
  }

  function handleDeleteMessage(msg_id) {
    if (!session) { console.warn('[MESH] handleDeleteMessage: no session'); return }
    console.log(`[MESH] handleDeleteMessage: msg_id=${msg_id} uid=${session.uid}`)
    socket.sendMessage({ type: 'msg_delete', msg_id, uid: session.uid })
    setMessages((prev) => {
      const found = prev.find((m) => m.msg_id === msg_id)
      console.log(`[MESH] Delete optimistic: found=${!!found} msg_id=${msg_id} before=${prev.length} after=${prev.length - (found ? 1 : 0)}`)
      return prev.filter((m) => m.msg_id !== msg_id)
    })
  }

  function handleReaction(msg_id, emoji) {
    if (!session) return
    const payload = { type: 'reaction', msg_id, uid: session.uid, emoji }
    socket.sendMessage(payload)
    // Optimistic update
    setMessages((prev) => prev.map((m) => {
      if (m.msg_id !== msg_id) return m
      const reactions = { ...(m.reactions || {}) }
      if (reactions[session.uid] === emoji) delete reactions[session.uid]
      else reactions[session.uid] = emoji
      return { ...m, reactions }
    }))
  }

  async function handleFetchMedia(mediaId) {
    const result = await socket.fetchMedia(mediaId)
    const blob = new Blob([result.data], { type: result.header.mime || 'application/octet-stream' })
    return URL.createObjectURL(blob)
  }

  function handleLoadOlder() {
    if (!messages.length) return
    const oldestMsgId = messages[0]?.msg_id
    if (!oldestMsgId) return
    socket.sendMessage({ type: 'history_fetch', before_msg_id: oldestMsgId })
  }

  function handleLeave() {
    socket.disconnect()
    setSession(null)
    setMessages([])
    setUsers([])
    setHasMoreHistory(false)
  }

  // --- Headless Relay ---
  async function handleStartRelay() {
    const { name, port, password } = hostForm
    if (!name || !port) { addLog('Name and Port are required.'); return }

    const result = await window.meshBridge.startHost({
      name, port: Number(port), password, headless_relay: true,
    })
    if (result.error) { addLog(`Error: ${result.error}`); return }
    setRelay({ port: Number(port), roomCode: result.code, name })
    addLog(`Relay started — port ${port} (${result.code})`)
  }

  async function handleStopRelay() {
    if (!relay) return
    await window.meshBridge.stopRelay({ port: relay.port })
    setRelay(null)
  }

  // --- Active Servers polling ---
  const [activeServers, setActiveServers] = useState([])

  useEffect(() => {
    if (!config) return // don't poll until config is loaded
    let mounted = true
    async function poll() {
      const servers = await window.meshBridge.getRunningServers()
      if (mounted) setActiveServers(servers)
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { mounted = false; clearInterval(interval) }
  }, [config, session, relay])

  // --- Host re-enters an already-running room ---
  async function handleReenterRoom(port) {
    const result = await window.meshBridge.reenterRoom({ port })
    if (result.error) { addLog(`Error: ${result.error}`); return }

    addLog(`Re-entering room on port ${port}...`)
    // Pre-load persisted history so it appears immediately
    if (result.history && result.history.length > 0) {
      setMessages(historyToMessages(result.history, config.uid))
    }
    setHasMoreHistory(result.has_more ?? false)
    const nick = config.nickname
    const joinPayload = { type: 'join', uid: config.uid, nick, password: '', dp: config.dp_dataurl, bio: config.bio }
    socket.connect(result.ws_url, joinPayload, makeMessageHandler(nick, true))
  }

  // --- Shutdown a server from the Active Servers panel ---
  async function handleShutdownServer(port) {
    const result = await window.meshBridge.shutdownPort({ port })
    if (result.error) { addLog(`Error: ${result.error}`); return }
    addLog(`Server on port ${port} shut down.`)
    const servers = await window.meshBridge.getRunningServers()
    setActiveServers(servers)
    // Refresh config so Saved Channels stays in sync
    const freshConfig = await window.meshBridge.getConfig()
    setConfig(freshConfig)
  }

  // --- Launch a saved channel from the Saved Channels panel ---
  function handleLaunchSavedChannel(channel) {
    handleStartRoom({
      name: channel.name,
      port: channel.port,
      password: channel.password,
      room_code: channel.room_code,
    })
  }

  // --- Remove a saved channel ---
  async function handleRemoveChannel(roomCode) {
    const freshConfig = await window.meshBridge.removeChannel({ room_code: roomCode })
    setConfig(freshConfig)
    addLog(`Channel removed.`)
  }

  // --- Render gates ---

  // 1. Still loading config
  if (config === null) {
    return (
      <div className="h-screen flex flex-col bg-[var(--bg-void)]">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[var(--text-muted)] text-sm tracking-widest uppercase">Loading...</span>
        </div>
      </div>
    )
  }

  // 2. No nickname set — first-boot profile setup
  if (!config.nickname) {
    return (
      <div className="h-screen flex flex-col bg-[var(--bg-void)]">
        <TitleBar />
        <div className="flex-1 overflow-y-auto">
          <SetupProfile
            uid={config.uid}
            onComplete={(updatedConfig) => setConfig(updatedConfig)}
          />
        </div>
      </div>
    )
  }

  // 3. Editing profile
  if (editingProfile) {
    return (
      <div className="h-screen flex flex-col bg-[var(--bg-void)]">
        <TitleBar />
        <div className="flex-1 overflow-y-auto">
          <SetupProfile
            uid={config.uid}
            existingConfig={config}
            onComplete={(updatedConfig) => { setConfig(updatedConfig); setEditingProfile(false) }}
            onCancel={() => setEditingProfile(false)}
          />
        </div>
      </div>
    )
  }

  // 4. Active relay view
  if (relay) {
    return (
      <div className="h-screen flex flex-col bg-[var(--bg-void)]">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <RelayActive relay={relay} onStop={handleStopRelay} />
        </div>
      </div>
    )
  }

  // 5. In a chat room
  if (session) {
    return (
      <div className="h-screen flex flex-col bg-[var(--bg-void)]">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <ChatRoom
            session={session}
            messages={messages}
            users={users}
            onSendChat={handleSendChat}
            onReaction={handleReaction}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onLeave={handleLeave}
            hasMoreHistory={hasMoreHistory}
            onLoadOlder={handleLoadOlder}
            onFetchMedia={handleFetchMedia}
          />
        </div>
      </div>
    )
  }

  // ── 6. Dashboard ──────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-[#080c08] text-[#e2efe3] flex flex-col select-none relative">
      <TitleBar />
      <div className="ambient-glow" />

      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">

        {/* ── Header ── */}
        <header className="glass-card-strong mx-4 mt-4 px-5 py-3 flex items-center gap-4 shrink-0 rounded-2xl">

          <span
            className="text-lg font-bold tracking-[0.25em] text-[#107C10] uppercase"
            style={{ animation: 'logo-pulse 2.5s ease-in-out infinite' }}
          >
            MESH
          </span>

          <span
            className="w-2 h-2 rounded-full bg-[#107C10] shrink-0"
            style={{ boxShadow: '0 0 8px #107C10', animation: 'status-blink 2.5s ease-in-out infinite' }}
          />

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setEditingProfile(true)}
              className="flex items-center gap-3 cursor-pointer group bg-transparent border-none p-0"
              title="Edit profile"
            >
              <div className="flex flex-col items-end">
                <span className="text-sm font-semibold text-[#e2efe3] group-hover:text-[#107C10] transition-colors">{config.nickname}</span>
                <span className="font-mono text-[10px] text-[#3d5441] tracking-wide">
                  {config.uid.slice(0, 8)}...
                </span>
              </div>
              <DashboardAvatar dpDataurl={config.dp_dataurl} />
            </button>
          </div>
        </header>

        {/* ── Bento Grid ── */}
        <main className="flex-1 grid grid-cols-[1fr_1fr_340px] gap-4 p-4 items-start overflow-y-auto">

          {/* ─── HOST CARD ─── */}
          <div className="glass-card relative p-6 overflow-hidden animate-fade-up glass-edge" style={{ animationDelay: '0ms' }}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-[rgba(16,124,16,0.12)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#107C10]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <h2 className="text-base font-bold text-[#e2efe3]">Create Room</h2>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-[#8aac8e]">Room Name</label>
                <input className="mesh-input" placeholder="e.g. Alpha Squad" value={hostForm.name} onChange={(e) => setHostForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1.5 text-[#8aac8e]">Port</label>
                  <input type="number" className="mesh-input font-mono" placeholder="8765" value={hostForm.port} onChange={(e) => setHostForm((f) => ({ ...f, port: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1.5 text-[#8aac8e]">Password</label>
                  <input type="password" className="mesh-input" placeholder="Optional" value={hostForm.password} onChange={(e) => setHostForm((f) => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-5">
              <button onClick={handleStartRoom} className="mesh-btn mesh-btn-primary flex-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start Room
              </button>
              <button onClick={handleStartRelay} className="mesh-btn mesh-btn-ghost flex-1" title="Headless relay — routes direct messages only">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Relay
              </button>
            </div>
          </div>

          {/* ─── JOIN CARD ─── */}
          <div className="glass-card relative p-6 overflow-hidden animate-fade-up glass-edge" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-[rgba(16,124,16,0.12)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#107C10]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              </div>
              <h2 className="text-base font-bold text-[#e2efe3]">Join Room</h2>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-[#8aac8e]">Host IP</label>
                <input className="mesh-input font-mono" placeholder="192.168.1.x" value={joinForm.ip} onChange={(e) => setJoinForm((f) => ({ ...f, ip: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1.5 text-[#8aac8e]">Port</label>
                  <input type="number" className="mesh-input font-mono" placeholder="8765" value={joinForm.port} onChange={(e) => setJoinForm((f) => ({ ...f, port: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1.5 text-[#8aac8e]">Password</label>
                  <input type="password" className="mesh-input" placeholder="Optional" value={joinForm.password} onChange={(e) => setJoinForm((f) => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
            </div>

            <button onClick={handleJoinRoom} className="mesh-btn mesh-btn-ghost w-full mt-5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Request Access
            </button>
          </div>

          {/* ─── Right Column: Servers + Channels + Log ─── */}
          <div className="flex flex-col gap-4 row-span-2">

            {/* ACTIVE SERVERS */}
            <div className="glass-card relative p-5 overflow-hidden animate-fade-up glass-edge" style={{ animationDelay: '120ms' }}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-[rgba(16,124,16,0.12)] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#107C10]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </div>
                <span className="text-sm font-bold text-[#e2efe3]">Active Servers</span>
              </div>

              {activeServers.length === 0 ? (
                <p className="text-xs text-[#3d5441] text-center py-4">No servers running</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {activeServers.map((srv) => (
                    <div key={srv.port} className="bg-[rgba(16,22,16,0.5)] border border-[rgba(16,124,16,0.1)] rounded-xl px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#107C10] shrink-0" style={{ boxShadow: '0 0 6px #107C10', animation: 'status-blink 2.5s ease-in-out infinite' }} />
                        <span className="text-xs font-semibold text-[#e2efe3] truncate flex-1">{srv.name}</span>
                        {srv.isRelay && <span className="text-[9px] text-[#8aac8e] bg-[rgba(16,124,16,0.1)] px-2 py-0.5 rounded-md">relay</span>}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-[#8aac8e] font-mono">
                        <span>:{srv.port}</span>
                        <span>{srv.code}</span>
                        <span>{srv.peerCount} peer{srv.peerCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        {!srv.isRelay && (
                          <button onClick={() => handleReenterRoom(srv.port)} className="mesh-btn mesh-btn-primary flex-1 !py-1.5 !text-[10px]">Re-Join</button>
                        )}
                        <button onClick={() => handleShutdownServer(srv.port)} className="flex-1 text-[10px] font-semibold border border-red-900/50 text-red-400 hover:bg-red-900/15 py-1.5 rounded-lg cursor-pointer transition-all">
                          Shutdown
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SAVED CHANNELS */}
            {config.saved_channels && config.saved_channels.length > 0 && (
              <div className="glass-card relative p-5 overflow-hidden animate-fade-up glass-edge" style={{ animationDelay: '180ms' }}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-[rgba(16,124,16,0.12)] flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-[#107C10]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <span className="text-sm font-bold text-[#e2efe3]">Saved Channels</span>
                </div>

                <div className="flex flex-col gap-2">
                  {config.saved_channels.map((ch) => {
                    const isRunning = activeServers.some((s) => s.code === ch.room_code)
                    return (
                      <div key={ch.room_code} className="bg-[rgba(16,22,16,0.5)] border border-[rgba(16,124,16,0.1)] rounded-xl px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#e2efe3] truncate flex-1">{ch.name}</span>
                          {isRunning && <span className="text-[9px] text-[#107C10] bg-[rgba(16,124,16,0.12)] px-2 py-0.5 rounded-md font-semibold">live</span>}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-[#8aac8e] font-mono">
                          <span>:{ch.port}</span>
                          <span>{ch.room_code}</span>
                          {ch.password && <span className="text-[#3d5441]">locked</span>}
                        </div>
                        <div className="flex gap-2 pt-1">
                          {!isRunning && (
                            <button onClick={() => handleLaunchSavedChannel(ch)} className="mesh-btn mesh-btn-primary flex-1 !py-1.5 !text-[10px]">Launch</button>
                          )}
                          <button onClick={() => handleRemoveChannel(ch.room_code)} className="text-[10px] font-semibold border border-red-900/50 text-red-400 hover:bg-red-900/15 px-3 py-1.5 rounded-lg cursor-pointer transition-all">
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ACTIVITY LOG */}
            {log.length > 0 && (
              <div className="glass-card relative p-5 overflow-hidden animate-fade-up glass-edge" style={{ animationDelay: '240ms' }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-[rgba(16,124,16,0.12)] flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-[#107C10]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </div>
                  <span className="text-sm font-bold text-[#e2efe3]">Activity</span>
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  {log.map((entry, i) => (
                    <span key={i} className="text-[#8aac8e]">
                      <span className="text-[#107C10] mr-1">›</span>{entry}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>

        </main>
      </div>
    </div>
  )
}
