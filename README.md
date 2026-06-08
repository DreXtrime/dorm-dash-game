# Dorm Dash - Multiplayer Game

![Reference Mockups](./docs/images/overview.png)

## Table of Contents
* [Overview](#overview)
* [🌐 Play Now](#-play-now)
* [🎮 How to Play](#-how-to-play)
* [Architecture & Technology Stack](#architecture--technology-stack)
* [Local Development Setup](#local-development-setup)
* [Backend Implementation Guide](#backend-implementation-guide)
* [Performance Constraints](#performance-constraints)
* [How the AI / Bot System Works](#how-the-ai--bot-system-works)
* [Credits](#credits)

## Overview
**Dorm Dash** is a real-time multiplayer browser game built for high performance and engaging gameplay. The project relies on a strictly DOM+CSS based rendering engine (no `<canvas>`) to deliver a fully responsive 60+ FPS experience, seamlessly connected to a real-time WebSocket backend. 

Players join a room, select a colored avatar, and enter a forest camp compound where they must navigate their character, collect embers to score points, avoid dangerous rainclouds, and use powerups. 

---

## 🌐 Play Now  
For your convenience you can access a online ready to play version of the game!  
Play here: https://dorm-dash-game.onrender.com

## 🎮 How to Play

### Joining the Game
1. **Name & Avatar:** On the main join screen, enter your player name and select a colored camper (Green, Red, Blue, or Yellow).
2. **Singleplayer:** You can also hit the singleplayer button to start a match against ai.
3. **Room Code:** Enter a 4-letter Room Code (e.g., `ABCD`) to join an existing lobby or create a new one.

![Join Screen](./docs/images/join_screen.png)

### Multipalyer Lobby
- Once in the lobby, you'll see a preview of the arena and all the connected players.
- You can copy the room link and share it with your friends to invite them.
- If you are the Host (the first person to create the room), you can start the game once everyone is ready!
### Singleplayer Lobby
- Here you can choose the amount of ai
- Specify how difficult each bot is
- Give each bot a name
- Choose a skill multiplier for each bot (refer to the [How the AI / Bot System Works](#how-the-ai--bot-system-works) section to more info)

### In-Game Mechanics
- **Movement:** Use the `W, A, S, D` keys, the `Arrow Keys`, or the on-screen mobile D-Pad to move your camper around the dirt compound.
- **Goal:** Run over the flickering **embers** that spawn around the map to collect them. Each ember gives you points.
- **Hazards:** Avoid the **rainclouds**! Getting struck by them can slow you or deduct points.
- **Timer:** Keep an eye on the top center clock. The game lasts for a specific duration (default 3 minutes). The player with the most points when the timer runs out wins!

![In Game Pause Screen](./docs/images/game_paused.png)

### Pause Menu
- Press `Escape` (or the gear icon on the bottom right) to pause the game. From here, you can toggle game audio, resume, or quit back to the main menu.

### End of Game
- When the timer expires, the screen shifts to the final scoreboard, crowning the winner!
- Players who click **Play Again** will enter a waiting state. If the Host clicks **Play Again**, everyone who chose to wait will be seamlessly dropped back into the Lobby for another round!
- If it was a bot match **Play Again** will take you to a new singleplayer lobby

![End Screen](./docs/images/end_screen.png)

---

## Architecture & Technology Stack
The application is structured into two primary domains to ensure a clean separation of concerns:

- **Frontend (`/client`)**: A Vanilla JS application utilizing a custom DOM entity pool for zero garbage-collection layout rendering. It handles all visual rendering, CSS animations, sound playback, player input mapping, and responsive UI scaling. Uses **HTML5, CSS3, and ES6 JavaScript**.
- **Backend (Server)**: An authoritative WebSocket server responsible for managing lobbies, executing the game loop simulation (typically at 20Hz), handling bot AI routing, collision detection, and score management. 
  - *Note: A local mock server (`client/ws-mock.js`) is currently provided for frontend development and visual testing, but the architecture is fully decoupled.*

## Local Development Setup

The backend has been fully implemented using Node.js. It now handles both the WebSocket real-time simulation and serving the static frontend files!

### Quick Start
To start the game, simply run the included run script from the root directory:
```bash
chmod +x ./run.sh  
./run.sh
```
Then navigate your web browser to `http://localhost:3000`.

### Manual Start
Alternatively, you can start the server manually:
```bash
cd server
npm install
npm start
```

## Backend Implementation Guide
The backend runs an authoritative 20Hz physics simulation for collisions and movement. Backend engineers should refer directly to **`BACKEND_CONTRACT.md`** for the exact WebSocket event schemas. The frontend is entirely "dumb" to game rules—it strictly renders whatever state the server broadcasts. 

The backend is strictly responsible for:
- **Lobby Management**: Handling `join_room` requests and broadcasting `room_update` state changes.
- **Game State Simulation**: Processing player `input` (movement directions) and broadcasting continuous `state_delta` ticks at roughly 20Hz.
- **Collisions & Entities**: The server dictates when an ember is collected or a cloud strikes a player, and manages the spawning coordinates of all entities.

## Performance Constraints
- **Zero Canvas**: The entire game is rendered using DOM elements and hardware-accelerated CSS transforms (`translate3d`). No `<canvas>` elements are permitted.
- **Object Pooling**: DOM nodes are pre-allocated at startup. To maintain 60 FPS, no elements should be created or destroyed inside the `requestAnimationFrame` loop.

## How the AI / Bot System Works

For the single-player mode there is bot system that runs directly on the server loop. It uses a simple state machine that decides what to do based on what is closest to it at any given moment.

### Core Logic and Priorities

Every few frames, the bot checks its surroundings and runs through a checklist of priorities to decide its next move:

- Avoid Danger: First, it checks if a cloud is nearby. If a cloud gets too close (and the bot doesn't have a shield), it instantly switches to an evade_cloud state and moves in the exact opposite direction.

- Grab Powerups: If it's safe, the bot scans for any powerups in range. If it finds a speed bolt, shield, or magnet, it goes straight for it.

- Collect Embers: If there are no threats or powerups around, it locks onto the nearest ember to score points.

- Wander: If the board is completely empty, it just picks a random spot on the screen and walks toward it.

### Difficulty Modes

To make the ai more varied, there are three difficulty presets (Easy, Medium, and Hard). They change how the bot performs by tweaking a few configuration values:

- Reaction Ticks: The bot doesn't "think" every single frame. Easy bots only re-evaluate their targets every 35 ticks, while Hard bots react almost instantly.

- Jitter (Accuracy): Easy bots are clumsy. When they target an ember, a random offset is added to their destination so they don't move perfectly. Hard bots have almost none of that, making them very precise.

- Movement Speed: The base speed of the bot is scaled down for Easy (0.65x) and boosted for Hard (1.05x).

- Fail Chance: To simulate human mistakes, there is a random trigger. On Easy, there is a 35% chance the bot will randomly ignore everything and just wander off for a moment. On Hard, this only happens 3% of the time.

There is also skill multiplier that fine-tunes these stats even further, adjusting response times, speed, and accuracy together.

## Credits

Imran Shiundu - dorm-dash game  
Andrei-Ionut Mihaila - dorm-dash game  
Tanel Erik Neitov - dorm-dash game + npc ai