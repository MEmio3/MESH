import { useState } from 'react'
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
  // Called by useMeshSocket for every incoming message.
  // `nick` and `isHost` are captured in the closure per-connection.
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
          // Update nick for peers who joined after us (we only had their uid)
          setUsers((prev) => prev.map((u) => u.uid === msg.uid ? { ...u, nick: msg.nick } : u))
          break

        case 'mesh_peer_joined':
          // We only receive uid + ip here — nick is unknown until they send a chat
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
    // msg_id: 8-char base36 timestamp — from network-schemas.md
    const msg_id = Date.now().toString(36).slice(-8).toUpperCase()
    const payload = { type: 'chat', uid: session.uid, nick: session.nick, msg: text.trim(), msg_id }
    socket.sendMessage(payload)
    // Optimistic add: server excludes sender from broadcast, so we add it ourselves
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

  return (
    <div className="min-h-screen bg-[#060608] text-zinc-100 flex flex-col select-none">

      {/* ── Header ── */}
      <header className="px-6 py-4 border-b-2 border-gray-800 flex items-center gap-3 shrink-0">
        <span className="text-xl font-bold tracking-widest text-blue-500">MESH</span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">P2P LAN Chat</span>
        <div className="ml-auto text-gray-600 text-xs font-mono truncate max-w-xs" title={SESSION_UID}>
          uid: {SESSION_UID.slice(0, 8)}…
        </div>
      </header>

      {/* ── Main Cards ── */}
      <main className="flex-1 flex gap-4 p-6 items-start">

        {/* Host a Room */}
        <section className="flex-1 bg-[#13161b] rounded-none border-2 border-gray-800 p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold uppercase tracking-widest text-zinc-100">Host a Room</h2>
            <p className="text-gray-500 text-xs mt-0.5 uppercase tracking-widest">Start a local WebSocket server on this machine.</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              className="w-full bg-[#060608] border-2 border-gray-800 rounded-none px-3 py-2 text-sm text-zinc-100 placeholder-gray-600 outline-none focus:border-blue-600 transition-colors font-mono"
              placeholder="Room Name"
              value={hostForm.name}
              onChange={(e) => setHostForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              type="number"
              className="w-full bg-[#060608] border-2 border-gray-800 rounded-none px-3 py-2 text-sm text-zinc-100 placeholder-gray-600 outline-none focus:border-blue-600 transition-colors font-mono"
              placeholder="Port"
              value={hostForm.port}
              onChange={(e) => setHostForm((f) => ({ ...f, port: e.target.value }))}
            />
            <input
              type="password"
              className="w-full bg-[#060608] border-2 border-gray-800 rounded-none px-3 py-2 text-sm text-zinc-100 placeholder-gray-600 outline-none focus:border-blue-600 transition-colors font-mono"
              placeholder="Password (optional)"
              value={hostForm.password}
              onChange={(e) => setHostForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleStartRoom}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-none py-2 text-sm transition-all cursor-pointer hover:shadow-[4px_4px_0px_0px_rgba(37,99,235,0.8)] hover:-translate-y-0.5"
            >
              Start Room
            </button>
            <button
              onClick={handleStartRelay}
              className="flex-1 bg-[#13161b] hover:bg-[#1a1f28] border-2 border-gray-700 text-zinc-300 font-semibold rounded-none py-2 text-sm transition-all cursor-pointer hover:shadow-[4px_4px_0px_0px_rgba(37,99,235,0.8)] hover:-translate-y-0.5"
              title="Start a headless relay — no chat UI, routes direct messages only"
            >
              Start as Relay
            </button>
          </div>
        </section>

        {/* Join a Room */}
        <section className="flex-1 bg-[#13161b] rounded-none border-2 border-gray-800 p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold uppercase tracking-widest text-zinc-100">Join a Room</h2>
            <p className="text-gray-500 text-xs mt-0.5 uppercase tracking-widest">Connect to an existing room on the LAN.</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              className="w-full bg-[#060608] border-2 border-gray-800 rounded-none px-3 py-2 text-sm text-zinc-100 placeholder-gray-600 outline-none focus:border-blue-600 transition-colors font-mono"
              placeholder="Host IP"
              value={joinForm.ip}
              onChange={(e) => setJoinForm((f) => ({ ...f, ip: e.target.value }))}
            />
            <input
              type="number"
              className="w-full bg-[#060608] border-2 border-gray-800 rounded-none px-3 py-2 text-sm text-zinc-100 placeholder-gray-600 outline-none focus:border-blue-600 transition-colors font-mono"
              placeholder="Port"
              value={joinForm.port}
              onChange={(e) => setJoinForm((f) => ({ ...f, port: e.target.value }))}
            />
            <input
              type="password"
              className="w-full bg-[#060608] border-2 border-gray-800 rounded-none px-3 py-2 text-sm text-zinc-100 placeholder-gray-600 outline-none focus:border-blue-600 transition-colors font-mono"
              placeholder="Password (optional)"
              value={joinForm.password}
              onChange={(e) => setJoinForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <button
            onClick={handleJoinRoom}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-none py-2 text-sm transition-all cursor-pointer hover:shadow-[4px_4px_0px_0px_rgba(37,99,235,0.8)] hover:-translate-y-0.5"
          >
            Join Room
          </button>
        </section>

      </main>

      {/* ── Log Panel ── */}
      {log.length > 0 && (
        <footer className="px-6 pb-4 shrink-0">
          <div className="bg-[#060608] border-2 border-gray-800 rounded-none px-4 py-3 font-mono text-xs text-gray-500 flex flex-col gap-1">
            {log.map((entry, i) => (
              <span key={i}><span className="text-gray-700">›</span> {entry}</span>
            ))}
          </div>
        </footer>
      )}

    </div>
  )
}
