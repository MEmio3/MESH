const { contextBridge, ipcRenderer } = require('electron')

// Allowlist for main->renderer push channels (js_* convention from claude.md)
const VALID_CHANNELS = [
  'js_peer_joined',
  'js_peer_left',
  'js_message_received',
  'js_room_state',
]

contextBridge.exposeInMainWorld('meshBridge', {
  // --- Renderer -> Main (invoke = request/response) ---

  /**
   * Start a WebSocket server (host a room).
   * Derived from core-flows.md: "Hosting a Room"
   * @param {{ name: string, port: number, password: string, headless_relay: boolean }} args
   * @returns {Promise<{ code: string, history: Array, ws_url: string }>}
   */
  startHost: (args) => ipcRenderer.invoke('py_start_host', args),

  /**
   * Get the WebSocket URL to connect to as a client.
   * Derived from core-flows.md: "Joining a Room"
   * @param {{ ip: string, port: number, password: string }} args
   * @returns {Promise<{ ws_url: string }>}
   */
  startClient: (args) => ipcRenderer.invoke('py_start_client', args),

  /**
   * Stop a running headless relay server.
   * @param {{ port: number }} args
   * @returns {Promise<{ ok: boolean } | { error: string }>}
   */
  stopRelay: (args) => ipcRenderer.invoke('py_stop_relay', args),

  // --- Main -> Renderer (on = event listener) ---

  /**
   * Register a listener for main-process push events.
   * @param {string} channel  Must be in the VALID_CHANNELS allowlist
   * @param {Function} callback
   */
  on: (channel, callback) => {
    if (VALID_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },

  /**
   * Remove a listener previously registered via meshBridge.on().
   * @param {string} channel
   * @param {Function} callback
   */
  off: (channel, callback) => {
    if (VALID_CHANNELS.includes(channel)) {
      ipcRenderer.removeListener(channel, callback)
    }
  },
})
