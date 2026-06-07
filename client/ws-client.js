class WsClient {
  constructor(url, onMessageCallback) {
    this.url = url;
    this.onMessageCallback = onMessageCallback;
    this.ws = null;
    this.intentionalClose = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => resolve();
        this.ws.onmessage = (e) => this.onMessageCallback(e.data);
        this.ws.onerror = (err) => reject(err);
        this.ws.onclose = () => {
          console.log('WebSocket closed');
          if (!this.intentionalClose) {
            const banner = document.getElementById('offline-banner');
            if (banner) banner.classList.remove('hidden');
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.ws) this.ws.close();
  }

  joinRoom(roomId, playerName, color, intent) {
    this.send({ type: 'join_room', roomId, playerName, color, intent });
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
