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
    return JSON.parse(raw)
  }

  // First boot — generate skeleton with permanent UID
  const config = {
    uid: generateUID(),
    nickname: '',
    bio: '',
    dp_dataurl: '',
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

module.exports = { init, getConfig, saveConfig }
