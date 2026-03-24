// config.js — Persistent local profile storage for MESH
// Stores uid, nickname, bio, dp_dataurl in mesh_config.json
// Located in Electron's userData directory (platform-specific)

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let configPath = null

/**
 * Initialize with the userData directory (called once from index.js).
 * @param {string} userDataDir — app.getPath('userData')
 */
function init(userDataDir) {
  configPath = path.join(userDataDir, 'mesh_config.json')
}

/**
 * Generate a cryptographically secure 20-character alphanumeric UID.
 * Permanent once created — tied to this device's profile.
 */
function generateUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(20)
  let uid = ''
  for (let i = 0; i < 20; i++) {
    uid += chars[bytes[i] % chars.length]
  }
  return uid
}

/**
 * Read the config from disk. If it doesn't exist, create a skeleton with a fresh UID.
 * @returns {{ uid: string, nickname: string, bio: string, dp_dataurl: string }}
 */
function getConfig() {
  if (!configPath) throw new Error('config.init() not called')

  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const data = JSON.parse(raw)
    // Migrate configs created before saved_channels was added
    if (!Array.isArray(data.saved_channels)) data.saved_channels = []
    return data
  }

  // First boot — generate skeleton with permanent UID
  const config = {
    uid: generateUID(),
    nickname: '',
    bio: '',
    dp_dataurl: '',
    saved_channels: [],
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  return config
}

/**
 * Merge updates into the existing config and persist.
 * @param {Partial<{ nickname: string, bio: string, dp_dataurl: string }>} updates
 * @returns {object} the full updated config
 */
function saveConfig(updates) {
  const current = getConfig()
  // UID is immutable — never overwrite it
  const merged = { ...current, ...updates, uid: current.uid }
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2))
  return merged
}

/**
 * Add a channel to saved_channels (or update if room_code already exists).
 * @param {{ room_code: string, name: string, port: number, password: string }} channel
 * @returns {object} the full updated config
 */
function addChannel(channel) {
  const current = getConfig()
  const idx = current.saved_channels.findIndex((c) => c.room_code === channel.room_code)
  if (idx >= 0) {
    // Update existing — port/password/name may have changed on re-launch
    current.saved_channels[idx] = { ...current.saved_channels[idx], ...channel }
  } else {
    current.saved_channels.push(channel)
  }
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2))
  return current
}

/**
 * Remove a channel from saved_channels by room_code.
 * @param {string} roomCode
 * @returns {object} the full updated config
 */
function removeChannel(roomCode) {
  const current = getConfig()
  current.saved_channels = current.saved_channels.filter((c) => c.room_code !== roomCode)
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2))
  return current
}

module.exports = { init, getConfig, saveConfig, addChannel, removeChannel }
