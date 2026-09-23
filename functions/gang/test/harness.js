// Test düzeneği: bellek içi Firestore + sanal saat + gerçek çete sistemi.
import { FakeFirestore, FieldValue, Timestamp } from './fakeFirestore.js';
import { createGangSystem } from '../system.js';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from '../../catalogData.js';
import { midnightMsOf, addDays } from '../time.js';

// functions/index.js'teki AMAZOR_PRICES ile aynı (index.js firebase-admin
// başlattığı için testte import edilmez; değer farklılığı ayrı testte yakalanır)
export const AMAZOR_PRICES = { tamirMalzemesi: 10, silahUpgrade: 100, arabaGelistirme: 500, yasakliMadde: 2500 };

export class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const ADMIN_UID = 'adminUid001';
export const PASSWORD = 'gizli-test-sifresi';

// İstanbul saati "YYYY-MM-DD HH:mm" → ms
export function ist(dateKey, hhmm = '00:00') {
  const [h, m] = hhmm.split(':').map(Number);
  return midnightMsOf(dateKey) + (h * 60 + m) * 60_000;
}

export function splitIncomeForDebt(currentDebt, amount) {
  const debt = currentDebt || 0;
  if (debt <= 0 || amount <= 0) return { goldDelta: amount, debtDelta: 0 };
  const repay = Math.min(Math.floor(amount / 2), debt);
  return { goldDelta: amount - repay, debtDelta: -repay };
}

export async function createHarness({ start = ist('2026-09-21', '09:00'), dice = null, yieldEvery = true } = {}) {
  const clock = { now: start };
  const db = new FakeFirestore({ clock: () => clock.now, yieldEvery });
  const diceQueue = dice ? [...dice] : null;
  const weaponsByOwner = new Map();
  const logs = [];
  const hooks = [];
  const system = createGangSystem({
    onGangJoined: async (uid) => hooks.push(['joined', uid]),
    onGangMarketBought: async (uid, res) => hooks.push(['market', uid, res.kind, res.material]),
    db,
    FieldValue,
    HttpsError: TestHttpsError,
    realNow: () => clock.now,
    getMaxWeaponPower: async (uid) => weaponsByOwner.get(uid) || 0,
    splitIncomeForDebt,
    catalogs: { VEHICLE_CATALOG, WEAPON_CATALOG, AMAZOR_PRICES },
    lifeDays: 20,
    adminUids: [ADMIN_UID],
    getTestPassword: () => PASSWORD,
    randomInt: (min, max) => {
      if (diceQueue && max === 7 && min === 1 && diceQueue.length) return diceQueue.shift();
      return min + Math.floor(Math.random() * (max - min));
    },
    log: (o) => logs.push(o),
  });

  const h = {
    db,
    system,
    clock,
    logs,
    hooks,
    weaponsByOwner,
    Timestamp,
    get internal() {
      return system._internal;
    },
    setTime(ms) {
      clock.now = ms;
    },
    at(dateKey, hhmm) {
      clock.now = ist(dateKey, hhmm);
    },
    async admin(action, data = {}) {
      return system.handleAdmin({ auth: { uid: ADMIN_UID }, data: { action, ...data } });
    },
    async unlock() {
      return h.admin('unlock', { password: PASSWORD });
    },
    async persona(p) {
      const r = await h.admin('createPersona', { persona: p });
      return r.id;
    },
    // test dünyasında bir persona olarak işlem
    async act(actorId, action, payload = {}) {
      return system.handleAction({ auth: { uid: ADMIN_UID }, data: { world: 'test', actAs: actorId, action, payload } });
    },
    // hata bekle → hata mesajını döndür
    async fails(actorId, action, payload = {}) {
      try {
        await h.act(actorId, action, payload);
      } catch (err) {
        return err;
      }
      throw new Error(`${action} başarısız olmalıydı ama başarılı oldu`);
    },
    // test saatini gerçek saatten bağımsız ilerlet ve saati çalıştır
    async tickTo(dateKey, hhmm = '00:05') {
      clock.now = ist(dateKey, hhmm);
      return system._internal.clock.runClock('test');
    },
    async nextDay(hhmm = '00:05') {
      const w = db._get('gangWorlds/test');
      const cur = system._internal.core.makeCtx('test', w).dateKey;
      return h.tickTo(addDays(cur, 1), hhmm);
    },
    get(path) {
      return db._get(`gangWorlds/test/${path}`);
    },
    raw(path) {
      return db._get(path);
    },
    async membership(id) {
      return db._get(`gangWorlds/test/memberships/${id}`) || {};
    },
    gangOf(id) {
      return db._get(`gangWorlds/test/memberships/${id}`)?.gangId || null;
    },
    member(gangId, id) {
      return db._get(`gangWorlds/test/gangs/${gangId}/members/${id}`);
    },
    state(gangId) {
      return db._get(`gangWorlds/test/gangs/${gangId}/private/state`);
    },
    gold(id) {
      return db._get(`gangWorlds/test/players/${id}`)?.gold;
    },
    async setPersona(id, persona) {
      return h.admin('updatePersona', { id, persona });
    },
    // doğrudan kasaya para koy (test kurulumu)
    async fundKasa(gangId, amount, { snapshot = true } = {}) {
      const ref = db.doc(`gangWorlds/test/gangs/${gangId}/private/state`);
      const cur = db._get(ref.path);
      const ctx = system._internal.core.makeCtx('test', db._get('gangWorlds/test'));
      await ref.set({ ...cur, kasa: (cur.kasa || 0) + amount, ...(snapshot ? { kasaAtMidnight: (cur.kasa || 0) + amount, midnightDateKey: ctx.dateKey, distributableLeft: Math.floor(((cur.kasa || 0) + amount) * 0.2) } : {}) });
    },
    async setPrestige(gangId, id, prestige) {
      await db.doc(`gangWorlds/test/gangs/${gangId}/members/${id}`).update({ prestige });
    },
    async setRank(gangId, id, rank) {
      await db.doc(`gangWorlds/test/gangs/${gangId}/members/${id}`).update({ rank });
      await db.doc(`gangWorlds/test/memberships/${id}`).set({ gangRank: rank }, { merge: true });
    },
    // test kurulumu: çeteye ticaret yolu ver
    async giveRoute(gangId, product = 'yasakliMadde', limit = 1_000_000, untilDateKey = '2026-12-31') {
      await db.doc(`gangWorlds/test/routes/${product}`).set({ product, holderType: 'gang', holderId: gangId, holderName: 'x', dailyOrderLimit: limit, powerUsed: limit * 20, untilDateKey });
    },
    // test kurulumu: depo kapasitesi
    async giveDepot(gangId, capacity = 1000) {
      await db.doc(`gangWorlds/test/gangs/${gangId}/private/depot`).set({ capacity }, { merge: true });
    },
    chat(gangId, channel = 'genel') {
      return Object.values(db._dump(`gangWorlds/test/gangs/${gangId}/chat_${channel}/`)).map((m) => m.text);
    },
    intelChat(channel = 'genel') {
      return Object.values(db._dump(`gangWorlds/test/intelChat_${channel}/`)).map((m) => m.text);
    },
    async recomputeRanks(gangId) {
      const ctx = system._internal.core.makeCtx('test', db._get('gangWorlds/test'));
      return recompute(ctx, gangId);
    },
  };

  async function recompute(ctx, gangId) {
    const { computeGangRanks } = await import('../ranks.js');
    const members = (await ctx.ref.members(gangId).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const gang = db._get(`gangWorlds/test/gangs/${gangId}`);
    const ranks = computeGangRanks(members, gang.babaId);
    for (const m of members) await h.setRank(gangId, m.id, ranks[m.id]);
    return ranks;
  }

  await h.unlock();
  // testlerde saat günlerce ilerlediği için admin oturumunu uzat
  await db.doc(`gangAdmins/${ADMIN_UID}`).set({ expiresAtMs: 9e15 }, { merge: true });
  return h;
}

// Standart kurulum: 1 çete (Baba + N üye), rütbeler ayarlı
export async function setupGang(h, { members = 6, name = 'Kara Kartallar', logo = { emoji: '💀', color: '#ff2e8c', bg: '#1a0610' }, babaPower = 60_000 } = {}) {
  const baba = await h.persona({ displayName: `${name} Baba`, gold: 20_000_000, power: babaPower, reputation: 100 });
  const { gangId } = await h.act(baba, 'createGang', { name, logo, note: 'test' });
  const ids = [];
  for (let i = 0; i < members; i++) {
    const id = await h.persona({ displayName: `${name} Üye${i + 1}`, gold: 1_000_000, power: 10_000 + i * 1000, reputation: 60 });
    h.clock.now += 1000; // katılma sırası (kıdem) belirgin olsun
    await h.act(id, 'joinGang', { gangId });
    ids.push(id);
  }
  return { gangId, baba, ids };
}

export { FieldValue, Timestamp, addDays, midnightMsOf };
