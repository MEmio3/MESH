// RelayActive.jsx — Status view for a running headless relay
// No WebSocket connection here — the relay runs in the main process.
// Props: { relay: { port, roomCode, name }, onStop: () => void }

export function RelayActive({ relay, onStop }) {
  return (
    <div className="min-h-screen bg-[#060608] text-zinc-100 flex flex-col select-none">

      {/* ── Header ── */}
      <header className="px-6 py-4 border-b-2 border-gray-800 flex items-center gap-3 shrink-0">
        <span className="text-xl font-bold tracking-widest text-[#107C10]">MESH</span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Relay Mode</span>
      </header>

      {/* ── Status card ── */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-[#13161b] border-2 border-gray-800 rounded-none p-8 w-full max-w-sm flex flex-col gap-6 items-center text-center">

          {/* Indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 font-semibold text-sm uppercase tracking-widest">Relay Active</span>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-2 w-full">
            <div className="flex justify-between items-center bg-[#060608] border border-gray-800 rounded-none px-4 py-2.5">
              <span className="text-gray-500 text-xs uppercase tracking-widest">Name</span>
              <span className="text-zinc-200 text-sm font-medium">{relay.name}</span>
            </div>
            <div className="flex justify-between items-center bg-[#060608] border border-gray-800 rounded-none px-4 py-2.5">
              <span className="text-gray-500 text-xs uppercase tracking-widest">Port</span>
              <span className="font-mono text-zinc-200 text-sm">{relay.port}</span>
            </div>
            <div className="flex justify-between items-center bg-[#060608] border border-gray-800 rounded-none px-4 py-2.5">
              <span className="text-gray-500 text-xs uppercase tracking-widest">Code</span>
              <span className="font-mono text-[#107C10] text-sm tracking-widest">{relay.roomCode}</span>
            </div>
          </div>

          <p className="text-gray-600 text-xs leading-relaxed uppercase tracking-widest">
            Guests connect via guest_relay_join.<br />
            Direct messages are routed automatically.
          </p>

          {/* Stop button */}
          <button
            onClick={onStop}
            className="w-full bg-red-900/60 hover:bg-red-800/70 border-2 border-red-800 text-red-400 hover:text-red-300 font-semibold rounded-none py-2.5 text-sm transition-colors cursor-pointer uppercase tracking-widest"
          >
            Stop Relay
          </button>

        </div>
      </main>

    </div>
  )
}
