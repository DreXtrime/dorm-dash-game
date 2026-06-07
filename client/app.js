class GameApp {
  constructor() {
    this.ws = null;
    this.screens = {
      join: document.getElementById('screen-join'),
      lobby: document.getElementById('screen-lobby'),
      game: document.getElementById('screen-game'),
      end: document.getElementById('screen-end')
    };
    this.sound = new SoundEngine();
    this.soundEnabled = localStorage.getItem('dorm-dash-volume') !== '0';
    this.soundEnabled = localStorage.getItem('dorm-dash-volume') !== '0';
    
    // UI Elements
    this.els = {
      nameInput: document.getElementById('input-name'),
      roomInput: document.getElementById('input-room'),
      colorBtns: document.querySelectorAll('.avatar-btn'),
      btnCreate: document.getElementById('btn-create-room'),
      btnJoin: document.getElementById('btn-join-room'),
      btnCopyLink: document.getElementById('btn-copy-link'),
      btnStartGame: document.getElementById('btn-start-game'),
      btnLeaveLobby: document.getElementById('btn-leave-lobby'),
      btnMenu: document.getElementById('btn-menu'),
      btnResume: document.getElementById('btn-resume'),
      btnQuit: document.getElementById('btn-quit'),
      btnToggleSoundJoin: document.getElementById('btn-toggle-sound-join'),
      btnToggleSoundGame: document.getElementById('btn-toggle-sound-game'),
      btnPlayAgain: document.getElementById('btn-play-again'),
      btnHome: document.getElementById('btn-home'),
      lobbyPlayers: document.getElementById('lobby-players'),
      lobbyRoomCode: document.getElementById('lobby-room-code'),
      selectRoundTime: document.getElementById('lobby-setting-timer'),
      selectMaxPlayers: document.getElementById('lobby-setting-players'),
      hudScoreboard: document.getElementById('hud-scoreboard'),
      hudTimer: document.getElementById('hud-timer'),
      actionBanner: document.getElementById('action-banner'),
      actionBannerText: document.getElementById('action-banner-text'),
      menuOverlay: document.getElementById('menu-overlay'),
      menuTitle: document.getElementById('menu-title'),
      arena: document.getElementById('arena'),
      winnerName: document.getElementById('winner-name'),
      finalScoreboard: document.getElementById('final-scoreboard'),
      offlineBanner: document.getElementById('offline-banner'),
      soundIconText: document.querySelector('.sound-icon-text'),
      confettiContainer: document.getElementById('confetti-container')
    };

    this.state = {
      localPlayerId: null,
      localColor: 'green',
      roomId: '',
      isHost: false,
      players: [],
      entities: [],
      gameState: 'lobby',
      timeRemaining: 0,
      input: { dx: 0, dy: 0, keys: new Set() }
    };
    
    this.domPool = [];
    this.poolSize = 60;
    this.activeNodes = new Map();
    this.rafId = null;
    this.lastTime = 0;
    this.inputInterval = null;

    this.localTargetPos = { x: 0, y: 0 };
    this.localCurrentPos = { x: 0, y: 0 };
    this.playerColors = { green: '#4CAF50', red: '#F44336', blue: '#2196F3', yellow: '#FFC107' };
    
    this.init();
  }

  init() {
    // Hide offline banner if mock mode is used
    if (WsClient.isMockMode) {
      this.els.offlineBanner.style.display = 'none';
    }

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
    this.resizeArena();
    window.addEventListener('resize', () => this.resizeArena());
  }

  setupEventListeners() {
    this.els.colorBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.els.colorBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.state.localColor = e.currentTarget.dataset.color;
      });
    });

    this.connectAndJoin = (intent) => {
      const name = this.els.nameInput.value.trim() || 'Camper';
      let room = this.els.roomInput.value.trim().toUpperCase();

      if (intent === 'join' && !room) {
        this.showBanner('Please enter a room code to join.');
        return;
      }
      if (intent === 'create') {
        room = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.els.roomInput.value = room;
      }

      this.state.roomId = room;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      this.ws = new WsClient(wsUrl, this.onMessage.bind(this));
      this.ws.connect().then(() => {
        this.ws.joinRoom(room, name, this.state.localColor, intent);
      }).catch(() => {
        this.showBanner('Failed to connect to the server.');
      });
    };

    this.els.btnCreate.addEventListener('click', () => this.connectAndJoin('create'));
    this.els.btnJoin.addEventListener('click', () => this.connectAndJoin('join'));
    
    this.els.btnStartGame.addEventListener('click', () => {
      if (this.state.isHost) this.ws.requestStart();
    });

    this.els.btnLeaveLobby.addEventListener('click', () => {
      if (this.ws) this.ws.disconnect();
      this.showScreen('join');
    });

    // Settings
    const lobbyTimer = document.getElementById('lobby-setting-timer');
    if (lobbyTimer) lobbyTimer.addEventListener('change', (e) => {
      if (this.state.isHost) this.ws.send({ type: 'update_settings', settings: { roundTime: parseInt(e.target.value) } });
    });
    
    const lobbyPlayers = document.getElementById('lobby-setting-players');
    if (lobbyPlayers) lobbyPlayers.addEventListener('change', (e) => {
      if (this.state.isHost) this.ws.send({ type: 'update_settings', settings: { maxPlayers: parseInt(e.target.value) } });
    });

    // Lobby Customization
    const lobbyName = document.getElementById('lobby-input-name');
    if (lobbyName) lobbyName.addEventListener('change', (e) => {
      this.ws.send({ type: 'update_player', name: e.target.value });
    });
    
    document.querySelectorAll('.l-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.l-color-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.ws.send({ type: 'update_player', color: e.currentTarget.dataset.color });
      });
    });

    this.els.btnCopyLink.addEventListener('click', () => {
      navigator.clipboard.writeText(this.state.roomId);
      this.showBanner('Room code copied!', 'info');
    });

    const toggleSound = () => {
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem('dorm-dash-volume', this.soundEnabled ? '1' : '0');
      this.updateSoundIcon();
    };
    this.els.btnToggleSoundJoin.addEventListener('click', toggleSound);
    this.els.btnToggleSoundGame.addEventListener('click', toggleSound);

    this.els.btnMenu.addEventListener('click', () => this.ws.sendMenuAction('pause'));
    this.els.btnResume.addEventListener('click', () => {
      this.ws.sendMenuAction('resume');
      this.els.menuOverlay.classList.add('hidden');
    });
    this.els.btnQuit.addEventListener('click', () => {
      if (this.ws) {
        this.ws.sendMenuAction('quit');
        this.ws.disconnect();
      }
      this.els.menuOverlay.classList.add('hidden');
      this.showScreen('join');
    });

    window.addEventListener('keydown', (e) => {
      this.state.input.keys.add(e.code);
      if (e.code === 'Escape' && this.state.gameState === 'playing') {
        this.ws.sendMenuAction('pause');
      }
    });
    window.addEventListener('keyup', (e) => this.state.input.keys.delete(e.code));

    const dpad = document.querySelectorAll('.dpad-btn');
    dpad.forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const dir = e.currentTarget.dataset.dir;
        if (dir === 'up') this.state.input.keys.add('ArrowUp');
        if (dir === 'down') this.state.input.keys.add('ArrowDown');
        if (dir === 'left') this.state.input.keys.add('ArrowLeft');
        if (dir === 'right') this.state.input.keys.add('ArrowRight');
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        const dir = e.currentTarget.dataset.dir;
        if (dir === 'up') this.state.input.keys.delete('ArrowUp');
        if (dir === 'down') this.state.input.keys.delete('ArrowDown');
        if (dir === 'left') this.state.input.keys.delete('ArrowLeft');
        if (dir === 'right') this.state.input.keys.delete('ArrowRight');
      });
    });

    // Wait/Play Again Flow
    this.els.btnPlayAgain.addEventListener('click', () => {
      this.els.btnPlayAgain.blur();
      
      // FIX: Force browser to clear the stuck `:active` CSS state by momentarily removing it from the render tree.
      this.els.btnPlayAgain.style.display = 'none';
      setTimeout(() => this.els.btnPlayAgain.style.display = '', 50);
      
      if (this.state.isHost) {
        this.ws.send({ type: 'play_again' });
      } else {
        this.ws.send({ type: 'wait_next' });
        this.els.btnPlayAgain.classList.add('hidden');
        document.getElementById('wait-host-msg').classList.remove('hidden');
      }
    });

    this.els.btnHome.addEventListener('click', () => {
      if (this.ws) this.ws.disconnect();
      this.showScreen('join');
    });
  }

  updateSoundIcon() {
    document.querySelectorAll('.sound-icon-text').forEach(el => {
      el.textContent = this.soundEnabled ? '🔊' : '🔇';
    });
  }

  playSound(name) {
    if (this.soundEnabled) {
      this.sound.play(name);
    }
  }

  showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.add('hidden'));
    this.screens[name].classList.remove('hidden');
    if (name !== 'end') this.els.confettiContainer.innerHTML = '';
  }

  startCountdown(callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      z-index: 55; pointer-events: none;
    `;
    document.getElementById('screen-game').appendChild(overlay);
  
    let count = 3;
    const tick = () => {
      overlay.innerHTML = `
        <div style="
          font-family: 'Fredoka One', cursive;
          font-size: 12rem;
          color: white;
          text-shadow: 0 0 40px rgba(255,200,0,0.8), 4px 4px 0 #5D2E0C;
          animation: winner-bounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">${count > 0 ? count : 'GO!'}</div>
      `;
      if (count === 0) {
        setTimeout(() => {
          overlay.remove();
          callback();
        }, 600);
      } else {
        count--;
        setTimeout(tick, 900);
      }
    };
    tick();
  }

  showBanner(text, type='error') {
    // TOAST NOTIFICATION: Creates a new element dynamically, animates it in, and removes it after 4s
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = text;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toast-fade 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  spawnConfetti() {
    this.els.confettiContainer.innerHTML = '';
    const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B'];
    const shapes = ['50%', '0%', '2px']; // circle, square, slight round rect
    for (let i = 0; i < 35; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      c.style.borderRadius = shapes[Math.floor(Math.random() * shapes.length)];
      c.style.width = Math.random() > 0.5 ? '12px' : '8px';
      c.style.height = Math.random() > 0.5 ? '12px' : '8px';
      if (Math.random() > 0.7) c.style.width = '16px'; // rectangle
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDuration = (2 + Math.random() * 3) + 's';
      c.style.animationDelay = (Math.random() * 1.5) + 's';
      this.els.confettiContainer.appendChild(c);
    }
  }

  onMessage(dataStr) {
    const data = JSON.parse(dataStr);
    switch (data.type) {
      case 'join_error':
        this.showBanner(data.message, 'error');
        if (this.ws) this.ws.disconnect();
        this.showScreen('join');
        break;

      case 'error':
        this.showBanner(data.message, 'error');
        break;

      case 'room_recreated':
        this.showScreen('lobby');
        break;

      case 'joined_room':
        this.state.localPlayerId = data.id;
        this.showScreen('lobby');
        break;

      case 'room_update':
        this.state.players = data.players;
        const myPlayer = data.players.find(p => p.id === this.state.localPlayerId);
        
        const lobbyName = document.getElementById('lobby-input-name');
        if (lobbyName && myPlayer) lobbyName.value = myPlayer.name;
        
        if (myPlayer) {
          document.querySelectorAll('.l-color-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.color === myPlayer.color);
          });
        }

        this.state.isHost = data.players[0].id === (this.ws.mockServer ? 'p1' : this.state.localPlayerId);
        if (this.ws.mockServer) this.state.localPlayerId = 'p1';

        if (this.state.isHost) {
          document.getElementById('lobby-host-settings').classList.remove('hidden');
          document.getElementById('btn-start-game').classList.remove('disabled');
          document.getElementById('lobby-waiting-msg').classList.add('hidden');
        } else {
          document.getElementById('lobby-host-settings').classList.add('hidden');
          document.getElementById('btn-start-game').classList.add('disabled');
          document.getElementById('lobby-waiting-msg').classList.remove('hidden');
        }

        this.els.lobbyRoomCode.textContent = this.state.roomId;
        this.els.lobbyPlayers.innerHTML = '';
        data.players.forEach(p => {
          const dot = document.createElement('div');
          dot.className = `p-dot-mini`;
          dot.style.backgroundColor = this.playerColors[p.color] || this.playerColors.green;
          this.els.lobbyPlayers.appendChild(dot);
        });

        if (data.settings) {
          if (data.settings.roundTime) this.els.selectRoundTime.value = data.settings.roundTime;
          if (data.settings.maxPlayers) this.els.selectMaxPlayers.value = data.settings.maxPlayers;
        }
        break;

      case 'game_start':
        this.playSound('start');
        this.state.gameState = 'paused'; 
        this.showScreen('game');
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame((t) => this.gameLoop(t));  
        this.startCountdown(() => {
        this.state.gameState = 'playing';
        this.startInputLoop();  
      });
      break;

      case 'state_delta':
        const oldPlayers = new Map(this.state.players.map(p => [p.id, p]));
        data.players.forEach(newP => {
          const oldP = oldPlayers.get(newP.id);
          if (oldP) {
            newP.name = oldP.name;
            newP.color = oldP.color;
            if (!Number.isNaN(oldP.displayX)) newP.displayX = oldP.displayX;
            if (!Number.isNaN(oldP.displayY)) newP.displayY = oldP.displayY;
            if (newP.id === this.state.localPlayerId) {
              if (newP.score > oldP.score) this.playSound('pickup');
              if (newP.score < oldP.score) this.playSound('cloud_hit');
            }
          }
          if (newP.displayX === undefined) newP.displayX = newP.x;
          if (newP.displayY === undefined) newP.displayY = newP.y;
        });

        const oldEntities = new Map(this.state.entities.map(e => [e.id, e]));
        data.entities.forEach(newE => {
          const oldE = oldEntities.get(newE.id);
          if (oldE) {
            newE.displayX = oldE.displayX;
            newE.displayY = oldE.displayY;
          } else {
            newE.displayX = newE.x;
            newE.displayY = newE.y;
          }
        });

        this.state.timeRemaining = data.time;
        this.updateScoreboard(data.players);
        
        const mins = Math.floor(data.time / 60);
        const secs = Math.floor(data.time % 60);
        this.els.hudTimer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (data.time <= 10) this.els.hudTimer.classList.add('pulse');
        else this.els.hudTimer.classList.remove('pulse');

        this.state.players = data.players;
        this.state.entities = data.entities;
        
        const local = data.players.find(p => p.id === this.state.localPlayerId);
        if (local) {
          // MULTIPLE POWERUPS UI: Turn off all slots, then turn on the ones currently active
          document.querySelectorAll('.hud-slot').forEach(s => s.classList.remove('active'));
          if (local.activePowerups) {
            local.activePowerups.forEach(pow => {
              const slot = document.getElementById(`slot-${pow}`);
              if (slot) slot.classList.add('active');
            });
          }
        }
        break;

      case 'powerup_pickup':
        // AUDIO EVENT: Independent event fired by server specifically for the picker-upper
        this.playSound('powerup');
        break;

      case 'menu_broadcast':
        this.showBanner(`[ ${data.action.toUpperCase()} by ${data.playerName} ]`);
        if (data.action === 'pause') {
          this.state.gameState = 'paused';
          this.els.menuTitle.textContent = 'Game Paused';
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
        const finalSb = document.getElementById('end-scoreboard');
        if (finalSb) finalSb.innerHTML = '';
        Object.entries(data.scores).forEach(([id, score]) => {
          const p = this.state.players.find(pl => pl.id === id);
          if (p && finalSb) {
            const row = document.createElement('div');
            row.className = 'final-row';
            row.innerHTML = `<span>${p.name}</span><span>${score}</span>`;
            finalSb.appendChild(row);
            if (id === data.winnerId) this.els.winnerName.textContent = `${p.name} Wins!`;
          }
        });
        this.showScreen('end');
        this.spawnConfetti();
        
        // Reset the Play Again button state for the next round
        this.els.btnPlayAgain.classList.remove('hidden');
        const waitMsg = document.getElementById('wait-host-msg');
        if (waitMsg) waitMsg.classList.add('hidden');
        
        break;
    }
  }

  updateScoreboard(players) {
    players.forEach(p => {
      let row = this.els.hudScoreboard.querySelector(`.score-row[data-pid="${p.id}"]`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'score-row';
        row.dataset.pid = p.id;
        row.innerHTML = `<div class="score-swatch" style="background-color: ${this.playerColors[p.color]||'#fff'}"></div><span class="score-name">${p.name}</span><span class="score-val" data-id="${p.id}">${p.score}</span>`;
        this.els.hudScoreboard.appendChild(row);
      } else {
        const span = row.querySelector('.score-val');
        if (span.textContent !== p.score.toString()) {
          const isUp = p.score > parseInt(span.textContent);
          span.textContent = p.score;
          span.classList.remove('bump-up', 'bump-dn');
          void span.offsetWidth; // trigger reflow
          span.classList.add(isUp ? 'bump-up' : 'bump-dn');
        }
      }
    });
    
    // Remove stale rows
    const currentIds = new Set(players.map(p => p.id));
    Array.from(this.els.hudScoreboard.children).forEach(row => {
      if (!currentIds.has(row.dataset.pid)) {
        row.remove();
      }
    });
  }

  startInputLoop() {
    let lastDx = null, lastDy = null;
    this.inputInterval = setInterval(() => {
      if (this.state.gameState !== 'playing') return;
      let dx = 0, dy = 0;
      if (this.state.input.keys.has('KeyW') || this.state.input.keys.has('ArrowUp')) dy -= 1;
      if (this.state.input.keys.has('KeyS') || this.state.input.keys.has('ArrowDown')) dy += 1;
      if (this.state.input.keys.has('KeyA') || this.state.input.keys.has('ArrowLeft')) dx -= 1;
      if (this.state.input.keys.has('KeyD') || this.state.input.keys.has('ArrowRight')) dx += 1;
      
      if (dx !== 0 && dy !== 0) {
        const len = Math.sqrt(dx*dx + dy*dy); dx /= len; dy /= len;
      }
      
      if (dx !== lastDx || dy !== lastDy) {
        this.ws.sendInput(dx, dy, false);
        lastDx = dx; lastDy = dy;
      }
    }, 50);
  }

  getNode() { return this.domPool.length > 0 ? this.domPool.pop() : null; }
  
  returnNode(node) {
    node.style.display = 'none';
    node.className = 'entity hidden';
    node.innerHTML = '';
    this.domPool.push(node);
  }

  resizeArena() {
    const scaleX = window.innerWidth / 1200;
    const scaleY = window.innerHeight / 700;
    const scale = Math.min(scaleX, scaleY);
    const wrapper = document.querySelector('.arena-wrapper');
    if (wrapper) wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  buildCamperDOM(node, color, name) {
    const hex = this.playerColors[color] || this.playerColors.green;
    const dkHex = this.getDarkColor(color);
    node.innerHTML = `
      <div class="player-label">${name}</div>
      <div class="camper">
        <div class="shadow"></div>
        <div class="helmet" style="background:${hex}"></div>
        <div class="head">
          <div class="eyes"></div>
          <div class="mouth"></div>
          <div class="ear-left"></div>
          <div class="ear-right"></div>
        </div>
        <div class="body" style="background:${dkHex}"></div>
        <div class="arm-left" style="background:${dkHex}"><div class="hand-left"></div></div>
        <div class="arm-right" style="background:${dkHex}"><div class="hand-right"></div></div>
        <div class="leg-left"><div class="boot-left"></div></div>
        <div class="leg-right"><div class="boot-right"></div></div>
      </div>
    `;
  }

  getDarkColor(color) {
    const darks = { green: '#388E3C', red: '#C62828', blue: '#1565C0', yellow: '#F57F17' };
    return darks[color] || darks.green;
  }

  buildEmberDOM(node) {
    node.innerHTML = `<div class="ember-root"><div class="ember-glow"></div></div>`;
  }

  buildCloudDOM(node) {
    node.innerHTML = `
      <div class="cloud-root">
        <div class="c-puff-c"></div>
        <div class="c-puff-l"></div>
        <div class="c-puff-r"></div>
        <div class="c-base"></div>
        <div class="c-rain cr1"></div>
        <div class="c-rain cr2"></div>
        <div class="c-rain cr3"></div>
        <div class="c-rain cr4"></div>
      </div>
    `;
  }

  buildPowerupDOM(node, type) {
    if (type === 'powerup-bolt') {
      node.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="#FFD700" style="transform:translate(-50%, -50%); filter: drop-shadow(0 0 8px #FFD700);"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`;
    } else if (type === 'powerup-shield') {
      node.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="#90CAF9" style="transform:translate(-50%, -50%); filter: drop-shadow(0 0 8px #90CAF9);"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`;
    } else if (type === 'powerup-magnet') {
      node.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="#CFD8DC" style="transform:translate(-50%, -50%); filter: drop-shadow(0 0 8px #CFD8DC);"><path d="M12 2C8.13 2 5 5.13 5 9v6h4V9c0-1.66 1.34-3 3-3s3 1.34 3 3v6h4V9c0-3.87-3.13-7-7-7z"/></svg>`;
    }
  }

  gameLoop(timestamp) {
    if (this.state.gameState !== 'playing') {
       this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
       return;
    }

    const renderList = [];

    this.state.players.forEach(p => {
      if (p.x === undefined || p.y === undefined) return;
      
      if (p.displayX === undefined || Number.isNaN(p.displayX)) p.displayX = p.x;
      if (p.displayY === undefined || Number.isNaN(p.displayY)) p.displayY = p.y;
      
      if (Math.abs(p.x - p.displayX) > 150 || Math.abs(p.y - p.displayY) > 150) {
        p.displayX = p.x;
        p.displayY = p.y;
      } else {
        p.displayX += (p.x - p.displayX) * 0.25;
        p.displayY += (p.y - p.displayY) * 0.25;
      }
      
      let x = p.displayX;
      let y = p.displayY;
      let isMoving = p.isMoving;
      let dx = p.dx || 0;
      
      renderList.push({ id: 'p_' + p.id, type: 'camper', color: p.color, name: p.name, x, y, isMoving, dx });
    });

    this.state.entities.forEach(e => {
      if (e.displayX === undefined) e.displayX = e.x;
      if (e.displayY === undefined) e.displayY = e.y;
      
      if (Math.abs(e.x - e.displayX) > 150 || Math.abs(e.y - e.displayY) > 150) {
        e.displayX = e.x;
        e.displayY = e.y;
      } else {
        e.displayX += (e.x - e.displayX) * 0.25;
        e.displayY += (e.y - e.displayY) * 0.25;
      }
      
      renderList.push({ id: e.id, type: e.type, x: e.displayX, y: e.displayY });
    });

    const currentActiveIds = new Set(renderList.map(item => item.id));
    for (const [id, node] of this.activeNodes.entries()) {
      if (!currentActiveIds.has(id)) {
        this.returnNode(node);
        this.activeNodes.delete(id);
      }
    }

    renderList.forEach(item => {
      let node = this.activeNodes.get(item.id);
      if (!node) {
        node = this.getNode();
        if (!node) return;
        node.style.display = 'block';
        node.className = `entity ${item.type}`;
        if (item.type === 'camper') this.buildCamperDOM(node, item.color, item.name);
        else if (item.type === 'ember') this.buildEmberDOM(node);
        else if (item.type === 'cloud') this.buildCloudDOM(node);
        else if (item.type.startsWith('powerup-')) this.buildPowerupDOM(node, item.type);
        this.activeNodes.set(item.id, node);
      }

      if (item.type === 'camper') {
        const camperInner = node.querySelector('.camper');
        if (camperInner) {
          camperInner.classList.toggle('walking', item.isMoving);
          if (item.dx < 0) camperInner.dataset.facing = 'left';
          else if (item.dx > 0) camperInner.dataset.facing = 'right';
          const facingLeft = camperInner.dataset.facing === 'left';
          camperInner.style.transform = facingLeft ? 'scaleX(-1)' : '';
        }
      }
      node.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
    });

    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }
}

class SoundEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  play(type) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    if (type === 'start') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(554, t + 0.1);
      osc.frequency.setValueAtTime(659, t + 0.2);
      osc.frequency.setValueAtTime(880, t + 0.3);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    } else if (type === 'pickup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    } else if (type === 'powerup') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(880, t + 0.2);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } else if (type === 'cloud_hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } else if (type === 'win') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(523, t);
      osc.frequency.setValueAtTime(659, t + 0.15);
      osc.frequency.setValueAtTime(784, t + 0.3);
      osc.frequency.setValueAtTime(1046, t + 0.45);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 1);
      osc.start(t);
      osc.stop(t + 1);
    }
  }
}

window.onload = () => { window.app = new GameApp(); };
