import { useState, useEffect } from 'react'
import { useMeshSocket } from './useMeshSocket'
import { ChatRoom } from './components/ChatRoom'
import { RelayActive } from './components/RelayActive'

// Stable session UID for this app instance
const SESSION_UID = crypto.randomUUID()

export default function App() {
  // Connection state
  const [session, setSession]   = useState(null)   // null | { uid, nick, isHost, roomCode, roomName }
  const [messages, setMessages] = useState([])     // { type, uid, nick, msg, msg_id, isMine }[]
  const [users, setUsers]       = useState([])     // { uid, nick, is_host, status }[]
  const [relay, setRelay]       = useState(null)   // null | { port, roomCode, name }

  // Dashboard form state
  const [hostForm, setHostForm] = useState({ name: '', port: '8765', password: '' })
  const [joinForm, setJoinForm] = useState({ ip: '', port: '8765', password: '' })
  const [log, setLog]           = useState([])

  const socket = useMeshSocket()

  function addLog(msg) {
    console.log('[MESH UI]', msg)
    setLog((prev) => [...prev.slice(-9), msg])
  }

  // --- Single message router — handles ALL WS message types ---
  function makeMessageHandler(nick, isHost) {
    return function handleMessage(msg) {
      switch (msg.type) {
        case 'accepted':
          setSession({ uid: SESSION_UID, nick, isHost, roomCode: msg.room_code, roomName: msg.room_name })
          addLog(`Connected — ${msg.room_name} (${msg.room_code})`)
          console.log('[MESH UI] accepted payload:', msg)
          break

        case 'user_list':
          setUsers(msg.users)
          break

        case 'chat':
          setMessages((prev) => [...prev, { ...msg, isMine: false }])
          setUsers((prev) => prev.map((u) => u.uid === msg.uid ? { ...u, nick: msg.nick } : u))
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

        default:
          console.log('[MESH UI] unhandled message type:', msg.type)
      }
    }
  }

  // --- Hosting a Room — core-flows.md ---
  async function handleStartRoom() {
    const { name, port, password } = hostForm
    if (!name || !port) { addLog('Name and Port are required.'); return }

    addLog(`Starting server on port ${port}...`)
    const result = await window.meshBridge.startHost({
      name, port: Number(port), password, headless_relay: false,
    })

    if (result.error) { addLog(`Error: ${result.error}`); return }
    addLog(`Server started — ${result.ws_url}`)

    const nick = name
    const joinPayload = { type: 'join', uid: SESSION_UID, nick, password, dp: '', bio: '' }
    socket.connect(result.ws_url, joinPayload, makeMessageHandler(nick, true))
  }

  // --- Joining a Room — core-flows.md ---
  async function handleJoinRoom() {
    const { ip, port, password } = joinForm
    if (!ip || !port) { addLog('IP and Port are required.'); return }

    addLog(`Connecting to ${ip}:${port}...`)
    const result = await window.meshBridge.startClient({ ip, port: Number(port), password })

    if (!result.ws_url) { addLog('Error: no ws_url returned'); return }

    const nick = 'Guest'
    const joinPayload = { type: 'join', uid: SESSION_UID, nick, password, dp: '', bio: '' }
    socket.connect(result.ws_url, joinPayload, makeMessageHandler(nick, false))
  }

  // --- Chat actions passed to ChatRoom ---
  function handleSendChat(text) {
    if (!text.trim() || !session) return
    const msg_id = Date.now().toString(36).slice(-8).toUpperCase()
    const payload = { type: 'chat', uid: session.uid, nick: session.nick, msg: text.trim(), msg_id }
    socket.sendMessage(payload)
    setMessages((prev) => [...prev, { ...payload, isMine: true }])
  }

  function handleLeave() {
    socket.disconnect()
    setSession(null)
    setMessages([])
    setUsers([])
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
    let mounted = true
    async function poll() {
      const servers = await window.meshBridge.getRunningServers()
      if (mounted) setActiveServers(servers)
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { mounted = false; clearInterval(interval) }
  }, [session, relay]) // re-subscribe when view changes

  // --- Host re-enters an already-running room ---
  async function handleReenterRoom(port) {
    const result = await window.meshBridge.reenterRoom({ port })
    if (result.error) { addLog(`Error: ${result.error}`); return }

    addLog(`Re-entering room on port ${port}...`)
    const nick = hostForm.name || 'Host'
    const joinPayload = { type: 'join', uid: SESSION_UID, nick, password: '', dp: '', bio: '' }
    socket.connect(result.ws_url, joinPayload, makeMessageHandler(nick, true))
  }

  // --- Shutdown a server from the Active Servers panel ---
  async function handleShutdownServer(port) {
    const result = await window.meshBridge.shutdownPort({ port })
    if (result.error) { addLog(`Error: ${result.error}`); return }
    addLog(`Server on port ${port} shut down.`)
    // Immediately refresh the list
    const servers = await window.meshBridge.getRunningServers()
    setActiveServers(servers)
  }

  // --- Render: RelayActive | ChatRoom | Dashboard ---
  if (relay) {
    return <RelayActive relay={relay} onStop={handleStopRelay} />
  }

  if (session) {
    return (
      <ChatRoom
        session={session}
        messages={messages}
        users={users}
        onSendChat={handleSendChat}
        onLeave={handleLeave}
      />
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#060608] text-[#e8f5e9] flex flex-col select-none relative">
      {/* Legacy ambient glow + scanlines */}
      <div className="ambient-glow" />
      <div className="scanlines" />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── Header (minimal — no fake tabs) ── */}
        <header className="px-6 py-4 flex items-center gap-3 shrink-0 relative">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#107C10] to-transparent opacity-30" />

          <span
            className="text-base font-bold tracking-[0.3em] text-[#107C10] uppercase"
            style={{ animation: 'logo-pulse 2.5s ease-in-out infinite' }}
          >
            MESH
          </span>

          <span
            className="w-2 h-2 rounded-full bg-[#107C10]"
            style={{ boxShadow: '0 0 8px #107C10', animation: 'status-blink 2.5s ease-in-out infinite' }}
          />

          <div className="ml-auto font-mono text-xs text-[#7a9e82] tracking-wide" title={SESSION_UID}>
            uid: {SESSION_UID.slice(0, 8)}…
          </div>
        </header>

        {/* ── 2-Column Grid ── */}
        <main className="flex-1 grid grid-cols-[1fr_320px] gap-6 p-6 items-start overflow-y-auto">

          {/* ─── Left Column: Host + Join stacked ─── */}
          <div className="flex flex-col gap-6">

            {/* HOST CARD */}
            <div className="relative bg-[#13161b] border border-[rgba(16,124,16,0.14)] rounded-lg p-6 overflow-hidden hover:border-[rgba(16,124,16,0.38)] transition-all duration-200 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#107C10] to-transparent opacity-40" />

              <div className="flex items-center gap-2 mb-5">
                <span className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#107C10]">Host</span>
                <span className="flex-1 h-px bg-[rgba(16,124,16,0.14)]" />
              </div>

              <h2 className="text-base font-bold tracking-[0.12em] uppercase text-[#e8f5e9] mb-5">Create Room</h2>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">Room Name</label>
                  <input
                    className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
                    placeholder="e.g. Alpha Squad"
                    value={hostForm.name}
                    onChange={(e) => setHostForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">Port</label>
                  <input
                    type="number"
                    className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none font-mono focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
                    placeholder="8765"
                    value={hostForm.port}
                    onChange={(e) => setHostForm((f) => ({ ...f, port: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">
                    Password <span className="text-[#3a5040] normal-case tracking-normal text-[9px]">(optional)</span>
                  </label>
                  <input
                    type="password"
                    className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
                    placeholder="Leave blank for open room"
                    value={hostForm.password}
                    onChange={(e) => setHostForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-5">
                <button
                  onClick={handleStartRoom}
                  className="flex-1 bg-[#107C10] hover:bg-[#1a9f1a] text-white text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2.5 rounded cursor-pointer transition-all duration-200 shadow-[0_0_20px_rgba(16,124,16,0.25)] hover:shadow-[0_0_32px_rgba(16,124,16,0.45)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  Start Room
                </button>
                <button
                  onClick={handleStartRelay}
                  className="flex-1 border border-[#107C10] text-[#107C10] bg-transparent hover:bg-[rgba(16,124,16,0.08)] hover:shadow-[0_0_20px_rgba(16,124,16,0.2)] text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2.5 rounded cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                  title="Start a headless relay — routes direct messages only"
                >
                  Start as Relay
                </button>
              </div>
            </div>

            {/* JOIN CARD */}
            <div className="relative bg-[#13161b] border border-[rgba(16,124,16,0.14)] rounded-lg p-6 overflow-hidden hover:border-[rgba(16,124,16,0.38)] transition-all duration-200 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#107C10] to-transparent opacity-40" />

              <div className="flex items-center gap-2 mb-5">
                <span className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#107C10]">Join</span>
                <span className="flex-1 h-px bg-[rgba(16,124,16,0.14)]" />
              </div>

              <h2 className="text-base font-bold tracking-[0.12em] uppercase text-[#e8f5e9] mb-5">Join Room</h2>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">Host IP</label>
                  <input
                    className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none font-mono focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
                    placeholder="192.168.1.x"
                    value={joinForm.ip}
                    onChange={(e) => setJoinForm((f) => ({ ...f, ip: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">Port</label>
                  <input
                    type="number"
                    className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none font-mono focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
                    placeholder="8765"
                    value={joinForm.port}
                    onChange={(e) => setJoinForm((f) => ({ ...f, port: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">Password</label>
                  <input
                    type="password"
                    className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
                    placeholder="Enter room password"
                    value={joinForm.password}
                    onChange={(e) => setJoinForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
              </div>

              <button
                onClick={handleJoinRoom}
                className="w-full mt-5 flex items-center justify-center gap-2.5 border border-[#107C10] bg-[rgba(16,124,16,0.05)] hover:bg-[rgba(16,124,16,0.12)] hover:border-[rgba(16,124,16,0.6)] text-[#107C10] text-[11px] font-bold tracking-[0.18em] uppercase px-4 py-3 rounded cursor-pointer transition-all duration-200 shadow-[0_0_12px_rgba(16,124,16,0.08)] hover:shadow-[0_0_20px_rgba(16,124,16,0.2)]"
              >
                <span className="text-sm leading-none">→</span>
                Request Access
              </button>
            </div>

          </div>

          {/* ─── Right Column: Active Servers + Activity Log ─── */}
          <div className="flex flex-col gap-5">

            {/* ACTIVE SERVERS */}
            <div className="relative bg-[#13161b] border border-[rgba(16,124,16,0.14)] rounded-lg p-5 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#107C10] to-transparent opacity-40" />
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#107C10]">Active Servers</span>
                <span className="flex-1 h-px bg-[rgba(16,124,16,0.14)]" />
              </div>

              {activeServers.length === 0 ? (
                <p className="text-xs text-[#3a5040] text-center py-3">No servers running.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {activeServers.map((srv) => (
                    <div key={srv.port} className="bg-[#181c23] border border-[rgba(16,124,16,0.14)] rounded px-3.5 py-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full bg-[#107C10] shrink-0"
                          style={{ boxShadow: '0 0 6px #107C10', animation: 'status-blink 2.5s ease-in-out infinite' }}
                        />
                        <span className="text-xs font-bold tracking-wide text-[#e8f5e9] truncate flex-1">{srv.name}</span>
                        {srv.isRelay && (
                          <span className="text-[9px] tracking-[0.15em] uppercase text-[#7a9e82] border border-[rgba(16,124,16,0.3)] px-1.5 py-0.5 rounded">relay</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-[#7a9e82] font-mono">
                        <span>:{srv.port}</span>
                        <span>{srv.code}</span>
                        <span>{srv.peerCount} peer{srv.peerCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        {!srv.isRelay && (
                          <button
                            onClick={() => handleReenterRoom(srv.port)}
                            className="flex-1 text-[10px] font-bold tracking-[0.12em] uppercase bg-[#107C10] hover:bg-[#1a9f1a] text-white py-1.5 rounded cursor-pointer transition-all duration-200 shadow-[0_0_12px_rgba(16,124,16,0.2)] hover:shadow-[0_0_20px_rgba(16,124,16,0.4)]"
                          >
                            Re-Join
                          </button>
                        )}
                        <button
                          onClick={() => handleShutdownServer(srv.port)}
                          className="flex-1 text-[10px] font-bold tracking-[0.12em] uppercase border border-red-800/60 text-red-400 hover:bg-red-900/20 hover:border-red-700 py-1.5 rounded cursor-pointer transition-all duration-200"
                        >
                          Shutdown
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ACTIVITY LOG */}
            {log.length > 0 && (
              <div className="relative bg-[#13161b] border border-[rgba(16,124,16,0.14)] rounded-lg p-5 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#107C10] to-transparent opacity-40" />
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#107C10]">Activity Log</span>
                  <span className="flex-1 h-px bg-[rgba(16,124,16,0.14)]" />
                </div>
                <div className="flex flex-col gap-1 font-mono text-[11px]">
                  {log.map((entry, i) => (
                    <span key={i} className="text-[#7a9e82]">
                      <span className="text-[#107C10]">›</span> {entry}
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
