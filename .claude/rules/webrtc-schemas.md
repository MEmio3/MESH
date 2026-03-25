# WebRTC Signaling Protocol (Phase 2)

All WebRTC signaling travels over the existing WebSocket bus as UTF-8 JSON.
The host acts as a **pure signaling router** — it never inspects or modifies `sdp` or `candidate` fields.

## 1. Signaling Payloads

**Caller → Host (Offer):**
`{ "type": "webrtc_offer", "target_uid": "string", "sdp": "string" }`

**Callee → Host (Answer):**
`{ "type": "webrtc_answer", "target_uid": "string", "sdp": "string" }`

**Either → Host (ICE Candidate):**
`{ "type": "webrtc_ice", "target_uid": "string", "candidate": "object" }`

**Either → Host (Hangup):**
`{ "type": "webrtc_hangup", "target_uid": "string" }`

**Host → Sender (Error):**
`{ "type": "webrtc_error", "reason": "peer_offline", "target_uid": "string" }`

## 2. Backend Routing Rules (Pure Router)

The host handles all `webrtc_*` messages identically:

1. **Inject `from_uid`** — set `payload.from_uid = sender's UID` so the recipient knows who sent it.
2. **Lookup `target_uid`** in `connected_peers`.
3. **If found:** forward the full payload (with `from_uid`) to the target's WebSocket.
4. **If not found:** return `{ "type": "webrtc_error", "reason": "peer_offline", "target_uid": "string" }` to the sender.

* The host MUST NOT parse, validate, or modify `sdp` or `candidate` fields — they are opaque blobs.
* This mirrors the existing `direct_message` routing pattern from `network-schemas.md`.

## 3. Call Flow Summary

```
Caller                    Host (Router)              Callee
  |--- webrtc_offer ------->|                           |
  |                          |--- webrtc_offer -------->|
  |                          |<-- webrtc_answer --------|
  |<-- webrtc_answer --------|                           |
  |--- webrtc_ice ---------->|                           |
  |                          |--- webrtc_ice ---------->|
  |                          |<-- webrtc_ice ------------|
  |<-- webrtc_ice ------------|                           |
  |        ... media flows peer-to-peer via WebRTC ...   |
  |--- webrtc_hangup ------->|                           |
  |                          |--- webrtc_hangup ------->|
```
