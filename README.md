# Dorm Dash - Multiplayer Game

## Overview
Dorm Dash is a real-time multiplayer browser game built for high performance and engaging gameplay. The project relies on a strictly DOM+CSS based rendering engine (no `<canvas>`) to deliver a fully responsive 60 FPS experience, seamlessly connected to a real-time WebSocket backend.

## Architecture
The application is structured into two primary domains to ensure a clean separation of concerns:

- **Frontend (`/client`)**: A Vanilla JS application utilizing a custom DOM entity pool for zero garbage-collection layout rendering. It handles all visual rendering, CSS animations, sound playback, player input mapping, and responsive UI scaling. 
- **Backend (Server)**: An authoritative WebSocket server responsible for managing lobbies, executing the game loop simulation (typically at 20Hz), handling bot AI routing, collision detection, and score management. 
  - *Note: A local mock server (`client/ws-mock.js`) is currently provided for frontend development and visual testing, but the architecture is fully decoupled.*

## Technology Stack
- **Frontend**: HTML5, CSS3 (Vanilla, No Frameworks), JavaScript (ES6+), PWA (Service Workers & Manifest)
- **Backend**: Backend-agnostic (Node.js/Go/Rust recommended)
- **Protocol**: WebSockets via JSON payload schema (Strictly defined in `BACKEND_CONTRACT.md`)

## Local Development Setup

### 1. Running the Game Locally
You can serve the static frontend using any local web server. The mock server will automatically handle the game state if a live backend is not provided.
```bash
cd client
python3 -m http.server 8000
# or
npx serve .
```
Navigate to `http://localhost:8000` in your browser. 

### 2. Backend Integration
When the real backend is ready to be connected, developers must do the following:
1. In `client/ws-client.js`, toggle `WsClient.isMockMode = false`.
2. Update the WebSocket connection URL in `client/app.js` to point to the live backend endpoint (e.g., `wss://api.dormdash.game`).
3. Remove the mock dependencies (`<script src="./ws-mock.js"></script>`) from `client/index.html`.

## Backend Implementation Guide
Backend engineers should refer directly to **`BACKEND_CONTRACT.md`** for the exact WebSocket event schemas. The frontend is entirely "dumb" to game rules—it strictly renders whatever state the server broadcasts. 

The backend is strictly responsible for:
- **Lobby Management**: Handling `join_room` requests and broadcasting `room_update` state changes.
- **Game State Simulation**: Processing player `input` (movement directions) and broadcasting continuous `state_delta` ticks at roughly 20Hz.
- **Collisions & Entities**: The server dictates when an ember is collected or a cloud strikes a player, and manages the spawning coordinates of all entities.

## Performance Constraints
- **Zero Canvas**: The entire game is rendered using DOM elements and hardware-accelerated CSS transforms (`translate3d`). No `<canvas>` elements are permitted.
- **Object Pooling**: DOM nodes are pre-allocated at startup. To maintain 60 FPS, no elements should be created or destroyed inside the `requestAnimationFrame` loop.

## Deployment
- **Frontend**: The client is a fully static PWA and can be deployed via Vercel, Netlify, Render, Cloudflare Pages, or any standard CDN.
- **Backend**: The backend should be deployed as a stateful WebSocket service, utilizing persistent connections.
