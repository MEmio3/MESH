// RelayActive.jsx — Status view for a running headless relay
// No WebSocket connection here — the relay runs in the main process.
// Props: { relay: { port, roomCode, name }, onStop: () => void }

export function RelayActive({ relay, onStop }) {
  return (
    <div className="h-full bg-[var(--bg-void)] text-[var(--text-primary)] flex flex-col select-none relative">
      <div className="ambient-glow" />

      {/* ── Header ── */}
      <header className="relative z-10 mx-4 mt-4 px-5 py-3 glass-card-strong rounded-xl flex items-center gap-3 shrink-0">
        <span className="text-lg font-bold tracking-widest text-[var(--mesh-accent)]">MESH</span>
        <span className="text-[var(--text-muted)] text-xs">·</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Relay Mode</span>
      </header>

      {/* ── Status card ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="glass-card glass-edge relative p-8 w-full max-w-sm flex flex-col gap-6 items-center text-center animate-fade-up">

          {/* Indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--mesh-accent-bright)] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--mesh-accent)]" />
            </span>
            <span className="text-[var(--mesh-accent-bright)] font-semibold text-sm uppercase tracking-widest">Relay Active</span>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-2 w-full">
            <div className="flex justify-between items-center bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl px-4 py-2.5">
              <span className="text-[var(--text-secondary)] text-xs uppercase tracking-widest">Name</span>
              <span className="text-[var(--text-primary)] text-sm font-medium">{relay.name}</span>
            </div>
            <div className="flex justify-between items-center bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl px-4 py-2.5">
              <span className="text-[var(--text-secondary)] text-xs uppercase tracking-widest">Port</span>
              <span className="font-mono text-[var(--text-primary)] text-sm">{relay.port}</span>
            </div>
            <div className="flex justify-between items-center bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl px-4 py-2.5">
              <span className="text-[var(--text-secondary)] text-xs uppercase tracking-widest">Code</span>
              <span className="font-mono text-[var(--mesh-accent)] text-sm tracking-widest">{relay.roomCode}</span>
            </div>
          </div>

          <p className="text-[var(--text-muted)] text-xs leading-relaxed">
            Guests connect via relay join. Direct messages are routed automatically.
          </p>

          {/* Stop button */}
          <button
            onClick={onStop}
            className="w-full bg-red-900/40 hover:bg-red-800/50 border border-red-800/50 text-red-400 hover:text-red-300 font-semibold rounded-xl py-2.5 text-sm transition-all cursor-pointer uppercase tracking-widest hover:shadow-[0_0_20px_rgba(220,38,38,0.15)]"
          >
            Stop Relay
          </button>

        </div>
      </main>

    </div>
  )
}
