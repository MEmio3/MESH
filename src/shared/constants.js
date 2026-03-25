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

  // Reactions
  REACTION: 'reaction',

  // Message actions
  MSG_EDIT: 'msg_edit',
  MSG_DELETE: 'msg_delete',

  // Media
  MEDIA_UPLOAD: 'media_upload',
  MEDIA_UPLOADED: 'media_uploaded',
  MEDIA_FETCH: 'media_fetch',
  MEDIA_DATA: 'media_data',
  MEDIA_ERROR: 'media_error',

  // Pagination
  HISTORY_FETCH: 'history_fetch',
  HISTORY_BATCH: 'history_batch',

  // Relay
  GUEST_RELAY_JOIN: 'guest_relay_join',
  DIRECT_MESSAGE: 'direct_message',
  DM_ERROR: 'dm_error',

  // WebRTC signaling
  WEBRTC_OFFER: 'webrtc_offer',
  WEBRTC_ANSWER: 'webrtc_answer',
  WEBRTC_ICE: 'webrtc_ice',
  WEBRTC_HANGUP: 'webrtc_hangup',
  WEBRTC_ERROR: 'webrtc_error',
}

const DEFAULTS = {
  WS_PORT: 8765,
  HISTORY_LIMIT: 100,
  PAGE_SIZE: 20,
}

module.exports = { MSG_TYPES, DEFAULTS }
