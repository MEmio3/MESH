// crypto.js — AES-256-GCM encryption for local chat log persistence
// Key is derived from the Host's permanent UID via PBKDF2.

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const SALT = 'mesh-log-salt-v1' // static salt — acceptable for local-only tamper protection
const KEY_LENGTH = 32
const ITERATIONS = 100_000

/**
 * Derive a 256-bit key from the user's permanent UID.
 * @param {string} uid
 * @returns {Buffer}
 */
function deriveKey(uid) {
  return crypto.pbkdf2Sync(uid, SALT, ITERATIONS, KEY_LENGTH, 'sha256')
}

/**
 * Encrypt a JSON-serialisable object into a single base64 string.
 * Format: iv(12B):authTag(16B):ciphertext — all base64-encoded together.
 * @param {any} data — must be JSON.stringify-able
 * @param {string} uid — host UID used to derive the encryption key
 * @returns {string} encrypted payload
 */
function encrypt(data, uid) {
  const key = deriveKey(uid)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const json = JSON.stringify(data)
  const encrypted = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Pack: iv + authTag + ciphertext → single base64 string
  const packed = Buffer.concat([iv, authTag, encrypted])
  return packed.toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted payload back into a JS object.
 * @param {string} payload — base64 string produced by encrypt()
 * @param {string} uid — host UID used to derive the decryption key
 * @returns {any} the original JSON-parsed data
 */
function decrypt(payload, uid) {
  const key = deriveKey(uid)
  const packed = Buffer.from(payload, 'base64')

  const iv = packed.subarray(0, 12)
  const authTag = packed.subarray(12, 28)
  const ciphertext = packed.subarray(28)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(decrypted.toString('utf-8'))
}

module.exports = { encrypt, decrypt }
