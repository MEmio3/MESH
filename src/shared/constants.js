// WebSocket message type constants
// Single source of truth for all WS message type strings.
// Derived from .claude/rules/network-schemas.md

const MSG_TYPES = {
  // Handshake
  JOIN: 'join',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  USER_LIST: 'user_list',

  // Presence
  PEER_JOINED: 'mesh_peer_joined',
  PEER_LEFT: 'mesh_peer_left',

  // Chat
  CHAT: 'chat',
  MSG_DELIVERED: 'msg_delivered',
  MSG_SEEN: 'msg_seen',

  // Relay
  GUEST_RELAY_JOIN: 'guest_relay_join',
  DIRECT_MESSAGE: 'direct_message',
  DM_ERROR: 'dm_error',
}

const DEFAULTS = {
  WS_PORT: 8765,
  HISTORY_LIMIT: 100,
}

module.exports = { MSG_TYPES, DEFAULTS }
