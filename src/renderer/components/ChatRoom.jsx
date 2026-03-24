// ChatRoom.jsx — Full chat interface for MESH
// Renders after a successful join handshake.
// Props: { session, messages, users, onSendChat, onLeave }

import { useState, useRef, useEffect } from 'react'

export function ChatRoom({ session, messages, users, onSendChat, onLeave }) {
  const [inputText, setInputText] = useState('')
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function sendAndClear() {
    if (!inputText.trim()) return
    onSendChat(inputText)
    setInputText('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendAndClear()
    }
  }

  function formatTime(msg_id) {
    // msg_id is base36 of Date.now() last 8 chars — reconstruct approximate time
    // Fallback: just show current time at render
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-screen bg-[#060608] text-zinc-100 flex flex-col select-none">

      {/* ── Header ── */}
      <header className="px-5 py-3 border-b-2 border-gray-800 flex items-center gap-3 shrink-0">
        <span className="text-base font-bold tracking-widest text-[#107C10]">MESH</span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-sm font-semibold uppercase tracking-widest text-zinc-200">{session.roomName}</span>
        <span className="font-mono text-xs bg-[#13161b] border-2 border-gray-800 px-2 py-0.5 rounded-none text-zinc-400">
          {session.roomCode}
        </span>
        {session.isHost && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#107C10] bg-transparent border-2 border-[#107C10] px-1.5 py-0.5 rounded-none">
            HOST
          </span>
        )}
        <button
          onClick={onLeave}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-zinc-300 border-2 border-gray-800 hover:border-gray-600 px-3 py-1 rounded-none transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Leave
        </button>
      </header>

      {/* ── Body: messages + user sidebar ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Messages area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-center text-gray-600 text-sm mt-8 uppercase tracking-widest">
                No messages yet. Say hello!
              </p>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={msg.msg_id ?? i} msg={msg} session={session} />
            ))}

            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="px-4 pb-4 pt-2 shrink-0 border-t-2 border-gray-800">
            <div className="flex gap-2 items-center bg-[#13161b] border-2 border-gray-800 rounded-none px-3 py-2 focus-within:border-[#107C10] transition-colors">
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-gray-600 outline-none font-mono"
                placeholder="Type a message…"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
              />
              <button
                onClick={sendAndClear}
                disabled={!inputText.trim()}
                className="bg-[#107C10] hover:bg-[#1a9f1a] disabled:bg-[#13161b] disabled:text-gray-600 disabled:border-gray-800 text-white text-xs font-semibold px-4 py-1.5 rounded-none border-2 border-[#107C10] disabled:border-gray-700 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0 hover:shadow-[0_0_20px_rgba(16,124,16,0.45)] hover:-translate-y-0.5 disabled:hover:shadow-none disabled:hover:translate-y-0"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── User sidebar ── */}
        <aside className="w-44 border-l-2 border-gray-800 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b-2 border-gray-800 shrink-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Users ({users.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
            {users.map((user) => (
              <UserRow key={user.uid} user={user} session={session} />
            ))}
          </div>
        </aside>

      </div>
    </div>
  )
}

// ── Sub-components ──

function MediaAttachment({ media }) {
  if (!media) return null
  if (media.type === 'image' && media.data) {
    return (
      <div className="mt-1.5 rounded overflow-hidden max-w-[280px]">
        <img src={media.data} alt={media.filename || 'image'} className="w-full h-auto" />
        {media.filename && <span className="text-[9px] text-gray-500 font-mono block mt-0.5">{media.filename}</span>}
      </div>
    )
  }
  if (media.type === 'file' && media.filename) {
    return (
      <div className="mt-1.5 flex items-center gap-2 bg-[#0d0f13] border border-gray-800 rounded px-2.5 py-1.5">
        <svg className="w-4 h-4 text-[#107C10] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span className="text-xs text-zinc-300 font-mono truncate">{media.filename}</span>
      </div>
    )
  }
  return null
}

function Reactions({ reactions }) {
  if (!reactions || typeof reactions !== 'object') return null
  const entries = Object.entries(reactions)
  if (entries.length === 0) return null

  // Group by emoji → count
  const counts = {}
  for (const [, emoji] of entries) {
    counts[emoji] = (counts[emoji] || 0) + 1
  }

  return (
    <div className="flex gap-1 mt-1 px-0.5">
      {Object.entries(counts).map(([emoji, count]) => (
        <span key={emoji} className="text-[11px] bg-[#181c23] border border-gray-800 rounded px-1.5 py-0.5">
          {emoji}{count > 1 && <span className="text-gray-500 ml-0.5 text-[10px]">{count}</span>}
        </span>
      ))}
    </div>
  )
}

function MessageBubble({ msg, session }) {
  const isMine = msg.isMine

  if (isMine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] flex flex-col items-end gap-0.5">
          <div className="bg-[#107C10] text-white text-sm px-3.5 py-2 rounded-none leading-relaxed">
            {msg.msg}
            <MediaAttachment media={msg.media} />
          </div>
          <Reactions reactions={msg.reactions} />
          <span className="text-[10px] text-gray-600 px-1 font-mono">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-[#107C10] px-1 uppercase tracking-widest">{msg.nick}</span>
        <div className="bg-[#13161b] text-zinc-100 text-sm px-3.5 py-2 rounded-none leading-relaxed border border-gray-800">
          {msg.msg}
          <MediaAttachment media={msg.media} />
        </div>
        <Reactions reactions={msg.reactions} />
        <span className="text-[10px] text-gray-600 px-1 font-mono">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

function UserRow({ user, session }) {
  const isMe = user.uid === session.uid

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={`text-[10px] ${user.is_host ? 'text-[#107C10]' : 'text-gray-600'}`}>●</span>
      <span className="text-xs text-zinc-300 truncate flex-1 font-mono" title={user.uid}>
        {user.nick}
        {isMe && <span className="text-gray-600 ml-1">(you)</span>}
      </span>
      {user.is_host && (
        <span className="text-[9px] text-[#107C10] shrink-0 uppercase tracking-widest">HOST</span>
      )}
    </div>
  )
}
