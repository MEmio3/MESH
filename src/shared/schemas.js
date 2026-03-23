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
 * Chat broadcast payload.
 * @param {{ uid: string, nick: string, msg: string, msg_id: string }} args
 * @returns {{ type: string, uid: string, nick: string, msg: string, msg_id: string }}
 */
function makeChatPayload({ uid, nick, msg, msg_id }) {
  return { type: 'chat', uid, nick, msg, msg_id }
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
