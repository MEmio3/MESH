// useMeshSocket.js — WebSocket connection hook for the MESH renderer
// Derived from core-flows.md: the UI opens its own WS connection after
// receiving the ws_url from the main process via meshBridge.

import { useRef } from 'react'

export function useMeshSocket() {
  const wsRef = useRef(null)

  function connect(ws_url, joinPayload, onMessage) {
    // Close any existing connection before opening a new one
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    const ws = new WebSocket(ws_url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log(`[MESH] WS open → ${ws_url}`)
      ws.send(JSON.stringify(joinPayload))
    }

    // All messages route through the single onMessage handler provided by App.jsx
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      onMessage(msg)
    }

    ws.onerror = (e) => {
      console.error('[MESH] WS error', e)
    }

    ws.onclose = () => {
      console.log('[MESH] WS closed')
    }
  }

  // Send a JSON-serialisable object over the open socket
  function sendMessage(obj) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj))
    } else {
      console.warn('[MESH] sendMessage called but socket is not open')
    }
  }

  // Gracefully close the socket
  function disconnect() {
    wsRef.current?.close()
    wsRef.current = null
  }

  return { connect, sendMessage, disconnect, wsRef }
}
