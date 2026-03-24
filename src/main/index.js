const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const network = require('./network')
const config = require('./config')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'))
  }
}

// --- IPC Handler Stubs ---
// Derived from .claude/rules/core-flows.md
// Full WS server implementation goes here in Phase 1.

ipcMain.handle('py_start_host', async (_event, args) => {
  try {
    return network.startHost(args)
  } catch (err) {
    console.error('[MESH] py_start_host error:', err.message)
    return { error: err.message }
  }
})

// core-flows.md: "Joining a Room" — backend returns ws_url; UI opens the connection
ipcMain.handle('py_start_client', async (_event, { ip, port }) => {
  return { ws_url: `ws://${ip}:${port}` }
})

ipcMain.handle('py_stop_relay', async (_event, { port }) => {
  try {
    network.stopHost(port)
    return { ok: true }
  } catch (err) {
    console.error('[MESH] py_stop_relay error:', err.message)
    return { error: err.message }
  }
})

// Phase 1.5: Host Controls & Persistence

ipcMain.handle('py_get_running_servers', async () => {
  return network.getActiveServers()
})

ipcMain.handle('py_shutdown_port', async (_event, { port }) => {
  try {
    network.shutdownServer(port)
    return { ok: true }
  } catch (err) {
    console.error('[MESH] py_shutdown_port error:', err.message)
    return { error: err.message }
  }
})

ipcMain.handle('py_reenter_room', async (_event, { port }) => {
  try {
    return network.reenterRoom(port)
  } catch (err) {
    console.error('[MESH] py_reenter_room error:', err.message)
    return { error: err.message }
  }
})

// Phase 1.6: Profile System

ipcMain.handle('py_get_config', async () => {
  return config.getConfig()
})

ipcMain.handle('py_save_config', async (_event, updates) => {
  return config.saveConfig(updates)
})

app.whenReady().then(() => {
  config.init(app.getPath('userData'))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
