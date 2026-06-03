class GameApp {
  constructor() {
    this.ws = null;
    this.screens = {
      join: document.getElementById('screen-join'),
      lobby: document.getElementById('screen-lobby'),
      game: document.getElementById('screen-game'),
      end: document.getElementById('screen-end')
    };
    this.audio = {
      start: new Audio('./assets/audio/start.mp3'),
      pickup: new Audio('./assets/audio/pickup.mp3'),
      powerup: new Audio('./assets/audio/powerup.mp3'),
      cloud_hit: new Audio('./assets/audio/cloud_hit.mp3'),
      win: new Audio('./assets/audio/win.mp3')
    };
    this.soundEnabled = localStorage.getItem('dorm-dash-volume') !== '0';
    
    // UI Elements
    this.els = {
      nameInput: document.getElementById('input-name'),
      roomInput: document.getElementById('input-room'),
      colorBtns: document.querySelectorAll('.avatar-btn'),
      btnCreate: document.getElementById('btn-create-room'),
      btnJoin: document.getElementById('btn-join-room'),
      btnCopyLink: document.getElementById('btn-copy-link'),
      btnCloseInvite: document.getElementById('btn-close-invite'),
      btnStartGame: document.getElementById('btn-start-game'),
      btnMenu: document.getElementById('btn-menu'),
      btnResume: document.getElementById('btn-resume'),
      btnQuit: document.getElementById('btn-quit'),
      btnToggleSoundJoin: document.getElementById('btn-toggle-sound-join'),
      btnToggleSoundGame: document.getElementById('btn-toggle-sound-game'),
      btnPlayAgain: document.getElementById('btn-play-again'),
      btnHome: document.getElementById('btn-home'),
      lobbyPlayers: document.getElementById('lobby-players'),
      lobbyRoomCode: document.getElementById('lobby-room-code'),
      lobbyInviteLink: document.getElementById('lobby-invite-link'),
      inviteBar: document.getElementById('invite-bar'),
      hudScoreboard: document.getElementById('hud-scoreboard'),
      hudTimer: document.getElementById('hud-timer'),
      actionBanner: document.getElementById('action-banner'),
      actionBannerText: document.getElementById('action-banner-text'),
      menuOverlay: document.getElementById('menu-overlay'),
      menuTitle: document.getElementById('menu-title'),
      arena: document.getElementById('arena'),
      winnerName: document.getElementById('winner-name'),
      finalScoreboard: document.getElementById('final-scoreboard')
    };

    this.state = {
      localPlayerId: null,
      localColor: 'green',
      roomId: '',
      isHost: false,
      players: [],
      entities: [],
      gameState: 'lobby', // lobby, playing, paused, ended
      timeRemaining: 0,
      input: { dx: 0, dy: 0, keys: new Set() }
    };
    
    // Game Rendering
    this.domPool = [];
    this.poolSize = 60;
    this.activeNodes = new Map();
    this.rafId = null;
    this.lastTime = 0;
    this.inputInterval = null;

    // Predictions / Interpolation
    this.localTargetPos = { x: 0, y: 0 };
    this.localCurrentPos = { x: 0, y: 0 };
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateSoundIcon();
    
    // Pre-allocate DOM Pool
    for (let i = 0; i < this.poolSize; i++) {
      const node = document.createElement('div');
      node.className = 'entity hidden';
      node.style.display = 'none';
      this.els.arena.appendChild(node);
      this.domPool.push(node);
    }
  }

  setupEventListeners() {
    this.els.colorBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.els.colorBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.state.localColor = e.target.dataset.color;
      });
    });

    const connectAndJoin = () => {
      const name = this.els.nameInput.value.trim() || 'Camper';
      const room = this.els.roomInput.value.trim() || 'ABCD';
      this.state.roomId = room;
      
      this.ws = new WsClient('wss://dummy.dormdash.game', this.onMessage.bind(this));
      this.ws.connect().then(() => {
        this.ws.joinRoom(room, name, this.state.localColor);
        this.showScreen('lobby');
      });
    };

    this.els.btnCreate.addEventListener('click', connectAndJoin);
    this.els.btnJoin.addEventListener('click', connectAndJoin);
    
    this.els.btnStartGame.addEventListener('click', () => {
      if (this.state.isHost) this.ws.requestStart();
    });

    this.els.btnCloseInvite.addEventListener('click', () => {
      this.els.inviteBar.style.display = 'none';
    });

    this.els.btnCopyLink.addEventListener('click', () => {
      navigator.clipboard.writeText(`dormdash.game/${this.state.roomId}`);
    });

    // Sound toggle
    const toggleSound = () => {
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem('dorm-dash-volume', this.soundEnabled ? '1' : '0');
      this.updateSoundIcon();
    };
    this.els.btnToggleSoundJoin.addEventListener('click', toggleSound);
    this.els.btnToggleSoundGame.addEventListener('click', toggleSound);

    // Menu
    this.els.btnMenu.addEventListener('click', () => {
      this.ws.sendMenuAction('pause');
    });
    this.els.btnResume.addEventListener('click', () => {
      this.ws.sendMenuAction('resume');
      this.els.menuOverlay.classList.add('hidden');
    });
    this.els.btnQuit.addEventListener('click', () => {
      this.ws.sendMenuAction('quit');
    });

    // Keyboard Input
    window.addEventListener('keydown', (e) => {
      this.state.input.keys.add(e.code);
      if (e.code === 'Escape' && this.state.gameState === 'playing') {
        this.ws.sendMenuAction('pause');
      }
    });
    window.addEventListener('keyup', (e) => {
      this.state.input.keys.delete(e.code);
    });

    // Touch Input
    const dpad = document.querySelectorAll('.dpad-btn');
    dpad.forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const dir = e.target.dataset.dir;
        if (dir === 'up') this.state.input.keys.add('ArrowUp');
        if (dir === 'down') this.state.input.keys.add('ArrowDown');
        if (dir === 'left') this.state.input.keys.add('ArrowLeft');
        if (dir === 'right') this.state.input.keys.add('ArrowRight');
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        const dir = e.target.dataset.dir;
        if (dir === 'up') this.state.input.keys.delete('ArrowUp');
        if (dir === 'down') this.state.input.keys.delete('ArrowDown');
        if (dir === 'left') this.state.input.keys.delete('ArrowLeft');
        if (dir === 'right') this.state.input.keys.delete('ArrowRight');
      });
    });

    // End screen
    this.els.btnPlayAgain.addEventListener('click', () => {
      window.location.reload();
    });
    this.els.btnHome.addEventListener('click', () => {
      window.location.reload();
    });
  }

  updateSoundIcon() {
    const onIcon = this.els.btnToggleSoundJoin.querySelector('.icon-sound-on');
    const offIcon = this.els.btnToggleSoundJoin.querySelector('.icon-sound-off');
    if (onIcon && offIcon) {
      if (this.soundEnabled) {
        onIcon.classList.remove('hidden');
        offIcon.classList.add('hidden');
      } else {
        onIcon.classList.add('hidden');
        offIcon.classList.remove('hidden');
      }
    }
  }

  playSound(name) {
    if (this.soundEnabled && this.audio[name]) {
      this.audio[name].currentTime = 0;
      this.audio[name].play().catch(() => {});
    }
  }

  showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.add('hidden'));
    this.screens[name].classList.remove('hidden');
  }

  showBanner(text) {
    this.els.actionBannerText.textContent = text;
    this.els.actionBanner.classList.remove('hidden');
    setTimeout(() => {
      this.els.actionBanner.classList.add('hidden');
    }, 4000);
  }

  onMessage(dataStr) {
    const data = JSON.parse(dataStr);
    
    switch (data.type) {
      case 'room_update':
        this.state.players = data.players;
        this.state.isHost = data.players[0].id === (this.ws.mockServer ? 'p1' : this.state.localPlayerId);
        if (this.ws.mockServer) this.state.localPlayerId = 'p1';
        
        this.els.lobbyRoomCode.textContent = this.state.roomId;
        this.els.lobbyInviteLink.textContent = `dormdash.game/${this.state.roomId}`;
        
        this.els.lobbyPlayers.innerHTML = '';
        data.players.forEach(p => {
          const dot = document.createElement('div');
          dot.className = `player-dot color-${p.color}`;
          this.els.lobbyPlayers.appendChild(dot);
        });
        
        if (this.state.isHost) {
          this.els.btnStartGame.classList.remove('disabled');
        }
        break;

      case 'game_start':
        this.playSound('start');
        this.state.gameState = 'playing';
        this.showScreen('game');
        this.startInputLoop();
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
        break;

      case 'state_delta':
        this.state.timeRemaining = data.time;
        this.updateScoreboard(data.players);
        
        // Timer update
        const mins = Math.floor(data.time / 60);
        const secs = data.time % 60;
        this.els.hudTimer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (data.time <= 10) {
          this.els.hudTimer.classList.add('pulse');
        } else {
          this.els.hudTimer.classList.remove('pulse');
        }

        // Target positions for interpolation
        this.state.players = data.players;
        this.state.entities = data.entities;
        
        const local = data.players.find(p => p.id === this.state.localPlayerId);
        if (local) {
          // Prediction reconciliation
          const dist = Math.hypot(this.localTargetPos.x - local.x, this.localTargetPos.y - local.y);
          if (dist > 6) {
             // Snap or smooth reconcile
             this.localTargetPos.x = local.x;
             this.localTargetPos.y = local.y;
             this.localCurrentPos.x += (local.x - this.localCurrentPos.x) * 0.5;
             this.localCurrentPos.y += (local.y - this.localCurrentPos.y) * 0.5;
          }
        }
        break;

      case 'menu_broadcast':
        this.showBanner(`★ ${data.action.toUpperCase()} by ${data.playerName} ★`);
        if (data.action === 'pause') {
          this.state.gameState = 'paused';
          this.els.menuTitle.textContent = '★ Game Paused ★';
          this.els.menuOverlay.classList.remove('hidden');
        } else if (data.action === 'resume') {
          this.state.gameState = 'playing';
          this.els.menuOverlay.classList.add('hidden');
        }
        break;

      case 'game_end':
        this.state.gameState = 'ended';
        clearInterval(this.inputInterval);
        cancelAnimationFrame(this.rafId);
        this.playSound('win');
        
        this.els.winnerName.textContent = 'Game Over';
        this.els.finalScoreboard.innerHTML = '';
        Object.entries(data.scores).forEach(([id, score]) => {
          const p = this.state.players.find(pl => pl.id === id);
          if (p) {
            const row = document.createElement('div');
            row.className = 'final-row';
            row.innerHTML = `<span>${p.name}</span><span>${score}</span>`;
            this.els.finalScoreboard.appendChild(row);
            if (id === data.winnerId) this.els.winnerName.textContent = `${p.name} Wins!`;
          }
        });
        
        this.showScreen('end');
        break;
    }
  }

  updateScoreboard(players) {
    // Only update if changed (simplified)
    this.els.hudScoreboard.innerHTML = '';
    players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML = `
        <div class="score-swatch color-${p.color}"></div>
        <span>${p.name}</span>
        <span class="score-val" data-id="${p.id}">${p.score}</span>
      `;
      this.els.hudScoreboard.appendChild(row);
    });
  }

  startInputLoop() {
    this.inputInterval = setInterval(() => {
      if (this.state.gameState !== 'playing') return;
      
      let dx = 0, dy = 0;
      if (this.state.input.keys.has('KeyW') || this.state.input.keys.has('ArrowUp')) dy -= 1;
      if (this.state.input.keys.has('KeyS') || this.state.input.keys.has('ArrowDown')) dy += 1;
      if (this.state.input.keys.has('KeyA') || this.state.input.keys.has('ArrowLeft')) dx -= 1;
      if (this.state.input.keys.has('KeyD') || this.state.input.keys.has('ArrowRight')) dx += 1;
      
      // Normalize
      if (dx !== 0 && dy !== 0) {
        const len = Math.sqrt(dx*dx + dy*dy);
        dx /= len; dy /= len;
      }
      
      if (dx !== 0 || dy !== 0) {
        // Client prediction
        this.localTargetPos.x += dx * 8;
        this.localTargetPos.y += dy * 8;
        this.ws.sendInput(dx, dy, false);
      }
    }, 50); // 20Hz
  }

  getNode() {
    if (this.domPool.length > 0) {
      return this.domPool.pop();
    }
    return null; // Pool empty
  }
  
  returnNode(node) {
    node.style.display = 'none';
    node.className = 'entity hidden';
    node.innerHTML = '';
    this.domPool.push(node);
  }

  gameLoop(timestamp) {
    if (this.state.gameState !== 'playing') {
       this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
       return;
    }
    // Budget: ~1ms logic
    
    // 1. Calculate positions
    const renderList = [];
    
    // Local player smooth prediction
    this.localCurrentPos.x += (this.localTargetPos.x - this.localCurrentPos.x) * 0.3;
    this.localCurrentPos.y += (this.localTargetPos.y - this.localCurrentPos.y) * 0.3;

    this.state.players.forEach(p => {
      let x = p.x;
      let y = p.y;
      if (p.id === this.state.localPlayerId) {
         x = this.localCurrentPos.x;
         y = this.localCurrentPos.y;
      }
      
      renderList.push({
        id: 'p_' + p.id,
        type: 'camper',
        color: p.color,
        name: p.name,
        x, y
      });
    });

    this.state.entities.forEach(e => {
      renderList.push({
        id: e.id,
        type: e.type,
        x: e.x, y: e.y
      });
    });

    // 2. DOM Updates (Batched write)
    const currentActiveIds = new Set(renderList.map(item => item.id));
    
    // Return stale nodes
    for (const [id, node] of this.activeNodes.entries()) {
      if (!currentActiveIds.has(id)) {
        this.returnNode(node);
        this.activeNodes.delete(id);
      }
    }

    // Update or assign nodes
    renderList.forEach(item => {
      let node = this.activeNodes.get(item.id);
      if (!node) {
        node = this.getNode();
        if (!node) return; // Dropped if pool empty
        
        node.style.display = 'block';
        node.className = `entity ${item.type}`;
        
        if (item.type === 'camper') {
          node.style.backgroundImage = `url(./assets/sprites/camper-${item.color}.png)`;
          node.innerHTML = `<div class="player-name-tag">${item.name}</div>`;
        } else if (item.type === 'ember') {
          node.style.backgroundImage = `url(./assets/sprites/ember.png)`;
        } else if (item.type === 'cloud') {
          node.style.backgroundImage = `url(./assets/sprites/cloud.png)`;
        }
        this.activeNodes.set(item.id, node);
      }

      // Calculate direction for camper
      if (item.type === 'camper') {
         node.classList.add('walking');
      }

      node.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
    });

    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }
}

window.onload = () => {
  window.app = new GameApp();
};
