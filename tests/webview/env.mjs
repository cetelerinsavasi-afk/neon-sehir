// Tarayıcı ortamının en küçük taklidi (window / document / navigator / sessionStorage / history).
// Ortam, alt süreçte NS_ENV (JSON) ile verilir: { url, ua, referrer, session, bridge }.
const cfg = JSON.parse(process.env.NS_ENV || '{}');
const store = new Map(Object.entries(cfg.session || {}));
const sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const loc = new URL(cfg.url || 'https://cetelerinsavasi.com/');
const history = {
  state: null,
  replaceState(state, _t, url) {
    this.state = state;
    const u = new URL(url, loc.href);
    loc.href = u.href;
  },
  pushState(state) {
    this.state = state;
  },
};
const location = {
  get href() { return loc.href; },
  get search() { return loc.search; },
  get pathname() { return loc.pathname; },
  get hash() { return loc.hash; },
};
const win = {
  location,
  history,
  sessionStorage,
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
};
if (cfg.bridge) {
  const calls = [];
  const files = new Map();
  win.__calls = calls;
  win.NeonAndroid = {
    getInfo: () => (cfg.billing ? '{"shell":"webview","versionCode":15,"billing":true}' : '{"shell":"webview","versionCode":14}'),
    signInWithGoogle: (id) => {
      calls.push(['signInWithGoogle', id]);
      if (cfg.bridge === 'silent') return; // yanıt vermez → zaman aşımı
      setTimeout(() => win.__neonNative.resolve(JSON.stringify({ requestId: id, ok: true, idToken: 'tok"en ' })), 5);
    },
    signOutGoogle: () => calls.push(['signOutGoogle']),
    exitApp: () => calls.push(['exitApp']),
    copyText: (t) => { calls.push(['copyText', t]); return true; },
    saveFile: (id, name, mime, b64) => {
      calls.push(['saveFile', name, mime, b64.length]);
      files.set(name, Buffer.from(b64, 'base64'));
      setTimeout(() => win.__neonNative.resolve(JSON.stringify({ requestId: id, ok: true, name })), 1);
    },
    saveFileBegin: (name, mime) => { calls.push(['saveFileBegin', name, mime]); files.set('t1', { name, parts: [] }); return 't1'; },
    saveFileChunk: (tid, b64) => { calls.push(['saveFileChunk', b64.length]); files.get(tid).parts.push(Buffer.from(b64, 'base64')); return true; },
    saveFileEnd: (id, tid) => {
      const t = files.get(tid);
      files.set(t.name, Buffer.concat(t.parts));
      calls.push(['saveFileEnd']);
      setTimeout(() => win.__neonNative.resolve(JSON.stringify({ requestId: id, ok: true, name: t.name })), 1);
    },
  };
  win.__files = files;
  // v155: native Play faturalandırma (sadece cfg.billing varken köprüde bulunur)
  if (cfg.billing) {
    const B = cfg.billing;
    const reply = (id, body) => setTimeout(() => win.__neonNative.resolve(JSON.stringify({ requestId: id, ...body })), 2);
    Object.assign(win.NeonAndroid, {
      billingGetDetails: (id, ids) => {
        calls.push(['billingGetDetails', JSON.parse(ids)]);
        reply(id, B.unavailable ? { ok: false, unavailable: true, code: 3, error: 'Google Play ödemesi bu cihazda kullanılamıyor.' } : { ok: true, items: [{ itemId: 'zumrut_50', title: '50', price: '₺49,99' }, { itemId: 'zumrut_200', title: '200', price: '₺159,99' }] });
      },
      billingPurchase: (id, productId, hash) => {
        calls.push(['billingPurchase', productId, hash]);
        reply(id, B.purchase || { ok: true, productId, purchaseToken: `tok_${productId}`, quantity: 1 });
      },
      billingListPurchases: (id) => {
        calls.push(['billingListPurchases']);
        reply(id, { ok: true, purchases: B.list || [] });
      },
      billingConsume: (id, token) => {
        calls.push(['billingConsume', token]);
        reply(id, { ok: true });
      },
    });
  }
}
globalThis.window = win;
globalThis.document = { referrer: cfg.referrer || '' };
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: cfg.ua || 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0 Safari/537.36', platform: 'Linux', maxTouchPoints: 0, ...(cfg.clipboard === 'fail' ? { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } } : cfg.clipboard === 'ok' ? { clipboard: { writeText: () => Promise.resolve() } } : {}) },
  configurable: true,
});
