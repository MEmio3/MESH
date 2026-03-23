# Project MESH
## Core Objective
Port a local P2P LAN application (formerly "Unified Hub") from Python/Eel to an Electron + Node.js WebSockets stack.
**Current Scope (Phase 1):** Text messaging, room management, and the Relay system only. Audio/Video/Screen-sharing are out of scope.

## Tech Stack
* **Framework:** Electron (Main Process = Node.js `ws` server; Renderer = React/Vite frontend)
* **Styling:** Tailwind CSS (Dark theme: deep blacks `#09090b`, electric blue accents)
* **Networking:** `ws` library for WebSockets over LAN. Star-topology message bus.

## Workflow Rules
1. **Never read the old Python code.** All logic, schemas, and flows must be derived strictly from the rules defined in `.claude/rules/`.
2. **Task-Do-Verify:** Build backend Node.js WebSocket logic first, test via simple scripts, then connect to the React UI via Electron IPC.
3. **No Audio/Video:** Ignore all WebRTC, audio capabilities, or screen-sharing flags during Phase 1.

## IPC Bridge Convention
* Replace all legacy `eel.py_*` calls with `ipcRenderer.invoke('py_*', args)`.
* Replace all legacy `eel.js_*` callbacks with `ipcMain.webContents.send('js_*', args)`.

@include .claude/rules/network-schemas.md
@include .claude/rules/state-models.md
@include .claude/rules/core-flows.md

## Folder Architecture
Enforce the following strict directory structure:
* `src/main/` -> Electron main process and Node.js WebSocket server logic.
* `src/renderer/` -> React frontend, Tailwind CSS, and UI components.
* `src/preload/` -> Electron preload scripts (contextBridge/IPC definitions).
* `src/shared/` -> Shared constants, payload schemas, and types.
* `.claude/` -> Project brain and rule files.