// Payload schema factory functions (stubs).
// Derived from .claude/rules/network-schemas.md
// Full validation logic will be added in Phase 1.

/**
 * Join payload — sent by client to host on connection.
 * @param {{ uid: string, nick: string, password?: string, dp?: string, bio?: string }} args
 * @returns {{ type: string, uid: string, nick: string, password: string, dp: string, bio: string }}
 */
function makeJoinPayload({ uid, nick, password = '', dp = '', bio = '' }) {
  return { type: 'join', uid, nick, password, dp, bio }
}

/**
 * Chat broadcast payload — supports optional media attachment and reactions.
 *
 * media (optional): { type: 'image'|'file', data: 'base64_string', filename: 'string' }
 * reactions (server-side): { [uid]: emoji_string } — e.g. { 'abc123': '👍', 'def456': '🔥' }
 *
 * @param {{ uid: string, nick: string, msg: string, msg_id: string, media?: object }} args
 * @returns {{ type: string, uid: string, nick: string, msg: string, msg_id: string, media: object|null }}
 */
function makeChatPayload({ uid, nick, msg, msg_id, media = null }) {
  return { type: 'chat', uid, nick, msg, msg_id, media }
}

/**
 * Direct message payload — host inspects target_uid and forwards to target WS.
 * @param {{ target_uid: string, [key: string]: any }} args
 * @returns {{ type: string, target_uid: string }}
 */
function makeDirectMessagePayload({ target_uid, ...rest }) {
  return { type: 'direct_message', target_uid, ...rest }
}

module.exports = { makeJoinPayload, makeChatPayload, makeDirectMessagePayload }
