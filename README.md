# Dorm Dash - Frontend PWA

## Overview
Dorm Dash is a real-time multiplayer Web PWA game built purely with DOM elements and CSS animations (no `<canvas>`). Players collect campfire embers, avoid rainclouds, and use power-ups in a 60 FPS competitive arena.

## How to run locally
1. Run a local web server from the `client/` directory.
   ```bash
   cd client
   npx serve .
   # or
   python3 -m http.server 8000
   ```
2. Open `http://localhost:8000` in your browser.

## How to connect the real backend
1. Update `client/ws-client.js` to point to your real WebSocket server URL (e.g., `wss://api.dormdash.game`).
2. Remove the mock initialization in `app.js` and use `WsClient` exclusively.
3. Refer to `BACKEND_CONTRACT.md` for the exact payload schemas required by the frontend.

## How to replace placeholder assets
1. Drop your production art assets into the `client/assets/` folder, matching the paths and filenames listed in `ASSETS_MANIFEST.md`.
2. The CSS placeholders will automatically be covered or can be removed from `client/styles.css` once the real assets are loaded.

## PWA Installation
- **Desktop (Chrome/Edge):** Click the install icon in the address bar or the "Install Dorm Dash" prompt on the Join screen.
- **Mobile (iOS):** Tap "Share" > "Add to Home Screen".
- **Mobile (Android):** Tap the "Add to Home Screen" prompt when it appears.

## Deployment
This frontend is static and can be deployed anywhere.
- **Render / Railway:** Create a Static Site service pointing to the `client/` directory.
- **Fly.io:** Use a simple Nginx or Caddy Dockerfile to serve `client/`.
- **Vercel / Netlify:** Connect the repo and set the publish directory to `client/`.

## Local Multiplayer Testing (ngrok)
To test multiplayer with devices on different networks (or over mobile hotspot):
1. Run local server: `python3 -m http.server 8000`
2. Expose with ngrok: `ngrok http 8000`
3. Share the `https://<id>.ngrok.io` URL with testers.

## Performance Profiling
1. Open Chrome DevTools > **Performance** tab.
2. Click **Record**, play for 10 seconds, and stop.
3. Inspect the **Main** thread. Look for the `requestAnimationFrame` loop.
4. Ensure there are **no Forced Synchronous Layouts** (purple blocks with red triangles).
5. The frame budget is ~16.6ms for 60 FPS. The game logic should consume < 2ms, leaving the rest for the browser's compositor.
