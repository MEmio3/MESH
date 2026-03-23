# State Management (Node.js Main Process)

## Active Servers Registry
Track active WebSocket servers in memory.
`active_servers: Map<number, NetworkNode>`
* `NetworkNode` properties: `port`, `room_name`, `room_code`, `is_headless_relay` (bool), `relay_auto_approve` (bool), `running` (bool).

## Peer Registries (Per Server Instance)
* `connected_peers: Map<string, PeerObject>` (Standard room members).
* `guest_peers: Map<string, PeerObject>` (Clients connected via headless relay).
* `pending_guests: Map<string, PeerObject>` (Relay clients awaiting manual host approval).

*PeerObject Shape:* `{ ws: WebSocket, nick: string, dp: string, is_host: boolean, is_live: boolean, status: string, remote_ip: string }`

## Chat History
Persisted locally. Max 100 messages per room.
Shape: `[{ uid, nick, msg, msg_id, reactions, seen_by }]`