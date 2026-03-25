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

  /**
   * Get a snapshot of all running servers.
   * @returns {Promise<Array<{ port: number, name: string, code: string, peerCount: number, isRelay: boolean }>>}
   */
  getRunningServers: () => ipcRenderer.invoke('py_get_running_servers'),

  /**
   * Gracefully shutdown a server by port.
   * @param {{ port: number }} args
   * @returns {Promise<{ ok: boolean } | { error: string }>}
   */
  shutdownPort: (args) => ipcRenderer.invoke('py_shutdown_port', args),

  /**
   * Re-enter an already-running server (host reconnects their UI).
   * @param {{ port: number }} args
   * @returns {Promise<{ code: string, history: Array, ws_url: string } | { error: string }>}
   */
  reenterRoom: (args) => ipcRenderer.invoke('py_reenter_room', args),

  /**
   * Read the local MESH profile config.
   * @returns {Promise<{ uid: string, nickname: string, bio: string, dp_dataurl: string }>}
   */
  getConfig: () => ipcRenderer.invoke('py_get_config'),

  /**
   * Save/update the local MESH profile config.
   * @param {Partial<{ nickname: string, bio: string, dp_dataurl: string }>} updates
   * @returns {Promise<object>}
   */
  saveConfig: (updates) => ipcRenderer.invoke('py_save_config', updates),

  /**
   * Remove a saved channel by room_code.
   * @param {{ room_code: string }} args
   * @returns {Promise<object>}
   */
  removeChannel: (args) => ipcRenderer.invoke('py_remove_channel', args),

  // --- Window controls (frameless titlebar) ---
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

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
