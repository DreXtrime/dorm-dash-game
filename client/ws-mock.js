class WsMockServer {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.players = [];
    this.entities = [];
    this.state = 'lobby'; 
    this.timeRemaining = 180;
    this.tickInterval = null;
    this.localPlayerId = 'p1';
    
    for (let i = 0; i < 15; i++) {
      this.entities.push({
        id: 'e' + i,
        type: 'ember',
        x: Math.random() * 800 + 100,
        y: Math.random() * 500 + 100
      });
    }
  }

  send(dataStr) {
    const data = JSON.parse(dataStr);
    setTimeout(() => this.handleMessage(data), 10);
  }

  handleMessage(data) {
    switch (data.type) {
      case 'join_room':
        this.players.push({
          id: this.localPlayerId,
          name: data.playerName,
          color: data.color,
          isHost: true,
          x: 200,
          y: 200,
          score: 0,
          activePowerup: null
        });
        this.players.push({
          id: 'bot1',
          name: 'Bot',
          color: data.color === 'red' ? 'blue' : 'red',
          isHost: false,
          x: 600,
          y: 300,
          score: 0,
          activePowerup: null
        });
        this.sendToClient({
          type: 'room_update',
          players: this.players,
          settings: { roundTime: 180, maxPlayers: 4 }
        });
        break;
      case 'request_start':
        this.state = 'playing';
        this.sendToClient({
          type: 'game_start',
          startTime: Date.now(),
          duration: 180
        });
        this.startGameLoop();
        break;
      case 'input':
        const p = this.players.find(pl => pl.id === this.localPlayerId);
        if (p && this.state === 'playing') {
          p.x += data.dx * 8;
          p.y += data.dy * 8;
          // bounds
          p.x = Math.max(0, Math.min(2000, p.x));
          p.y = Math.max(0, Math.min(2000, p.y));

          this.entities = this.entities.filter(e => {
            if (e.type === 'ember') {
              const dist = Math.hypot(p.x - e.x, p.y - e.y);
              if (dist < 40) {
                p.score += 1;
                return false;
              }
            }
            return true;
          });
          if (this.entities.length < 15) {
            this.entities.push({
              id: 'e' + Date.now() + Math.random(),
              type: 'ember',
              x: Math.random() * 1800 + 100,
              y: Math.random() * 800 + 100
            });
          }
        }
        break;
      case 'menu_action':
        this.sendToClient({
          type: 'menu_broadcast',
          action: data.action,
          playerName: this.players[0].name
        });
        if (data.action === 'quit') {
          this.endGame();
        } else if (data.action === 'pause') {
          this.state = 'paused';
        } else if (data.action === 'resume') {
          this.state = 'playing';
        }
        break;
    }
  }

  startGameLoop() {
    this.tickInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      this.timeRemaining -= 0.05;
      
      const bot = this.players.find(p => p.id === 'bot1');
      if (bot) {
        bot.x += (Math.random() - 0.5) * 6;
        bot.y += (Math.random() - 0.5) * 6;
        bot.x = Math.max(0, Math.min(2000, bot.x));
        bot.y = Math.max(0, Math.min(2000, bot.y));
      }
      
      this.sendToClient({
        type: 'state_delta',
        time: Math.floor(this.timeRemaining),
        players: this.players,
        entities: this.entities
      });
      
      if (this.timeRemaining <= 0) {
        this.endGame();
      }
    }, 50);
  }
  
  endGame() {
    this.state = 'ended';
    clearInterval(this.tickInterval);
    const winner = this.players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    const scores = {};
    this.players.forEach(p => scores[p.id] = p.score);
    this.sendToClient({
      type: 'game_end',
      winnerId: winner.id,
      scores: scores
    });
  }

  sendToClient(data) {
    this.onMessage(JSON.stringify(data));
  }
}
