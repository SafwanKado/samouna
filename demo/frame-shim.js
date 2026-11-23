// Runs first inside each app frame: routes fetch/WebSocket to the parent's
// simulated backend and gives the frame its own in-memory storage.
(function () {
  const server = window.parent.__samounaMock;

  window.fetch = async (url, opts = {}) => {
    const r = await server.handle(String(url), opts);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  class DemoSocket {
    constructor() {
      this.readyState = 0;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 30);
    }
    send(raw) {
      const msg = JSON.parse(raw);
      if (msg.type !== 'auth' || this.conn) return;
      this.conn = server.connect(msg.token, (ev) => {
        if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(ev) });
      });
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (this.conn) this.conn.close();
      setTimeout(() => this.onclose && this.onclose({}), 0);
    }
  }
  Object.assign(DemoSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = DemoSocket;

  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }); } catch { /* keep real one */ }

  // The preview host blocks confirm() dialogs; treat them as "yes".
  window.confirm = () => true;
  try { Object.defineProperty(navigator, 'serviceWorker', { value: { register: () => Promise.resolve() }, configurable: true }); } catch { /* ignore */ }
})();

// Inside an embedded srcdoc frame, "#/store/1" links would resolve against the
// outer page's URL. Keep in-app hash navigation inside the frame.
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  window.location.hash = a.getAttribute('href').slice(1);
}, true);
