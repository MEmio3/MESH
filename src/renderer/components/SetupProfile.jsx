// SetupProfile.jsx — First-boot profile creation screen
// Shown when config.nickname is empty. User sets nickname, optional bio/dp.
// Props: { uid, onComplete: (config) => void }

import { useState, useRef } from 'react'

export function SetupProfile({ uid, onComplete }) {
  const [nickname, setNickname] = useState('')
  const [bio, setBio]           = useState('')
  const [dpDataurl, setDpDataurl] = useState('')
  const [saving, setSaving]     = useState(false)
  const fileRef = useRef(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    // Cap at 256KB for the base64 payload
    if (file.size > 256 * 1024) return

    const reader = new FileReader()
    reader.onload = () => setDpDataurl(reader.result)
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
    <div className="min-h-screen bg-[#060608] text-[#e8f5e9] flex flex-col select-none relative">
      <div className="ambient-glow" />
      <div className="scanlines" />

      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center p-6">

        {/* Setup card */}
        <form
          onSubmit={handleSubmit}
          className="relative bg-[#13161b] border border-[rgba(16,124,16,0.14)] rounded-lg p-8 w-full max-w-md overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#107C10] to-transparent opacity-40" />

          {/* Header */}
          <div className="text-center mb-8">
            <span
              className="text-xl font-bold tracking-[0.3em] text-[#107C10] uppercase inline-block mb-3"
              style={{ animation: 'logo-pulse 2.5s ease-in-out infinite' }}
            >
              MESH
            </span>
            <h1 className="text-lg font-bold tracking-[0.12em] uppercase text-[#e8f5e9] mb-1.5">
              Create Your Profile
            </h1>
            <p className="text-[11px] text-[#7a9e82]">
              Your identity on the mesh network. Your UID is permanent.
            </p>
          </div>

          {/* UID display */}
          <div className="bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2 mb-6 text-center">
            <span className="text-[10px] tracking-[0.18em] uppercase text-[#7a9e82] block mb-1">Your UID</span>
            <span className="font-mono text-sm text-[#107C10] tracking-wide">{uid}</span>
          </div>

          {/* Avatar upload */}
          <div className="flex flex-col items-center mb-6">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-full border-2 border-dashed border-[rgba(16,124,16,0.38)] bg-[#0d0f13] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[#107C10] transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,124,16,0.15)]"
            >
              {dpDataurl ? (
                <img src={dpDataurl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-[#3a5040] uppercase tracking-wider">Upload</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <span className="text-[9px] text-[#3a5040] mt-2">Optional — max 256KB</span>
          </div>

          {/* Nickname */}
          <div className="mb-4">
            <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">
              Nickname <span className="text-red-400">*</span>
            </label>
            <input
              className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200"
              placeholder="Your display name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </div>

          {/* Bio */}
          <div className="mb-6">
            <label className="block text-[10px] tracking-[0.18em] uppercase mb-1.5 text-[#7a9e82]">
              Bio <span className="text-[#3a5040] normal-case tracking-normal text-[9px]">(optional)</span>
            </label>
            <textarea
              className="w-full bg-[#0d0f13] border border-[rgba(16,124,16,0.14)] rounded px-3 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5040] outline-none focus:border-[#107C10] focus:shadow-[0_0_0_3px_rgba(16,124,16,0.1),inset_0_0_0_1px_rgba(16,124,16,0.08)] transition-all duration-200 resize-none"
              placeholder="A short bio..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              maxLength={140}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!nickname.trim() || saving}
            className="w-full bg-[#107C10] hover:bg-[#1a9f1a] disabled:bg-[#0a4f0a] disabled:cursor-not-allowed text-white text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-3 rounded cursor-pointer transition-all duration-200 shadow-[0_0_20px_rgba(16,124,16,0.25)] hover:shadow-[0_0_32px_rgba(16,124,16,0.45)]"
          >
            {saving ? 'Saving...' : 'Enter the Mesh'}
          </button>
        </form>

      </div>
    </div>
  )
}
