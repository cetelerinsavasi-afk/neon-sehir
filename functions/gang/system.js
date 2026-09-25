// Çete sistemi giriş noktası: callable dispatch, admin, saat, polis kancası.
import crypto from 'crypto';
import { createCore, TEST_WORLD } from './core.js';
import { createMembershipActions } from './actions/membership.js';
import { createTreasuryActions } from './actions/treasury.js';
import { createTradeActions } from './actions/trade.js';
import { createWarActions } from './actions/wars.js';
import { createVoteActions } from './actions/votes.js';
import { createIntelActions } from './actions/intel.js';
import { createMarketActions } from './actions/market.js';
import { createClock } from './clock.js';
import { GANG, MS_HOUR, MS_DAY } from './config.js';
import { nextMidnightMs as nextMidnightMsOf, dateKeyOf as dateKeyOfMs } from './time.js';

const ADMIN_SESSION_MS = 12 * MS_HOUR;
const ADMIN_MAX_FAILS = 5;
const ADMIN_LOCK_MS = 15 * 60 * 1000;
const MAX_TEST_OFFSET_MS = 400 * MS_DAY;

export function createGangSystem(deps) {
  const core = createCore(deps);
  const { db, fail } = core;
  const intel = createIntelActions(core);
  const membership = createMembershipActions(core, intel);
  const treasury = createTreasuryActions(core);
  const trade = createTradeActions(core, treasury);
  const market = createMarketActions(core, trade);
  const wars = createWarActions(core);
  const votes = createVoteActions(core);
  const clock = createClock(core, { wars, votes, treasury, intel });
  core.cleanupGang = clock.cleanupGang;

  const adminUids = deps.adminUids || [];
  const realNow = deps.realNow || (() => Date.now());
  const logJson = deps.log || ((o) => console.log(JSON.stringify(o)));

  // ---------------------------------------------------------------------------
  // Salt-okunur teklif/fiyat sorguları (istemci karşı çetenin özel kasasını /
  // tırın içeriğini okuyamadığı için sunucu hesaplar)
  // ---------------------------------------------------------------------------
  async function quoteSabotage(ctx, data) {
    const truckId = String(data.truckId || '');
    const m = await core.readMembership(null, ctx, ctx.actorId);
    const truck = (await ctx.ref.truck(truckId).get()).data();
    if (!truck || truck.status !== 'in_transit') fail('failed-precondition', 'Bu tır şu an yolda değil.');
    const day = (await ctx.ref.sabotageDay(ctx.dateKey).get()).data();
    const price = wars.sabotagePrice(day).price;
    let canReceive = true;
    let allied = false;
    if (data.org === 'intel') {
      core.requireIntel(m);
    } else {
      const gangId = core.requireGangMember(m);
      const [depot, al, cargo] = await Promise.all([
        ctx.ref.depot(gangId).get(),
        ctx.ref.alliance([gangId, truck.gangId].sort().join('__')).get(),
        ctx.ref.cargo(truckId).get(),
      ]);
      // Depo kontrolü tırın GERÇEK yüküyle (ör. 1 araba olan 100'lük depoya
      // 100 yasaklı madde sığmaz → sabotaj butonu gizlenir).
      canReceive = core.depotFree(depot.data()) >= Number(cargo.data()?.units || 0);
      allied = ['accepted', 'active', 'ending'].includes(al.data()?.status);
    }
    return { price, canReceive, allied, open: ctx.hour < GANG.SABOTAGE_START_DEADLINE_HOUR };
  }

  // Bahis üst sınırı (iki çetenin küçük 00:00 kasasının 1/4'ü) — karşı
  // çetenin kasası istemciye açık olmadığı için sunucu hesaplar.
  async function quoteBet(ctx, data) {
    const m = await core.readMembership(null, ctx, ctx.actorId);
    const gangId = core.requireGangMember(m);
    const targetGangId = String(data.targetGangId || '');
    const [a, b] = await Promise.all([ctx.ref.gangState(gangId).get(), ctx.ref.gangState(targetGangId).get()]);
    return { maxBet: wars.betLimit(a.data(), b.data(), ctx.dateKey), minBet: GANG.BET_MIN_STAKE };
  }

  const HANDLERS = {
    // üyelik
    createGang: membership.createGang,
    joinGang: membership.joinGang,
    leaveGang: membership.leaveGang,
    kickMember: membership.kickMember,
    giveRespect: membership.giveRespect,
    updateGangProfile: membership.updateGangProfile,
    donate: membership.donate,
    sendGangChat: membership.sendGangChat,
    sendGlobalChat: membership.sendGlobalChat,
    // kasa
    createDistribution: treasury.createDistribution,
    claimDistribution: treasury.claimDistribution,
    withdrawToSelf: treasury.withdrawToSelf,
    transferToGang: treasury.transferToGang,
    // ticaret
    buyTruck: trade.buyTruck,
    buyDepot: trade.buyDepot,
    placeOrder: trade.placeOrder,
    cancelOrder: trade.cancelOrder,
    listDepotItem: market.listDepotItem,
    cancelDepotListing: market.cancelDepotListing,
    buyMarketListing: market.buyMarketListing,
    sellFromDepot: trade.sellFromDepot,
    distributeFromDepot: trade.distributeFromDepot,
    // savaş & diplomasi
    rollDice: wars.rollDice,
    offerBet: wars.offerBet,
    respondBet: wars.respondBet,
    withdrawBet: wars.withdrawBet,
    suggest: wars.suggest,
    requestAlliance: wars.requestAlliance,
    respondAlliance: wars.respondAlliance,
    endAlliance: wars.endAlliance,
    sendAllianceNote: wars.sendAllianceNote,
    startSabotage: wars.startSabotage,
    requestSabotage: wars.requestSabotage,
    payHarac: wars.payHarac,
    startOperation: wars.startOperation,
    payBribe: wars.payBribe,
    quoteSabotage,
    quoteBet,
    // oylama
    requestVote: votes.requestVote,
    cancelVoteRequest: votes.cancelVoteRequest,
    castVote: votes.castVote,
    // istihbarat
    joinIntel: intel.joinIntel,
    leaveIntel: intel.leaveIntel,
    updateIntelNote: intel.updateIntelNote,
    sendIntelChat: intel.sendIntelChat,
    changeCodeName: intel.changeCodeName,
    kickIntelMember: intel.kickIntelMember,
    requestIntelKickVote: intel.requestIntelKickVote,
    cancelIntelVoteRequest: intel.cancelIntelVoteRequest,
    castIntelVote: intel.castIntelVote,
    reportTruck: intel.reportTruck,
    leakTruck: intel.leakTruck,
    reportBet: intel.reportBet,
    leakBet: intel.leakBet,
    startBetOperation: intel.startBetOperation,
    intelDecision: intel.intelDecision,
  };

  async function getConfig() {
    const snap = await db.doc('gangSystem/config').get();
    return snap.data() || { liveOpen: false, liveWorldId: null };
  }

  // Çeteler oyunculara AÇIK: canlı dünya ilk ihtiyaçta (ilk oyuncu işlemi ya
  // da ilk saat turu) tek seferlik, transaction içinde kurulur ve açılır.
  // Mevcut bir canlı dünya varsa ona dokunulmaz (veri korunur), sadece açılır.
  // Sonrasında `liveOpen` Firestore konsolundan false yapılırsa bakım modu
  // yine çalışır (autoOpened bir kez yazıldığı için tekrar açılmaz).
  async function ensureLiveWorld() {
    const cfg = await getConfig();
    if (cfg.autoOpened) return cfg;
    const cfgRef = db.doc('gangSystem/config');
    return db.runTransaction(async (tx) => {
      const cur = (await tx.get(cfgRef)).data() || {};
      if (cur.autoOpened) return cur;
      const nowMs = realNow();
      let liveWorldId = cur.liveWorldId || null;
      if (!liveWorldId) {
        liveWorldId = `live_${dateKeyOfMs(nowMs).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
        const today = dateKeyOfMs(nowMs);
        const worldData = { createdAtMs: nowMs, launchDateKey: today, lastTickDateKey: today, clockOffsetMs: 0 };
        tx.set(db.doc(`gangWorlds/${liveWorldId}`), worldData);
        const wctx = core.makeCtx(liveWorldId, worldData);
        tx.set(wctx.ref.intel(), intel.intelDefaults(), { merge: true });
        tx.set(wctx.ref.intelState(), intel.intelStateDefaults(wctx), { merge: true });
      }
      const next = { liveOpen: true, liveWorldId, autoOpened: true, openedAtMs: nowMs };
      tx.set(cfgRef, next, { merge: true });
      logJson({ gang: 'live_auto_open', liveWorldId });
      return { ...cur, ...next };
    });
  }

  async function hasAdminSession(uid) {
    if (!adminUids.includes(uid)) return false;
    const s = (await db.doc(`gangAdmins/${uid}`).get()).data();
    return Boolean(s?.expiresAtMs && s.expiresAtMs > realNow());
  }

  function requireAuth(request) {
    if (!request.auth?.uid) fail('unauthenticated', 'Bu işlem için giriş yapmalısın.');
    return request.auth.uid;
  }

  async function runAfterCommit(ctx) {
    const jobs = ctx.afterCommit.splice(0);
    for (const job of jobs) {
      try {
        await job();
      } catch (err) {
        console.error('gang afterCommit hata', err);
      }
    }
  }

  function mapError(err) {
    if (err instanceof deps.HttpsError) return err;
    const code = err?.code;
    if (code === 10 || code === 'aborted' || code === 'ABORTED') return new deps.HttpsError('aborted', 'Şu an yoğunluk var, tekrar dene.');
    console.error('gangAction beklenmeyen hata', err);
    return new deps.HttpsError('internal', 'Bir şeyler ters gitti, tekrar dene.');
  }

  async function handleAction(request) {
    const uid = requireAuth(request);
    const data = request.data || {};
    if (data.action === 'hello' && data.world !== 'test') {
      const cfg = await ensureLiveWorld();
      return { ok: true, liveOpen: Boolean(cfg.liveOpen), liveWorldId: cfg.liveOpen ? cfg.liveWorldId : null };
    }
    const handler = HANDLERS[data.action];
    if (!handler) fail('invalid-argument', 'Geçersiz işlem.');
    let worldId;
    let actorId;
    if (data.world === 'test') {
      if (!(await hasAdminSession(uid))) fail('permission-denied', 'Test modu kapalı.');
      worldId = TEST_WORLD;
      actorId = String(data.actAs || '');
      if (!/^tp[a-z0-9]{6,20}$/.test(actorId)) fail('invalid-argument', 'Test personası seçilmedi.');
      const p = await db.doc(`gangWorlds/${TEST_WORLD}/players/${actorId}`).get();
      if (!p.exists) fail('failed-precondition', 'Test personası bulunamadı.');
    } else {
      const cfg = await ensureLiveWorld();
      if (!cfg.liveOpen || !cfg.liveWorldId) fail('failed-precondition', '🚧 Çeteler şu an tadilatta.');
      worldId = cfg.liveWorldId;
      actorId = uid;
    }
    const world = await core.loadWorld(worldId);
    if (!world) fail('failed-precondition', '🚧 Çeteler şu an tadilatta.');
    const ctx = core.makeCtx(worldId, world, { actorId, authUid: uid });
    const rosterAction = ROSTER_ACTIONS.has(data.action);
    const msBefore = rosterAction ? (await db.doc(`gangWorlds/${worldId}/memberships/${actorId}`).get()).data() || {} : null;
    try {
      const res = await handler(ctx, data.payload || {});
      await runAfterCommit(ctx);
      if (rosterAction) {
        try {
          await refreshRostersAfter(ctx, data.action, msBefore);
        } catch (err) {
          console.error('gang roster yenileme hata', err);
        }
      }
      // Onboarding kancaları (sadece canlı dünya; best-effort — hata işlemi bozmaz)
      if (!ctx.isTest) {
        try {
          if ((data.action === 'createGang' || data.action === 'joinGang') && deps.onGangJoined) await deps.onGangJoined(uid);
          if (data.action === 'buyMarketListing' && deps.onGangMarketBought) await deps.onGangMarketBought(uid, res || {});
        } catch (err) {
          console.error('gang onboarding kancası hata', err);
        }
      }
      // v38 aktiflik: sohbet mesajı (çete/genel/İstihbarat) → çete üyeliği için aktif sayılır
      if (SOCIAL_ACTIONS.has(data.action)) {
        try {
          await touchSocialActivity(worldId, actorId, world);
        } catch (err) {
          console.error('gang aktiflik kaydı hata', err);
        }
      }
      ctx.logs.push({ gang: 'action', world: worldId, action: data.action, actorId: ctx.isTest ? actorId : 'player' });
      core.flushLogs(ctx);
      return { ok: true, ...(res || {}) };
    } catch (err) {
      throw mapError(err);
    }
  }

  // ---------------------------------------------------------------------------
  // ADMIN — gizli test girişi, personalar, zaman simülasyonu, canlıya açma
  // ---------------------------------------------------------------------------
  function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
  }

  async function ensureWorld(worldId, extra = {}) {
    const ref = db.doc(`gangWorlds/${worldId}`);
    const snap = await ref.get();
    if (snap.exists) return snap.data();
    const nowMs = realNow();
    const today = dateKeyOfMs(nowMs);
    const data = { createdAtMs: nowMs, launchDateKey: today, lastTickDateKey: today, clockOffsetMs: 0, ...extra };
    await ref.set(data);
    const ctx = core.makeCtx(worldId, data);
    await ctx.ref.intel().set(intel.intelDefaults(), { merge: true });
    await ctx.ref.intelState().set(intel.intelStateDefaults(ctx), { merge: true });
    return data;
  }

  const PERSONA_PRESETS = [
    { displayName: 'Test Baba', gold: 5_000_000, power: 60_000, reputation: 100, isPolice: false },
    { displayName: 'Test Sağkol', gold: 3_000_000, power: 45_000, reputation: 100, isPolice: false },
    { displayName: 'Test Kıdemli', gold: 800_000, power: 30_000, reputation: 70, isPolice: false },
    { displayName: 'Test Tetikçi', gold: 300_000, power: 20_000, reputation: 55, isPolice: true },
    { displayName: 'Test Çömez', gold: 50_000, power: 8_000, reputation: 30, isPolice: false },
    { displayName: 'Rakip Baba', gold: 5_000_000, power: 55_000, reputation: 100, isPolice: false },
    { displayName: 'Rakip Üye', gold: 400_000, power: 25_000, reputation: 60, isPolice: false },
    { displayName: 'Ajan Polis', gold: 200_000, power: 15_000, reputation: 80, isPolice: true },
  ];

  function personaData(input, base = {}) {
    const n = (v, def, max) => {
      const x = Math.floor(Number(v ?? def));
      if (!Number.isFinite(x) || x < 0) return def;
      return Math.min(x, max);
    };
    return {
      displayName: core.cleanText(input.displayName ?? base.displayName ?? 'Test Oyuncu', { min: 2, max: 24, field: 'Ad' }),
      gold: n(input.gold, base.gold ?? 1_000_000, 1e12),
      power: n(input.power, base.power ?? 10_000, 1e9),
      reputation: n(input.reputation, base.reputation ?? 50, 100),
      isPolice: Boolean(input.isPolice ?? base.isPolice ?? false),
    };
  }

  async function handleAdmin(request) {
    const uid = requireAuth(request);
    const data = request.data || {};
    const action = data.action;
    const nowMs = realNow();
    if (!adminUids.includes(uid)) fail('permission-denied', 'Yetkin yok.');

    if (action === 'unlock') {
      const ref = db.doc(`gangAdmins/${uid}`);
      const s = (await ref.get()).data() || {};
      if (s.lockedUntilMs && s.lockedUntilMs > nowMs) fail('resource-exhausted', 'Çok fazla hatalı deneme. Biraz sonra tekrar dene.');
      const expected = deps.getTestPassword ? deps.getTestPassword() : null;
      if (!expected || !safeEqual(String(data.password || ''), expected)) {
        const fails = Number(s.failCount || 0) + 1;
        await ref.set({ failCount: fails >= ADMIN_MAX_FAILS ? 0 : fails, lockedUntilMs: fails >= ADMIN_MAX_FAILS ? nowMs + ADMIN_LOCK_MS : 0 }, { merge: true });
        fail('permission-denied', 'Şifre yanlış.');
      }
      await ref.set({ expiresAtMs: nowMs + ADMIN_SESSION_MS, failCount: 0, lockedUntilMs: 0, unlockedAtMs: nowMs }, { merge: true });
      await ensureWorld(TEST_WORLD);
      logJson({ gang: 'admin_unlock', uid });
      return { ok: true, expiresAtMs: nowMs + ADMIN_SESSION_MS };
    }

    if (!(await hasAdminSession(uid))) fail('permission-denied', 'Test oturumu kapalı. Önce şifreyi gir.');
    const testRef = db.doc(`gangWorlds/${TEST_WORLD}`);

    switch (action) {
      case 'status': {
        const cfg = await getConfig();
        const w = (await testRef.get()).data() || null;
        return { ok: true, config: cfg, testWorld: w, virtualNowMs: nowMs + Number(w?.clockOffsetMs || 0), realNowMs: nowMs };
      }
      case 'lock': {
        await db.doc(`gangAdmins/${uid}`).set({ expiresAtMs: 0 }, { merge: true });
        return { ok: true };
      }
      case 'quickSetup': {
        await ensureWorld(TEST_WORLD);
        const out = [];
        for (const [i, p] of PERSONA_PRESETS.entries()) {
          const id = 'tp' + crypto.randomBytes(6).toString('hex');
          await db.doc(`gangWorlds/${TEST_WORLD}/players/${id}`).set({ ...personaData(p), inventory: {}, createdAtMs: nowMs + i });
          out.push(id);
        }
        return { ok: true, created: out };
      }
      case 'createPersona': {
        await ensureWorld(TEST_WORLD);
        const id = 'tp' + crypto.randomBytes(6).toString('hex');
        await db.doc(`gangWorlds/${TEST_WORLD}/players/${id}`).set({ ...personaData(data.persona || {}), inventory: {}, createdAtMs: nowMs });
        return { ok: true, id };
      }
      case 'updatePersona': {
        const id = String(data.id || '');
        if (!/^tp[a-z0-9]{6,20}$/.test(id)) fail('invalid-argument', 'Geçersiz persona.');
        const ref = db.doc(`gangWorlds/${TEST_WORLD}/players/${id}`);
        const cur = (await ref.get()).data();
        if (!cur) fail('not-found', 'Persona yok.');
        await ref.set(personaData(data.persona || {}, cur), { merge: true });
        return { ok: true };
      }
      case 'advanceTime':
      case 'jumpToMidnight':
      case 'jumpToHour': {
        const w = await ensureWorld(TEST_WORLD);
        const offset = Number(w.clockOffsetMs || 0);
        const vNow = nowMs + offset;
        let target;
        if (action === 'advanceTime') {
          const hours = Number(data.hours);
          if (!(hours > 0 && hours <= 24 * 40)) fail('invalid-argument', 'Geçersiz süre.');
          target = vNow + hours * MS_HOUR;
        } else if (action === 'jumpToMidnight') {
          target = nextMidnightMsOf(vNow) + 1000;
        } else {
          const h = Number(data.hour);
          if (!Number.isInteger(h) || h < 0 || h > 23) fail('invalid-argument', 'Geçersiz saat.');
          const base = nextMidnightMsOf(vNow) - MS_DAY; // bugünün 00:00'ı
          target = base + h * MS_HOUR + 1000;
          if (target <= vNow) target += MS_DAY;
        }
        const newOffset = offset + (target - vNow);
        if (newOffset > MAX_TEST_OFFSET_MS) fail('failed-precondition', 'Test saati daha fazla ileri alınamaz — test dünyasını sıfırla.');
        await testRef.set({ clockOffsetMs: newOffset }, { merge: true });
        const res = await clock.runClock(TEST_WORLD);
        return { ok: true, virtualNowMs: nowMs + newOffset, clock: summarizeClock(res) };
      }
      case 'runClock': {
        const res = await clock.runClock(TEST_WORLD);
        return { ok: true, clock: summarizeClock(res) };
      }
      case 'resetTestWorld': {
        if (data.confirm !== 'SIFIRLA') fail('invalid-argument', 'Onay metni hatalı.');
        await db.recursiveDelete(testRef);
        await ensureWorld(TEST_WORLD);
        logJson({ gang: 'admin_reset_test', uid });
        return { ok: true };
      }
      case 'openLive': {
        // Canlıya AÇ: mode 'fresh' → yepyeni boş dünya (sistem sıfırdan başlar)
        //             mode 'reopen' → bakım için kapatılmış mevcut dünyayı tekrar aç
        const cfg = await getConfig();
        let liveWorldId = cfg.liveWorldId;
        if (data.mode === 'fresh') {
          if (data.confirm !== 'CANLIYA AÇ') fail('invalid-argument', 'Onay metni hatalı.');
          liveWorldId = `live_${dateKeyOfMs(nowMs).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
          await ensureWorld(liveWorldId);
        } else if (!liveWorldId) {
          fail('failed-precondition', 'Henüz canlı dünya yok — önce "fresh" ile aç.');
        }
        await db.doc('gangSystem/config').set({ liveOpen: true, liveWorldId, openedAtMs: nowMs, openedBy: uid }, { merge: true });
        logJson({ gang: 'admin_open_live', liveWorldId });
        return { ok: true, liveWorldId };
      }
      case 'closeLive': {
        await db.doc('gangSystem/config').set({ liveOpen: false, closedAtMs: nowMs }, { merge: true });
        return { ok: true };
      }
      default:
        fail('invalid-argument', 'Geçersiz admin işlemi.');
    }
    return { ok: true };
  }

  function summarizeClock(res) {
    return {
      ticks: (res?.ticks || []).map((t) => ({ dayKey: t.dayKey, ok: t.ok, lock: t.lock, errors: (t.errors || []).length })),
      errors: (res?.errors || []).length,
    };
  }

  async function runAllClocks() {
    let cfg;
    try {
      cfg = await ensureLiveWorld();
    } catch (err) {
      console.error('ensureLiveWorld hata', err);
      cfg = await getConfig();
    }
    const out = {};
    const worlds = [TEST_WORLD];
    if (cfg.liveWorldId) worlds.push(cfg.liveWorldId);
    for (const w of worlds) {
      try {
        out[w] = summarizeClock(await clock.runClock(w));
      } catch (err) {
        console.error('gangClock hata', w, err);
        out[w] = { error: String(err?.message || err) };
      }
    }
    return out;
  }

  // Polis yakalama ödülü → İstihbarat prestiji (sadece canlı dünya).
  async function onPoliceBustReward(uid, amount, refId) {
    const cfg = await getConfig();
    if (!cfg.liveOpen || !cfg.liveWorldId) return { skipped: true };
    const world = await core.loadWorld(cfg.liveWorldId);
    if (!world) return { skipped: true };
    const ctx = core.makeCtx(cfg.liveWorldId, world, { actorId: uid });
    const res = await intel.awardPoliceReward(ctx, uid, Math.floor(Number(amount) || 0), refId);
    core.flushLogs(ctx);
    return res;
  }

  // Şüpheyle yakalanma cezası → İstihbarat kasası (sadece canlı dünya).
  // Soygunda / yasaklı madde satışında şüpheyle yakalanıp borç (ceza)
  // yazıldığı ANDA çağrılır. Kredi/maaş borcu cezaları ve polisin yakaladığı
  // durumlar (ödül polise gider) bu kancayı ÇAĞIRMAZ. İdempotent: refId.
  async function onSuspicionFine(uid, amount, refId) {
    const amt = Math.floor(Number(amount) || 0);
    if (!(amt > 0)) return { skipped: true };
    const cfg = await getConfig();
    if (!cfg.liveOpen || !cfg.liveWorldId) return { skipped: true };
    const world = await core.loadWorld(cfg.liveWorldId);
    if (!world) return { skipped: true };
    const ctx = core.makeCtx(cfg.liveWorldId, world, { actorId: 'system' });
    const res = await intel.creditFineToIntel(ctx, amt, refId);
    core.flushLogs(ctx);
    return res;
  }

  // ---------------------------------------------------------------------------
  // v38 — AKTİFLİK: 30 gün boyunca savaşa katılmayan, HİÇBİR sohbete mesaj
  // yazmayan ve ibadet etmeyen üye atılır (üçünden biri aktiflik sayılır).
  // Savaş: members.lastActiveAtMs · çete sohbeti: members.lastChatAtMs ·
  // diğer sohbetler/ibadet: members.lastSocialAtMs (burada, en fazla saatte
  // bir yazılır — üye listesini dinleyenleri gereksiz tetiklememek için).
  // ---------------------------------------------------------------------------
  const SOCIAL_ACTIONS = new Set(['sendGangChat', 'sendGlobalChat', 'sendIntelChat']);
  // v38: üye listesi (00:00 prestijli herkese açık görünüm) değiştiren işlemler
  const ROSTER_ACTIONS = new Set(['createGang', 'joinGang', 'leaveGang', 'kickMember', 'giveRespect', 'joinIntel', 'leaveIntel', 'kickIntelMember', 'changeCodeName', 'intelDecision']);
  const INTEL_ROSTER_ACTIONS = new Set(['joinIntel', 'leaveIntel', 'kickIntelMember', 'changeCodeName', 'intelDecision']);
  async function refreshRostersAfter(ctx, action, before) {
    const after = (await db.doc(`gangWorlds/${ctx.worldId}/memberships/${ctx.actorId}`).get()).data() || {};
    const gangIds = new Set([before?.gangId, after.gangId].filter(Boolean));
    if (action === 'kickMember' || action === 'giveRespect') gangIds.add(after.gangId || before?.gangId);
    for (const g of gangIds) if (g) await core.refreshGangRoster(ctx, g);
    if (INTEL_ROSTER_ACTIONS.has(action) || before?.intelRosterId !== after.intelRosterId) await core.refreshIntelRoster(ctx);
  }
  const SOCIAL_TOUCH_MIN_MS = 60 * 60 * 1000;
  async function touchSocialActivity(worldId, uid, worldData = null) {
    const ms = (await db.doc(`gangWorlds/${worldId}/memberships/${uid}`).get()).data();
    if (!ms?.gangId) return { skipped: true };
    const ref = db.doc(`gangWorlds/${worldId}/gangs/${ms.gangId}/members/${uid}`);
    const m = (await ref.get()).data();
    if (!m) return { skipped: true };
    const world = worldData || (await core.loadWorld(worldId));
    const now = core.makeCtx(worldId, world || {}).now;
    if (now - Number(m.lastSocialAtMs || 0) < SOCIAL_TOUCH_MIN_MS) return { skipped: true };
    await ref.update({ lastSocialAtMs: now, inactiveWarn: false });
    return { touched: true };
  }
  // Oyunun diğer yerlerinden (ChatsApp mesajı, camide ibadet) — sadece canlı dünya, best-effort
  async function onPlayerActivity(uid) {
    const cfg = await getConfig();
    if (!cfg.liveOpen || !cfg.liveWorldId) return { skipped: true };
    return touchSocialActivity(cfg.liveWorldId, uid);
  }

  // Oyuncu şu an (canlı dünyada) bir çetede mi? — onboarding otomatik geçişi için
  async function isInLiveGang(uid) {
    const cfg = await getConfig();
    if (!cfg.liveOpen || !cfg.liveWorldId) return false;
    const m = (await db.doc(`gangWorlds/${cfg.liveWorldId}/memberships/${uid}`).get()).data();
    return Boolean(m?.gangId);
  }

  // Testler için iç erişim (production'da kullanılmaz)
  const _internal = { core, membership, treasury, trade, market, wars, votes, intel, clock, HANDLERS };

  return { handleAction, handleAdmin, runAllClocks, onPoliceBustReward, onSuspicionFine, isInLiveGang, ensureLiveWorld, onPlayerActivity, touchSocialActivity, _internal };
}
