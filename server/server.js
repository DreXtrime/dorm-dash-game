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

const generateId = () => Math.random().toString(36).substring(2, 9);

function broadcast(room, data) {
  const msg = JSON.stringify(data);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
  });
}

function broadcastRoomUpdate(room) {
  const playersArr = Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isHost: p.id === room.hostId
  }));
  broadcast(room, {
    type: 'room_update',
    players: playersArr,
    settings: { roundTime: room.timer, maxPlayers: 4 }
  });
}

wss.on('connection', (ws) => {
  ws.id = generateId();
  ws.roomId = null;

  ws.on('message', (message) => {
    let data;
    try { data = JSON.parse(message); } catch (e) { return; }

    const room = rooms.get(ws.roomId);

    if (data.type === 'join_room') {
      const roomId = data.roomId.toUpperCase();
      ws.roomId = roomId;
      
      let r = rooms.get(roomId);
      if (!r) {
        r = {
          id: roomId,
          players: new Map(),
          entities: new Map(),
          state: 'lobby',
          timer: 180,
          hostId: ws.id,
          tickInterval: null,
          lastTime: 0
        };
        rooms.set(roomId, r);
      }
      
      if (r.state !== 'lobby') {
        ws.send(JSON.stringify({ type: 'error', message: 'Game already started' }));
        ws.close();
        return;
      }
      
      if (r.players.size >= 4) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        ws.close();
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
        score: 0,
        x: 100 + r.players.size * 50,
        y: 200,
        dx: 0,
        dy: 0,
        isMoving: false,
        activePowerup: null,
        powerupEndTime: 0,
        cloudImmunityEndTime: 0
      });

      broadcastRoomUpdate(r);
    } else if (data.type === 'request_start' && room) {
      if (room.hostId === ws.id && room.state === 'lobby') {
        room.state = 'playing';
        room.timer = 180;
        
        let i = 0;
        room.players.forEach(p => {
          p.score = 0;
          p.x = 200 + (i * 200);
          p.y = 350;
          p.activePowerup = null;
          i++;
        });

        // Fill with bots if less than 2 players to ensure testing works seamlessly
        if (room.players.size < 2) {
          const botId = 'bot_' + generateId();
          room.players.set(botId, {
            id: botId,
            ws: null,
            name: 'Bot Camper',
            color: 'red',
            score: 0,
            x: 600,
            y: 350,
            dx: 0,
            dy: 0,
            isMoving: false,
            activePowerup: null,
            powerupEndTime: 0,
            cloudImmunityEndTime: 0,
            targetX: 600,
            targetY: 350
          });
        }

        spawnEmber(room); spawnEmber(room); spawnEmber(room);
        spawnCloud(room); spawnCloud(room);

        broadcast(room, { type: 'game_start', startTime: Date.now(), duration: room.timer });
        
        room.lastTime = Date.now();
        room.tickInterval = setInterval(() => gameTick(room), TICK_MS);
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
        } else {
          if (room.hostId === ws.id) {
            room.hostId = Array.from(room.players.values()).find(pl => pl.ws)?.id;
          }
          if (room.state === 'lobby') broadcastRoomUpdate(room);
          else if (room.players.size < 2) endGame(room);
        }
      }
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
  if (room.state !== 'playing') return;
  
  const now = Date.now();
  const dt = (now - room.lastTime) / 1000;
  room.lastTime = now;
  
  room.timer -= dt;
  if (room.timer <= 0) {
    room.timer = 0;
    endGame(room);
    return;
  }

  const playerCount = Array.from(room.players.values()).filter(p => p.ws).length;
  if (Math.random() < 0.6 * playerCount * dt) {
    spawnEmber(room);
  }
  if (Math.random() < 0.01) {
    spawnPowerup(room);
  }

  for (const [id, e] of room.entities) {
    if (e.type === 'ember') {
      if (now - e.spawnTime > 12000) {
        room.entities.delete(id);
        spawnEmber(room);
      }
      
      for (const p of room.players.values()) {
        if (p.activePowerup === 'magnet' && now < p.powerupEndTime) {
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
      if (Math.random() < 0.02) {
         p.targetX = 100 + Math.random() * (ARENA_WIDTH - 200);
         p.targetY = 250 + Math.random() * (ARENA_HEIGHT - 350);
      }
      const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y);
      if (dist > 5) {
        p.dx = (p.targetX - p.x) / dist;
        p.dy = (p.targetY - p.y) / dist;
      } else {
        p.dx = 0; p.dy = 0;
      }
    }

    if (p.activePowerup && now >= p.powerupEndTime) {
      p.activePowerup = null;
    }

    let speedModifier = 1.0;
    if (p.activePowerup === 'bolt') speedModifier = 1.6;

    let cloudSlow = false;
    for (const e of room.entities.values()) {
      if (e.type === 'cloud' && checkAABB(p.x, p.y, 40, 40, e.x, e.y, 72, 48)) {
        cloudSlow = true;
        if (now > p.cloudImmunityEndTime) {
          if (p.activePowerup === 'shield') {
            p.activePowerup = null; 
            p.cloudImmunityEndTime = now + 1500; 
          } else {
            p.score = Math.max(0, p.score - 5);
            p.cloudImmunityEndTime = now + 1500;
          }
        }
      }
    }
    
    if (cloudSlow && now <= p.cloudImmunityEndTime && p.activePowerup !== 'shield') {
      speedModifier *= 0.5;
    }

    const speed = 220 * speedModifier;
    p.x += p.dx * speed * dt;
    p.y += p.dy * speed * dt;
    p.isMoving = p.dx !== 0 || p.dy !== 0;

    p.x = Math.max(30, Math.min(ARENA_WIDTH - 30, p.x));
    p.y = Math.max(220, Math.min(ARENA_HEIGHT - 30, p.y));

    for (const [id, e] of room.entities) {
      if (e.type === 'ember') {
        if (checkAABB(p.x, p.y, 40, 40, e.x, e.y, 24, 28)) {
          p.score += 10;
          room.entities.delete(id);
        }
      } else if (e.type.startsWith('powerup-')) {
        if (checkAABB(p.x, p.y, 40, 40, e.x, e.y, 32, 32)) {
          p.activePowerup = e.type.replace('powerup-', '');
          p.powerupEndTime = now + 5000;
          if (p.activePowerup === 'shield') p.powerupEndTime = now + 9999999;
          room.entities.delete(id);
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
      activePowerup: p.activePowerup
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
  let maxScore = -1;
  let winnerId = null;
  room.players.forEach(p => {
    scores[p.id] = p.score;
    if (p.score > maxScore) {
      maxScore = p.score;
      winnerId = p.id;
    }
  });
  broadcast(room, { type: 'game_end', scores, winnerId });
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
