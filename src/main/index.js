const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

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
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'))
  }
}

// --- IPC Handler Stubs ---
// Derived from .claude/rules/core-flows.md
// Full WS server implementation goes here in Phase 1.

ipcMain.handle('py_start_host', async (_event, args) => {
  // TODO: Instantiate ws.Server on args.port, register in active_servers,
  //       return { code, history, ws_url }
  console.log('[STUB] py_start_host:', args)
  return { code: null, history: [], ws_url: null }
})

ipcMain.handle('py_start_client', async (_event, args) => {
  // TODO: Validate target, return ws_url for renderer to connect
  console.log('[STUB] py_start_client:', args)
  return { ws_url: null }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
