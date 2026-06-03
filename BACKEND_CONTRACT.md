# Backend Contract

### join_room
Direction: Client → Server
Trigger: User clicks "Create Room" or "Join Room" on Join Screen.
Payload: `{ "type": "join_room", "roomId": "ABCD", "playerName": "CamperA", "color": "green" }`
Frontend behaviour on receipt: N/A
Error case: If server rejects, connection fails or error message is received.

### room_update
Direction: Server → Client
Trigger: A player joins or leaves the lobby.
Payload: `{ "type": "room_update", "players": [ { "id": "uuid", "name": "CamperA", "color": "green", "isHost": true } ], "settings": { "roundTime": 180, "maxPlayers": 4 } }`
Frontend behaviour on receipt: Updates Lobby Screen player list and settings (if host).
Error case: Lobby screen shows outdated state.

### request_start
Direction: Client → Server
Trigger: Host clicks "START GAME" on Lobby Screen.
Payload: `{ "type": "request_start" }`
Frontend behaviour on receipt: N/A
Error case: Game does not start.

### game_start
Direction: Server → Client
Trigger: All players are ready or host forces start.
Payload: `{ "type": "game_start", "startTime": 1234567890, "duration": 180 }`
Frontend behaviour on receipt: Transitions to In-Game Screen, initializes game state, starts timer and RAF loop.
Error case: Client remains in lobby.

### input
Direction: Client → Server
Trigger: Sent at 20Hz during active gameplay.
Payload: `{ "type": "input", "dx": 1, "dy": -1, "powerup": false }`
Frontend behaviour on receipt: N/A
Error case: Server uses last known input or stops player.

### state_delta
Direction: Server → Client
Trigger: Sent at server tick rate (e.g., 20Hz).
Payload: 
```json
{
  "type": "state_delta",
  "time": 1234567895,
  "players": [
    { "id": "uuid", "x": 100, "y": 200, "score": 12, "activePowerup": null }
  ],
  "entities": [
    { "id": "e1", "type": "ember", "x": 50, "y": 50 },
    { "id": "e2", "type": "cloud", "x": 300, "y": 150 }
  ]
}
```
Frontend behaviour on receipt: Updates remote player targets for interpolation, compares local player pos for reconciliation, updates entity pool state.
Error case: Desync or visual stuttering.

### menu_action
Direction: Client → Server
Trigger: User clicks Pause, Resume, or Quit in the menu overlay.
Payload: `{ "type": "menu_action", "action": "pause" | "resume" | "quit" }`
Frontend behaviour on receipt: Local UI updates immediately.
Error case: Server state desyncs with client intent.

### menu_broadcast
Direction: Server → Client
Trigger: A player pauses, resumes, or quits the game.
Payload: `{ "type": "menu_broadcast", "action": "pause" | "resume" | "quit", "playerName": "CamperA" }`
Frontend behaviour on receipt: Shows overlay (if pause) and HUD banner for 4s.
Error case: Missed banner.

### player_left
Direction: Server → Client
Trigger: A player disconnects or quits.
Payload: `{ "type": "player_left", "id": "uuid", "playerName": "CamperB" }`
Frontend behaviour on receipt: Removes player from scoreboard, shows banner.
Error case: Ghost player remains on screen.

### game_end
Direction: Server → Client
Trigger: Timer reaches zero or only one player remains.
Payload: `{ "type": "game_end", "winnerId": "uuid", "scores": { "uuid": 12 } }`
Frontend behaviour on receipt: Transitions to End Screen, shows winner and scores.
Error case: Game continues indefinitely.

### error
Direction: Server → Client
Trigger: Invalid action, full room, etc.
Payload: `{ "type": "error", "message": "Room is full" }`
Frontend behaviour on receipt: Displays error alert or text.
Error case: Silent failure.
