import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import { bus } from './events.js';

/**
 * Channels:
 *   public           - everyone: stock toggles, shop open/closed
 *   store:<id>       - bakery staff devices of one store
 *   customer:<id>    - one customer's devices (their order updates)
 *
 * Clients authenticate with a first message {type:"auth", token} rather than
 * a query string, so tokens don't end up in proxy access logs.
 */
export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const channels = new Map();

  const join = (ws, ch) => {
    if (!channels.has(ch)) channels.set(ch, new Set());
    channels.get(ch).add(ws);
    ws.channels.add(ch);
  };

  wss.on('connection', (ws) => {
    ws.channels = new Set();
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const authTimeout = setTimeout(() => ws.close(4001, 'auth timeout'), 10_000);

    ws.once('message', (raw) => {
      clearTimeout(authTimeout);
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return ws.close(4000, 'bad message');
      }
      join(ws, 'public');
      if (msg?.type === 'auth' && msg.token) {
        try {
          const user = verifyToken(msg.token);
          if (user.app === 'bakery' && user.storeId) join(ws, `store:${user.storeId}`);
          if (user.app === 'customer') join(ws, `customer:${user.id}`);
        } catch {
          /* expired token: public channel only */
        }
      }
      ws.send(JSON.stringify({ type: 'ready', channels: [...ws.channels] }));
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      for (const ch of ws.channels) {
        const set = channels.get(ch);
        set?.delete(ws);
        if (set && !set.size) channels.delete(ch);
      }
    });
  });

  const onPublish = ({ channel, event }) => {
    const set = channels.get(channel);
    if (!set) return;
    const data = JSON.stringify(event);
    for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(data);
  };
  bus.on('publish', onPublish);

  // Drop dead connections (phones that went to sleep without closing).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  return {
    wss,
    close() {
      clearInterval(heartbeat);
      bus.off('publish', onPublish);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
