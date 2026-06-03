class WsClient {
  constructor(url, onMessageCallback) {
    this.url = url;
    this.onMessageCallback = onMessageCallback;
    this.ws = null;
    this.mockServer = null;
    this.useMock = true;
  }

  connect() {
    if (this.useMock) {
      console.log('Using Mock WebSocket Server');
      this.mockServer = new WsMockServer(this.onMessageCallback);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => resolve();
        this.ws.onmessage = (e) => this.onMessageCallback(e.data);
        this.ws.onerror = (err) => reject(err);
        this.ws.onclose = () => {
          console.log('WebSocket closed');
          document.getElementById('offline-banner').classList.remove('hidden');
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  send(data) {
    const payload = JSON.stringify(data);
    if (this.useMock) {
      this.mockServer.send(payload);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    }
  }
  
  joinRoom(roomId, playerName, color) {
    this.send({ type: 'join_room', roomId, playerName, color });
  }
  
  requestStart() {
    this.send({ type: 'request_start' });
  }
  
  sendInput(dx, dy, powerup) {
    this.send({ type: 'input', dx, dy, powerup });
  }
  
  sendMenuAction(action) {
    this.send({ type: 'menu_action', action });
  }
}
