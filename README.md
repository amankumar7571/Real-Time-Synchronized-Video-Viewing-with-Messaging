# Real-Time Synchronized Video Viewing with Messaging

A front-end demo of a watch party: create a room, watch a video together, and chat while you watch.

## Status: front-end demo — sync is same-browser only

- The WatchTogether room and chat UI are real and interactive.
- **There is no real-time backend yet.** "Sync" currently works through `localStorage` `storage` events, which only synchronize tabs open in the **same browser** — it does not sync playback across different users or devices. There is no WebSocket server, no socket.io, and no backend in this repository.

## How to run

No build step and no backend. Open `index.html` in a browser (or serve the folder with any static file server). Open the same page in a second tab of the same browser to see the tab-to-tab sync.

## What would make it real

- A WebSocket server (e.g. Node + socket.io, or FastAPI WebSockets) that relays play/pause/seek events and chat messages between users in a room.
- Room state on the server so users joining late get the current playback position.
