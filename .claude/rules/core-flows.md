# Core Logical Flows

## 1. Hosting a Room
* **UI Trigger:** User clicks 'Start Room'. 
* **Action:** UI invokes `ipcRenderer.invoke('py_start_host', {name, port, password, headless_relay})`.
* **Backend:** 1. Check if `active_servers[port]` exists. 
  2. Instantiate new WebSocket server on `port`. 
  3. Register server in `active_servers`. 
  4. Return `{ code, history, ws_url }` to UI.
* **UI Connects:** Host's own frontend connects to `ws://localhost:port` and sends a `join` payload.

## 2. Joining a Room
* **UI Trigger:** User requests access.
* **Action:** UI invokes `ipcRenderer.invoke('py_start_client', {ip, port, password})`.
* **Backend:** Returns `{ ws_url: "ws://ip:port" }` to UI.
* **UI Connects:** Frontend opens WebSocket to `ws_url`, sends `join` payload, awaits `accepted` or `rejected`.

## 3. Disconnect Handling
* Triggered on `ws.on('close')`.
* Backend looks up `uid` in `connected_peers` or `guest_peers`.
* Removes `uid` from memory.
* Broadcasts to remaining peers: `{ "type": "mesh_peer_left", "uid": "string" }`.
* Broadcasts System Chat: "User left the room."