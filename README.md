# MESH

**Peer-to-peer LAN chat application built with Electron, Node.js WebSockets, and React.**

MESH lets you host or join encrypted chat rooms on your local network — no internet, no cloud, no accounts. One person starts a room, others join by IP. Messages, media, reactions, and chat history all stay on your LAN.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Network Protocol](#network-protocol)
- [Features](#features)
- [Getting Started](#getting-started)
- [How to Use](#how-to-use)
- [Security](#security)
- [Build & Package](#build--package)

---

## How It Works

MESH uses a **star topology** — one machine acts as the **Host** (runs the WebSocket server), and everyone else connects as **Clients**. There is no central server or internet dependency. Everything runs over your Wi-Fi or LAN.

```
                    ┌──────────┐
                    │   HOST   │
                    │ (Server) │
                    └────┬─────┘
                         │ WebSocket
              ┌──────────┼──────────┐
              │          │          │
         ┌────┴───┐ ┌───┴────┐ ┌──┴─────┐
         │Client A│ │Client B│ │Client C│
         └────────┘ └────────┘ └────────┘
```

**The Host is also a Client.** When you start a room, your app runs the WebSocket server in the background (Electron main process) and your UI connects to it as a regular client. Everyone — including the host — goes through the same WebSocket connection.

### Flow

1. **Host** clicks "Start Room" → WebSocket server starts on a port (default 8765)
2. **Host's UI** connects to `ws://localhost:8765` and sends a `join` message
3. **Client** enters the Host's IP and port, clicks "Request Access" → connects to `ws://<host-ip>:8765`
4. **Server** validates the password (if set), assigns the peer, and sends back chat history
5. **Messages** are broadcast by the server to all connected peers in real-time
6. **Media files** are uploaded as binary frames, stored on the host's disk, and served on-demand

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Desktop Framework** | Electron 41 | Cross-platform desktop app with Node.js backend and Chromium frontend in one process |
| **Frontend** | React 19 + Vite 8 | Fast component-based UI with hot module replacement during development |
| **Styling** | Tailwind CSS 4 | Utility-first CSS with a custom glassmorphism design system |
| **Networking** | `ws` (Node.js WebSocket library) | Lightweight, zero-dependency WebSocket server for LAN communication |
| **Encryption** | Node.js `crypto` (AES-256-GCM) | Chat logs encrypted at rest using the host's unique ID as the key |
| **Build/Package** | Vite (renderer) + electron-builder (desktop) | Vite bundles the React frontend; electron-builder packages the full app for Windows/macOS/Linux |

### Why These Choices

- **Electron** gives us a Node.js process (for the WebSocket server) and a Chromium window (for the React UI) in one app. No separate server binary needed.
- **WebSockets over LAN** means zero latency, no NAT traversal, no TURN servers. Messages travel directly between machines on the same network.
- **`ws` library** (not Socket.IO) keeps things minimal — raw WebSocket frames, both JSON text and binary, with no abstraction overhead.
- **Vite** instead of Webpack because it's significantly faster for development (instant HMR) and produces smaller bundles.
- **Tailwind CSS 4** with CSS variables for the entire design system — all colors, glass effects, and animations are defined once and reused everywhere.

---

## Architecture

MESH has three layers that communicate through well-defined boundaries:

```
┌─────────────────────────────────────────────────────┐
│                    ELECTRON APP                      │
│                                                      │
│  ┌─────────────────┐    IPC Bridge    ┌────────────┐ │
│  │   Main Process   │◄──────────────►│  Renderer   │ │
│  │   (Node.js)      │  contextBridge  │  (React)    │ │
│  │                   │                │             │ │
│  │  ┌─────────────┐ │                │ ┌─────────┐ │ │
│  │  │ network.js  │ │                │ │ App.jsx │ │ │
│  │  │ WS Server   │ │                │ │ Router  │ │ │
│  │  └──────┬──────┘ │                │ └────┬────┘ │ │
│  │  ┌──────┴──────┐ │                │ ┌────┴────┐ │ │
│  │  │  config.js  │ │                │ │ChatRoom │ │ │
│  │  │  crypto.js  │ │                │ │Profile  │ │ │
│  │  │  media.js   │ │                │ │Relay    │ │ │
│  │  └─────────────┘ │                │ └─────────┘ │ │
│  └─────────────────┘                └────────────┘ │
│                                                      │
│         ▲ WebSocket (ws://localhost:port)             │
│         │                                            │
│         ▼                                            │
│  ┌─────────────────┐                                 │
│  │  useMeshSocket  │  (React hook — renderer-side    │
│  │  WebSocket      │   WS client, NOT through IPC)   │
│  └─────────────────┘                                 │
└─────────────────────────────────────────────────────┘
```

### The Three Processes

**1. Main Process (`src/main/`)** — Node.js

The backend. Runs the WebSocket server, handles file I/O, encrypts/decrypts chat logs, stores media on disk, and manages the profile config. This is where all the server logic lives.

Key modules:
- `network.js` — The WebSocket server engine. Handles all message types: join, chat, reactions, edit, delete, media upload/fetch, history pagination, and relay routing.
- `config.js` — Reads/writes the user's profile (`nickname`, `bio`, `avatar`, `saved_channels`) to a JSON file in Electron's userData directory.
- `crypto.js` — AES-256-GCM encryption for chat logs. Key is derived from the host's permanent UID via PBKDF2 (100k iterations).
- `media.js` — Stores uploaded files as `.bin` on disk, generates JPEG thumbnails for images using Electron's `nativeImage`.

**2. Preload (`src/preload/`)** — The Bridge

Electron's security boundary. The preload script uses `contextBridge` to expose a safe `window.meshBridge` API to the renderer. The renderer can never directly access Node.js — it can only call the functions defined here.

```javascript
// Renderer calls:
window.meshBridge.startHost({ name, port, password })
window.meshBridge.getConfig()

// These map to ipcRenderer.invoke() calls handled by the main process
```

**3. Renderer (`src/renderer/`)** — React UI

The frontend. A single-page React app that renders the dashboard, chat room, profile editor, and relay status. It does NOT use the IPC bridge for real-time messaging — instead, it opens its own WebSocket connection directly to the host's server.

This is a critical design decision: **IPC is used for control-plane operations** (start server, get config, shutdown), while **WebSocket is used for data-plane operations** (chat, reactions, media). This means the same code path works whether you're the host or a remote client.

### IPC Naming Convention

All IPC channels follow the legacy naming convention from the original Python/Eel codebase:
- `py_start_host` — Start a WebSocket server
- `py_start_client` — Get a WebSocket URL for joining
- `py_get_config` — Read profile config
- `js_peer_joined` — Push event: peer joined (main → renderer)

The `py_` prefix means "renderer invokes main" (request/response). The `js_` prefix means "main pushes to renderer" (event).

---

## Project Structure

```
src/
├── main/                       # Electron main process (Node.js)
│   ├── index.js                # App entry point, window creation, IPC handlers
│   ├── network.js              # WebSocket server — all message handling
│   ├── config.js               # Profile & saved channels persistence
│   ├── crypto.js               # AES-256-GCM encrypt/decrypt for chat logs
│   └── media.js                # File storage, thumbnail generation
│
├── preload/
│   └── preload.js              # contextBridge — exposes meshBridge API
│
├── renderer/                   # React frontend (bundled by Vite)
│   ├── index.html              # Entry HTML with Content Security Policy
│   ├── main.jsx                # React root mount
│   ├── App.jsx                 # Main app — dashboard, routing, state
│   ├── useMeshSocket.js        # WebSocket hook (connect, send, binary frames)
│   ├── assets/
│   │   └── index.css           # Tailwind + glassmorphism design system
│   └── components/
│       ├── ChatRoom.jsx        # Chat UI — messages, media, reactions, edit/delete
│       ├── SetupProfile.jsx    # Profile creation and editing
│       ├── TitleBar.jsx        # Custom frameless window titlebar
│       └── RelayActive.jsx     # Headless relay status view
│
├── shared/                     # Shared between main and renderer
│   ├── constants.js            # Message type strings, defaults
│   └── schemas.js              # Payload factory functions
│
logs/                           # Encrypted chat history (per room)
media/                          # Uploaded media files (per room)
```

### What Lives Where

| Concern | File(s) | Process |
|---------|---------|---------|
| WebSocket server | `network.js` | Main |
| Message routing | `network.js` | Main |
| Chat encryption | `crypto.js` | Main |
| Media storage | `media.js` | Main |
| User profile | `config.js` | Main |
| IPC bridge | `preload.js` | Preload |
| Dashboard UI | `App.jsx` | Renderer |
| Chat interface | `ChatRoom.jsx` | Renderer |
| WS client connection | `useMeshSocket.js` | Renderer |
| Message type constants | `constants.js` | Shared |

---

## Network Protocol

All communication happens over WebSockets using **UTF-8 JSON text frames** for messages and **binary frames** for media transfers.

### Message Types

#### Handshake
```
Client → Host:  { type: "join", uid, nick, password, dp, bio }
Host → Client:  { type: "accepted", room_code, room_name, history: [...], has_more }
Host → Client:  { type: "user_list", users: [{ uid, nick, dp, is_host, status }] }
Host → Client:  { type: "mesh_peer_joined", uid, ip }  (one per existing peer)
Host → Client:  { type: "rejected", reason: "invalid_password" | "uid_taken" }
```

#### Chat
```
Client → Host:  { type: "chat", uid, nick, msg, msg_id, media?, reply_to?, forwarded? }
Host → All:     (broadcasts the exact payload to every peer except sender)
```

#### Reactions
```
Client → Host:  { type: "reaction", msg_id, uid, emoji }
Host → All:     (broadcasts to all peers including sender)
```

#### Edit & Delete
```
Client → Host:  { type: "msg_edit", msg_id, uid, new_msg }
Client → Host:  { type: "msg_delete", msg_id, uid }
Host → All:     (broadcasts to all peers, updates/removes from history)
```

#### Media (Binary Frames)

Upload and download use a custom binary frame format:

```
┌────────────┬─────────────────────┬──────────────┐
│ 4 bytes    │ N bytes             │ remaining    │
│ header len │ JSON header         │ raw binary   │
│ (uint32 BE)│ (utf-8 encoded)     │ (file data)  │
└────────────┴─────────────────────┴──────────────┘
```

**Upload:**
```
Client sends binary frame:
  Header: { type: "media_upload", filename, mime, videoThumbnail? }
  Body:   Raw file bytes

Host responds (text frame):
  { type: "media_uploaded", media_id, thumbnail }
```

**Download:**
```
Client sends (text):  { type: "media_fetch", media_id }
Host sends binary frame:
  Header: { type: "media_data", media_id, mime, filename }
  Body:   Raw file bytes
```

#### Pagination
```
Client → Host:  { type: "history_fetch", before_msg_id }
Host → Client:  { type: "history_batch", messages: [...], has_more }
```

#### Relay (Direct Messages)
```
Guest → Host:   { type: "guest_relay_join", uid, nick, dp }
Client → Host:  { type: "direct_message", target_uid, ... }
Host → Target:  (forwards exact payload with added `from: sender_uid`)
```

---

## Features

### Chat
- Real-time text messaging over LAN WebSockets
- Message editing (own messages only, marked as "edited")
- Message deletion / unsend (own messages only)
- Reply to messages (Instagram-style — quote appears above the bubble)
- Forward messages
- Emoji reactions (6 quick emojis per message)
- Chat history pagination (load older messages)

### Media
- Image upload with blurred thumbnail preview (click to fetch full image, click again for lightbox)
- Video upload with client-captured thumbnail (canvas-based frame grab)
- Audio upload with custom inline player
- Generic file upload with download button
- Editable filename before sending
- Max file size: 50MB (matches WebSocket server `maxPayload`)

### Profile
- Persistent identity with unique 20-character UID (generated once, never changes)
- Editable nickname, bio, and avatar
- Avatar resized to 192x192 on upload
- Profile stored in Electron's userData directory

### Rooms & Channels
- Password-protected rooms
- Saved channels — rooms you've hosted are remembered with their room code, so history persists across sessions
- Active servers panel — see all running servers, re-join or shutdown
- Room codes — 6-character alphanumeric identifiers

### Relay
- Headless relay mode — host a relay server that routes direct messages between guests without a chat room
- Auto-approve or manual guest approval (pending)

### UI/UX
- Frameless window with custom titlebar
- Glassmorphism design system (frosted glass cards, translucent backgrounds)
- Dark theme: deep blacks (`#080c08`) with Xbox green accents (`#107C10`)
- Animated status indicators, fade-in cards, logo pulse
- Custom video player with seek bar, fullscreen, time display
- Custom audio player with waveform-style progress bar

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **npm** 9+
- **Git**

### Install

```bash
git clone https://github.com/AbuMaruf1/1MESH.git
cd 1MESH
npm install
```

### Run (Development)

```bash
npm run dev
```

This starts two processes concurrently:
1. **Vite dev server** on `http://localhost:5173` (React frontend with hot reload)
2. **Electron app** (waits for Vite, then launches the desktop window)

> **Important:** Changes to `src/renderer/` are hot-reloaded instantly. Changes to `src/main/` (the Node.js server) require restarting `npm run dev` — the Electron main process only loads these files once at startup.

### First Launch

1. The app opens with a **Profile Setup** screen
2. Choose a nickname, optionally add a bio and avatar
3. A permanent UID is generated automatically — this is your identity across all rooms
4. Click "Save" to reach the Dashboard

---

## How to Use

### Host a Room

1. On the Dashboard, fill in a **Room Name** and optionally a **Port** (default 8765) and **Password**
2. Click **Start Room**
3. You'll enter the chat room as the Host. Share your **local IP** and **port** with others on the same network

### Join a Room

1. On the Dashboard, enter the **Host IP** (e.g., `192.168.1.5`) and **Port**
2. Enter the room **Password** if one was set
3. Click **Request Access**
4. If accepted, you'll enter the chat room

### Chat

- Type a message and press **Enter** or click **Send**
- **Attach media:** Click the paperclip icon (supports images, videos, audio, files up to 50MB)
- **React:** Hover over a message → click the smiley face → pick an emoji
- **Reply:** Hover → click `...` → Reply
- **Edit:** Hover over your message → click `...` → Edit → modify text → Enter
- **Unsend:** Hover over your message → click `...` → Unsend
- **Forward:** Hover → click `...` → Forward

### Media

- **Images** show as blurred thumbnails. Click once to fetch the full image, click again for a fullscreen lightbox with download button.
- **Videos** show as blurred thumbnail previews. Click to load the full video with a custom player (play/pause, seek, fullscreen).
- **Audio** shows as a compact inline player with play/pause and seek.

### Leave & Rejoin

- Click **Leave** to disconnect from the room (the server keeps running if you're the host)
- On the Dashboard, the **Active Servers** panel shows your running server — click **Re-Join** to reconnect
- **Saved Channels** remembers your rooms — click **Launch** to restart a previously hosted room with its history

---

## Security

### What's Encrypted

- **Chat logs at rest** — stored on the host's disk as AES-256-GCM encrypted JSON. The encryption key is derived from the host's UID using PBKDF2 with 100,000 iterations.
- **Media files** — stored as raw binary on disk (not encrypted, but only accessible on the host machine).

### What's NOT Encrypted

- **WebSocket traffic** — messages travel as plaintext JSON over the LAN. This is a LAN-only app; the assumption is that your local network is trusted. If you need encryption in transit, you'd need to add TLS to the WebSocket server.
- **Profile data** — stored as plain JSON in Electron's userData directory.

### Content Security Policy

The renderer enforces a strict CSP that:
- Blocks external scripts and styles
- Only allows WebSocket and HTTP(S) connections
- Allows `data:` and `blob:` URLs for images and media (required for thumbnails and fetched media)

---

## Build & Package

### Build the Renderer

```bash
npm run build:renderer
```

Outputs optimized React bundle to `dist/renderer/`.

### Package the Full App

```bash
npm run build
```

This runs `vite build` then `electron-builder`, producing:
- **Windows:** NSIS installer in `release/`
- **macOS:** DMG in `release/`
- **Linux:** AppImage in `release/`

---

## License

This project is private and not currently licensed for public distribution.
