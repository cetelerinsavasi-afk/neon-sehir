// v59 — Altın Mağazası (Shopier) çok ürünlü sipariş düzeltmesi ve Yönetim
// Paneli telafisi için çevrimdışı test. index.js'teki GERÇEK kod parçaları
// (paket tanımları, ayrıştırıcı, yükleme, webhook) okunup sahte Firestore ile
// çalıştırılır. Çalıştır: node --test functions/scripts/gold-store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createAdminPanel } from '../adminPanel.js';

const src = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
function grab(start, until) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start);
  if (until) return src.slice(i, src.indexOf(until, i));
  const re = start.startsWith('export const') ? /\n\}\);\n|\n\);\n/g : /\n\}\n/g;
  re.lastIndex = i;
  const m = re.exec(src);
  return src.slice(i, m.index + m[0].length).replace(/^export /, '');
}
const code = [
  grab('const GOLD_STORE_PACKAGES = {', 'const REDEMPTION_CODE_CHARS'),
  grab('// creditGoldStorePackage — bir paketin', '// shopierOsbWebhook — Shopier'),
  grab('export const shopierOsbWebhook = onRequest('),
  'return { parseShopierPackages, creditShopierOrder, creditMissingShopierPackage, getShopierOrderSummary, shopierOsbWebhook };',
].join('\n');

class HttpsError extends Error {
  constructor(c, m) {
    super(m);
    this.code = c;
  }
}
const USER = 'osbuser';
const PASS = 'osbpass';
function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const admin = { firestore: { FieldValue }, auth: () => ({ getUserByEmail: async () => { throw new Error('auth/user-not-found'); } }) };
  const fns = new Function('db', 'admin', 'HttpsError', 'onRequest', 'crypto', 'shopierOsbUsername', 'shopierOsbPassword', 'extractShopierOsbFields', code)(
    db, admin, HttpsError, (_opts, fn) => fn, crypto, { value: () => USER }, { value: () => PASS }, async (req) => req.body
  );
  S('redemptionCodes/ABC234', { uid: 'oyuncu' });
  S('users/oyuncu', { displayName: 'Tahir', gold: 0 });
  const osb = async (order) => {
    const resVal = Buffer.from(JSON.stringify(order)).toString('base64');
    const hashVal = crypto.createHmac('sha256', PASS).update(resVal + USER).digest('hex');
    const res = { code: null, status(c) { this.code = c; return this; }, send() { return this; } };
    await fns.shopierOsbWebhook({ body: { resVal, hashVal }, headers: {} }, res);
    return res.code;
  };
  const inv = (m) => G(`users/oyuncu/inventory/${m}`)?.quantity || 0;
  const smsCount = () => [...db._store.keys()].filter((k) => k.startsWith('users/oyuncu/messages/')).length;
  return { db, S, G, fns, osb, inv, smsCount };
}
const base = { email: 'x@y.com', customernote: 'kod: abc234', istest: 0, currency: 0 };

test('ayrıştırıcı: virgüllü / JSON / nesne dizisi / tek ürün; tutar kontrolü', () => {
  const { fns } = setup();
  const p = (o) => fns.parseShopierPackages(o);
  assert.deepEqual(p({ productid: 49730536, productlist: '49730536,49730517', price: '128' }).packageIds, ['paket1', 'paket2']);
  assert.equal(p({ productid: 49730536, productlist: '49730536,49730517', price: '128' }).consistent, true);
  assert.deepEqual(p({ productid: 49730536, productlist: '["49730536","49730517"]', price: '128' }).packageIds, ['paket1', 'paket2']);
  assert.deepEqual(p({ productid: 49730536, productlist: [{ productid: 49730517, quantity: 2 }], price: '198' }).packageIds, ['paket2', 'paket2']);
  assert.deepEqual(p({ productid: 49730517, price: '99' }).packageIds, ['paket2'], 'productlist yoksa eski davranış');
  const bad = p({ productid: 49730536, productlist: '49730536', price: '130' });
  assert.deepEqual(bad.packageIds, ['paket1']);
  assert.equal(bad.consistent, false, 'tutar tutmuyor → elle kontrol');
  assert.deepEqual(p({ productid: 111, productlist: '999999' , price: '5'}).packageIds, []);
});

test('v67: aynı paketten 2 adet — productcount / sepet ayrıntısı / tutardan çıkarım', () => {
  const { fns } = setup();
  const p = (o) => fns.parseShopierPackages(o);
  const a = p({ productid: 49730536, productlist: '49730536', productcount: 2, price: '58' });
  assert.deepEqual(a.packageIds, ['paket1', 'paket1']);
  assert.equal(a.consistent, true);
  const b = p({ productid: 49730517, productlist: '49730517', chartdetails: [{ productid: '49730517', quantity: 2 }], price: '198' });
  assert.deepEqual(b.packageIds, ['paket2', 'paket2']);
  const c = p({ productid: 49730536, productlist: '49730536', price: '58' });
  assert.deepEqual(c.packageIds, ['paket1', 'paket1'], 'fark tek kombinasyonla karşılanıyor → eklenir');
  assert.equal(c.inferred, true);
  assert.equal(c.consistent, false, 'çıkarım yapılan sipariş elle kontrol için işaretlenir');
  const d = p({ productid: 49730536, productlist: '49730536', price: '128' });
  assert.deepEqual(d.packageIds, ['paket1', 'paket2']);
  const e = p({ productid: 49730536, productlist: '49730536', price: '40' });
  assert.deepEqual(e.packageIds, ['paket1'], 'karşılanamayan fark → tahmin yok');
});

test('webhook: iki paketli tek sipariş → iki paket de yüklenir; tekrar gelen bildirim ikinci kez yüklemez', async () => {
  const { osb, G, inv, smsCount } = setup();
  const order = { ...base, orderid: '5001', productid: 49730536, productlist: '49730536,49730517', productcount: 2, price: '128' };
  assert.equal(await osb(order), 200);
  assert.equal(G('users/oyuncu').emerald, 250, '50 + 200 zümrüt');
  assert.equal(G('users/oyuncu').gold, 0, 'artık altın yüklenmez');
  assert.equal(smsCount(), 2);
  const o = G('shopierOrders/5001');
  assert.deepEqual(o.creditedPackages, ['paket1', 'paket2']);
  assert.equal(o.packageId, 'paket1');
  assert.equal(o.needsReview, false);
  assert.equal(o.productlist, '49730536,49730517');
  assert.equal(await osb(order), 200);
  assert.equal(G('users/oyuncu').emerald, 250, 'retry iki kez yüklemez');
});

test('webhook: tek paketli sipariş eskisi gibi; tutar tutmazsa yüklenen yüklenir ve elle kontrole düşer', async () => {
  const { osb, G, db } = setup();
  await osb({ ...base, orderid: '6001', productid: 49730517, price: '99' });
  assert.equal(G('users/oyuncu').emerald, 200);
  assert.deepEqual(G('shopierOrders/6001').creditedPackages, ['paket2']);
  await osb({ ...base, orderid: '6002', productid: 49730536, productlist: '49730536', price: '130' });
  assert.equal(G('users/oyuncu').emerald, 250);
  assert.equal(G('shopierOrders/6002').needsReview, true);
  assert.equal(G('shopierUnmatchedOrders/6002').reason, 'price-mismatch');
  assert.ok(db);
});

test('telafi: eski hatalı sipariş (130 TL, yalnızca paket1) → paket2 bir kez yüklenir, ikincisi reddedilir', async () => {
  const { S, G, fns, inv } = setup();
  S('shopierOrders/277575017', { uid: 'oyuncu', packageId: 'paket1', price: '130', productid: 49730536, matchedBy: 'code', creditedAt: 1 });
  const before = await fns.getShopierOrderSummary('277575017');
  assert.equal(before.remainingTRY, 101);
  assert.deepEqual(before.creditable.map((p) => p.id), ['paket1', 'paket2']);
  const r = await fns.creditMissingShopierPackage({ orderId: '277575017', packageId: 'paket2', actorUid: 'boss' });
  assert.equal(G('users/oyuncu').emerald, 200);
  assert.deepEqual(r.creditedPackages, ['paket1', 'paket2']);
  assert.equal(r.remainingTRY, 2);
  assert.deepEqual(r.creditable, []);
  await assert.rejects(fns.creditMissingShopierPackage({ orderId: '277575017', packageId: 'paket2', actorUid: 'boss' }), /zaten karşılanmış/);
  await assert.rejects(fns.creditMissingShopierPackage({ orderId: '277575017', packageId: 'paket1', actorUid: 'boss' }), /zaten karşılanmış/);
  assert.equal(G('users/oyuncu').emerald, 200);
  await assert.rejects(fns.creditMissingShopierPackage({ orderId: 'yok', packageId: 'paket1', actorUid: 'boss' }), /sipariş yok/);
});

test('Yönetim Paneli: yalnızca yönetici; işlem denetim kaydına yazılır', async () => {
  const { db, S, G, fns } = setup();
  S('users/boss', { displayName: 'Boss', createdAt: new Timestamp(1) });
  S('users/mod1', { displayName: 'Mod', role: 'moderator', createdAt: new Timestamp(1) });
  S('shopierOrders/277575017', { uid: 'oyuncu', packageId: 'paket1', price: '130', creditedAt: 1 });
  const panel = createAdminPanel({
    db, auth: {}, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, bootstrapAdminUids: ['boss'], reportTargets: {}, banUntilMs: 0,
    shop: { getOrder: (id) => fns.getShopierOrderSummary(id), creditMissing: (a) => fns.creditMissingShopierPackage(a) },
  });
  const call = (uid, action, payload) => panel.adminAction({ auth: { uid }, data: { action, payload } });
  await assert.rejects(call('mod1', 'getShopOrder', { orderId: '277575017' }), /yöneticilere/);
  await assert.rejects(call('boss', 'getShopOrder', { orderId: '../x' }), /Geçersiz sipariş/);
  const got = await call('boss', 'getShopOrder', { orderId: '277575017' });
  assert.equal(got.order.playerName, 'Tahir');
  assert.equal(got.order.remainingTRY, 101);
  const done = await call('boss', 'creditShopOrder', { orderId: '277575017', packageId: 'paket2' });
  assert.equal(done.order.remainingTRY, 2);
  const logs = [...db._store.keys()].filter((k) => k.startsWith('admin_logs/')).map((k) => G(k));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'shop_credit');
  assert.equal(logs[0].details.orderId, '277575017');
  assert.equal(logs[0].targetUid, 'oyuncu');
  await assert.rejects(call('boss', 'creditShopOrder', { orderId: '277575017', packageId: 'paket2' }), /zaten karşılanmış/);
});
