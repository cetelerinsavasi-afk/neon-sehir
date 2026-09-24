// Çete sisteminin çekirdeği: dünya/bağlam, ekonomi adaptörü, ledger,
// bildirim, üyelik okuma ve üye çıkarma (halef seçimi dahil).
// Firebase'e doğrudan bağımlı DEĞİL — tüm bağımlılıklar `deps` ile gelir,
// böylece aynı kod hem Cloud Functions'ta hem bellek içi testlerde çalışır.
import crypto from 'crypto';
import { GANG, INTEL, GANG_RANKS, TRADE_PRODUCTS, RANK_LABELS, INTEL_TO_GANG_EQUIV, productById, rankLevel } from './config.js';
import { dateKeyOf, hourOf, windowSlotOf, weekdayOfKey, addDays } from './time.js';


export const TEST_WORLD = 'test';

export function createCore(deps) {
  const {
    db,
    FieldValue: FV,
    HttpsError,
    realNow = () => Date.now(),
    getMaxWeaponPower,
    splitIncomeForDebt,
    catalogs,
    randomInt = (min, maxExclusive) => crypto.randomInt(min, maxExclusive),
    log = (obj) => console.log(JSON.stringify(obj)),
  } = deps;

  const fail = (code, message) => {
    throw new HttpsError(code, message);
  };

  // ---------------------------------------------------------------------------
  // Dünya & bağlam
  // ---------------------------------------------------------------------------
  function makeCtx(worldId, worldData = {}, { actorId = null, authUid = null } = {}) {
    const isTest = worldId === TEST_WORLD;
    // Zaman simülasyonu SADECE test dünyasında: canlı dünyada ofset hiçbir
    // koşulda uygulanmaz (belgeye yazılmış olsa bile).
    const now = realNow() + (isTest ? Number(worldData.clockOffsetMs || 0) : 0);
    const base = `gangWorlds/${worldId}`;
    const d = (p) => db.doc(`${base}/${p}`);
    const c = (p) => db.collection(`${base}/${p}`);
    const dateKey = dateKeyOf(now);
    return {
      worldId,
      isTest,
      world: worldData,
      now,
      dateKey,
      hour: hourOf(now),
      slot: windowSlotOf(now),
      weekday: weekdayOfKey(dateKey),
      actorId,
      authUid,
      logs: [],
      afterCommit: [],
      ref: {
        world: () => db.doc(base),
        membership: (id) => d(`memberships/${id}`),
        memberships: () => c('memberships'),
        gang: (g) => d(`gangs/${g}`),
        gangs: () => c('gangs'),
        member: (g, id) => d(`gangs/${g}/members/${id}`),
        members: (g) => c(`gangs/${g}/members`),
        gangState: (g) => d(`gangs/${g}/private/state`),
        depot: (g) => d(`gangs/${g}/private/depot`),
        gangLog: (g) => c(`gangs/${g}/log`),
        gangChat: (g, ch) => c(`gangs/${g}/chat_${ch}`),
        pending: (g) => c(`gangs/${g}/pending`),
        votes: (g) => c(`gangs/${g}/votes`),
        voteLock: (g, key) => d(`gangs/${g}/voteLocks/${key}`),
        ballot: (g, v, id) => d(`gangs/${g}/votes/${v}/ballots/${id}`),
        gangName: (key) => d(`gangNames/${key}`),
        intel: () => d('intel/main'),
        intelState: () => d('intel/main/private/state'),
        intelLog: () => c('intel/main/log'),
        roster: (r) => d(`intelRoster/${r}`),
        rosterCol: () => c('intelRoster'),
        codeName: (key) => d(`intelCodeNames/${key}`),
        intelChat: (ch) => c(`intelChat_${ch}`),
        intelReport: (id) => d(`intelReports/${id}`),
        intelReports: () => c('intelReports'),
        betReport: (id) => d(`betReports/${id}`),
        betReports: () => c('betReports'),
        distribution: (id) => d(`distributions/${id}`),
        distributions: () => c('distributions'),
        war: (id) => d(`wars/${id}`),
        wars: () => c('wars'),
        shards: (id) => c(`wars/${id}/shards`),
        shard: (id, key) => d(`wars/${id}/shards/${key}`),
        roll: (id, rollId) => d(`wars/${id}/rolls/${rollId}`),
        slot: (id) => d(`slots/${id}`),
        route: (p) => d(`routes/${p}`),
        routes: () => c('routes'),
        truck: (t) => d(`trucks/${t}`),
        trucks: () => c('trucks'),
        cargo: (t) => d(`trucks/${t}/cargo/main`),
        truckCode: (code) => d(`truckCodes/${code}`),
        order: (id) => d(`orders/${id}`),
        listing: (id) => d(`market/${id}`),
        listings: () => c('market'),
        orders: () => c('orders'),
        sabotageDay: (k) => d(`sabotageDays/${k}`),
        globalChat: () => c('globalChat'),
        intelPending: () => c('intel/main/pending'),
        intelVotes: () => c('intel/main/votes'),
        intelVoteLock: (key) => d(`intel/main/voteLocks/${key}`),
        intelBallot: (v, rid) => d(`intel/main/votes/${v}/ballots/${rid}`),
        alliance: (key) => d(`alliances/${key}`),
        alliances: () => c('alliances'),
        ledger: () => c('ledger'),
        request: (id) => d(`requests/${id}`),
        tick: (k) => d(`ticks/${k}`),
        player: (id) => d(`players/${id}`),
        players: () => c('players'),
        inbox: () => c('inbox'),
      },
    };
  }

  async function loadWorld(worldId) {
    const snap = await db.doc(`gangWorlds/${worldId}`).get();
    return snap.exists ? snap.data() : null;
  }

  // ---------------------------------------------------------------------------
  // Ekonomi adaptörü — canlı: users/{uid}; test: gangWorlds/test/players/{id}
  // ---------------------------------------------------------------------------
  function walletRef(ctx, actorId) {
    return ctx.isTest ? ctx.ref.player(actorId) : db.doc(`users/${actorId}`);
  }

  async function readWallet(tx, ctx, actorId) {
    const snap = await tx.get(walletRef(ctx, actorId));
    if (!snap.exists) fail('failed-precondition', 'Oyuncu bulunamadı.');
    const u = snap.data();
    return {
      gold: Number(u.gold || 0),
      reputation: Number(u.reputation || 0),
      displayName: String(u.displayName || 'Oyuncu'),
      avatar: u.avatar && typeof u.avatar === 'object' ? u.avatar : null,
      debtToState: Number(u.debtToState || 0),
      isPolice: ctx.isTest ? Boolean(u.isPolice) : u.profession === 'polis',
      testPower: ctx.isTest ? Number(u.power || 0) : null,
    };
  }

  function debitGold(tx, ctx, actorId, wallet, amount) {
    if (!Number.isInteger(amount) || amount < 0) fail('invalid-argument', 'Geçersiz miktar.');
    if (wallet.gold < amount) fail('failed-precondition', 'Yeterli altının yok.');
    wallet.gold -= amount;
    tx.update(walletRef(ctx, actorId), { gold: FV.increment(-amount) });
  }

  // Canlı dünyada mevcut kural: kazanılan her altın borç varsa %50 borca
  // gider (splitIncomeForDebt). Test dünyasında borç yok.
  function creditGold(tx, ctx, actorId, wallet, amount) {
    if (amount <= 0) return { goldDelta: 0, debtDelta: 0 };
    if (ctx.isTest) {
      tx.update(walletRef(ctx, actorId), { gold: FV.increment(amount) });
      return { goldDelta: amount, debtDelta: 0 };
    }
    const { goldDelta, debtDelta } = splitIncomeForDebt(wallet.debtToState, amount);
    tx.update(walletRef(ctx, actorId), {
      gold: FV.increment(goldDelta),
      debtToState: FV.increment(debtDelta),
    });
    return { goldDelta, debtDelta };
  }

  // Güç anlık görüntüsü (snapshot) — canlı: en güçlü geçerli silah
  // (mevcut getMaxWeaponPower, satılmış/ömrü bitmiş silah sayılmaz).
  async function readPower(ctx, actorId) {
    if (ctx.isTest) {
      const snap = await ctx.ref.player(actorId).get();
      return Number(snap.data()?.power || 0);
    }
    return Number((await getMaxWeaponPower(actorId)) || 0);
  }

  // ---------------------------------------------------------------------------
  // Ledger / log / bildirim
  // ---------------------------------------------------------------------------
  function ledger(tx, ctx, entry) {
    const doc = {
      type: entry.type,
      amount: Number(entry.amount || 0),
      from: entry.from || null,
      to: entry.to || null,
      refId: entry.refId || null,
      before: entry.before ?? null,
      actorId: entry.actorId ?? ctx.actorId ?? null,
      atMs: ctx.now,
      dateKey: ctx.dateKey,
    };
    tx.set(ctx.ref.ledger().doc(), doc);
    ctx.logs.push({ gang: 'ledger', world: ctx.worldId, ...doc });
  }

  function gangLog(tx, ctx, gangId, icon, text) {
    tx.set(ctx.ref.gangLog(gangId).doc(), { icon, text, atMs: ctx.now });
  }

  function intelLog(tx, ctx, icon, text) {
    tx.set(ctx.ref.intelLog().doc(), { icon, text, atMs: ctx.now });
  }

  function notify(tx, ctx, actorId, text, kind = 'gang') {
    if (ctx.isTest) {
      tx.set(ctx.ref.inbox().doc(), { to: actorId, text, kind, atMs: ctx.now });
    } else {
      tx.set(db.collection(`users/${actorId}/messages`).doc(), {
        text,
        createdAt: FV.serverTimestamp(),
        read: false,
        type: 'gang',
        gangKind: kind,
      });
    }
  }

  function systemChat(tx, ctx, chatColl, text) {
    tx.set(chatColl.doc(), { system: true, text, createdAtMs: ctx.now });
  }

  // Olay: çete günlüğü + çetenin genel sohbetine sistem mesajı
  function announce(tx, ctx, gangId, icon, text) {
    gangLog(tx, ctx, gangId, icon, text);
    systemChat(tx, ctx, ctx.ref.gangChat(gangId, 'genel'), `${icon} ${text}`);
  }
  function announceIntel(tx, ctx, icon, text) {
    intelLog(tx, ctx, icon, text);
    systemChat(tx, ctx, ctx.ref.intelChat('genel'), `${icon} ${text}`);
  }

  function flushLogs(ctx) {
    for (const l of ctx.logs) log(l);
    ctx.logs.length = 0;
  }

  // ---------------------------------------------------------------------------
  // İstemci çift tıklama / ağ tekrarı koruması: requests/{actor}_{requestId}
  // ---------------------------------------------------------------------------
  async function requestGuard(tx, ctx, requestId) {
    if (!requestId) return { done: false, save: () => {} };
    const id = `${ctx.actorId}_${String(requestId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)}`;
    const ref = ctx.ref.request(id);
    const snap = await tx.get(ref);
    if (snap.exists) return { done: true, result: snap.data().result || {} };
    return {
      done: false,
      save: (result) => tx.set(ref, { result: result || {}, atMs: ctx.now }),
    };
  }

  // ---------------------------------------------------------------------------
  // Üyelik
  // ---------------------------------------------------------------------------
  const EMPTY_MEMBERSHIP = {
    gangId: null,
    gangRank: null,
    gangJoinedAtMs: null,
    gangStint: null,
    intelRosterId: null,
    intelRank: null,
    intelCodeName: null,
    intelJoinedAtMs: null,
    intelDecisionGangId: null,
    intelDecisionDeadline: null,
  };

  async function readMembership(tx, ctx, actorId) {
    const ref = ctx.ref.membership(actorId);
    const snap = tx ? await tx.get(ref) : await ref.get();
    return { exists: snap.exists, ...EMPTY_MEMBERSHIP, ...(snap.data() || {}) };
  }

  // Üye çıkarma iki aşamalı: planRemoval (SADECE okumalar) + applyRemoval
  // (SADECE yazmalar). Firestore transaction'ında tüm okumalar yazmalardan
  // önce yapılmak zorunda olduğu için bu ayrım şart.
  async function planRemoval(tx, ctx, gangId, memberId, { gangSnapData = null } = {}) {
    const gang = gangSnapData || (await tx.get(ctx.ref.gang(gangId))).data();
    const memberSnap = await tx.get(ctx.ref.member(gangId, memberId));
    const membership = await readMembership(tx, ctx, memberId);
    const plan = { gangId, memberId, gang, member: memberSnap.data() || null, membership, successor: null };
    if (!memberSnap.exists) return plan;
    const [votesSnap, pendingSnap] = await Promise.all([
      tx.get(ctx.ref.votes(gangId).where('status', '==', 'active')),
      tx.get(ctx.ref.pending(gangId).where('status', '==', 'pending')),
    ]);
    plan.votes = votesSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    plan.pending = pendingSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    if (plan.member.rank === 'baba') {
      const all = await tx.get(ctx.ref.members(gangId));
      const others = all.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.id !== memberId);
      others.sort(
        (a, b) => (b.prestige || 0) - (a.prestige || 0) || (a.joinedAtMs || 0) - (b.joinedAtMs || 0) || (a.id < b.id ? -1 : 1)
      );
      if (others.length > 0) {
        plan.successor = others[0];
        plan.successorMembership = await readMembership(tx, ctx, others[0].id);
      }
    }
    return plan;
  }

  function applyRemoval(tx, ctx, plan, reason, { notifyText = null } = {}) {
    const { gangId, memberId, gang, member } = plan;
    if (!member) return { removed: false };
    tx.delete(ctx.ref.member(gangId, memberId)); // prestij kalıcı olarak silinir
    const msUpdate = { gangId: null, gangRank: null, gangJoinedAtMs: null, gangStint: null };
    if (plan.membership.intelDecisionGangId === gangId) {
      msUpdate.intelDecisionGangId = null;
      msUpdate.intelDecisionDeadline = null;
    }
    tx.set(ctx.ref.membership(memberId), msUpdate, { merge: true });
    ctx.logs.push({ gang: 'membership', world: ctx.worldId, event: 'remove', gangId, memberId, reason });

    const babaChanged = member.rank === 'baba';
    // Ayrılan/atılan kişinin hedef ya da başlatıcı olduğu oylamalar iptal.
    for (const v of plan.votes || []) {
      if (v.targetId === memberId || v.initiatorId === memberId || (babaChanged && v.type !== 'kick')) {
        tx.update(v.ref, { status: 'cancelled', cancelReason: 'member_left', resolvedAtMs: ctx.now });
      }
    }
    for (const p of plan.pending || []) {
      if (p.targetId === memberId || p.initiatorId === memberId) {
        tx.update(p.ref, { status: 'cancelled', cancelReason: 'member_left' });
      }
    }

    const gangUpdate = { memberCount: FV.increment(-1) };
    let dissolved = false;
    if (babaChanged) {
      if (plan.successor) {
        const s = plan.successor;
        tx.update(ctx.ref.member(gangId, s.id), { rank: 'baba' });
        const sUpd = { gangRank: 'baba' };
        if (plan.successorMembership?.intelRosterId) {
          // İstihbarat üyesi Baba oldu → gizli karar paneli (sonraki 00:00'a kadar)
          sUpd.intelDecisionGangId = gangId;
          sUpd.intelDecisionDeadline = addDays(ctx.dateKey, 1);
        }
        tx.set(ctx.ref.membership(s.id), sUpd, { merge: true });
        gangUpdate.babaId = s.id;
        gangUpdate.babaName = s.name;
        gangLog(tx, ctx, gangId, '👑', `${s.name} yeni Mafya Babası oldu.`);
        notify(tx, ctx, s.id, `👑 ${gang?.name || 'Çete'} çetesinin yeni Mafya Babası sensin.`, 'rank');
      } else {
        dissolved = true;
        gangUpdate.status = 'disbanded';
        gangUpdate.dissolvedReason = 'empty';
        gangUpdate.dissolvedAtMs = ctx.now;
        gangUpdate.cleanupDone = false;
        gangUpdate.memberCount = 0;
        if (gang?.nameKey) tx.delete(ctx.ref.gangName(gang.nameKey));
      }
    }
    tx.update(ctx.ref.gang(gangId), gangUpdate);
    if (notifyText) notify(tx, ctx, memberId, notifyText, 'membership');
    return { removed: true, dissolved };
  }

  // ---------------------------------------------------------------------------
  // Ürün fiyatları (sunucu otoritesi — istemci değeri asla kabul edilmez)
  // ---------------------------------------------------------------------------
  // Kalem anahtarı: malzeme → "tamirMalzemesi"; silah → "silah:3"; araba → "araba:5"
  function parseItemKey(key) {
    const s = String(key || '');
    if (s.startsWith('silah:')) {
      const id = Number(s.slice(6));
      const c = catalogs.WEAPON_CATALOG[id];
      return c ? { key: s, productId: 'silah', kind: 'weapon', catalogId: id, storePrice: c.price, label: c.name } : null;
    }
    if (s.startsWith('araba:')) {
      const id = Number(s.slice(6));
      const c = catalogs.VEHICLE_CATALOG[id];
      return c ? { key: s, productId: 'araba', kind: 'vehicle', catalogId: id, storePrice: c.price, label: c.name } : null;
    }
    const p = productById(s);
    if (p && p.kind === 'material' && catalogs.AMAZOR_PRICES[p.material] != null) {
      return { key: s, productId: p.id, kind: 'material', material: p.material, storePrice: catalogs.AMAZOR_PRICES[p.material], label: p.label };
    }
    return null;
  }

  function unitBuyPrice(item) {
    return Math.floor(item.storePrice * GANG.TRADE_ROUTE_BUY_RATIO);
  }
  // "Anlık satış değeri" — mevcut instantSellListing ile aynı: yeni ürün için
  // mağaza fiyatının yarısı (malzeme: AMAZOR/2; silah/araç: katalog/2).
  function unitInstantValue(item) {
    return Math.floor(item.storePrice / 2);
  }
  function itemsValue(items, fn) {
    let total = 0;
    for (const [key, qty] of Object.entries(items || {})) {
      const it = parseItemKey(key);
      if (it) total += fn(it) * Number(qty || 0);
    }
    return total;
  }
  function storeValueOf(items) {
    return itemsValue(items, (it) => it.storePrice);
  }
  function instantValueOf(items) {
    return itemsValue(items, unitInstantValue);
  }

  // Depo yeri (birim): araba/silah 10, yasaklı madde 1
  function unitsOfItems(items) {
    let u = 0;
    for (const [key, qty] of Object.entries(items || {})) {
      const it = parseItemKey(key);
      if (it) u += Number(GANG.DEPOT_UNIT_SIZE[it.productId] || 0) * Number(qty || 0);
    }
    return u;
  }
  function depotFree(depot) {
    const d = depot || {};
    return Number(d.capacity || 0) - Number(d.usedUnits || 0) - Number(d.reservedUnits || 0);
  }

  function productItemOptions(productId) {
    const p = productById(productId);
    if (!p) return [];
    if (p.kind === 'weapon') return Object.keys(catalogs.WEAPON_CATALOG).map((id) => parseItemKey(`silah:${id}`));
    if (p.kind === 'vehicle') return Object.keys(catalogs.VEHICLE_CATALOG).map((id) => parseItemKey(`araba:${id}`));
    return [parseItemKey(p.id)];
  }

  // ---------------------------------------------------------------------------
  // Doğrulama yardımcıları
  // ---------------------------------------------------------------------------
  function cleanText(v, { min = 0, max = 100, field = 'Metin' } = {}) {
    const s = String(v ?? '')
      // eslint-disable-next-line no-control-regex -- kontrol karakterlerini bilerek temizliyoruz
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length < min) fail('invalid-argument', `${field} en az ${min} karakter olmalı.`);
    if (s.length > max) fail('invalid-argument', `${field} en fazla ${max} karakter olabilir.`);
    return s;
  }

  function posInt(v, field = 'Miktar') {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n <= 0) fail('invalid-argument', `Geçersiz ${field.toLowerCase()}.`);
    return n;
  }

  function nameKeyOf(name) {
    return name.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').replace(/[/.#$[\]]/g, '_');
  }

  function requireGangMember(membership, gangId = null) {
    if (!membership.gangId) fail('failed-precondition', 'Bir çetede değilsin.');
    if (gangId && membership.gangId !== gangId) fail('permission-denied', 'Bu çetenin üyesi değilsin.');
    return membership.gangId;
  }

  function requireRank(rank, minRank, msg = 'Bu işlem için yetkin yok.') {
    if (rankLevel(rank) > GANG_RANKS.indexOf(minRank)) fail('permission-denied', msg);
  }

  function requireIntel(membership) {
    if (!membership.intelRosterId) fail('failed-precondition', 'İstihbarat üyesi değilsin.');
    return membership.intelRosterId;
  }

  function intelRankEquiv(rank) {
    return INTEL_TO_GANG_EQUIV[rank] || 'comez';
  }

  return {
    deps,
    db,
    FV,
    fail,
    randomInt,
    makeCtx,
    loadWorld,
    walletRef,
    readWallet,
    debitGold,
    creditGold,
    readPower,
    ledger,
    gangLog,
    intelLog,
    notify,
    systemChat,
    announce,
    announceIntel,
    unitsOfItems,
    depotFree,
    flushLogs,
    requestGuard,
    readMembership,
    planRemoval,
    applyRemoval,
    parseItemKey,
    unitBuyPrice,
    unitInstantValue,
    storeValueOf,
    instantValueOf,
    productItemOptions,
    cleanText,
    posInt,
    nameKeyOf,
    requireGangMember,
    requireRank,
    requireIntel,
    intelRankEquiv,
    EMPTY_MEMBERSHIP,
    constants: { GANG, INTEL, TRADE_PRODUCTS, RANK_LABELS },
  };
}
