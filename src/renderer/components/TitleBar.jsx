// TitleBar.jsx — Custom frameless window titlebar
// Draggable region with min/max/close buttons matching the glass aesthetic.

export function TitleBar() {
  return (
    <div
      className="h-8 flex items-center justify-between px-3 shrink-0 bg-[rgba(8,12,8,0.85)] border-b border-[var(--border-glass)] select-none z-50"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <span className="text-[10px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase">MESH</span>

      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Minimize */}
        <button
          onClick={() => window.meshBridge.minimizeWindow()}
          className="w-8 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(16,124,16,0.1)] rounded transition-colors cursor-pointer border-none bg-transparent"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        {/* Maximize */}
        <button
          onClick={() => window.meshBridge.maximizeWindow()}
          className="w-8 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(16,124,16,0.1)] rounded transition-colors cursor-pointer border-none bg-transparent"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        </button>
        {/* Close */}
        <button
          onClick={() => window.meshBridge.closeWindow()}
          className="w-8 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-900/20 rounded transition-colors cursor-pointer border-none bg-transparent"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  )
}
