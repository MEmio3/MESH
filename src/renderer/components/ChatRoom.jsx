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
    <div className="h-screen bg-[#09090b] text-zinc-100 flex flex-col select-none">

      {/* ── Header ── */}
      <header className="px-5 py-3 border-b border-zinc-800 flex items-center gap-3 shrink-0">
        <span className="text-base font-bold tracking-widest text-blue-500">MESH</span>
        <span className="text-zinc-600 text-xs">·</span>
        <span className="text-sm font-semibold text-zinc-200">{session.roomName}</span>
        <span className="font-mono text-xs bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded text-zinc-400">
          {session.roomCode}
        </span>
        {session.isHost && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-950 border border-blue-800 px-1.5 py-0.5 rounded">
            HOST
          </span>
        )}
        <button
          onClick={onLeave}
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 px-3 py-1 rounded-lg transition-colors cursor-pointer"
        >
          Leave
        </button>
      </header>

      {/* ── Body: messages + user sidebar ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Messages area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-center text-zinc-600 text-sm mt-8">
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
          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-zinc-800">
            <div className="flex gap-2 items-center bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 focus-within:border-blue-500 transition-colors">
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
                placeholder="Type a message…"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
              />
              <button
                onClick={sendAndClear}
                disabled={!inputText.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── User sidebar ── */}
        <aside className="w-44 border-l border-zinc-800 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-zinc-800 shrink-0">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
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

function MessageBubble({ msg, session }) {
  const isMine = msg.isMine

  if (isMine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] flex flex-col items-end gap-0.5">
          <div className="bg-blue-600 text-white text-sm px-3.5 py-2 rounded-2xl rounded-br-sm leading-relaxed">
            {msg.msg}
          </div>
          <span className="text-[10px] text-zinc-600 px-1">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-blue-400 px-1">{msg.nick}</span>
        <div className="bg-zinc-800 text-zinc-100 text-sm px-3.5 py-2 rounded-2xl rounded-bl-sm leading-relaxed">
          {msg.msg}
        </div>
        <span className="text-[10px] text-zinc-600 px-1">
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
      <span className={`text-[10px] ${user.is_host ? 'text-blue-500' : 'text-zinc-500'}`}>●</span>
      <span className="text-xs text-zinc-300 truncate flex-1" title={user.uid}>
        {user.nick}
        {isMe && <span className="text-zinc-600 ml-1">(you)</span>}
      </span>
      {user.is_host && (
        <span className="text-[9px] text-blue-500 shrink-0">HOST</span>
      )}
    </div>
  )
}
