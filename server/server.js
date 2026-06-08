const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '../client');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/rooms') {
    const publicRooms = [];
    for (const [id, room] of rooms.entries()) {
      if (room.state === 'lobby' && !room.botMode && room.players.size < room.maxPlayers) {
        // Collect host name
        const host = Array.from(room.players.values()).find(p => p.id === room.hostId);
        publicRooms.push({
          id: id,
          hostName: host ? host.name : 'Unknown',
          players: room.players.size,
          maxPlayers: room.maxPlayers
        });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(publicRooms));
  }

  let filePath = path.join(CLIENT_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!path.extname(filePath)) {
    filePath = path.join(CLIENT_DIR, 'index.html');
  }

  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(CLIENT_DIR, 'index.html'), (err2, content2) => {
          if (err2) {
            res.writeHead(404);
            res.end('File not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content2, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocketServer({ server });

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 700;
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;

const rooms = new Map();
const watchers = new Set(); // Clients watching for public room updates

function getPublicRooms() {
  const publicRooms = [];
  for (const [id, room] of rooms.entries()) {
    if (room.state === 'lobby' && !room.botMode && room.players.size < room.maxPlayers) {
      const host = Array.from(room.players.values()).find(p => p.id === room.hostId);
      publicRooms.push({
        id: id,
        hostName: host ? host.name : 'Unknown',
        players: room.players.size,
        maxPlayers: room.maxPlayers
      });
    }
  }
  return publicRooms;
}

function broadcastPublicRooms() {
  const data = JSON.stringify({ type: 'public_rooms_update', rooms: getPublicRooms() });
  for (const ws of watchers) {
    if (ws.readyState === 1) ws.send(data);
  }
}

const generateId = () => Math.random().toString(36).substring(2, 9);

function broadcast(room, data) {
  const msg = JSON.stringify(data);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
  });
}

function broadcastRoomUpdate(room) {
  const lobbyPlayers = Array.from(room.players.values()).filter(p => p.inLobby !== false);
  const payload = JSON.stringify({
    type: 'room_update',
    players: lobbyPlayers.map(p => ({
      id: p.id, name: p.name, color: p.color
    })),
    settings: { roundTime: room.roundTime, maxPlayers: room.maxPlayers || 4 }
  });
  
  for (const p of room.players.values()) {
    if (p.inLobby !== false && p.ws) {
      p.ws.send(payload);
    }
  }
  broadcastPublicRooms();
}

wss.on('connection', (ws) => {
  ws.id = generateId();
  ws.roomId = null;

  ws.on('message', (message) => {
    let data;
    try { data = JSON.parse(message); } catch (e) { return; }

    if (data.type === 'watch_rooms') {
      watchers.add(ws);
      ws.send(JSON.stringify({ type: 'public_rooms_update', rooms: getPublicRooms() }));
      return;
    }

    const room = rooms.get(ws.roomId);

    if (data.type === 'join_room') {
      const roomId = data.roomId.toUpperCase();
      const intent = data.intent;
      
      let r = rooms.get(roomId);
      
      if (intent === 'join' && !r) {
        ws.send(JSON.stringify({ type: 'join_error', message: "Room doesn't exist, try creating one." }));
        return;
      }

      if (intent === 'create' && r) {
        ws.send(JSON.stringify({ type: 'join_error', message: "Room already exists! Try joining it instead." }));
        return;
      }

      if (!r) {
        r = {
          id: roomId,
          players: new Map(),
          entities: new Map(),
          state: 'lobby',
          roundTime: 180,
          timer: 180,
          maxPlayers: 4,
          hostId: ws.id,
          tickInterval: null,
          lastTime: 0
        };
        rooms.set(roomId, r);
        broadcastPublicRooms();
      }
      
      ws.roomId = roomId;

      if (r.state !== 'lobby') {
        ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress' }));
        return;
      }
      
      if (r.players.size >= (r.maxPlayers || 4)) {
        ws.send(JSON.stringify({ type: 'join_error', message: 'Room is full' }));
        return;
      }

      let playerName = data.playerName.substring(0, 12);
      let nameCount = 1;
      const originalName = playerName;
      while (Array.from(r.players.values()).some(p => p.name === playerName)) {
        playerName = `${originalName}${nameCount++}`;
      }

      r.players.set(ws.id, {
        id: ws.id,
        ws: ws,
        name: playerName,
        color: data.color || 'green',
        inLobby: true,
        score: 0,
        x: 200,
        y: 200,
        dx: 0,
        dy: 0,
        powerups: {},
        isMoving: false
      });

      ws.send(JSON.stringify({ type: 'joined_room', id: ws.id }));
      broadcastRoomUpdate(r);
    } else if (data.type === 'request_start' && room) {
      if (room.hostId === ws.id && room.state === 'lobby') {
        room.state = 'playing';
        room.timer = room.roundTime;
        room.botMode = !!data.botMode; // track if this is a solo-vs-bot game

        const activePlayers = Array.from(room.players.values()).filter(p => p.inLobby !== false);

        activePlayers.forEach((p, i) => {
          p.score = 0;
          p.waitingNext = false;
          const spawnPoints = [
            { x: 400, y: 350 },
            { x: 800, y: 350 },
            { x: 400, y: 500 },
            { x: 800, y: 500 }
          ];
          p.x = spawnPoints[i % 4].x;
          p.y = spawnPoints[i % 4].y;
          p.powerups = {};
          p.isMoving = false;
        });

        // Only add a bot when botMode is explicitly requested
        if (room.botMode) {
          const botId = 'bot_' + generateId();
          room.players.set(botId, {
            id: botId,
            ws: null,
            name: 'Bot',
            color: 'red',
            score: 0,
            x: 700,
            y: 350,
            dx: 0,
            dy: 0,
            isMoving: false,
            powerups: {},
            targetX: 700,
            targetY: 350,
            // Bot AI state
            botState: 'wander',       // wander | chase_ember | chase_powerup | evade_cloud
            botStateTimer: 0,
            botReactionDelay: 0,      // ticks before bot "notices" a new target
          });
        }

        spawnEmber(room); spawnEmber(room); spawnEmber(room);
        spawnCloud(room); spawnCloud(room);

        broadcast(room, { type: 'game_start', startTime: Date.now(), duration: room.timer });

        room.lastTime = Date.now();
        setTimeout(() => {
          room.lastTime = Date.now();
          room.tickInterval = setInterval(() => {
            gameTick(room);
          }, 33);
        }, 3000);
        
        broadcastPublicRooms();
      }
    } else if (data.type === 'update_settings' && room) {
      if (room.hostId === ws.id && room.state === 'lobby') {
        if (data.settings.roundTime) {
          room.roundTime = data.settings.roundTime;
          room.timer = room.roundTime;
        }
        if (data.settings.maxPlayers) {
          room.maxPlayers = data.settings.maxPlayers;
          // KICK LOGIC: If the host reduces maxPlayers below current count, kick the most recently joined players.
          const pArr = Array.from(room.players.values());
          if (pArr.length > room.maxPlayers) {
            for (let i = room.maxPlayers; i < pArr.length; i++) {
               const pk = pArr[i];
               if (pk.ws) {
                 pk.ws.send(JSON.stringify({ type: 'error', message: 'You were kicked. The host reduced the max player count.' }));
                 pk.ws.close();
               }
            }
          }
        }
        broadcastRoomUpdate(room);
      }
    } else if (data.type === 'update_player' && room && room.state === 'lobby') {
      const p = room.players.get(ws.id);
      if (p) {
        if (data.name) {
          let playerName = data.name.substring(0, 12);
          let nameCount = 1;
          const originalName = playerName;
          while (Array.from(room.players.values()).some(pl => pl.id !== ws.id && pl.name === playerName)) {
            playerName = `${originalName}${nameCount++}`;
          }
          p.name = playerName;
        }
        if (data.color) p.color = data.color;
        broadcastRoomUpdate(room);
      }
    } else if (data.type === 'input' && room && room.state === 'playing') {
      const p = room.players.get(ws.id);
      if (p) {
        let len = Math.hypot(data.dx, data.dy);
        if (len > 0) {
          p.dx = data.dx / len;
          p.dy = data.dy / len;
        } else {
          p.dx = 0;
          p.dy = 0;
        }
      }
    } else if (data.type === 'menu_action' && room) {
      const action = data.action;
      if (action === 'pause' && room.state === 'playing') {
        room.state = 'paused';
        broadcast(room, { type: 'menu_broadcast', action: 'pause', playerName: room.players.get(ws.id)?.name || 'Someone' });
      } else if (action === 'resume' && room.state === 'paused') {
        room.state = 'playing';
        room.lastTime = Date.now(); 
        broadcast(room, { type: 'menu_broadcast', action: 'resume', playerName: room.players.get(ws.id)?.name || 'Someone' });
      } else if (action === 'quit') {
        broadcast(room, { type: 'menu_broadcast', action: 'quit', playerName: room.players.get(ws.id)?.name || 'Someone' });
        ws.close(); 
      }
    } else if (data.type === 'play_again' && room && room.state === 'ended') {
      if (room.hostId === ws.id) {
        room.state = 'lobby';
        const hostP = room.players.get(ws.id);
        if (hostP) hostP.inLobby = true;
        
        for (const p of room.players.values()) {
           if (p.waitingNext) {
             p.waitingNext = false;
             p.inLobby = true;
             if (p.ws) p.ws.send(JSON.stringify({ type: 'room_recreated' }));
           }
        }
        if (hostP && hostP.ws) hostP.ws.send(JSON.stringify({ type: 'room_recreated' }));
        broadcastRoomUpdate(room);
      }
    } else if (data.type === 'wait_next' && room) {
      const p = room.players.get(ws.id);
      if (!p) return;
      
      if (room.state === 'ended') {
        p.waitingNext = true;
      } else if (room.state === 'lobby') {
        p.inLobby = true;
        p.waitingNext = false;
        if (p.ws) p.ws.send(JSON.stringify({ type: 'room_recreated' }));
        broadcastRoomUpdate(room);
      } else if (room.state === 'playing') {
        if (p.ws) {
          p.ws.send(JSON.stringify({ type: 'error', message: 'The next game has already started without you!' }));
          p.ws.close();
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        const p = room.players.get(ws.id);
        room.players.delete(ws.id);
        if (p) broadcast(room, { type: 'player_left', id: ws.id, playerName: p.name });
        
        if (room.players.size === 0 || Array.from(room.players.values()).filter(pl => pl.ws).length === 0) {
          clearInterval(room.tickInterval);
          rooms.delete(ws.roomId);
          broadcastPublicRooms();
        } else {
          if (room.hostId === ws.id) {
            if (room.state === 'ended') {
              broadcast(room, { type: 'error', message: 'Host left the game. Room closed.' });
              room.players.forEach(p => { if (p.ws) p.ws.close(); });
              rooms.delete(ws.roomId);
            } else {
              room.hostId = Array.from(room.players.values()).find(pl => pl.ws)?.id;
              if (room.state === 'lobby') broadcastRoomUpdate(room);
              else if (room.players.size < 2) endGame(room);
            }
          } else {
            if (room.state === 'lobby') broadcastRoomUpdate(room);
            else if (room.players.size < 2 && room.state === 'playing') endGame(room);
          }
        }
      }
    }
    
    if (watchers.has(ws)) {
      watchers.delete(ws);
    }
  });
});

function spawnEmber(room) {
  const id = 'e_' + generateId();
  room.entities.set(id, {
    id, type: 'ember',
    x: 100 + Math.random() * (ARENA_WIDTH - 200),
    y: 250 + Math.random() * (ARENA_HEIGHT - 350),
    spawnTime: Date.now()
  });
}

function spawnCloud(room) {
  const id = 'c_' + generateId();
  room.entities.set(id, {
    id, type: 'cloud',
    x: 100 + Math.random() * (ARENA_WIDTH - 200),
    y: 250 + Math.random() * (ARENA_HEIGHT - 350),
    tx: 100 + Math.random() * (ARENA_WIDTH - 200),
    ty: 250 + Math.random() * (ARENA_HEIGHT - 350)
  });
}

function spawnPowerup(room) {
  if (Array.from(room.entities.values()).filter(e => e.type.startsWith('powerup-')).length >= 3) return;
  const types = ['powerup-bolt', 'powerup-shield', 'powerup-magnet'];
  const type = types[Math.floor(Math.random() * types.length)];
  const id = 'pu_' + generateId();
  room.entities.set(id, {
    id, type,
    x: 100 + Math.random() * (ARENA_WIDTH - 200),
    y: 250 + Math.random() * (ARENA_HEIGHT - 350)
  });
}

function checkAABB(x1, y1, w1, h1, x2, y2, w2, h2) {
  return Math.abs(x1 - x2) < (w1 + w2) / 2 && Math.abs(y1 - y2) < (h1 + h2) / 2;
}

function gameTick(room) {
  const now = Date.now();
  const dt = Math.min((now - room.lastTime) / 1000, 0.1);
  room.lastTime = now;
  
  room.timer -= dt;
  if (room.timer <= 0) {
    room.timer = 0;
    endGame(room);
    return;
  }

  const playerCount = Array.from(room.players.values()).filter(p => p.ws).length;
  const embers = Array.from(room.entities.values()).filter(e => e.type === 'ember');
  const emberCount = embers.length;
  const minEmbers = playerCount * 2;
  const maxEmbers = playerCount * 5;

  if (emberCount < minEmbers) {
    const needed = minEmbers - emberCount;
    for (let i = 0; i < needed; i++) {
    spawnEmber(room);
    }
  }
  
  if (emberCount < maxEmbers) {
    if (Math.random() < 0.03) {
      const burst = Math.floor(Math.random() * 4) + 2;
      for (let i = 0; i < burst && emberCount + i < maxEmbers; i++) {
        spawnEmber(room);
      }
    } else if (Math.random() < 0.15 * dt * playerCount) {
      spawnEmber(room);
    }
  }
  if (Math.random() < 0.005) {
    spawnPowerup(room);
  }

  for (const [id, e] of room.entities) {
    if (e.type === 'ember') {
      if (now - e.spawnTime > 12000) {
        room.entities.delete(id);
        spawnEmber(room);
      }
      
      for (const p of room.players.values()) {
        if (p.powerups.magnet && p.powerups.magnet > now) {
          const dist = Math.hypot(p.x - e.x, p.y - e.y);
          if (dist < 120 && dist > 0) {
            e.x += ((p.x - e.x) / dist) * 250 * dt;
            e.y += ((p.y - e.y) / dist) * 250 * dt;
          }
        }
      }
    } else if (e.type === 'cloud') {
      const dist = Math.hypot(e.tx - e.x, e.ty - e.y);
      if (dist < 10 || Math.random() < 0.02) {
        e.tx = 100 + Math.random() * (ARENA_WIDTH - 200);
        e.ty = 250 + Math.random() * (ARENA_HEIGHT - 350);
      } else {
        e.x += ((e.tx - e.x) / dist) * 80 * dt;
        e.y += ((e.ty - e.y) / dist) * 80 * dt;
      }
    }
  }

  const cloudCount = Array.from(room.entities.values()).filter(e => e.type === 'cloud').length;
  if (cloudCount < playerCount + 1) spawnCloud(room);

  for (const p of room.players.values()) {
    if (!p.ws) {
      // ── SMART BOT AI ──────────────────────────────────────
      // Difficulty: bot gets faster reactions as game progresses
      const gameProgress = 1 - (room.timer / room.roundTime); // 0→1
      const reactionInterval = Math.max(8, 30 - Math.floor(gameProgress * 22)); // ticks
      p.botStateTimer = (p.botStateTimer || 0) + 1;

      if (p.botStateTimer >= reactionInterval) {
        p.botStateTimer = 0;

        const entities = Array.from(room.entities.values());

        // 1. Check for nearby threatening clouds first (evade)
        let nearestCloud = null, nearestCloudDist = 110;
        for (const e of entities) {
          if (e.type !== 'cloud') continue;
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < nearestCloudDist) { nearestCloud = e; nearestCloudDist = d; }
        }

        if (nearestCloud && !p.powerups.shield) {
          // Evade: run directly away from cloud
          const awayX = p.x + (p.x - nearestCloud.x);
          const awayY = p.y + (p.y - nearestCloud.y);
          p.targetX = Math.max(80, Math.min(ARENA_WIDTH - 80, awayX));
          p.targetY = Math.max(230, Math.min(ARENA_HEIGHT - 80, awayY));
          p.botState = 'evade_cloud';
        } else {
          // 2. Look for powerups (high priority)
          let nearestPU = null, nearestPUDist = Infinity;
          for (const e of entities) {
            if (!e.type.startsWith('powerup-')) continue;
            const d = Math.hypot(p.x - e.x, p.y - e.y);
            if (d < nearestPUDist) { nearestPU = e; nearestPUDist = d; }
          }

          // 3. Look for nearest ember
          let nearestEmber = null, nearestEmberDist = Infinity;
          for (const e of entities) {
            if (e.type !== 'ember') continue;
            const d = Math.hypot(p.x - e.x, p.y - e.y);
            if (d < nearestEmberDist) { nearestEmber = e; nearestEmberDist = d; }
          }

          // Decide target: powerup < 250px wins over ember, else go for ember
          if (nearestPU && nearestPUDist < 250) {
            p.targetX = nearestPU.x;
            p.targetY = nearestPU.y;
            p.botState = 'chase_powerup';
          } else if (nearestEmber) {
            // Add small imperfection — bot misses slightly (harder at end of game)
            const jitter = Math.max(0, 30 - Math.floor(gameProgress * 28));
            p.targetX = nearestEmber.x + (Math.random() - 0.5) * jitter;
            p.targetY = nearestEmber.y + (Math.random() - 0.5) * jitter;
            p.botState = 'chase_ember';
          } else {
            // Wander to a random arena point
            p.targetX = 150 + Math.random() * (ARENA_WIDTH - 300);
            p.targetY = 250 + Math.random() * (ARENA_HEIGHT - 350);
            p.botState = 'wander';
          }
        }
      }

      // Move towards target
      const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y);
      if (dist > 8) {
        p.dx = (p.targetX - p.x) / dist;
        p.dy = (p.targetY - p.y) / dist;
      } else {
        p.dx = 0; p.dy = 0;
      }
    }

    let cloudSlow = false;
    const hasShield = p.powerups.shield && p.powerups.shield > now;
    
    for (const e of room.entities.values()) {
      if (e.type === 'cloud' && checkAABB(p.x, p.y, 40, 40, e.x, e.y, 50, 50)) {
        // Only apply penalties/slowdown if they DO NOT have a shield
        if (!hasShield) {
          if (!p.cloudImmunityEndTime || now > p.cloudImmunityEndTime) {
            p.score = Math.max(0, p.score - 5);
            p.cloudImmunityEndTime = now + 1500;
          }
          cloudSlow = true;
        }
      }
    }
    
    // Process Powerups
    let baseSpeed = 220;
    if (p.powerups.bolt && p.powerups.bolt > now) {
      baseSpeed = 350;
    } else if (p.powerups.bolt) {
      delete p.powerups.bolt;
    }
    
    if (p.powerups.shield && p.powerups.shield <= now) delete p.powerups.shield;
    if (p.powerups.magnet && p.powerups.magnet <= now) delete p.powerups.magnet;

    if (cloudSlow) {
      baseSpeed *= 0.3;
    }

    p.x += p.dx * baseSpeed * dt;
    p.y += p.dy * baseSpeed * dt;
    p.isMoving = p.dx !== 0 || p.dy !== 0;

    p.x = Math.max(30, Math.min(ARENA_WIDTH - 30, p.x));
    p.y = Math.max(220, Math.min(ARENA_HEIGHT - 30, p.y));

    for (const [id, e] of room.entities) {
      if (e.type === 'ember') {
        if (checkAABB(p.x, p.y, 40, 40, e.x, e.y, 24, 28)) {
          p.score += 10;
          room.entities.delete(id);
        }
      } else if (e.type === 'cloud') {
        if (checkAABB(p.x, p.y, 30, 30, e.x, e.y, 50, 50)) {
          if (p.powerups.shield && p.powerups.shield > now) {
            // SHIELD LOGIC: Destroy the cloud and consume the shield
            delete p.powerups.shield;
            room.entities.delete(id);
          } else if (!p.cloudImmunityEndTime || now > p.cloudImmunityEndTime) {
            p.score = Math.max(0, p.score - 5);
            p.cloudImmunityEndTime = now + 1500;
          }
        }
      } else if (e.type.startsWith('powerup-')) {
        if (checkAABB(p.x, p.y, 40, 40, e.x, e.y, 32, 32)) {
          // MULTIPLE POWERUPS LOGIC: Set expiration timestamp per-powerup type.
          const type = e.type.replace('powerup-', '');
          p.powerups[type] = now + 5000;
          if (type === 'shield') p.powerups[type] = now + 9999999;
          room.entities.delete(id);
          // AUDIO EVENT: Tell specifically this player's client to play the powerup sound
          if (p.ws) p.ws.send(JSON.stringify({ type: 'powerup_pickup', powerup: type }));
        }
      }
    }
  }

  const payload = {
    type: 'state_delta',
    time: Math.ceil(room.timer),
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: Math.round(p.x),
      y: Math.round(p.y),
      dx: p.dx,
      isMoving: p.isMoving,
      score: p.score,
      activePowerups: Object.keys(p.powerups)
    })),
    entities: Array.from(room.entities.values()).map(e => ({
      id: e.id,
      type: e.type,
      x: Math.round(e.x),
      y: Math.round(e.y)
    }))
  };
  broadcast(room, payload);
}

function endGame(room) {
  room.state = 'ended';
  clearInterval(room.tickInterval);
  const scores = {};
  let winnerId = null;
  let maxScore = -1;
  for (const p of room.players.values()) {
    if (p.inLobby !== false) {
      scores[p.id] = p.score;
      if (p.score > maxScore) { maxScore = p.score; winnerId = p.id; }
    }
    p.inLobby = false; // Everyone is marked out of lobby
  }
  broadcast(room, { type: 'game_end', scores, winnerId });
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
