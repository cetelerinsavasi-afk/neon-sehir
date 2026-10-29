// Çete sisteminin çekirdeği: dünya/bağlam, ekonomi adaptörü, ledger,
// bildirim, üyelik okuma ve üye çıkarma (halef seçimi dahil).
// Firebase'e doğrudan bağımlı DEĞİL — tüm bağımlılıklar `deps` ile gelir,
// böylece aynı kod hem Cloud Functions'ta hem bellek içi testlerde çalışır.
import crypto from 'crypto';
import { GANG, INTEL, GANG_RANKS, TRADE_PRODUCTS, RANK_LABELS, INTEL_TO_GANG_EQUIV, productById, rankLevel, GANG_EXIT_COOLDOWN_MS } from './config.js';
import { dateKeyOf, hourOf, windowSlotOf, weekdayOfKey, addDays } from './time.js';
import { goldTag } from '../moneyLog.js';
import { stateWrite } from '../stateTreasury.js';
import { intelReviewRanks } from './ranks.js';


export const TEST_WORLD = 'test';
// v109 — teşkilat sicilindeki sayaçlar (istihbarat + polis icraatı tek sicilde)
export const INTEL_RECORD_COUNTERS = ['power', 'truckReports', 'betReports', 'truckLeaks', 'betLeaks', 'paid', 'heistsStopped', 'goldRecovered', 'goldEarned', 'bustPrestige'];

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
      // v136: test dünyasında darbe kilidi denemesi (politics/state) — sadece testler açar
      coupCheckInTest: isTest && Boolean(worldData.coupCheckInTest),
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
        // v103: güvenli yasaklı madde satışından günlük haraç toplamı (sadece sunucu)
        harac: (g, day) => d(`gangs/${g}/harac/${day}`),
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
        // v94 — İstihbarat üye raporu: üye başı günlük icraat (sadece sunucu)
        intelStat: (rid, day) => d(`intelStats/${rid}_${day}`),
        intelStats: () => c('intelStats'),
        intelReports: () => c('intelReports'),
        betReport: (id) => d(`betReports/${id}`),
        betReports: () => c('betReports'),
        distribution: (id) => d(`distributions/${id}`),
        distributions: () => c('distributions'),
        // v38: herkese açık görünümler (00:00 prestiji; anlık prestij sadece kendine)
        gangRoster: (g) => d(`gangs/${g}/public/roster`),
        // v41: başkanlık devri talebi (tek belge; çete üyeleri okur)
        handover: (g) => d(`gangs/${g}/public/handover`),
        intelRosterView: () => d('intel/main/public/roster'),
        war: (id) => d(`wars/${id}`),
        // v37: bahis tutarı ayrı belgede — sadece Baba/Sağ Kol/Kıdemli okur (kurallar)
        betSecret: (id) => d(`wars/${id}/secret/stake`),
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
        // v108 — İstihbarat sicili (süresiz; üye ayrılınca silinir) + başvurular
        intelRecord: (r) => d(`intelRecords/${r}`),
        intelApp: (id) => d(`intel/main/applications/${id}`),
        intelApps: () => c('intel/main/applications'),
        intelAppLink: (id) => d(`intelAppLinks/${id}`),
        // v108.1 — gece maaşı: oyuncu başına günde TEK maaş (imam / polis —
        // rol değiştirse de) + polis rüşvet havuzu. Canlıda kök
        // koleksiyonlar (imam maaşı functions/index.js'de aynı işareti kullanır).
        roleSalaryMark: (actorId, day) => (isTest ? d(`roleSalaryMarks/${day}_${actorId}`) : db.doc(`roleSalaryMarks/${day}_${actorId}`)),
        bribePool: (day) => (isTest ? d(`policeBribePool/${day}`) : db.doc(`policeBribePool/${day}`)),
        bribePayout: (day) => (isTest ? d(`policeBribePayouts/${day}`) : db.doc(`policeBribePayouts/${day}`)),
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
      // v108 — görev şartları ve rol tekliği (imam / istihbarat / polis)
      onboarded: ctx.isTest ? u.onboarded !== false : Boolean(u.onboardingRewardClaimed),
      policePending: ctx.isTest ? Boolean(u.policePending) : u.pendingPoliceChange === 'apply',
      isImam: Boolean(u.isImam),
      belediyeSeat: ctx.isTest ? null : u.belediyeSeat || null, // v127: belediye görevlisi polis olamaz
      suspicion: Number(u.suspicion || 0), // v109: polislik şartı (%0)
    };
  }

  function debitGold(tx, ctx, actorId, wallet, amount) {
    if (!Number.isInteger(amount) || amount < 0) fail('invalid-argument', 'Geçersiz miktar.');
    if (wallet.gold < amount) fail('failed-precondition', 'Yeterli altının yok.');
    wallet.gold -= amount;
    tx.update(walletRef(ctx, actorId), { gold: FV.increment(-amount), goldTag: goldTag('cete') });
  }

  // Canlı dünyada mevcut kural: kazanılan her altın borç varsa %50 borca
  // gider (splitIncomeForDebt). Test dünyasında borç yok.
  function creditGold(tx, ctx, actorId, wallet, amount) {
    if (amount <= 0) return { goldDelta: 0, debtDelta: 0 };
    if (ctx.isTest) {
      tx.update(walletRef(ctx, actorId), { gold: FV.increment(amount), goldTag: goldTag('cete') });
      return { goldDelta: amount, debtDelta: 0 };
    }
    const { goldDelta, debtDelta } = splitIncomeForDebt(wallet.debtToState, amount);
    tx.update(walletRef(ctx, actorId), {
      gold: FV.increment(goldDelta), goldTag: goldTag('cete'),
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
  // v94 → v108 — İstihbarat SİCİLİ: üyenin TÜM icraatı (süresiz; üye
  // İstihbarattan çıkınca silinir). Eskiden günlük belgeler + son 14 gün.
  //   f: { warId, power, truckReports, betReports, truckLeaks, betLeaks, paid,
  //        v109 polis: heistsStopped, goldRecovered, goldEarned, bustPrestige }
  // YAZMA — işlem içinde, okumalardan sonra çağrılır.
  // ---------------------------------------------------------------------------
  function intelStat(tx, ctx, rosterId, f = {}) {
    if (!rosterId) return;
    const patch = { rosterId, updatedAtMs: ctx.now };
    if (f.warId) patch.wars = { [f.warId]: true };
    for (const k of INTEL_RECORD_COUNTERS) {
      const v = Math.round(Number(f[k]) || 0);
      if (v) patch[k] = FV.increment(v);
    }
    tx.set(ctx.ref.intelRecord(rosterId), patch, { merge: true });
    // v132: günlük kopya (sicilde "Son 1 hafta" raporu; 15 günden eskisi gece silinir)
    tx.set(ctx.ref.intelStat(rosterId, ctx.dateKey), { ...patch, dateKey: ctx.dateKey }, { merge: true });
  }
  // ---------------------------------------------------------------------------
  // v108 — DEVLET KASASI (functions/stateTreasury.js). Test dünyası kendi
  // altına yazar (gangWorlds/test/stateLedger) — canlı defter kirlenmez.
  // YAZMA — işlem içinde, okumalardan sonra. Kasa eksiye inebilir (okuma yok).
  // ---------------------------------------------------------------------------
  function stateTx(tx, ctx, kind, cat, amount) {
    return stateWrite(tx, db, FV, { kind, cat, amount, atMs: ctx.now, dayKey: ctx.dateKey, base: ctx.isTest ? `gangWorlds/${ctx.worldId}/` : '' });
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
    if (!actorId) return; // v41: boş Baba koltuğu vb.
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
  // ---------------------------------------------------------------------------
  // v38 — HERKESE AÇIK GÖRÜNÜM: diğer üyelerin prestiji 00:00'daki haliyle
  // görünür (anlık prestij sadece sahibine). Üye/kod adı listeleri tek bir
  // "roster" belgesinden okunur; asıl üye belgesi (anlık prestij) sadece
  // sahibine açıktır (Firestore kuralı). Liste, üyelik değişince (katıl/ayrıl/
  // at/saygı…) ve her gece 00:00'da yeniden yazılır.
  // ---------------------------------------------------------------------------
  // v64: üyenin son saygı gördüğü hafta (eski kayıtlar: RESPECT_LEGACY_WEEK)
  function respectWeekOf(m) {
    if (m?.respectWeekKey) return m.respectWeekKey;
    return m?.respected ? GANG.RESPECT_LEGACY_WEEK : null;
  }
  function publicMemberView(m) {
    return {
      name: m.name || '',
      rank: m.rank || 'comez',
      avatar: m.avatar || null,
      prestige: Number(m.prestigeAtMidnight ?? m.prestige ?? 0),
      respected: Boolean(m.respected),
      respectWeekKey: respectWeekOf(m), // v64: istemci "bu hafta saygı gördü mü"yü bununla hesaplar
      inactiveWarn: Boolean(m.inactiveWarn),
      joinedAtMs: Number(m.joinedAtMs || 0),
    };
  }
  // v39: adına oylama açılan üye (çıkarma, devirme, ayaklanma hedefi) oylama
  // bitene kadar (00:00) Çömez / Muhbir yetkisindedir. Asıl rütbe değişmez.
  function underVote(m, ctx) {
    return Boolean(m) && Number(m.underVoteUntilMs || 0) > ctx.now;
  }
  function effRank(m, ctx, lowest = 'comez') {
    if (!m) return null;
    return underVote(m, ctx) ? lowest : m.rank;
  }
  function withEffRank(m, ctx, lowest = 'comez') {
    return m ? { ...m, realRank: m.rank, rank: effRank(m, ctx, lowest) } : m;
  }

  async function refreshGangRoster(ctx, gangId) {
    if (!gangId) return;
    const snap = await ctx.ref.members(gangId).get();
    const members = {};
    snap.docs.forEach((d) => {
      members[d.id] = publicMemberView(d.data());
    });
    await ctx.ref.gangRoster(gangId).set({ members, count: snap.size, updatedAtMs: ctx.now });
    // v39: Çeteler listesindeki üye sayısı gerçek sayıyla eşit kalsın
    const g = await ctx.ref.gang(gangId).get();
    if (g.exists && g.data().status === 'active' && Number(g.data().memberCount) !== snap.size) await ctx.ref.gang(gangId).update({ memberCount: snap.size });
  }
  async function refreshIntelRoster(ctx) {
    const snap = await ctx.ref.rosterCol().get();
    const members = {};
    snap.docs.forEach((d) => {
      const r = d.data();
      members[d.id] = { codeName: r.codeName || '', rank: r.rank || 'muhbir', prestige: Number(r.prestigeAtMidnight ?? r.prestige ?? 0), joinedAtMs: Number(r.joinedAtMs || 0) };
    });
    await ctx.ref.intelRosterView().set({ members, count: snap.size, updatedAtMs: ctx.now });
    // üye sayacı gerçek sayıyla eşit kalsın; v108: başvuruları kim inceler
    const iv = await ctx.ref.intel().get();
    const review = intelReviewRanks(snap.docs.map((d) => d.data().rank));
    const patch = {};
    if (Number(iv.data()?.memberCount) !== snap.size) patch.memberCount = snap.size;
    if (JSON.stringify(iv.data()?.reviewRanks || []) !== JSON.stringify(review)) patch.reviewRanks = review;
    if (Object.keys(patch).length) await ctx.ref.intel().set(patch, { merge: true });
  }

  // ---------------------------------------------------------------------------
  // v108 — İSTİHBARAT KASASI KAPANDI. İstihbaratın kazandığı her şey (savaş,
  // bahis, operasyon tahsilatı, rüşvet, çökertilen çetenin kasası, iadeler)
  // DEVLET kasasına gelir yazılır; operasyon masrafları devletten ödenir.
  // readIntelKasa / creditIntel imzaları eski çağıranlar için korunur:
  // readIntelKasa artık OKUMA YAPMAZ (işlemlere yük eklemez).
  // ---------------------------------------------------------------------------
  const INTEL_INCOME_CAT = {
    intel_trade_war_win: 'ist_savas',
    bet_payout_intel: 'ist_bahis',
    intel_op_reward: 'ist_operasyon',
    intel_bribe_income: 'ist_rusvet',
    gang_takedown_to_intel: 'ist_cokertme',
    distribution_refund: 'ist_iade',
    intel_bet_op_refund: 'ist_iade',
    intel_fine_income: 'soygun_ceza',
  };
  async function readIntelKasa() {
    return { exists: true, kasa: 0, members: 0, cap: Infinity, state: true };
  }
  function creditIntel(tx, ctx, info, amount, { type, refId = null, from = { kind: 'system' } } = {}) {
    const amt = Math.max(0, Math.floor(Number(amount) || 0));
    if (!amt) return { credited: 0, burned: 0 };
    stateTx(tx, ctx, 'in', INTEL_INCOME_CAT[type] || 'diger', amt);
    ledger(tx, ctx, { type, amount: amt, from, to: { kind: 'state', id: 'main' }, refId, actorId: 'system' });
    return { credited: amt, burned: 0 };
  }

  // v37: rütbelilere (Baba · Sağ Kol · Kıdemli) özel sistem mesajı — yönetim sohbeti
  function announceMgmt(tx, ctx, gangId, icon, text) {
    systemChat(tx, ctx, ctx.ref.gangChat(gangId, 'yonetim'), `${icon} ${text}`);
  }

  // v37: bahis tutarı. Eski belgelerde war.stake durur (taşınana kadar),
  // yenilerde wars/{id}/secret/stake. İşlem içinde OKUMA aşamasında çağrılmalı.
  async function readBetStake(tx, ctx, warId, war) {
    if (war && war.stake != null) return Number(war.stake) || 0;
    const s = await tx.get(ctx.ref.betSecret(warId));
    return Number(s.data()?.stake || 0);
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
    intelAppId: null, // v108: bekleyen teşkilat başvurusu
    intelCooldownUntilMs: null, // v109: ayrılan / atılan 24 saat yeniden başvuramaz
    gangCooldownUntilMs: null, // v116: çeteden ayrılan / atılan 24 saat polis-imam olamaz
    gangCooldownGangId: null, // v127: ve sadece AYRILDIĞI çeteye 24 saat giremez
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
    // v41: kalan üye sayısı her çıkarmada bilinmeli (Baba koltuğu boşken son üye çıkarsa çete dağılır)
    const all = await tx.get(ctx.ref.members(gangId));
    plan.othersCount = all.docs.filter((d) => d.id !== memberId).length;
    if (plan.member.rank === 'baba') {
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

  function isKickReason(reason) {
    const r = String(reason || '');
    return r === 'kicked' || r === 'vote_kick' || r === 'devirme_lost' || r.endsWith('_failed');
  }

  function applyRemoval(tx, ctx, plan, reason, { notifyText = null } = {}) {
    const { gangId, memberId, gang, member } = plan;
    if (!member) return { removed: false };
    tx.delete(ctx.ref.member(gangId, memberId)); // prestij kalıcı olarak silinir
    // v34: KENDİ İSTEĞİYLE ayrılan aynı gün içinde (00:00'a kadar) bu çeteye
    // tekrar giremez → çık-gir ile oylama/prestij hileleri engellenir.
    // v56: GÜN İÇİNDE ATILAN da (Baba/Sağ Kol doğrudan atma, erken sonuçlanan
    // atma/devirme/ayaklanma oylaması) o gün 00:00'a kadar aynı çeteye giremez.
    // 00:00 sonuçlandırmasında (ctx.nightly) atılan ve aktiflik temizliğiyle
    // ('inactive') çıkarılan hemen tekrar girebilir.
    const voluntary = String(reason || '').startsWith('left');
    const lockOut = voluntary || (isKickReason(reason) && !ctx.nightly);
    const msUpdate = { gangId: null, gangRank: null, gangJoinedAtMs: null, gangStint: null, ...(lockOut ? { gangExitDay: { [gangId]: ctx.dateKey } } : {}) };
    // v116: kendi isteğiyle ayrılan ('left') ya da atılan (gece sonuçlanan oylama
    // dahil) 24 saat çeteye / polisliğe / imamlığa giremez.
    if (reason === 'left' || isKickReason(reason)) {
      msUpdate.gangCooldownUntilMs = ctx.now + GANG_EXIT_COOLDOWN_MS;
      msUpdate.gangCooldownGangId = gangId; // v127: çete yasağı sadece bu çeteye
    }
    if (plan.membership.intelDecisionGangId === gangId) {
      msUpdate.intelDecisionGangId = null;
      msUpdate.intelDecisionDeadline = null;
    }
    tx.set(ctx.ref.membership(memberId), msUpdate, { merge: true });
    ctx.logs.push({ gang: 'membership', world: ctx.worldId, event: 'remove', gangId, memberId, reason });

    const babaChanged = member.rank === 'baba';
    // v34: başlatan ya da hedef çeteden ayrılsa/atılsa da oylamalar DEVAM EDER
    // ve 00:00'da sonuçlanır (bkz. clock.resolveVote). Tek istisna: Mafya
    // Babası çeteden çıktıysa (halef geçti) liderlik oylamasının hedefi
    // kalmadığı için devirme/ayaklanma oylaması sonuçsuz kapanır.
    for (const v of plan.votes || []) {
      if (babaChanged && v.type !== 'kick') {
        tx.update(v.ref, { status: 'cancelled', cancelReason: 'baba_left', resolvedAtMs: ctx.now });
      }
    }
    for (const p of plan.pending || []) {
      if (p.targetId === memberId || p.initiatorId === memberId) {
        tx.update(p.ref, { status: 'cancelled', cancelReason: 'member_left' });
      }
    }

    const gangUpdate = { memberCount: FV.increment(-1) };
    let dissolved = false;
    const lastOne = plan.othersCount === 0;
    if (babaChanged || lastOne) {
      if (plan.successor && !lastOne) {
        // v41: Baba ayrılınca/atılınca yerine HEMEN kimse geçmez — herkes
        // 00:00'a kadar mevkiinde kalır; 00:00'da rütbeler düzenlenirken en
        // yüksek prestijli üye Mafya Babası olur (bkz. clock.recomputeGangRanks).
        gangUpdate.babaId = null;
        gangUpdate.babaName = null;
        gangUpdate.babaVacantSinceMs = ctx.now;
        gangLog(tx, ctx, gangId, '👑', 'Mafya Babası koltuğu boş — yeni Mafya Babası 00:00\'da belirlenecek.');
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
    // v41: kendi isteğiyle ayrılan herkes için sohbette duyuru (başka çeteye geçiş / yeni çete kurma dahil)
    if (voluntary && !dissolved) announce(tx, ctx, gangId, '🚪', `${member.name} çeteden ayrıldı.${babaChanged ? ' 👑 Yeni Mafya Babası 00:00\'da belirlenecek.' : ''}`);
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
    if (!membership.intelRosterId) fail('failed-precondition', 'Polis Teşkilatı üyesi değilsin.');
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
    announceMgmt,
    refreshGangRoster,
    underVote,
    effRank,
    withEffRank,
    refreshIntelRoster,
    readIntelKasa,
    creditIntel,
    stateTx,
    intelStat,
    readBetStake,
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
    respectWeekOf,
    EMPTY_MEMBERSHIP,
    constants: { GANG, INTEL, TRADE_PRODUCTS, RANK_LABELS },
  };
}
