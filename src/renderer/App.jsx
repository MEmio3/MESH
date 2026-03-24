import { useState } from 'react'
import { useMeshSocket } from './useMeshSocket'
import { ChatRoom } from './components/ChatRoom'
import { RelayActive } from './components/RelayActive'

// Stable session UID for this app instance
const SESSION_UID = crypto.randomUUID()

// ── Icon helpers ──────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="1.5" y="1.5" width="7.5" height="7.5" rx="1" stroke="#3b82f6" strokeWidth="1.4"/>
      <rect x="13" y="1.5" width="7.5" height="7.5" rx="1" stroke="#3b82f6" strokeWidth="1.4"/>
      <rect x="1.5" y="13" width="7.5" height="7.5" rx="1" stroke="#3b82f6" strokeWidth="1.4"/>
      <rect x="13" y="13" width="7.5" height="7.5" rx="1" stroke="#3b82f6" strokeWidth="1.4"/>
    </svg>
  )
}

function IconArrow() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="8.5" stroke="#3b82f6" strokeWidth="1.4"/>
      <path d="M14 11L11 8M14 11L11 14M14 11H8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconServer() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="20" height="8" rx="2"/>
      <rect x="2" y="14" width="20" height="8" rx="2"/>
      <circle cx="6.5" cy="6" r="1" fill="currentColor" stroke="none"/>
      <circle cx="6.5" cy="18" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}

// ── Shared card wrapper ────────────────────────────────────────────────────────

function Panel({ children, className = '' }) {
  return (
    <div className={`bg-[#0d1117] border border-[#1e3a5c]/55 rounded-lg shadow-[0_0_0_1px_rgba(30,100,180,0.07),0_8px_32px_rgba(0,0,0,0.55)] ${className}`}>
      {children}
    </div>
  )
}

// ── Field label ────────────────────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5" style={{ color: 'rgba(96,165,250,0.55)' }}>
      {children}
    </label>
  )
}

// ── Text input ─────────────────────────────────────────────────────────────────

function Field({ type = 'text', placeholder, value, onChange, mono = false }) {
  return (
    <input
      type={type}
      className={`w-full bg-[#070a0f] border border-[#1a2d45]/75 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-600/60 transition-colors ${mono ? 'font-mono' : ''}`}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // Connection state
  const [session, setSession]   = useState(null)
  const [messages, setMessages] = useState([])
  const [users, setUsers]       = useState([])
  const [relay, setRelay]       = useState(null)

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
    <div className="min-h-screen bg-[#090c11] text-zinc-100 flex flex-col select-none overflow-hidden">

      {/* ── Top Navigation Bar ── */}
      <header className="px-6 py-3 bg-[#0a0e14] border-b border-[#1a2d45]/50 flex items-center gap-5 shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex items-center justify-center w-6 h-6">
            <span className="absolute w-5 h-5 rounded-full border-2 border-blue-500 opacity-40 animate-ping" style={{ animationDuration: '2.5s' }} />
            <span className="w-3 h-3 rounded-full border-2 border-blue-400" />
          </span>
          <span className="text-sm font-bold tracking-[0.3em] text-white uppercase">Unified Hub</span>
        </div>

        {/* Nav tabs */}
        <nav className="flex items-end gap-0.5 ml-4">
          {['Messages', 'Relays', 'Rooms', 'Profile'].map((tab) => (
            <div
              key={tab}
              className={`px-5 py-2 text-[11px] tracking-[0.18em] uppercase font-semibold transition-colors ${
                tab === 'Rooms'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-zinc-600 border-b-2 border-transparent'
              }`}
            >
              {tab}
            </div>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <button className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1.5">
            <IconSettings />
          </button>
          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1a2d45]/60 rounded-full pl-1 pr-3 py-1">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {SESSION_UID.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-xs font-mono text-zinc-400 tracking-wide">{SESSION_UID.slice(0, 8)}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          </div>
        </div>
      </header>

      {/* ── 3-Column Grid ── */}
      <main className="flex-1 grid grid-cols-[1fr_1fr_1.15fr] gap-5 p-6 items-start overflow-y-auto">

        {/* ─── COL 1: HOST ─── */}
        <Panel className="p-6 flex flex-col gap-5">
          {/* Card header */}
          <div>
            <p className="text-[10px] tracking-[0.22em] uppercase mb-3.5" style={{ color: 'rgba(96,165,250,0.6)' }}>Host</p>
            <div className="w-12 h-12 rounded-md border border-[#1e3a5c]/70 bg-[#080c12] flex items-center justify-center mb-4">
              <IconGrid />
            </div>
            <h2 className="text-[17px] font-bold tracking-[0.12em] uppercase text-white">Create Room</h2>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-3">
            <div>
              <FieldLabel>Room Name</FieldLabel>
              <Field
                placeholder="e.g. Alpha Squad"
                value={hostForm.name}
                onChange={(e) => setHostForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel>Port</FieldLabel>
              <Field
                type="number"
                mono
                placeholder="8765"
                value={hostForm.port}
                onChange={(e) => setHostForm((f) => ({ ...f, port: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel>
                Password <span style={{ color: 'rgba(113,113,122,0.6)' }}>(optional)</span>
              </FieldLabel>
              <Field
                type="password"
                placeholder="Leave blank for open room"
                value={hostForm.password}
                onChange={(e) => setHostForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={handleStartRoom}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2.5 rounded transition-all cursor-pointer shadow-[0_0_18px_rgba(37,99,235,0.45)] hover:shadow-[0_0_28px_rgba(37,99,235,0.65)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Start Room
            </button>
            <button
              onClick={handleStartRelay}
              className="flex-1 flex items-center justify-center gap-2 border border-blue-600/55 text-blue-400 hover:bg-blue-900/20 hover:border-blue-500/80 bg-transparent text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2.5 rounded transition-all cursor-pointer"
              title="Start a headless relay — routes direct messages only"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              Start as Relay
            </button>
          </div>
        </Panel>

        {/* ─── COL 2: JOIN + HOSTED RELAYS ─── */}
        <div className="flex flex-col gap-5">
          <Panel className="p-6 flex flex-col gap-5">
            {/* Card header */}
            <div>
              <p className="text-[10px] tracking-[0.22em] uppercase mb-3.5" style={{ color: 'rgba(96,165,250,0.6)' }}>Join</p>
              <div className="w-12 h-12 rounded-md border border-[#1e3a5c]/70 bg-[#080c12] flex items-center justify-center mb-4">
                <IconArrow />
              </div>
              <h2 className="text-[17px] font-bold tracking-[0.12em] uppercase text-white">Join Room</h2>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-3">
              <div>
                <FieldLabel>Host IP</FieldLabel>
                <Field
                  mono
                  placeholder="192.168.1.x"
                  value={joinForm.ip}
                  onChange={(e) => setJoinForm((f) => ({ ...f, ip: e.target.value }))}
                />
              </div>
              <div>
                <FieldLabel>Port</FieldLabel>
                <Field
                  type="number"
                  mono
                  placeholder="8765"
                  value={joinForm.port}
                  onChange={(e) => setJoinForm((f) => ({ ...f, port: e.target.value }))}
                />
              </div>
              <div>
                <FieldLabel>Password</FieldLabel>
                <Field
                  type="password"
                  placeholder="Enter room password"
                  value={joinForm.password}
                  onChange={(e) => setJoinForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>

            <button
              onClick={handleJoinRoom}
              className="w-full flex items-center justify-center gap-2.5 border border-blue-600/65 bg-[#090e18] hover:bg-blue-900/25 hover:border-blue-500/80 text-blue-300 text-[11px] font-bold tracking-[0.18em] uppercase px-4 py-3 rounded transition-all cursor-pointer shadow-[0_0_12px_rgba(37,99,235,0.12)] hover:shadow-[0_0_20px_rgba(37,99,235,0.2)]"
            >
              <span className="text-sm leading-none">→</span>
              Request Access
            </button>
          </Panel>

          {/* My Hosted Relays */}
          <Panel className="p-5">
            <p className="text-[10px] tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(96,165,250,0.6)' }}>My Hosted Relays</p>
            <p className="text-xs text-zinc-700 text-center py-3">No active relays.</p>
          </Panel>
        </div>

        {/* ─── COL 3: Hosted Channels + Servers + Log ─── */}
        <div className="flex flex-col gap-5">

          {/* My Hosted Channels */}
          <Panel className="p-5">
            <p className="text-[10px] tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(96,165,250,0.6)' }}>My Hosted Channels</p>
            <p className="text-xs text-zinc-700 text-center py-3">No rooms hosted this session.</p>
          </Panel>

          {/* Running Servers */}
          <Panel className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-blue-400/60"><IconServer /></span>
              <p className="text-[10px] tracking-[0.22em] uppercase" style={{ color: 'rgba(96,165,250,0.6)' }}>Running Servers</p>
            </div>
            <p className="text-xs text-zinc-700 text-center py-2">No servers running.</p>
          </Panel>

          {/* Activity Log — only visible once there's output */}
          {log.length > 0 && (
            <Panel className="p-5">
              <p className="text-[10px] tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(96,165,250,0.6)' }}>Activity Log</p>
              <div className="flex flex-col gap-1 font-mono text-[11px]">
                {log.map((entry, i) => (
                  <span key={i} className="text-zinc-500">
                    <span style={{ color: 'rgba(30,80,150,0.9)' }}>›</span> {entry}
                  </span>
                ))}
              </div>
            </Panel>
          )}

        </div>

      </main>
    </div>
  )
}
