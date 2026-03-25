// media.js — File-based media storage for MESH host
// Stores media files on disk instead of embedding base64 in chat messages.
// Generates thumbnails for images using Electron's nativeImage (no npm deps).

const fs = require('fs')
const path = require('path')

const MEDIA_ROOT = path.join(__dirname, '..', '..', 'media')

function ensureMediaDir(roomCode) {
  const dir = path.join(MEDIA_ROOT, roomCode)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function generateMediaId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${ts}_${rand}`
}

/**
 * Save raw media binary to disk.
 * @param {string} roomCode
 * @param {string} mediaId
 * @param {Buffer} buffer
 */
function saveMedia(roomCode, mediaId, buffer) {
  const dir = ensureMediaDir(roomCode)
  fs.writeFileSync(path.join(dir, `${mediaId}.bin`), buffer)
}

/**
 * Load media binary from disk.
 * @param {string} roomCode
 * @param {string} mediaId
 * @returns {Buffer|null}
 */
function loadMedia(roomCode, mediaId) {
  const filePath = path.join(MEDIA_ROOT, roomCode, `${mediaId}.bin`)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath)
}

/**
 * Generate a small JPEG thumbnail for an image buffer using Electron's nativeImage.
 * Returns a base64 data URL string, or null if generation fails.
 * @param {Buffer} imageBuffer
 * @returns {string|null} data:image/jpeg;base64,... or null
 */
function generateImageThumbnail(imageBuffer) {
  try {
    const { nativeImage } = require('electron')
    const img = nativeImage.createFromBuffer(imageBuffer)
    if (img.isEmpty()) return null

    const size = img.getSize()
    const maxDim = 280
    const scale = maxDim / Math.max(size.width, size.height)
    const resized = img.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
      quality: 'good',
    })

    const jpegBuf = resized.toJPEG(60)
    return `data:image/jpeg;base64,${jpegBuf.toString('base64')}`
  } catch (err) {
    console.error('[MESH] Thumbnail generation failed:', err.message)
    return null
  }
}

module.exports = { generateMediaId, saveMedia, loadMedia, generateImageThumbnail, ensureMediaDir, MEDIA_ROOT }
