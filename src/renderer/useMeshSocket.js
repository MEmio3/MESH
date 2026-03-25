// useMeshSocket.js — WebSocket connection hook for the MESH renderer
// Supports both JSON text frames and binary frames (for media transfer).

import { useRef } from 'react'

export function useMeshSocket() {
  const wsRef = useRef(null)
  const mediaFetchResolvers = useRef(new Map())

  function connect(ws_url, joinPayload, onMessage) {
    // Close any existing connection before opening a new one
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    const ws = new WebSocket(ws_url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      console.log(`[MESH] WS open → ${ws_url}`)
      ws.send(JSON.stringify(joinPayload))
    }

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        // JSON text frame — existing message path
        const msg = JSON.parse(e.data)
        onMessage(msg)
      } else {
        // Binary frame — media data response
        handleBinaryFrame(e.data)
      }
    }

    ws.onerror = (e) => {
      console.error('[MESH] WS error', e)
    }

    ws.onclose = () => {
      console.log('[MESH] WS closed')
    }
  }

  function handleBinaryFrame(arrayBuffer) {
    try {
      const view = new DataView(arrayBuffer)
      const headerLen = view.getUint32(0)
      const headerBytes = new Uint8Array(arrayBuffer, 4, headerLen)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
      const binaryData = arrayBuffer.slice(4 + headerLen)

      if (header.type === 'media_data') {
        const resolver = mediaFetchResolvers.current.get(header.media_id)
        if (resolver) {
          resolver({ header, data: binaryData })
          mediaFetchResolvers.current.delete(header.media_id)
        }
      }
    } catch (err) {
      console.error('[MESH] Binary frame parse error:', err)
    }
  }

  // Send a JSON-serialisable object over the open socket
  function sendMessage(obj) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (obj.type === 'msg_delete' || obj.type === 'msg_edit' || (obj.type === 'chat' && (obj.reply_to || obj.forwarded))) {
        console.log(`[MESH WS] Sending ${obj.type}:`, JSON.stringify(obj).slice(0, 500))
      }
      wsRef.current.send(JSON.stringify(obj))
    } else {
      console.warn(`[MESH] sendMessage called but socket is not open (state=${wsRef.current?.readyState}), type=${obj.type}`)
    }
  }

  /**
   * Send a binary frame: [4-byte header-length][JSON header][raw binary data]
   * @param {object} headerObj - JSON header
   * @param {ArrayBuffer} arrayBuffer - raw binary data
   */
  function sendBinary(headerObj, arrayBuffer) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    const headerStr = JSON.stringify(headerObj)
    const headerBytes = new TextEncoder().encode(headerStr)
    const frame = new ArrayBuffer(4 + headerBytes.length + arrayBuffer.byteLength)
    const view = new DataView(frame)
    view.setUint32(0, headerBytes.length)
    new Uint8Array(frame, 4, headerBytes.length).set(headerBytes)
    new Uint8Array(frame, 4 + headerBytes.length).set(new Uint8Array(arrayBuffer))
    wsRef.current.send(frame)
  }

  /**
   * Request full media from host. Returns a Promise that resolves with {header, data: ArrayBuffer}.
   * @param {string} mediaId
   * @returns {Promise<{header: object, data: ArrayBuffer}>}
   */
  function fetchMedia(mediaId) {
    return new Promise((resolve, reject) => {
      mediaFetchResolvers.current.set(mediaId, resolve)
      sendMessage({ type: 'media_fetch', media_id: mediaId })
      setTimeout(() => {
        if (mediaFetchResolvers.current.has(mediaId)) {
          mediaFetchResolvers.current.delete(mediaId)
          reject(new Error('Media fetch timeout'))
        }
      }, 30000)
    })
  }

  // Gracefully close the socket
  function disconnect() {
    wsRef.current?.close()
    wsRef.current = null
    mediaFetchResolvers.current.clear()
  }

  return { connect, sendMessage, sendBinary, fetchMedia, disconnect, wsRef }
}
