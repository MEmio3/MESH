# Network Protocol & Schemas
* **Protocol:** WebSockets (UTF-8 JSON strings).
* **Topology:** Star topology. Host acts as the message bus.

## 1. Connection Handshake
**Client -> Host (Join):**
`{ "type": "join", "uid": "string", "nick": "string", "password": "string_or_empty", "dp": "base64", "bio": "string" }`
* Host validates UID and plain-text password.
* **Host -> New Client (Accepted):** `{ "type": "accepted", "room_code": "string", "room_name": "string", "history": [...] }`
* **Host -> New Client (User List):** `{ "type": "user_list", "users": [...] }`
* **Host -> All Existing (Join Announce):** `{ "type": "mesh_peer_joined", "uid": "string", "ip": "string" }`
* **Host -> New Client (Existing Peers):** Sends `mesh_peer_joined` for every connected peer.

## 2. Text Chat
* **Broadcast:** `{ "type": "chat", "uid": "string", "nick": "string", "msg": "string", "msg_id": "8chars_timestamp" }`
* **ACK:** `{ "type": "msg_delivered", "msg_id": "string" }`
* **Seen:** `{ "type": "msg_seen", "msg_id": "string" }`

## 3. Relay Routing
* **Guest Join:** `{ "type": "guest_relay_join", "uid": "string", "nick": "string", "dp": "base64" }`
* **Direct Message (E2EE):** Host inspects `{ "type": "direct_message", "target_uid": "string" }` and forwards the exact payload to the target's WebSocket. If offline, returns `{ "type": "dm_error" }`.