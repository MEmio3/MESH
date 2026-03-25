// SetupProfile.jsx — Profile creation / editing screen
// First boot: config.nickname is empty → create mode.
// Edit mode: pass existing config to pre-fill fields.
// Props: { uid, onComplete: (config) => void, existingConfig?: object, onCancel?: () => void }

import { useState, useRef } from 'react'

export function SetupProfile({ uid, onComplete, existingConfig, onCancel }) {
  const isEdit = !!existingConfig
  const [nickname, setNickname] = useState(existingConfig?.nickname ?? '')
  const [bio, setBio]           = useState(existingConfig?.bio ?? '')
  const [dpDataurl, setDpDataurl] = useState(existingConfig?.dp_dataurl ?? '')
  const [saving, setSaving]     = useState(false)
  const fileRef = useRef(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      // Compress and convert to WebP via canvas
      const img = new Image()
      img.onload = () => {
        const MAX = 192
        let w = img.width, h = img.height
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // Use PNG for maximum compatibility (WebP canvas encoding can silently fail)
        let dataUrl = canvas.toDataURL('image/png')
        // If too large (>256KB), retry with JPEG at lower quality
        if (dataUrl.length > 256 * 1024) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        }
        setDpDataurl(dataUrl)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nickname.trim()) return
    setSaving(true)

    const updates = { nickname: nickname.trim(), bio: bio.trim(), dp_dataurl: dpDataurl }
    const config = await window.meshBridge.saveConfig(updates)
    onComplete(config)
  }

  return (
    <div className="min-h-full bg-[var(--bg-void)] text-[var(--text-primary)] flex flex-col select-none relative">
      <div className="ambient-glow" />

      <div className="relative z-10 flex flex-col min-h-full items-center justify-center p-6">

        {/* Setup card */}
        <form
          onSubmit={handleSubmit}
          className="relative glass-card glass-edge p-8 w-full max-w-md overflow-hidden animate-fade-up"
        >
          {/* glass-edge ::before handles the top highlight */}

          {/* Header */}
          <div className="text-center mb-8">
            <span
              className="text-xl font-bold tracking-[0.3em] text-[var(--mesh-accent)] uppercase inline-block mb-3"
              style={{ animation: 'logo-pulse 2.5s ease-in-out infinite' }}
            >
              MESH
            </span>
            <h1 className="text-lg font-bold tracking-[0.12em] uppercase text-[var(--text-primary)] mb-1.5">
              {isEdit ? 'Edit Profile' : 'Create Your Profile'}
            </h1>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {isEdit ? 'Update your display name, bio, or avatar.' : 'Your identity on the mesh network. Your UID is permanent.'}
            </p>
          </div>

          {/* UID display */}
          <div className="bg-[var(--bg-input)] border border-[var(--border-glass)] rounded px-3 py-2 mb-6 text-center">
            <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--text-secondary)] block mb-1">Your UID</span>
            <span className="font-mono text-sm text-[var(--mesh-accent)] tracking-wide">{uid}</span>
          </div>

          {/* Avatar upload */}
          <div className="flex flex-col items-center mb-6">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-full border-2 border-dashed border-[var(--border-hover)] bg-[var(--bg-input)] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--mesh-accent)] transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,124,16,0.15)]"
            >
              {dpDataurl ? (
                <img src={dpDataurl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Upload</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <span className="text-[9px] text-[var(--text-muted)] mt-2">Optional — max 256KB</span>
          </div>

          {/* Nickname */}
          <div className="mb-4">
            <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[var(--text-secondary)]">
              Nickname <span className="text-red-400">*</span>
            </label>
            <input
              className="w-full bg-[var(--bg-input)] border border-[var(--border-glass)] rounded px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--mesh-accent)] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1)] transition-all duration-200"
              placeholder="Your display name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </div>

          {/* Bio */}
          <div className="mb-6">
            <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[var(--text-secondary)]">
              Bio <span className="text-[var(--text-muted)] normal-case tracking-normal text-[9px]">(optional)</span>
            </label>
            <textarea
              className="w-full bg-[var(--bg-input)] border border-[var(--border-glass)] rounded px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--mesh-accent)] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1)] transition-all duration-200 resize-none"
              placeholder="A short bio..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              maxLength={140}
            />
          </div>

          {/* Submit + Cancel */}
          <div className="flex gap-3">
            {isEdit && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 mesh-btn mesh-btn-ghost text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-3 rounded-xl"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!nickname.trim() || saving}
              className="flex-1 mesh-btn mesh-btn-primary text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Enter the Mesh'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
