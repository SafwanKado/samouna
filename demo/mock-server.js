// In-browser stand-in for the Samouna API, used only by the preview page.
// Mirrors the real server's rules: phone normalization, OTP limits,
// 5-minute cancel window, single-step pipeline, store isolation, live events.
(function () {
  const CANCEL_MS = 5 * 60 * 1000;
  const NEXT = { pending: 'in_oven', in_oven: 'ready', ready: 'out_for_delivery', out_for_delivery: 'completed' };
  const STAMP = { in_oven: 'acceptedAt', ready: 'readyAt', out_for_delivery: 'outForDeliveryAt', completed: 'completedAt' };
  const ACTIVE = ['pending', 'in_oven', 'ready', 'out_for_delivery'];

  function normalize(input) {
    if (input == null) return null;
    let s = String(input).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660)
      .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0)
      .trim().replace(/[\s\-().‎‏]/g, '');
    if (s.startsWith('+')) s = s.slice(1); else if (s.startsWith('00')) s = s.slice(2);
    if (!/^\d+$/.test(s)) return null;
    if (s.startsWith('964')) s = s.slice(3);
    if (s.startsWith('0')) s = s.slice(1);
    return /^7\d{9}$/.test(s) ? `964${s}` : null;
  }

  const BAKERIES = [
    { owner: 'Sample Owner One', phone: '+9647500000001', name: 'Furn Al-Noor', address: 'Sharya main street, near the roundabout', city: 'sharya', fee: 1000, open: true,
      products: [['سەموونا تەنوورێ', 'صمون حجري', 'Stone-oven Samoun', 250], ['نانێ تیری', 'خبز تنور', 'Tandoor bread', 500],
        ['کولێرە', 'كليچة بالتمر', 'Date Klecha', 1500], ['کێکا تەڕ', 'كيك إسفنجي', 'Sponge cake', 3000], ['پیزایا بچووک', 'بيتزا صغيرة', 'Mini pizza', 1000]] },
    { owner: 'Sample Owner Two', phone: '+9647500000002', name: 'Sharya Golden Bakery', address: 'Market street, opposite the pharmacy', city: 'sharya', fee: 0, open: true,
      products: [['سەموون', 'صمون', 'Samoun', 250], ['کرواسۆن', 'كرواسون', 'Croissant', 750], ['کاهی', 'كاهي', 'Kahi pastry', 1000]] },
    { owner: 'Sample Owner Three', phone: '+9647500000003', name: 'Sharya Fresh Bread', address: 'Sharya centre, next to the market', city: 'sharya', fee: 500, open: true,
      products: [['سەموون', 'صمون', 'Samoun', 250], ['نانێ تیری', 'خبز تنور', 'Tandoor bread', 500]] },
  ];

  let db, seq, conns;
  function reset() {
    db = { users: [], stores: [], products: [], orders: [], tx: [], otps: [] };
    seq = { user: 1, store: 1, product: 1, order: 1 };
    conns = new Set();
    for (const b of BAKERIES) {
      const u = { id: seq.user++, fullName: b.owner, phone: b.phone, role: 'bakery_owner', preferredLanguage: 'ku' };
      const s = { id: seq.store++, ownerId: u.id, name: b.name, address: b.address, city: b.city, deliveryFee: b.fee, isActive: b.open };
      db.users.push(u); db.stores.push(s);
      for (const [ku, ar, en, price] of b.products) db.products.push({ id: seq.product++, storeId: s.id, name: { ku, ar, en }, price, imageUrl: null, isAvailable: true });
    }
  }
  reset();

  class Fail { constructor(status, code, details) { Object.assign(this, { status, code, details }); } }
  const fail = (status, code, details) => { throw new Fail(status, code, details); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const storeJson = (s) => ({ ...s, ownerId: undefined });
  const product = (id) => db.products.find((p) => p.id === id);
  function orderJson(o) {
    return clone({
      ...o, storeName: db.stores.find((s) => s.id === o.storeId).name,
      cancellableUntil: new Date(new Date(o.createdAt).getTime() + CANCEL_MS).toISOString(),
      items: o.items.map((i) => ({ ...i, name: product(i.productId).name })),
    });
  }
  function publish(channel, event) {
    for (const c of conns) if (c.channels.has(channel)) setTimeout(() => c.send(clone(event)), 30);
  }
  const notifyOrder = (o) => {
    const j = orderJson(o);
    publish(`store:${o.storeId}`, { type: 'order.updated', order: j });
    publish(`customer:${o.customerId}`, { type: 'order.updated', order: j });
    return j;
  };

  function auth(headers, app) {
    const m = /^Bearer demo\.(customer|bakery)\.(\d+)$/.exec(headers.Authorization || '');
    if (!m || (app && m[1] !== app)) fail(401, 'unauthorized');
    const user = db.users.find((u) => u.id === Number(m[2]));
    if (!user) fail(401, 'unauthorized');
    if (app === 'bakery') {
      const store = db.stores.find((s) => s.ownerId === user.id);
      if (!store) fail(403, 'not_bakery');
      return { user, store };
    }
    return { user };
  }

  function parseEmail(input) {
    const e = String(input ?? '').trim().toLowerCase();
    if (!e) return null;
    if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) fail(400, 'invalid_email');
    return e;
  }

  function requestOtp(meta) {
    const hourAgo = Date.now() - 3600e3;
    const recent = db.otps.filter((o) => o.phone === meta && o.createdAt > hourAgo);
    if (recent.length >= 3) fail(429, 'otp_rate_limited', { minutes: Math.ceil((recent[0].createdAt + 3600e3 - Date.now()) / 60000) });
    db.otps.forEach((o) => { if (o.phone === meta) o.used = true; });
    const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    db.otps.push({ phone: meta, code, createdAt: Date.now(), attempts: 0, used: false });
    return { sent: true, phone: `+${meta}`, expiresIn: 300, devCode: code };
  }
  function verifyOtp(meta, code) {
    const o = [...db.otps].reverse().find((x) => x.phone === meta && !x.used);
    if (!o || Date.now() - o.createdAt > 300e3) fail(400, 'otp_expired');
    if (o.attempts >= 5) fail(400, 'otp_locked');
    if (o.code !== String(code)) { o.attempts++; fail(400, o.attempts >= 5 ? 'otp_locked' : 'otp_invalid'); }
    o.used = true;
  }

  function route(method, path, query, body, headers) {
    const seg = path.split('/').filter(Boolean); // ['api', ...]
    const [, a, b, c, d] = seg;
    const key = `${method} /${[a, b && (/^\d+$/.test(b) ? ':id' : b), c && (/^\d+$/.test(c) ? ':id' : c), d].filter(Boolean).join('/')}`;

    switch (key) {
      case 'GET /health': return { ok: true };
      case 'POST /auth/otp': break;
      case 'GET /stores': {
        const city = query.get('city');
        return { stores: db.stores.filter((s) => !city || s.city === city).sort((x, y) => y.isActive - x.isActive || x.name.localeCompare(y.name)).map(storeJson) };
      }
      case 'GET /stores/:id': {
        const s = db.stores.find((x) => x.id === Number(b)) || fail(404, 'not_found');
        return { store: storeJson(s), products: clone(db.products.filter((p) => p.storeId === s.id)) };
      }
      case 'GET /auth/me': return { user: clone(auth(headers).user) };
      case 'PATCH /auth/me': {
        const { user } = auth(headers);
        if (body.fullName !== undefined) {
          const n = String(body.fullName).trim();
          if (n.length < 2) fail(400, 'name_required');
          user.fullName = n;
        }
        if (body.email !== undefined) user.email = parseEmail(body.email);
        return { user: clone(user) };
      }
      case 'POST /orders': {
        const { user } = auth(headers, 'customer');
        if (body.clientRequestId) {
          const dup = db.orders.find((o) => o.customerId === user.id && o.clientRequestId === body.clientRequestId);
          if (dup) return { order: orderJson(dup) };
        }
        const s = db.stores.find((x) => x.id === Number(body.storeId)) || fail(404, 'not_found');
        if (!s.isActive) fail(409, 'store_closed');
        const address = String(body.deliveryAddress || '').trim();
        if (address.length < 5) fail(400, 'validation');
        const items = (body.items || []).map((i) => ({ productId: Number(i.productId), quantity: Number(i.quantity) }));
        if (!items.length || items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)) fail(400, 'validation');
        const bad = items.filter((i) => { const p = product(i.productId); return !p || p.storeId !== s.id || !p.isAvailable; }).map((i) => i.productId);
        if (bad.length) fail(409, 'product_unavailable', { productIds: bad });
        const name = String(body.fullName || '').trim();
        if (name.length >= 2) user.fullName = name;
        let scheduledFor = null;
        if (body.scheduledFor) {
          const ahead = new Date(body.scheduledFor).getTime() - Date.now();
          if (Number.isNaN(ahead) || ahead < 20 * 60e3 || ahead > 7 * 86400e3) fail(400, 'schedule_invalid');
          scheduledFor = new Date(body.scheduledFor).toISOString();
        }
        const subtotal = items.reduce((t, i) => t + product(i.productId).price * i.quantity, 0);
        const o = {
          id: seq.order++, customerId: user.id, storeId: s.id, clientRequestId: body.clientRequestId || null,
          customerName: user.fullName, customerPhone: user.phone, deliveryAddress: address, deliveryCity: s.city,
          notes: String(body.notes || '').trim() || null, subtotal, deliveryFee: s.deliveryFee, total: subtotal + s.deliveryFee,
          scheduledFor, status: 'pending', cancellationReason: null, cancelledBy: null, createdAt: new Date().toISOString(), updatedAt: Date.now(),
          items: items.map((i) => ({ ...i, price: product(i.productId).price })),
        };
        db.orders.push(o);
        const j = orderJson(o);
        publish(`store:${s.id}`, { type: 'order.created', order: j });
        publish(`customer:${user.id}`, { type: 'order.updated', order: j });
        return { order: j };
      }
      case 'GET /orders': {
        const { user } = auth(headers, 'customer');
        return { orders: db.orders.filter((o) => o.customerId === user.id).reverse().map(orderJson), serverTime: new Date().toISOString() };
      }
      case 'GET /orders/:id': {
        const { user } = auth(headers, 'customer');
        const o = db.orders.find((x) => x.id === Number(b) && x.customerId === user.id) || fail(404, 'not_found');
        return { order: orderJson(o), serverTime: new Date().toISOString() };
      }
      case 'POST /orders/:id/cancel': {
        const { user } = auth(headers, 'customer');
        const o = db.orders.find((x) => x.id === Number(b) && x.customerId === user.id) || fail(404, 'not_found');
        if (o.status !== 'pending' || Date.now() - new Date(o.createdAt).getTime() >= CANCEL_MS) fail(409, 'cancel_window_closed');
        Object.assign(o, { status: 'cancelled', cancelledBy: 'customer', cancelledAt: new Date().toISOString(), updatedAt: Date.now() });
        return { order: notifyOrder(o) };
      }
      case 'GET /bakery/store': return { store: storeJson(auth(headers, 'bakery').store) };
      case 'PATCH /bakery/store': {
        const { store } = auth(headers, 'bakery');
        if (typeof body.isActive !== 'boolean') fail(400, 'validation');
        store.isActive = body.isActive;
        publish('public', { type: 'store.updated', store: storeJson(store) });
        return { store: storeJson(store) };
      }
      case 'GET /bakery/products': {
        const { store } = auth(headers, 'bakery');
        return { products: clone(db.products.filter((p) => p.storeId === store.id)) };
      }
      case 'PATCH /bakery/products/:id': {
        const { store } = auth(headers, 'bakery');
        const p = db.products.find((x) => x.id === Number(c) && x.storeId === store.id) || fail(404, 'not_found');
        if (typeof body.isAvailable !== 'boolean') fail(400, 'validation');
        p.isAvailable = body.isAvailable;
        publish('public', { type: 'product.updated', product: clone(p) });
        return { product: clone(p) };
      }
      case 'GET /bakery/orders': {
        const { store } = auth(headers, 'bakery');
        const cutoff = Date.now() - 2 * 3600e3;
        return {
          orders: db.orders.filter((o) => o.storeId === store.id && (ACTIVE.includes(o.status) || o.updatedAt > cutoff)).map(orderJson),
          serverTime: new Date().toISOString(),
        };
      }
      case 'POST /bakery/orders/:id/advance': {
        const { store } = auth(headers, 'bakery');
        const o = db.orders.find((x) => x.id === Number(c) && x.storeId === store.id) || fail(404, 'not_found');
        const to = NEXT[body.from] || fail(400, 'validation');
        if (o.status !== body.from) fail(409, o.status === 'cancelled' ? 'cancel_window_closed' : 'invalid_transition');
        Object.assign(o, { status: to, [STAMP[to]]: new Date().toISOString(), updatedAt: Date.now() });
        if (to === 'completed') db.tx.push({ orderId: o.id, storeId: o.storeId, amount: o.total, at: Date.now() });
        return { order: notifyOrder(o) };
      }
      case 'POST /bakery/orders/:id/reject': {
        const { store } = auth(headers, 'bakery');
        const o = db.orders.find((x) => x.id === Number(c) && x.storeId === store.id) || fail(404, 'not_found');
        if (o.status !== 'pending') fail(409, 'invalid_transition');
        Object.assign(o, { status: 'cancelled', cancelledBy: 'bakery', cancelledAt: new Date().toISOString(), updatedAt: Date.now() });
        return { order: notifyOrder(o) };
      }
      case 'GET /bakery/summary': {
        const { store } = auth(headers, 'bakery');
        const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date(t));
        const today = day(Date.now());
        const byDay = new Map();
        for (const t of db.tx.filter((x) => x.storeId === store.id)) {
          const k = day(t.at); const v = byDay.get(k) || { date: k, orders: 0, cash: 0 };
          v.orders++; v.cash += t.amount; byDay.set(k, v);
        }
        const days = [...byDay.values()].sort((x, y) => y.date.localeCompare(x.date));
        return { today: byDay.get(today) || { date: today, orders: 0, cash: 0 }, last7Days: days, weekTotal: days.reduce((s, x) => s + x.cash, 0) };
      }
    }

    // /auth/otp/request and /auth/otp/verify
    if (method === 'POST' && a === 'auth' && b === 'otp') {
      const meta = normalize(body.phone) || fail(400, 'invalid_phone');
      const app = body.app === 'bakery' ? 'bakery' : 'customer';
      const phone = `+${meta}`;
      const owner = db.users.find((u) => u.phone === phone && u.role === 'bakery_owner');
      if (app === 'bakery' && !owner) fail(403, 'not_bakery');
      const exists = db.users.some((u) => u.phone === phone);
      if (app === 'customer' && body.intent === 'login' && !exists) fail(404, 'no_account');
      if (app === 'customer' && body.intent === 'register' && exists) fail(409, 'account_exists');
      if (c === 'request') return requestOtp(meta);
      if (c === 'verify') {
        if (app === 'bakery') {
          verifyOtp(meta, body.code);
          const store = db.stores.find((s) => s.ownerId === owner.id);
          return { token: `demo.bakery.${owner.id}`, user: clone(owner), store: storeJson(store) };
        }
        let user = db.users.find((u) => u.phone === phone);
        const name = String(body.fullName || '').trim();
        const email = parseEmail(body.email);
        if (!user && name.length < 2) fail(400, 'name_required');
        verifyOtp(meta, body.code);
        if (!user) {
          user = { id: seq.user++, fullName: name, phone, email, role: 'customer', preferredLanguage: body.lang || 'ku' };
          db.users.push(user);
        } else {
          if (name.length >= 2) user.fullName = name;
          if (email) user.email = email;
        }
        return { token: `demo.customer.${user.id}`, user: clone(user) };
      }
    }
    fail(404, 'not_found');
  }

  window.__samounaMock = {
    reset,
    async handle(url, opts = {}) {
      await new Promise((r) => setTimeout(r, 120)); // feel like a network
      const u = new URL(url, 'http://demo.local');
      let body = {};
      try { body = opts.body ? JSON.parse(opts.body) : {}; } catch { /* ignore */ }
      try {
        return { status: 200, body: route((opts.method || 'GET').toUpperCase(), u.pathname, u.searchParams, body, opts.headers || {}) };
      } catch (e) {
        if (e instanceof Fail) return { status: e.status, body: { error: { code: e.code, message: e.code, details: e.details } } };
        console.error(e);
        return { status: 500, body: { error: { code: 'generic' } } };
      }
    },
    connect(token, send) {
      const c = { channels: new Set(['public']), send };
      const m = /^demo\.(customer|bakery)\.(\d+)$/.exec(token || '');
      if (m && m[1] === 'customer') c.channels.add(`customer:${m[2]}`);
      if (m && m[1] === 'bakery') {
        const s = db.stores.find((x) => x.ownerId === Number(m[2]));
        if (s) c.channels.add(`store:${s.id}`);
      }
      conns.add(c);
      setTimeout(() => send({ type: 'ready', channels: [...c.channels] }), 20);
      return { close: () => conns.delete(c) };
    },
  };
})();
