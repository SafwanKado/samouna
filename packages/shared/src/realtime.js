// Auto-reconnecting WebSocket client.
//
// Mobile networks drop sockets constantly, so every (re)connect fires
// `onReconnect`, which callers use to refetch state they may have missed.

export function connectRealtime({ url, getToken, onEvent, onStatus, onReconnect }) {
  let ws;
  let attempt = 0;
  let closed = false;
  let timer;
  let everConnected = false;

  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      attempt = 0;
      const token = getToken?.();
      ws.send(JSON.stringify({ type: 'auth', token: token || null }));
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        onStatus?.('online');
        if (everConnected) onReconnect?.();
        everConnected = true;
        return;
      }
      onEvent?.(msg);
    };
    ws.onclose = () => {
      onStatus?.('offline');
      if (closed) return;
      const delay = Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 500;
      timer = setTimeout(open, delay);
    };
    ws.onerror = () => ws.close();
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible' && ws?.readyState === WebSocket.CLOSED) {
      clearTimeout(timer);
      attempt = 0;
      open();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  open();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      ws?.close();
    },
    /** Re-authenticate (e.g. after login) by reconnecting. */
    reset() {
      ws?.close();
    },
  };
}
