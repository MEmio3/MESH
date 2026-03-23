import { useState } from 'react'
import { useMeshSocket } from './useMeshSocket'
import { ChatRoom } from './components/ChatRoom'

// Stable session UID for this app instance
const SESSION_UID = crypto.randomUUID()

export default function App() {
  // Connection state
  const [session, setSession]   = useState(null)   // null | { uid, nick, isHost, roomCode, roomName }
  const [messages, setMessages] = useState([])     // { type, uid, nick, msg, msg_id, isMine }[]
  const [users, setUsers]       = useState([])     // { uid, nick, is_host, status }[]

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

  // --- Render: ChatRoom or Dashboard ---
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
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col select-none">

      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3 shrink-0">
        <span className="text-xl font-bold tracking-widest text-blue-500">MESH</span>
        <span className="text-zinc-600 text-xs">P2P LAN Chat</span>
        <div className="ml-auto text-zinc-700 text-xs font-mono truncate max-w-xs" title={SESSION_UID}>
          uid: {SESSION_UID.slice(0, 8)}…
        </div>
      </header>

      {/* ── Main Cards ── */}
      <main className="flex-1 flex gap-4 p-6 items-start">

        {/* Host a Room */}
        <section className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Host a Room</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Start a local WebSocket server on this machine.</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
              placeholder="Room Name"
              value={hostForm.name}
              onChange={(e) => setHostForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              type="number"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
              placeholder="Port"
              value={hostForm.port}
              onChange={(e) => setHostForm((f) => ({ ...f, port: e.target.value }))}
            />
            <input
              type="password"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
              placeholder="Password (optional)"
              value={hostForm.password}
              onChange={(e) => setHostForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <button
            onClick={handleStartRoom}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-2 text-sm transition-colors cursor-pointer"
          >
            Start Room
          </button>
        </section>

        {/* Join a Room */}
        <section className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Join a Room</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Connect to an existing room on the LAN.</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
              placeholder="Host IP"
              value={joinForm.ip}
              onChange={(e) => setJoinForm((f) => ({ ...f, ip: e.target.value }))}
            />
            <input
              type="number"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
              placeholder="Port"
              value={joinForm.port}
              onChange={(e) => setJoinForm((f) => ({ ...f, port: e.target.value }))}
            />
            <input
              type="password"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
              placeholder="Password (optional)"
              value={joinForm.password}
              onChange={(e) => setJoinForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <button
            onClick={handleJoinRoom}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-2 text-sm transition-colors cursor-pointer"
          >
            Join Room
          </button>
        </section>

      </main>

      {/* ── Log Panel ── */}
      {log.length > 0 && (
        <footer className="px-6 pb-4 shrink-0">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-xs text-zinc-500 flex flex-col gap-1">
            {log.map((entry, i) => (
              <span key={i}><span className="text-zinc-700">›</span> {entry}</span>
            ))}
          </div>
        </footer>
      )}

    </div>
  )
}
