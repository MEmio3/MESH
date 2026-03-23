import { useState } from 'react'
import { useMeshSocket } from './useMeshSocket'

// Stable session UID for this app instance
const SESSION_UID = crypto.randomUUID()

export default function App() {
  const [hostForm, setHostForm] = useState({ name: '', port: '8765', password: '' })
  const [joinForm, setJoinForm] = useState({ ip: '', port: '8765', password: '' })
  const [status, setStatus]     = useState(null)   // null | 'host' | 'client'
  const [roomInfo, setRoomInfo] = useState(null)   // { code, room_name }
  const [log, setLog]           = useState([])

  const { connect } = useMeshSocket()

  function addLog(msg) {
    console.log('[MESH UI]', msg)
    setLog((prev) => [...prev.slice(-9), msg])
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

    // Host's own frontend connects to the server it just started (core-flows.md)
    const joinPayload = {
      type: 'join', uid: SESSION_UID, nick: name,
      password, dp: '', bio: '',
    }
    connect(result.ws_url, joinPayload, (msg) => {
      if (msg.type === 'accepted') {
        setStatus('host')
        setRoomInfo({ code: msg.room_code, room_name: msg.room_name })
        addLog(`Connected as Host — ${msg.room_name} (${msg.room_code})`)
        console.log('[MESH UI] accepted payload:', msg)
      }
    })
  }

  // --- Joining a Room — core-flows.md ---
  async function handleJoinRoom() {
    const { ip, port, password } = joinForm
    if (!ip || !port) { addLog('IP and Port are required.'); return }

    addLog(`Requesting ws_url for ${ip}:${port}...`)
    const result = await window.meshBridge.startClient({ ip, port: Number(port), password })

    if (!result.ws_url) { addLog('Error: no ws_url returned'); return }
    addLog(`Connecting to ${result.ws_url}...`)

    const joinPayload = {
      type: 'join', uid: SESSION_UID, nick: 'Guest',
      password, dp: '', bio: '',
    }
    connect(result.ws_url, joinPayload, (msg) => {
      if (msg.type === 'accepted') {
        setStatus('client')
        setRoomInfo({ code: msg.room_code, room_name: msg.room_name })
        addLog(`Connected to Room — ${msg.room_name} (${msg.room_code})`)
        console.log('[MESH UI] accepted payload:', msg)
      }
      if (msg.type === 'rejected') {
        addLog(`Rejected: ${msg.reason}`)
      }
    })
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

      {/* ── Status Banner ── */}
      {status && (
        <div className="mx-6 mt-4 bg-emerald-950 border border-emerald-700 text-emerald-400 rounded-lg px-4 py-2 text-sm flex items-center gap-2 shrink-0">
          <span className="text-emerald-500">✓</span>
          <span>
            {status === 'host' ? 'Connected as Host' : 'Connected to Room'}
            {roomInfo && ` — ${roomInfo.room_name} `}
            {roomInfo && (
              <span className="font-mono bg-emerald-900/50 px-1.5 py-0.5 rounded text-xs">
                {roomInfo.code}
              </span>
            )}
          </span>
        </div>
      )}

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
            disabled={status === 'host'}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-lg py-2 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {status === 'host' ? 'Room Active' : 'Start Room'}
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
            disabled={status === 'client'}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-lg py-2 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {status === 'client' ? 'Joined' : 'Join Room'}
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
