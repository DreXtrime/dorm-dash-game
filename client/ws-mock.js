class WsMockServer {
  constructor() {
    this.players = [];
    this.entities = [];
    this.gameState = 'lobby'; // lobby | playing | ended
    this.timer = 180; // 3 minutes default
    this.botInterval = null;
    this.loopInterval = null;
    this.bots = [];
    this.onMessage = null;
    this.maxPlayers = 4;
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'join_room':
        if (this.players.length >= this.maxPlayers) return;
        const newPlayer = {
          id: 'p1', // local player
          name: msg.playerName,
          color: msg.color || 'green',
          score: 0,
          x: 200,
          y: 200,
          isMoving: false
        };
        this.players.push(newPlayer);
        
        // Add bots to fill lobby
        const botNames = ['BotAlpha', 'BotBravo', 'BotCharlie'];
        const botColors = ['red', 'blue', 'yellow'];
        for (let i = 0; i < this.maxPlayers - 1; i++) {
          this.players.push({
            id: 'bot' + i,
            name: botNames[i],
            color: botColors[i],
            score: 0,
            x: 100 + (i * 50),
            y: 100 + (i * 50),
            isMoving: false,
            targetX: 0,
            targetY: 0
          });
        }
        
        this.broadcast({ type: 'room_update', players: this.players, maxPlayers: this.maxPlayers, roundTime: this.timer });
        break;

      case 'request_start':
        if (this.players.length > 0 && this.players[0].id === 'p1') {
          this.startGame();
        }
        break;

      case 'input':
        const p = this.players.find(p => p.id === 'p1');
        if (p && this.gameState === 'playing') {
          p.x += msg.dx * 8;
          p.y += msg.dy * 8;
          p.dx = msg.dx;
          p.isMoving = (msg.dx !== 0 || msg.dy !== 0);
          
          // Confine to arena bounds (approximate)
          p.x = Math.max(50, Math.min(window.innerWidth - 50, p.x));
          p.y = Math.max(150, Math.min(window.innerHeight - 50, p.y));

          this.checkCollisions(p);
        }
        break;

      case 'menu_action':
        this.broadcast({ type: 'menu_broadcast', action: msg.action, playerName: this.players[0].name });
        if (msg.action === 'quit') {
          this.endGame();
        }
        break;
    }
  }

  startGame() {
    this.gameState = 'playing';
    this.spawnEntities();
    this.broadcast({ type: 'game_start' });
    
    this.botInterval = setInterval(() => this.updateBots(), 500);
    this.loopInterval = setInterval(() => this.gameTick(), 1000 / 20); // 20hz tick
  }

  spawnEntities() {
    this.entities = [];
    for (let i = 0; i < 5; i++) {
      this.spawnEmber();
    }
    for (let i = 0; i < 2; i++) {
      this.spawnCloud();
    }
  }

  spawnEmber() {
    this.entities.push({
      id: 'e_' + Math.random().toString(36).substr(2, 9),
      type: 'ember',
      x: 100 + Math.random() * (window.innerWidth - 200),
      y: 200 + Math.random() * (window.innerHeight - 300)
    });
  }

  spawnCloud() {
    this.entities.push({
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      type: 'cloud',
      x: 100 + Math.random() * (window.innerWidth - 200),
      y: 200 + Math.random() * (window.innerHeight - 300)
    });
  }

  updateBots() {
    if (this.gameState !== 'playing') return;
    this.players.forEach(bot => {
      if (!bot.id.startsWith('bot')) return;
      
      // Random movement
      if (Math.random() > 0.3) {
        bot.targetX = Math.max(50, Math.min(window.innerWidth - 50, bot.x + (Math.random() - 0.5) * 200));
        bot.targetY = Math.max(150, Math.min(window.innerHeight - 50, bot.y + (Math.random() - 0.5) * 200));
        bot.isMoving = true;
      } else {
        bot.isMoving = false;
      }

      if (bot.isMoving) {
        const dx = bot.targetX - bot.x;
        const dy = bot.targetY - bot.y;
        const dist = Math.hypot(dx, dy);
        bot.dx = dx;
        if (dist > 5) {
          bot.x += (dx / dist) * 15;
          bot.y += (dy / dist) * 15;
        } else {
          bot.isMoving = false;
        }
        this.checkCollisions(bot);
      }
    });
  }

  checkCollisions(player) {
    const hitboxSize = 30;
    
    // Check Embers
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.type === 'ember') {
        const dist = Math.hypot(player.x - ent.x, player.y - ent.y);
        if (dist < hitboxSize) {
          player.score += 10;
          this.entities.splice(i, 1);
          setTimeout(() => this.spawnEmber(), 2000); // Respawn after 2s
        }
      } else if (ent.type === 'cloud') {
        const dist = Math.hypot(player.x - ent.x, player.y - ent.y);
        if (dist < hitboxSize + 20) {
          // Stun effect (mock doesn't implement full stun logic, just minor point drain)
          if (Math.random() > 0.8 && player.score > 0) player.score -= 1;
        }
      }
    }
  }

  gameTick() {
    if (this.gameState !== 'playing') return;
    
    this.broadcast({
      type: 'state_delta',
      time: this.timer,
      players: this.players,
      entities: this.entities
    });

    if (Math.random() < 0.05) this.timer--; // Mock timer decrement

    if (this.timer <= 0) {
      this.endGame();
    }
  }

  endGame() {
    this.gameState = 'ended';
    clearInterval(this.botInterval);
    clearInterval(this.loopInterval);
    
    const scores = {};
    let winnerId = this.players[0].id;
    let maxScore = -1;
    
    this.players.forEach(p => {
      scores[p.id] = p.score;
      if (p.score > maxScore) {
        maxScore = p.score;
        winnerId = p.id;
      }
    });

    this.broadcast({
      type: 'game_end',
      scores: scores,
      winnerId: winnerId
    });
  }

  broadcast(data) {
    if (this.onMessage) {
      this.onMessage(JSON.stringify(data));
    }
  }
}

window.WsMockServer = WsMockServer;
