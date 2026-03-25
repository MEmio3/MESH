// ChatRoom.jsx — Full chat interface for MESH
// Renders after a successful join handshake.

import { useState, useRef, useEffect } from 'react'

const QUICK_EMOJIS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F525}', '\u{1F602}', '\u{1F62E}', '\u{1F44F}']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB (matches server maxPayload)

export function ChatRoom({ session, messages, users, onSendChat, onReaction, onEditMessage, onDeleteMessage, onLeave, hasMoreHistory, onLoadOlder, onFetchMedia }) {
  const [inputText, setInputText] = useState('')
  const [pendingMedia, setPendingMedia] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState(null)       // { msg_id, nick, msg }
  const [editingMsg, setEditingMsg] = useState(null)  // { msg_id, original_msg }
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const fileRef     = useRef(null)
  const messagesRef = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function startReply(msg) {
    setEditingMsg(null)
    const preview = msg.msg?.slice(0, 80) || (msg.media ? `${msg.media.type === 'image' ? 'Photo' : msg.media.type === 'video' ? 'Video' : msg.media.type === 'audio' ? 'Audio' : 'File'}` : '...')
    const mediaThumbnail = msg.media?.thumbnail || null
    const mediaType = msg.media?.type || null
    setReplyTo({ msg_id: msg.msg_id, nick: msg.nick || session.nick, msg: preview, mediaThumbnail, mediaType })
    inputRef.current?.focus()
  }

  function startEdit(msg) {
    setReplyTo(null)
    setEditingMsg({ msg_id: msg.msg_id, original_msg: msg.msg })
    setInputText(msg.msg || '')
    inputRef.current?.focus()
  }

  function handleForward(msg) {
    onSendChat(msg.msg || '', null, { forwarded: true })
  }

  function handleUnsend(msg_id) {
    onDeleteMessage?.(msg_id)
  }

  async function sendAndClear() {
    if (editingMsg) {
      if (!inputText.trim()) return
      onEditMessage?.(editingMsg.msg_id, inputText.trim())
      setInputText('')
      setEditingMsg(null)
      return
    }

    if ((!inputText.trim() && !pendingMedia) || uploading) return
    const media = pendingMedia
    const text = inputText
    const reply = replyTo
    setInputText('')
    setReplyTo(null)
    clearPendingMedia()

    if (media?.arrayBuffer) setUploading(true)
    try {
      await onSendChat(text, media, reply ? { reply_to: { msg_id: reply.msg_id, nick: reply.nick, preview: reply.msg, mediaThumbnail: reply.mediaThumbnail || null, mediaType: reply.mediaType || null } } : null)
    } finally {
      setUploading(false)
    }
  }

  function clearPendingMedia() {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl)
    setPendingMedia(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendAndClear()
    }
  }

  function captureVideoThumbnail(file) {
    return new Promise((resolve) => {
      // Append a real (hidden) video element to DOM — off-screen elements
      // sometimes don't decode frames in Chromium/Electron
      const video = document.createElement('video')
      video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none'
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      document.body.appendChild(video)

      const url = URL.createObjectURL(file)
      let resolved = false

      function cleanup() {
        video.pause()
        video.removeAttribute('src')
        video.load()
        document.body.removeChild(video)
        setTimeout(() => URL.revokeObjectURL(url), 200)
      }

      function done(val) {
        if (resolved) return
        resolved = true
        cleanup()
        console.log('[MESH] captureVideoThumbnail result:', val ? val.length + ' chars' : 'null')
        resolve(val)
      }

      function tryCapture() {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!vw || !vh) return null
        try {
          const scale = 200 / Math.max(vw, vh)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(vw * scale)
          canvas.height = Math.round(vh * scale)
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          return dataUrl.length > 500 ? dataUrl : null
        } catch { return null }
      }

      // Attempt capture at multiple points with retries
      let attempts = 0
      function attemptCapture() {
        attempts++
        const result = tryCapture()
        if (result) { done(result); return }
        if (attempts < 6) setTimeout(attemptCapture, 300)
        else done(null)
      }

      video.oncanplay = () => {
        // Try playing briefly then capture
        video.play().then(() => {
          setTimeout(() => {
            video.pause()
            const result = tryCapture()
            if (result) { done(result); return }
            // Seek forward and retry
            if (video.duration > 1) {
              video.currentTime = 1
              video.onseeked = () => setTimeout(attemptCapture, 150)
            } else {
              attemptCapture()
            }
          }, 500)
        }).catch(() => attemptCapture())
      }

      video.onerror = () => done(null)
      video.src = url
      setTimeout(() => done(null), 12000)
    })
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      console.warn('[MESH] File too large:', file.size, '>', MAX_FILE_SIZE)
      return
    }

    let mediaType = 'file'
    const mimeType = file.type || ''
    if (mimeType.startsWith('image/')) mediaType = 'image'
    else if (mimeType.startsWith('video/')) mediaType = 'video'
    else if (mimeType.startsWith('audio/')) mediaType = 'audio'

    // Capture video thumbnail first (before file input is cleared)
    let videoThumbnail = null
    if (mediaType === 'video') {
      videoThumbnail = await captureVideoThumbnail(file)
    }

    const reader = new FileReader()
    reader.onload = () => {
      const previewUrl = URL.createObjectURL(file)
      setPendingMedia({
        type: mediaType,
        arrayBuffer: reader.result,
        filename: file.name,
        mime: mimeType,
        size: file.size,
        previewUrl,
        videoThumbnail,
      })
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function handleLoadOlderClick() {
    const el = messagesRef.current
    const prevHeight = el?.scrollHeight || 0
    onLoadOlder()
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight
    })
  }

  return (
    <div className="h-full bg-[var(--bg-void)] text-[var(--text-primary)] flex flex-col select-none relative">
      <div className="ambient-glow" />

      {/* Header */}
      <header className="relative z-10 mx-3 mt-3 px-5 py-3 glass-card-strong rounded-xl flex items-center gap-3 shrink-0">
        <span className="text-base font-bold tracking-widest text-[var(--mesh-accent)]">MESH</span>
        <span className="text-[var(--text-muted)] text-xs">&middot;</span>
        <span className="text-sm font-semibold uppercase tracking-widest text-[var(--text-primary)]">{session.roomName}</span>
        <span className="font-mono text-xs bg-[var(--bg-input)] border border-[var(--border-glass)] px-2.5 py-0.5 rounded-lg text-[var(--text-secondary)]">
          {session.roomCode}
        </span>
        {session.isHost && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--mesh-accent)] border border-[var(--mesh-accent)] px-2 py-0.5 rounded-md bg-[rgba(16,124,16,0.08)]">
            HOST
          </span>
        )}
        <button
          onClick={onLeave}
          className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-glass)] hover:border-[var(--border-hover)] px-3 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-[rgba(16,124,16,0.06)]"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Leave
        </button>
      </header>

      {/* Body: messages + user sidebar */}
      <div className="relative z-10 flex-1 flex overflow-hidden mx-3 mb-3 mt-2 gap-2">

        {/* Messages area */}
        <div className="flex-1 flex flex-col overflow-hidden glass-card rounded-xl">
          <div ref={messagesRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {/* Load older messages */}
            {hasMoreHistory && (
              <button
                onClick={handleLoadOlderClick}
                className="self-center text-[11px] text-[var(--mesh-accent)] hover:text-[var(--mesh-accent-bright)] bg-[var(--bg-input)] border border-[var(--border-glass)] hover:border-[var(--border-hover)] px-4 py-1.5 rounded-lg cursor-pointer transition-all mb-2"
              >
                Load older messages
              </button>
            )}

            {messages.length === 0 && !hasMoreHistory && (
              <p className="text-center text-[var(--text-muted)] text-sm mt-8">
                No messages yet. Say hello!
              </p>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={msg.msg_id ?? i} msg={msg} session={session} users={users} onReaction={onReaction} onFetchMedia={onFetchMedia} onReply={startReply} onEdit={startEdit} onForward={handleForward} onUnsend={handleUnsend} />
            ))}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-[var(--border-glass)]">
            {/* Reply / Edit preview */}
            {(replyTo || editingMsg) && (
              <div className="flex items-stretch gap-0 mb-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl overflow-hidden">
                <div className="w-1 bg-[var(--mesh-accent)] shrink-0" />
                <div className="flex-1 min-w-0 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {editingMsg ? (
                      <svg className="w-3 h-3 text-[var(--mesh-accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    ) : (
                      <svg className="w-3 h-3 text-[var(--mesh-accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    )}
                    <span className="text-[11px] font-bold text-[var(--mesh-accent)]">
                      {editingMsg ? 'Edit message' : replyTo.nick}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] truncate mt-0.5">
                    {editingMsg ? editingMsg.original_msg : replyTo.msg}
                  </p>
                </div>
                <button
                  onClick={() => { setReplyTo(null); setEditingMsg(null); if (editingMsg) setInputText('') }}
                  className="text-[var(--text-muted)] hover:text-red-400 cursor-pointer bg-transparent border-none px-3 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
            {/* Pending media preview */}
            {pendingMedia && (
              <div className="flex items-center gap-2 mb-2 bg-[var(--bg-elevated)] border border-[var(--border-glass)] rounded-lg px-3 py-2">
                {pendingMedia.type === 'image' && pendingMedia.previewUrl ? (
                  <img src={pendingMedia.previewUrl} alt="" className="w-10 h-10 rounded object-cover" />
                ) : pendingMedia.type === 'video' && pendingMedia.videoThumbnail ? (
                  <img src={pendingMedia.videoThumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                ) : pendingMedia.type === 'video' ? (
                  <svg className="w-5 h-5 text-[var(--mesh-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                ) : pendingMedia.type === 'audio' ? (
                  <svg className="w-5 h-5 text-[var(--mesh-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                ) : (
                  <svg className="w-5 h-5 text-[var(--mesh-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                )}
                <input
                  className="text-xs text-[var(--text-secondary)] truncate flex-1 bg-transparent outline-none border-b border-transparent focus:border-[var(--mesh-accent)] transition-colors"
                  value={pendingMedia.filename}
                  onChange={(e) => setPendingMedia((prev) => prev ? { ...prev, filename: e.target.value } : prev)}
                  title="Click to rename"
                />
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatFileSize(pendingMedia.size)}</span>
                <button onClick={clearPendingMedia} className="text-[var(--text-muted)] hover:text-red-400 cursor-pointer bg-transparent border-none p-1 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
            {/* Uploading indicator */}
            {uploading && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5">
                <div className="w-3.5 h-3.5 border-2 border-[var(--text-muted)] border-t-[var(--mesh-accent)] rounded-full animate-spin" />
                <span className="text-[11px] text-[var(--text-secondary)]">Uploading media...</span>
              </div>
            )}
            <div className="flex gap-2 items-center bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 focus-within:border-[var(--mesh-accent)] focus-within:shadow-[0_0_0_3px_rgba(16,124,16,0.1)] transition-all">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-[var(--text-muted)] hover:text-[var(--mesh-accent)] cursor-pointer bg-transparent border-none p-1 transition-colors shrink-0"
                title="Attach file (max 50MB)"
                disabled={uploading}
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <input ref={fileRef} type="file" onChange={handleFileSelect} className="hidden" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
                placeholder="Type a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
                disabled={uploading}
              />
              <button
                onClick={sendAndClear}
                disabled={(!inputText.trim() && !pendingMedia) || uploading}
                className="mesh-btn mesh-btn-primary text-xs px-4 py-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none shrink-0"
              >
                {uploading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* User sidebar */}
        <aside className="w-48 glass-card rounded-xl flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[var(--border-glass)] shrink-0">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
              Users ({users.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
            {users.map((user) => (
              <UserRow key={user.uid} user={user} session={session} />
            ))}
          </div>
        </aside>

      </div>
    </div>
  )
}

// ── Helpers ──

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Sub-components ──

/** Branching media attachment — routes between reference-based and legacy inline */
function MediaAttachment({ media, onFetchMedia }) {
  if (!media) return null
  if (media.media_id) return <RefMediaAttachment media={media} onFetchMedia={onFetchMedia} />
  if (media.data) return <LegacyMediaAttachment media={media} />
  return null
}

/** Custom video player matching MESH aesthetic */
function CustomVideoPlayer({ src }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  function togglePlay(e) {
    e.stopPropagation()
    if (videoRef.current.paused) videoRef.current.play()
    else videoRef.current.pause()
  }

  function handleSeek(e) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    videoRef.current.currentTime = pos * videoRef.current.duration
  }

  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  return (
    <div className="relative group cursor-pointer" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        className="w-full block"
        style={{ maxHeight: '360px' }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => { setCurrentTime(videoRef.current.currentTime); setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100) }}
        onLoadedMetadata={() => setDuration(videoRef.current.duration)}
      />
      {/* Center play button */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
      )}
      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2.5 pt-6 pb-2 transition-opacity ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
        {/* Seek bar */}
        <div className="w-full h-1 bg-white/20 rounded-full cursor-pointer mb-2 group/seek" onClick={handleSeek}>
          <div className="h-full bg-[var(--mesh-accent)] rounded-full relative" style={{ width: `${progress}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[var(--mesh-accent)] border border-white/50 opacity-0 group-hover/seek:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={togglePlay} className="text-white bg-transparent border-none cursor-pointer p-0">
            {playing ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>
          <span className="text-[10px] text-white/70 font-mono">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); videoRef.current?.requestFullscreen?.() }}
            className="ml-auto text-white/70 hover:text-white bg-transparent border-none cursor-pointer p-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

/** Custom audio player matching MESH aesthetic */
function CustomAudioPlayer({ src, filename }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  function togglePlay() {
    if (audioRef.current.paused) audioRef.current.play()
    else audioRef.current.pause()
  }

  function handleSeek(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audioRef.current.currentTime = pos * audioRef.current.duration
  }

  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => { setCurrentTime(audioRef.current.currentTime); setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100) }}
        onLoadedMetadata={() => setDuration(audioRef.current.duration)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 cursor-pointer border-none transition-colors"
      >
        {playing ? (
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {filename && <span className="text-[10px] text-white/60 truncate">{filename}</span>}
        <div className="w-full h-1 bg-white/15 rounded-full cursor-pointer" onClick={handleSeek}>
          <div className="h-full bg-white/70 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-white/50 font-mono">{fmtTime(currentTime)}</span>
          <span className="text-[9px] text-white/30">/</span>
          <span className="text-[9px] text-white/50 font-mono">{fmtTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}

/** New reference-based media: thumbnail preview + eye icon for on-demand fetch */
function RefMediaAttachment({ media, onFetchMedia }) {
  const [fetching, setFetching] = useState(false)
  const [blobUrl, setBlobUrl] = useState(null)
  const [lightbox, setLightbox] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  async function handleFetch() {
    if (blobUrl || fetching || !onFetchMedia) return
    setFetching(true)
    try {
      const url = await onFetchMedia(media.media_id)
      setBlobUrl(url)
    } catch (err) {
      console.error('[MESH] Media fetch failed:', err)
      setError(true)
    } finally {
      setFetching(false)
    }
  }

  function handleDownload() {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = media.filename || 'file'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const eyeIcon = (
    <svg className="w-5 h-5 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
  const smallEyeIcon = (
    <svg className="w-4 h-4 text-[var(--mesh-accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
  const spinner = <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
  const smallSpinner = <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-[var(--mesh-accent)] rounded-full animate-spin shrink-0" />

  // ── Image — preview size, click to fetch, click again for lightbox ──
  if (media.type === 'image') {
    return (
      <>
        <div
          className="relative cursor-pointer overflow-hidden rounded-lg m-1.5"
          style={{ width: '260px' }}
          onClick={() => blobUrl ? setLightbox(true) : handleFetch()}
        >
          {blobUrl ? (
            <img
              src={blobUrl}
              alt={media.filename || 'image'}
              className="block w-full h-auto"
            />
          ) : media.thumbnail ? (
            <img
              src={media.thumbnail}
              alt={media.filename || 'image'}
              className="block w-full h-auto"
              style={{ filter: 'blur(8px)', transform: 'scale(1.1)', minHeight: '160px', objectFit: 'cover' }}
            />
          ) : (
            <div className="w-full bg-[#0a0f0a] flex items-center justify-center" style={{ minHeight: '160px' }}>
              <svg className="w-10 h-10 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
          )}
          {/* Fetch overlay */}
          {!blobUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              {fetching ? spinner : error ? <span className="text-xs text-red-400">Failed</span> : eyeIcon}
            </div>
          )}
          {/* Bottom info gradient */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 py-1.5 flex items-center gap-2">
            {media.filename && <span className="text-[9px] text-white/70 font-mono truncate flex-1">{media.filename}</span>}
            {media.size && <span className="text-[9px] text-white/50">{formatFileSize(media.size)}</span>}
          </div>
        </div>
        {/* Lightbox — full size on second click */}
        {lightbox && blobUrl && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-8 cursor-pointer" onClick={() => setLightbox(false)}>
            <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img src={blobUrl} alt={media.filename} className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl" />
              <div className="flex items-center gap-4">
                {media.filename && <span className="text-sm text-white/70 font-mono">{media.filename}</span>}
                <button onClick={handleDownload} className="flex items-center gap-1.5 text-xs text-white bg-[var(--mesh-accent)] hover:bg-[var(--mesh-accent-bright)] px-3 py-1.5 rounded-lg cursor-pointer border-none transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </button>
                <button onClick={() => setLightbox(false)} className="text-white/70 hover:text-white bg-transparent border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors">Close</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Video — preview size, custom player ──
  if (media.type === 'video') {
    if (blobUrl) {
      return (
        <div className="m-1.5 rounded-lg overflow-hidden" style={{ width: '280px' }}>
          <CustomVideoPlayer src={blobUrl} />
        </div>
      )
    }
    return (
      <div className="relative cursor-pointer m-1.5 rounded-lg overflow-hidden" style={{ width: '280px' }} onClick={handleFetch}>
        {media.thumbnail ? (
          <img
            src={media.thumbnail}
            alt={media.filename || 'video'}
            className="block w-full h-auto"
            style={{ filter: 'blur(4px) brightness(0.7)', transform: 'scale(1.05)', minHeight: '160px', objectFit: 'cover' }}
          />
        ) : (
          <div className="w-full bg-[#0a0f0a] flex items-center justify-center" style={{ minHeight: '160px' }}>
            <svg className="w-12 h-12 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
        )}
        {/* Center play overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          {fetching ? spinner : error ? <span className="text-xs text-red-400">Failed</span> : (
            <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 py-1.5 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-white/60 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          {media.filename && <span className="text-[9px] text-white/70 font-mono truncate flex-1">{media.filename}</span>}
          {media.size && <span className="text-[9px] text-white/50">{formatFileSize(media.size)}</span>}
        </div>
      </div>
    )
  }

  // ── Audio — custom inline player ──
  if (media.type === 'audio') {
    if (blobUrl) {
      return (
        <div className="m-1.5" style={{ maxWidth: '300px' }}>
          <CustomAudioPlayer src={blobUrl} filename={media.filename} />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer m-1.5" style={{ maxWidth: '300px' }} onClick={handleFetch}>
        <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
          {fetching ? smallSpinner : (
            <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {media.filename && <span className="text-[10px] text-white/60 truncate block">{media.filename}</span>}
          <div className="w-full h-1 bg-white/15 rounded-full mt-1.5" />
          <span className="text-[9px] text-white/40 mt-1 block">{media.size ? formatFileSize(media.size) : 'Tap to load'}</span>
        </div>
      </div>
    )
  }

  // ── Generic file ──
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={blobUrl ? handleDownload : handleFetch}>
      <svg className="w-5 h-5 text-white/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span className="text-xs font-mono truncate flex-1">{media.filename || 'file'}</span>
      {media.size && <span className="text-[10px] text-white/50 shrink-0">{formatFileSize(media.size)}</span>}
      {fetching ? smallSpinner : blobUrl ? (
        <svg className="w-4 h-4 text-white/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      ) : smallEyeIcon}
    </div>
  )
}

/** Legacy inline media for old messages with embedded base64 data */
function LegacyMediaAttachment({ media }) {
  const [lightbox, setLightbox] = useState(false)
  const [blobUrl, setBlobUrl] = useState(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!media?.data) return
    try {
      const arr = media.data.split(',')
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream'
      const bstr = atob(arr[1])
      const u8 = new Uint8Array(bstr.length)
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i)
      const blob = new Blob([u8], { type: mime })
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)
      return () => URL.revokeObjectURL(url)
    } catch {
      // Data URL may be corrupted from encrypt/decrypt cycle
    }
  }, [media?.data])

  if (!media?.data) return null

  const mimeMatch = media.data.match(/^data:(.*?);/)
  const mime = mimeMatch?.[1] || ''
  const isImage = mime.startsWith('image/') || media.type === 'image'
  const isVideo = mime.startsWith('video/') || media.type === 'video'
  const isAudio = mime.startsWith('audio/') || media.type === 'audio'

  if (isImage) {
    return (
      <>
        <div className="relative cursor-pointer overflow-hidden rounded-lg m-1.5" style={{ maxWidth: '280px', maxHeight: '320px' }} onClick={() => !imgError && setLightbox(true)}>
          {imgError ? (
            <div className="w-[200px] h-20 bg-black/20 flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)]">Image unavailable</span>
            </div>
          ) : (
            <img src={blobUrl || media.data} alt={media.filename || 'image'} className="block max-w-full h-auto" onError={() => setImgError(true)} />
          )}
          {media.filename && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 py-1.5">
              <span className="text-[9px] text-white/70 font-mono truncate block">{media.filename}</span>
            </div>
          )}
        </div>
        {lightbox && !imgError && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-8 cursor-pointer" onClick={() => setLightbox(false)}>
            <img src={blobUrl || media.data} alt={media.filename} className="max-w-[90vw] max-h-[80vh] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </>
    )
  }

  if (isVideo) {
    return (
      <div className="m-1.5 rounded-lg overflow-hidden" style={{ maxWidth: '320px' }}>
        <CustomVideoPlayer src={blobUrl || media.data} />
      </div>
    )
  }

  if (isAudio) {
    return (
      <div className="m-1.5" style={{ maxWidth: '300px' }}>
        <CustomAudioPlayer src={blobUrl || media.data} filename={media.filename} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <svg className="w-5 h-5 text-white/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span className="text-xs font-mono truncate flex-1">{media.filename || 'Attached file'}</span>
    </div>
  )
}

function Reactions({ reactions }) {
  if (!reactions || typeof reactions !== 'object') return null
  const entries = Object.entries(reactions)
  if (entries.length === 0) return null

  const counts = {}
  for (const [, emoji] of entries) {
    counts[emoji] = (counts[emoji] || 0) + 1
  }

  return (
    <div className="flex gap-1 mt-1 px-0.5">
      {Object.entries(counts).map(([emoji, count]) => (
        <span key={emoji} className="text-[11px] bg-[var(--bg-elevated)] border border-[var(--border-glass)] rounded-md px-1.5 py-0.5">
          {emoji}{count > 1 && <span className="text-[var(--text-muted)] ml-0.5 text-[10px]">{count}</span>}
        </span>
      ))}
    </div>
  )
}

function EmojiPicker({ onSelect }) {
  return (
    <div className="flex gap-1 bg-[var(--bg-glass-strong)] border border-[var(--border-glass)] rounded-xl px-2 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-md">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[rgba(16,124,16,0.15)] transition-colors cursor-pointer bg-transparent border-none text-base"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

function Avatar({ uid, users, size = 28 }) {
  const user = users?.find((u) => u.uid === uid)
  const dp = user?.dp || ''
  const nick = user?.nick || '?'
  const initial = nick.charAt(0).toUpperCase()
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      className="rounded-full overflow-hidden shrink-0 border border-[var(--border-glass)] bg-[var(--bg-input)] flex items-center justify-center"
      style={{ width: size, height: size, minWidth: size }}
      title={nick}
    >
      {dp && !imgFailed ? (
        <img src={dp} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
      ) : (
        <span className="font-bold text-[var(--mesh-accent)]" style={{ fontSize: size * 0.4 }}>{initial}</span>
      )}
    </div>
  )
}

function MessageBubble({ msg, session, users, onReaction, onFetchMedia, onReply, onEdit, onForward, onUnsend }) {
  const isMine = msg.isMine
  const [hovered, setHovered] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  function handleReact(emoji) {
    onReaction?.(msg.msg_id, emoji)
    setShowPicker(false)
  }

  // Forwarded label
  const forwardedLabel = msg.forwarded ? (
    <div className={`px-3.5 pt-2 pb-0.5 flex items-center gap-1.5 ${isMine ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
      <span className="text-[10px] italic">Forwarded</span>
    </div>
  ) : null

  // Edited indicator
  const editedTag = msg.edited ? <span className={`text-[9px] italic ml-1.5 ${isMine ? 'text-white/35' : 'text-[var(--text-muted)]'}`}>edited</span> : null

  const actionBar = (
    <div
      className={`absolute ${isMine ? 'left-0 pr-1' : 'right-0 pl-1'} top-1/2 flex items-center gap-0.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{ transform: `translateX(${isMine ? '-100%' : '100%'}) translateY(-50%)` }}
    >
      {/* React button */}
      <div className="relative">
        <button
          onClick={() => { setShowPicker((v) => !v); setShowMenu(false) }}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--bg-glass-strong)] border border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--mesh-accent)] hover:border-[var(--border-hover)] transition-all cursor-pointer"
          title="React"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </button>
        {showPicker && (
          <div className={`absolute top-full mt-1 ${isMine ? 'right-0' : 'left-0'} z-20`}>
            <EmojiPicker onSelect={handleReact} />
          </div>
        )}
      </div>
      {/* More actions button */}
      <div className="relative">
        <button
          onClick={() => { setShowMenu((v) => !v); setShowPicker(false) }}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--bg-glass-strong)] border border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--mesh-accent)] hover:border-[var(--border-hover)] transition-all cursor-pointer"
          title="More"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
        {showMenu && (
          <div className={`absolute top-full mt-1 ${isMine ? 'right-0' : 'left-0'} z-20 bg-[var(--bg-glass-strong)] border border-[var(--border-glass)] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-md py-1 min-w-[130px]`}>
            <button onClick={() => { onReply?.(msg); setShowMenu(false) }} className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[rgba(16,124,16,0.1)] cursor-pointer bg-transparent border-none flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              Reply
            </button>
            <button onClick={() => { onForward?.(msg); setShowMenu(false) }} className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[rgba(16,124,16,0.1)] cursor-pointer bg-transparent border-none flex items-center gap-2 transition-colors">
              <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 0 4-4h12"/></svg>
              Forward
            </button>
            {isMine && msg.msg && (
              <button onClick={() => { onEdit?.(msg); setShowMenu(false) }} className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[rgba(16,124,16,0.1)] cursor-pointer bg-transparent border-none flex items-center gap-2 transition-colors">
                <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
            )}
            {isMine && (
              <button onClick={() => { onUnsend?.(msg.msg_id); setShowMenu(false) }} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/10 cursor-pointer bg-transparent border-none flex items-center gap-2 transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Unsend
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // Bubble content
  const bubbleContent = (
    <>
      {forwardedLabel}
      {msg.msg && (
        <div className={`text-sm leading-relaxed ${msg.media || msg.forwarded ? 'px-3.5 pt-2 pb-1' : 'px-4 py-2.5'}`}>
          {msg.msg}{editedTag}
        </div>
      )}
      <MediaAttachment media={msg.media} onFetchMedia={onFetchMedia} />
    </>
  )

  // Instagram-style reply reference — sits above the bubble, overlapping slightly
  const replyRef = msg.reply_to ? (
    <div
      className={`relative z-0 max-w-[85%] flex items-center gap-2 px-3 py-1.5 rounded-t-xl ${
        isMine
          ? 'bg-[rgba(16,124,16,0.25)] ml-auto mr-9 rounded-bl-xl'
          : 'bg-[rgba(255,255,255,0.04)] border border-[var(--border-glass)] border-b-0 ml-9 rounded-br-xl'
      }`}
      style={{ marginBottom: '-8px', paddingBottom: '12px' }}
    >
      <div className="flex-1 min-w-0">
        <span className={`text-[10px] font-semibold block ${isMine ? 'text-white/60' : 'text-[var(--mesh-accent)]'}`}>
          {msg.reply_to.nick}
        </span>
        <span className={`text-[10px] block truncate ${isMine ? 'text-white/35' : 'text-[var(--text-muted)]'}`}>
          {msg.reply_to.preview || '...'}
        </span>
      </div>
      {msg.reply_to.mediaThumbnail && (
        <img src={msg.reply_to.mediaThumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0 opacity-70" />
      )}
    </div>
  ) : null

  if (isMine) {
    return (
      <div
        className="flex flex-col items-end gap-0.5"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setShowPicker(false); setShowMenu(false) }}
      >
        {replyRef}
        <div className="flex items-end gap-2 max-w-[70%] relative z-[1]">
          {actionBar}
          <div className="bg-[var(--mesh-accent)] text-white overflow-hidden rounded-2xl rounded-br-sm shadow-[0_2px_12px_rgba(16,124,16,0.2)]">
            {bubbleContent}
          </div>
          <Avatar uid={session.uid} users={users} size={28} />
        </div>
        <div className="flex flex-col items-end gap-0.5 pr-9">
          <Reactions reactions={msg.reactions} />
          <span className="text-[10px] text-[var(--text-muted)] px-1 font-mono">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col items-start gap-0.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowPicker(false); setShowMenu(false) }}
    >
      {replyRef}
      <div className="flex items-end gap-2 max-w-[70%] relative z-[1]">
        <Avatar uid={msg.uid} users={users} size={28} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-[var(--mesh-accent)] px-1 tracking-wide">{msg.nick}</span>
          <div className="bg-[var(--bg-glass-strong)] text-[var(--text-primary)] overflow-hidden rounded-2xl rounded-bl-sm border border-[var(--border-glass)]">
            {bubbleContent}
          </div>
        </div>
        {actionBar}
      </div>
      <div className="flex flex-col items-start gap-0.5 pl-9">
        <Reactions reactions={msg.reactions} />
        <span className="text-[10px] text-[var(--text-muted)] px-1 font-mono">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

function UserRow({ user, session }) {
  const isMe = user.uid === session.uid
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-[rgba(16,124,16,0.05)] transition-colors">
      <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-[var(--border-glass)] bg-[var(--bg-input)] flex items-center justify-center">
        {user.dp && !imgFailed ? (
          <img src={user.dp} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        ) : (
          <span className={`text-[8px] font-bold ${user.is_host ? 'text-[var(--mesh-accent)]' : 'text-[var(--text-muted)]'}`}>
            {(user.nick || '?').charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <span className="text-xs text-[var(--text-primary)] truncate flex-1" title={user.uid}>
        {user.nick}
        {isMe && <span className="text-[var(--text-muted)] ml-1">(you)</span>}
      </span>
      {user.is_host && (
        <span className="text-[9px] text-[var(--mesh-accent)] shrink-0 uppercase tracking-widest">HOST</span>
      )}
    </div>
  )
}
