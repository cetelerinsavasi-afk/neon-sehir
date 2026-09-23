// MERKEZİ SAAT — çete sisteminin TÜM zaman tabanlı işleri burada.
//
// runClock(world): kaçırılmış her gün için sırayla runDailyTick(gün) çalışır
// (scheduler bir gün çalışmazsa ertesi çalışmada telafi edilir), ardından
// süresi dolan dağıtımlar iade edilir, savaş göstergeleri uzlaştırılır,
// dağılmış çetelerin temizliği yapılır.
//
// İDEMPOTENCY: ticks/{gün} kilidi (lease) aynı günün eşzamanlı iki kez
// işlenmesini engeller; ayrıca HER varlık kendi durum makinesiyle işlenir
// (ör. tır 'in_transit' + departDateKey==dün → transaction içinde
// doğrulanıp 'idle' yapılır). Tick yarıda kesilip tekrar çalışsa bile
// işlenmiş varlıklar ikinci kez etki üretmez.
import { GANG, INTEL, TRADE_PRODUCTS, MS_DAY, productById } from './config.js';
import { addDays, midnightMsOf, weekdayOfKey, daysBetweenKeys, dateKeyOf } from './time.js';
import { computeGangRanks, computeIntelRanks } from './ranks.js';

const LIVE_GRACE_MS = 45 * 1000; // canlıda 00:00'dan sonra geç kalan zar yazımları için tampon
const TICK_LEASE_MS = 9 * 60 * 1000;
const MAX_CATCHUP_DAYS = 40;

export function createClock(core, actions) {
  const { db, FV, ledger, gangLog, intelLog, notify } = core;
  const { wars: warActions, votes: voteActions, treasury, intel: intelActions } = actions;

  function tickCtx(worldId, world, dayKey) {
    const ctx = core.makeCtx(worldId, world, { actorId: 'system' });
    ctx.realNowVirtual = ctx.now;
    ctx.now = midnightMsOf(dayKey);
    ctx.dateKey = dayKey;
    ctx.hour = 0;
    ctx.slot = 0;
    ctx.weekday = weekdayOfKey(dayKey);
    return ctx;
  }

  async function safe(ctx, label, fn) {
    try {
      return await fn();
    } catch (err) {
      ctx.errors = ctx.errors || [];
      ctx.errors.push({ label, message: String(err?.message || err) });
      console.error('gang tick error', ctx.worldId, ctx.dateKey, label, err);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Kilit
  // ---------------------------------------------------------------------------
  async function acquireTick(ctx, dayKey) {
    const ref = ctx.ref.tick(dayKey);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const t = snap.data();
      const real = core.deps.realNow ? core.deps.realNow() : Date.now();
      if (t?.status === 'done') return 'done';
      if (t?.status === 'running' && t.leaseUntil > real) return 'busy';
      tx.set(ref, { status: 'running', leaseUntil: real + TICK_LEASE_MS, attempts: FV.increment(1), startedAt: real }, { merge: true });
      return 'acquired';
    });
  }

  // ---------------------------------------------------------------------------
  // 1) TIR SEFERLERİ: varış / sabotaj / operasyon
  // ---------------------------------------------------------------------------
  async function resolveTruckTrip(ctx, truckId, dayKey) {
    return db.runTransaction(async (tx) => {
      const truckSnap = await tx.get(ctx.ref.truck(truckId));
      const truck = truckSnap.data();
      if (!truck || truck.status !== 'in_transit' || truck.departDateKey !== dayKey) return { skipped: true };
      const defId = `def_${truckId}_${dayKey}`;
      const [cargoSnap, ownerGangSnap, defSnap] = await Promise.all([tx.get(ctx.ref.cargo(truckId)), tx.get(ctx.ref.gang(truck.gangId)), tx.get(ctx.ref.war(defId))]);
      const cargo = cargoSnap.data() || { items: {}, units: 0 };
      const orderSnap = cargo.orderId ? await tx.get(ctx.ref.order(cargo.orderId)) : null;
      const ownerAlive = ownerGangSnap.data()?.status === 'active';
      const def = defSnap.data() || null;
      const attackIds = def?.attackWarIds || [];
      const attacks = [];
      for (const id of attackIds) {
        const s = await tx.get(ctx.ref.war(id));
        if (s.exists) attacks.push({ id, ...s.data() });
      }
      const defShards = def ? await tx.get(ctx.ref.shards(defId)) : null;
      let defensePower = 0;
      defShards?.forEach((d) => (defensePower += Number(d.data().power || 0)));
      for (const a of attacks) {
        const sh = await tx.get(ctx.ref.shards(a.id));
        a.power = 0;
        sh.forEach((d) => {
          if (d.data().sideKey === 'attacker') a.power += Number(d.data().power || 0);
        });
      }
      // saldırgan çetelerin durumu (depoya ekleme / yer iadesi için)
      const attackerGangAlive = {};
      for (const a of attacks.filter((x) => x.type === 'sabotage')) {
        attackerGangAlive[a.attackerGangId] = (await tx.get(ctx.ref.gang(a.attackerGangId))).data()?.status === 'active';
      }
      const intelStateSnap = attacks.some((a) => a.type === 'intelop') ? await tx.get(ctx.ref.intelState()) : null;

      // --- karar: en güçlü AKTİF saldırı (haraç/rüşvet ödenenler düşer) savunmayla karşılaştırılır ---
      const live = attacks.filter((a) => a.status === 'active');
      live.sort((x, y) => y.power - x.power || x.createdAtMs - y.createdAtMs);
      const strongest = live[0] || null;
      const attackWon = Boolean(strongest && strongest.power > defensePower);
      let outcome = 'delivered';
      const units = Number(cargo.units || 0);
      const summary = Object.entries(cargo.items || {})
        .map(([k, q]) => `${q} × ${core.parseItemKey(k)?.label || k}`)
        .join(', ');

      // --- yazmalar ---
      if (ownerAlive && units) tx.set(ctx.ref.depot(truck.gangId), { reservedUnits: FV.increment(-units) }, { merge: true });
      if (attackWon && strongest.type === 'sabotage') {
        outcome = 'stolen';
        if (attackerGangAlive[strongest.attackerGangId]) {
          const upd = { usedUnits: FV.increment(units), reservedUnits: FV.increment(-Number(strongest.reservedUnits || 0)) };
          for (const [k, q] of Object.entries(cargo.items || {})) upd[`items.${k}`] = FV.increment(q);
          tx.update(ctx.ref.depot(strongest.attackerGangId), upd);
          core.announce(tx, ctx, strongest.attackerGangId, '🏴‍☠️', `TIR #${truck.code} sabotajı BAŞARILI — yük depoya alındı${summary ? `: ${summary}` : ''}.`);
        }
        if (ownerAlive) core.announce(tx, ctx, truck.gangId, '💥', `TIR #${truck.code} sabote edildi (${strongest.sides?.attacker?.name || ''}), yük çalındı. Tır geri döndü.`);
      } else if (attackWon && strongest.type === 'intelop') {
        outcome = 'destroyed';
        const reward = core.instantValueOf(cargo.items || {});
        if (reward > 0 && intelStateSnap?.exists) {
          tx.update(ctx.ref.intelState(), { kasa: FV.increment(reward) });
          ledger(tx, ctx, { type: 'intel_op_reward', amount: reward, from: { kind: 'system' }, to: { kind: 'intel', id: 'main' }, refId: strongest.id, actorId: 'system' });
        }
        core.announceIntel(tx, ctx, '🔥', `TIR #${truck.code} operasyonu BAŞARILI — yük imha edildi, ödül ${reward.toLocaleString('tr-TR')}.`);
        if (ownerAlive) core.announce(tx, ctx, truck.gangId, '🚨', `İstihbarat TIR #${truck.code} yükünü imha etti. Tır geri döndü.`);
        strongest.reward = reward;
      } else if (ownerAlive) {
        const upd = { usedUnits: FV.increment(units) };
        for (const [k, q] of Object.entries(cargo.items || {})) upd[`items.${k}`] = FV.increment(q);
        tx.update(ctx.ref.depot(truck.gangId), upd);
        core.announce(tx, ctx, truck.gangId, '✅', `TIR #${truck.code} depoya ulaştı${summary ? `: ${summary}` : ''}${live.length ? ' — savunma başarılı!' : '.'}`);
      } else {
        outcome = 'lost';
      }

      for (const a of attacks) {
        if (a.type === 'sabotage' && a.status === 'active') {
          const won = attackWon && strongest.id === a.id;
          if (!won && attackerGangAlive[a.attackerGangId]) {
            if (a.reservedUnits) tx.set(ctx.ref.depot(a.attackerGangId), { reservedUnits: FV.increment(-a.reservedUnits) }, { merge: true });
            core.announce(tx, ctx, a.attackerGangId, '🛡️', `TIR #${truck.code} saldırısı başarısız.`);
          }
        }
        if (a.type === 'intelop' && a.status === 'active' && !(attackWon && strongest.id === a.id)) {
          core.announceIntel(tx, ctx, '🛡️', `TIR #${truck.code} operasyonu başarısız.`);
        }
        const upd = { activeGangIds: [], resolvedAtMs: ctx.now };
        if (a.status === 'active') {
          upd.status = 'resolved';
          upd.result = { won: attackWon && strongest.id === a.id, attackPower: a.power, defensePower, reward: a.reward || 0 };
        }
        tx.update(ctx.ref.war(a.id), upd);
      }
      if (def) tx.update(ctx.ref.war(defId), { status: 'resolved', activeGangIds: [], resolvedAtMs: ctx.now, result: { outcome, defensePower } });
      if (orderSnap?.exists) tx.update(ctx.ref.order(cargo.orderId), { status: outcome, resolvedAtMs: ctx.now });

      const retired = !ownerAlive;
      tx.update(ctx.ref.truck(truckId), {
        status: retired ? 'retired' : 'idle',
        departDateKey: null,
        lastTrip: { dateKey: dayKey, outcome },
      });
      tx.delete(ctx.ref.cargo(truckId));
      if (retired) tx.delete(ctx.ref.truckCode(truck.code));
      ctx.logs.push({ gang: 'truck_trip', world: ctx.worldId, truckId, outcome });
      return { outcome };
    });
  }

  // 12:00 — tır sahibine (ve müttefiklerine) saldırılar duyurulur; o andan
  // itibaren savunma/haraç/rüşvet kartlarını görürler.
  async function announceAttacks(ctx) {
    if (ctx.hour < GANG.ATTACK_ANNOUNCE_HOUR) return;
    const snap = await ctx.ref.wars().where('type', '==', 'defense').where('dateKey', '==', ctx.dateKey).get();
    for (const d of snap.docs) {
      if (d.data().announced || d.data().status !== 'active') continue;
      await safe(ctx, `announce:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const def = (await tx.get(d.ref)).data();
          if (!def || def.announced || def.status !== 'active') return;
          const alSnap = await tx.get(ctx.ref.alliances().where('gangIds', 'array-contains', def.defenderGangId));
          const allies = alSnap.docs.map((x) => x.data()).filter((a) => ['active', 'ending'].includes(a.status)).map((a) => a.gangIds.find((g) => g !== def.defenderGangId));
          const attacks = [];
          for (const id of def.attackWarIds || []) {
            const s = await tx.get(ctx.ref.war(id));
            if (s.exists) attacks.push({ id, ...s.data() });
          }
          const defGang = (await tx.get(ctx.ref.gang(def.defenderGangId))).data();
          const add = [def.defenderGangId, ...allies];
          tx.update(d.ref, { announced: true, gangIds: FV.arrayUnion(...add), activeGangIds: FV.arrayUnion(...add) });
          const active = attacks.filter((a) => a.status === 'active');
          for (const a of active) tx.update(ctx.ref.war(a.id), { announced: true, gangIds: FV.arrayUnion(...add), activeGangIds: FV.arrayUnion(...add) });
          if (active.length === 0) return;
          const names = active.map((a) => (a.type === 'intelop' ? `🕵️ İstihbarat${a.bribe > 0 ? ` (rüşvet ${a.bribe.toLocaleString('tr-TR')})` : ''}` : `${a.sides?.attacker?.name || ''}${a.harac > 0 ? ` (haraç ${a.harac.toLocaleString('tr-TR')})` : ''}`));
          core.announce(tx, ctx, def.defenderGangId, '⚠️', `TIR #${def.truckCode} saldırı altında! ${names.join(', ')}. Savunma 12:00–24:00; haraç/rüşvet 18:00'e kadar.`);
          if (defGang?.babaId) notify(tx, ctx, defGang.babaId, `⚠️ TIR #${def.truckCode} saldırı altında! Savunmaya katıl.`, 'sabotage');
          const defName = def.sides?.[def.defenderGangId]?.name || '';
          for (const g of allies) core.announce(tx, ctx, g, '🛡️', `Müttefik ${defName} çetesinin TIR #${def.truckCode} tırı saldırı altında — savunmaya katılabilirsiniz.`);
        })
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2) BAHİSLİ SAVAŞ SONUCU
  // ---------------------------------------------------------------------------
  async function resolveBet(ctx, warId, dayKey) {
    const { totals } = await warActions.sumShards(ctx, warId);
    return db.runTransaction(async (tx) => {
      const war = (await tx.get(ctx.ref.war(warId))).data();
      if (!war || war.status !== 'active' || war.dateKey !== dayKey) return { skipped: true };
      const [a, b] = war.gangIds;
      const [ga, gb] = await Promise.all([tx.get(ctx.ref.gang(a)), tx.get(ctx.ref.gang(b))]);
      const aliveA = ga.data()?.status === 'active';
      const aliveB = gb.data()?.status === 'active';
      const pa = totals[a] || 0;
      const pb = totals[b] || 0;
      const pot = war.stake * 2;
      let winner = null;
      if (aliveA && !aliveB) winner = a;
      else if (aliveB && !aliveA) winner = b;
      else if (aliveA && aliveB && pa !== pb) winner = pa > pb ? a : b;
      if (winner) {
        tx.update(ctx.ref.gangState(winner), { kasa: FV.increment(pot) });
        ledger(tx, ctx, { type: 'bet_payout', amount: pot, from: { kind: 'escrow', id: warId }, to: { kind: 'gang', id: winner }, refId: warId, actorId: 'system' });
      } else {
        for (const [g, alive] of [[a, aliveA], [b, aliveB]]) {
          if (alive) tx.update(ctx.ref.gangState(g), { kasa: FV.increment(war.stake) });
          ledger(tx, ctx, { type: alive ? 'bet_refund' : 'bet_refund_burn', amount: war.stake, from: { kind: 'escrow', id: warId }, to: alive ? { kind: 'gang', id: g } : { kind: 'burn' }, refId: warId, actorId: 'system' });
        }
      }
      tx.update(ctx.ref.war(warId), { status: 'resolved', activeGangIds: [], resolvedAtMs: ctx.now, display: { [a]: pa, [b]: pb }, result: { winner, totals: { [a]: pa, [b]: pb }, pot } });
      for (const [g, alive] of [[a, aliveA], [b, aliveB]]) {
        if (!alive) continue;
        const txt = winner === g ? `🏆 Bahisli savaşı kazandınız! +${pot.toLocaleString('tr-TR')} kasaya.` : winner ? '☠️ Bahisli savaşı kaybettiniz.' : '🤝 Bahisli savaş berabere — bahisler iade edildi.';
        gangLog(tx, ctx, g, winner === g ? '🏆' : winner ? '☠️' : '🤝', txt);
      }
      ctx.logs.push({ gang: 'bet_resolved', world: ctx.worldId, warId, winner });
      return { winner };
    });
  }

  // ---------------------------------------------------------------------------
  // 3) PAZAR TİCARET YOLU SAVAŞI
  // ---------------------------------------------------------------------------
  function productForSunday(world, sundayKey) {
    const launch = world.launchDateKey || sundayKey;
    const wd = weekdayOfKey(launch);
    const firstSunday = addDays(launch, (7 - wd) % 7);
    const weeks = Math.max(0, Math.floor(daysBetweenKeys(firstSunday, sundayKey) / 7));
    return TRADE_PRODUCTS[weeks % TRADE_PRODUCTS.length];
  }

  async function createTradeWar(ctx, dayKey) {
    if (weekdayOfKey(dayKey) !== 0) return null;
    const warId = `trade_${dayKey}`;
    const product = productForSunday(ctx.world, dayKey);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ctx.ref.war(warId));
      if (snap.exists) return { skipped: true };
      tx.set(ctx.ref.war(warId), {
        type: 'trade',
        status: 'active',
        visibility: 'public',
        gangIds: [],
        activeGangIds: [],
        intelInvolved: true,
        product: product.id,
        productLabel: product.label,
        productEmoji: product.emoji,
        dateKey: dayKey,
        startsAtMs: midnightMsOf(dayKey),
        endsAtMs: midnightMsOf(addDays(dayKey, 1)),
        sides: {},
        display: {},
        createdAtMs: ctx.now,
      });
      return { warId };
    });
  }

  async function resolveTradeWar(ctx, dayKey) {
    const warId = `trade_${dayKey}`;
    const pre = await ctx.ref.war(warId).get();
    if (!pre.exists || pre.data().status !== 'active') return { skipped: true };
    const { totals } = await warActions.sumShards(ctx, warId);
    const entries = Object.entries(totals).filter(([, p]) => p > 0);
    entries.sort((x, y) => y[1] - x[1]);
    let winnerKey = entries[0]?.[0] || null;
    if (entries.length > 1 && entries[0][1] === entries[1][1]) {
      // beraberlik: aynı güce İLK ulaşan değil, ilk zar atan kazanır (deterministik)
      const tied = entries.filter(([, p]) => p === entries[0][1]).map(([k]) => k);
      const rolls = await ctx.ref.wars().doc(warId).collection('rolls').orderBy('atMs', 'asc').limit(500).get();
      winnerKey = rolls.docs.map((d) => d.data().sideKey).find((k) => tied.includes(k)) || tied.sort()[0];
    }
    const war = pre.data();
    return db.runTransaction(async (tx) => {
      const w = (await tx.get(ctx.ref.war(warId))).data();
      if (!w || w.status !== 'active') return { skipped: true };
      const routeRef = ctx.ref.route(war.product);
      const routeSnap = await tx.get(routeRef);
      const prev = routeSnap.data();
      let winnerGang = null;
      if (winnerKey && winnerKey !== 'intel') {
        const g = (await tx.get(ctx.ref.gang(winnerKey))).data();
        if (g?.status === 'active') winnerGang = { id: winnerKey, ...g };
      }
      const intelState = winnerKey === 'intel' ? await tx.get(ctx.ref.intelState()) : null;
      const prevGang = prev?.holderType === 'gang' ? (await tx.get(ctx.ref.gang(prev.holderId))).data() : null;
      const power = winnerKey ? totals[winnerKey] : 0;

      if (prev?.holderType === 'gang' && prevGang && (!winnerGang || prev.holderId !== winnerGang.id)) {
        tx.update(ctx.ref.gang(prev.holderId), { routeProducts: FV.arrayRemove(war.product) });
        if (prevGang.status === 'active') gangLog(tx, ctx, prev.holderId, '📉', `${war.productLabel} ticaret yolunu kaybettiniz.`);
      }
      if (winnerGang) {
        tx.set(routeRef, {
          product: war.product,
          holderType: 'gang',
          holderId: winnerGang.id,
          holderName: winnerGang.name,
          holderLogo: winnerGang.logo || null,
          sinceDateKey: addDays(dayKey, 1),
          untilDateKey: addDays(dayKey, 1 + GANG.ROUTE_HOLD_DAYS),
          powerUsed: power,
          dailyOrderLimit: Math.floor(power * GANG.TRADE_ORDER_LIMIT_RATIO),
          warId,
        });
        tx.update(ctx.ref.gang(winnerGang.id), { routeProducts: FV.arrayUnion(war.product) });
        gangLog(tx, ctx, winnerGang.id, '🛣️', `${war.productLabel} ticaret yolu sizin! Günlük sipariş limiti: ${Math.floor(power * GANG.TRADE_ORDER_LIMIT_RATIO).toLocaleString('tr-TR')}`);
      } else {
        tx.set(routeRef, { product: war.product, holderType: null, holderId: null, holderName: null, holderLogo: null, sinceDateKey: addDays(dayKey, 1), untilDateKey: null, powerUsed: 0, dailyOrderLimit: 0, warId, lastWinner: winnerKey === 'intel' ? 'intel' : null });
      }
      let intelIncome = 0;
      if (winnerKey === 'intel') {
        intelIncome = Math.floor(power * INTEL.WAR_WIN_KASA_RATIO);
        if (intelState?.exists && intelIncome > 0) {
          tx.update(ctx.ref.intelState(), { kasa: FV.increment(intelIncome) });
          ledger(tx, ctx, { type: 'intel_trade_war_win', amount: intelIncome, from: { kind: 'system' }, to: { kind: 'intel', id: 'main' }, refId: warId, actorId: 'system' });
        }
        intelLog(tx, ctx, '🏆', `Pazar savaşını İstihbarat kazandı! Yol kimseye verilmedi, kasaya +${intelIncome.toLocaleString('tr-TR')}.`);
      }
      tx.update(ctx.ref.war(warId), { status: 'resolved', resolvedAtMs: ctx.now, display: totals, result: { winnerKey, power, intelIncome } });
      ctx.logs.push({ gang: 'trade_war_resolved', world: ctx.worldId, warId, winnerKey, power });
      return { winnerKey, totals };
    });
  }

  // Çeteler listesi "son pazar savaşı gücüne" göre sıralanır → her çetenin
  // ve İstihbaratın son pazar gücü herkese açık belgeye yazılır (idempotent).
  async function recordSundayPowers(ctx, sundayKey) {
    const { totals } = await warActions.sumShards(ctx, `trade_${sundayKey}`);
    const gangs = await ctx.ref.gangs().where('status', '==', 'active').get();
    let batch = db.batch();
    let n = 0;
    for (const g of gangs.docs) {
      if (g.data().lastSundayDateKey === sundayKey) continue;
      batch.update(g.ref, { lastSundayPower: Number(totals[g.id] || 0), lastSundayDateKey: sundayKey });
      n += 1;
      if (n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (n % 400 !== 0) await batch.commit();
    await ctx.ref.intel().set({ lastSundayPower: Number(totals.intel || 0), lastSundayDateKey: sundayKey }, { merge: true });
  }

  // ---------------------------------------------------------------------------
  // 4) OYLAMA SONUCU (çete bazında)
  // ---------------------------------------------------------------------------
  async function resolveVote(ctx, gangId, voteId) {
    return db.runTransaction(async (tx) => {
      const voteRef = ctx.ref.votes(gangId).doc(voteId);
      const vote = (await tx.get(voteRef)).data();
      if (!vote || vote.status !== 'active' || vote.endsAtMs > ctx.now) return { skipped: true };
      const gang = (await tx.get(ctx.ref.gang(gangId))).data();
      const [initSnap, targetSnap] = await Promise.all([tx.get(ctx.ref.member(gangId, vote.initiatorId)), tx.get(ctx.ref.member(gangId, vote.targetId))]);
      const { passed, ratio } = voteActions.voteOutcome(vote);
      const initiator = initSnap.data();
      const target = targetSnap.data();
      const result = { passed, ratio, yes: vote.yes || 0, no: vote.no || 0 };
      if (gang?.status !== 'active' || !initiator || !target) {
        tx.update(voteRef, { status: 'cancelled', cancelReason: 'member_left', resolvedAtMs: ctx.now, result });
        return { cancelled: true };
      }
      const pct = `%${Math.round(ratio * 100)}`;
      if (vote.type === 'kick' && (target.rank === 'baba' || gang.babaId === vote.targetId)) {
        // Oylama sürerken hedef Mafya Babası olduysa (ör. ayaklanma) çıkarma oylaması düşer.
        tx.update(voteRef, { status: 'cancelled', cancelReason: 'target_is_baba', resolvedAtMs: ctx.now, result });
        return { cancelled: true };
      }
      if (vote.type === 'kick') {
        if (passed) {
          const plan = await core.planRemoval(tx, ctx, gangId, vote.targetId, { gangSnapData: gang });
          core.applyRemoval(tx, ctx, plan, 'vote_kick', { notifyText: `🗳️ Oylama sonucu ${gang.name} çetesinden çıkarıldın (${pct}).` });
        }
        tx.update(voteRef, { status: 'resolved', resolvedAtMs: ctx.now, result });
        core.announce(tx, ctx, gangId, '🗳️', passed ? `${vote.targetName} oylamayla çeteden çıkarıldı (${pct}).` : `${vote.targetName} için çıkarma oylaması reddedildi (${pct}).`);
        return result;
      }
      // devirme / ayaklanma
      if (target.rank !== 'baba' || gang.babaId !== vote.targetId) {
        tx.update(voteRef, { status: 'cancelled', cancelReason: 'baba_changed', resolvedAtMs: ctx.now, result });
        return { cancelled: true };
      }
      const challengerMembership = await core.readMembership(tx, ctx, vote.initiatorId);
      if (passed) {
        let removalPlan = null;
        if (vote.type === 'devirme') {
          removalPlan = await core.planRemoval(tx, ctx, gangId, vote.targetId, { gangSnapData: gang });
          removalPlan.member = { ...removalPlan.member, rank: 'deposed' }; // halef seçimi YOK — kazanan aday belli
          removalPlan.votes = (removalPlan.votes || []).filter((v) => v.id !== voteId);
        }
        // yazmalar
        tx.update(ctx.ref.member(gangId, vote.initiatorId), { rank: 'baba' });
        const cUpd = { gangRank: 'baba' };
        if (challengerMembership.intelRosterId) {
          cUpd.intelDecisionGangId = gangId;
          cUpd.intelDecisionDeadline = addDays(ctx.dateKey, 1);
        }
        tx.set(ctx.ref.membership(vote.initiatorId), cUpd, { merge: true });
        tx.update(ctx.ref.gang(gangId), { babaId: vote.initiatorId, babaName: initiator.name });
        if (removalPlan) {
          core.applyRemoval(tx, ctx, removalPlan, 'devirme_lost', { notifyText: `🗳️ Devirme oylamasını kaybettin ve ${gang.name} çetesinden çıkarıldın.` });
        } else {
          tx.update(ctx.ref.member(gangId, vote.targetId), { rank: 'sagkol' });
          tx.set(ctx.ref.membership(vote.targetId), { gangRank: 'sagkol' }, { merge: true });
          notify(tx, ctx, vote.targetId, `🔥 Ayaklanma başarılı oldu — Mafya Babalığından alındın.`, 'vote');
        }
        notify(tx, ctx, vote.initiatorId, `👑 ${gang.name} çetesinin yeni Mafya Babası sensin (${pct}).`, 'vote');
        core.announce(tx, ctx, gangId, '👑', `${vote.type === 'devirme' ? 'Devirme' : 'Ayaklanma'} başarılı: ${initiator.name} yeni Mafya Babası (${pct}).`);
      } else if (vote.type === 'devirme' || GANG.AYAKLANMA_FAIL_KICKS_INITIATOR) {
        // Devirme: kazanan Baba kalır, diğer aday (başlatan) çeteden atılır.
        const plan = await core.planRemoval(tx, ctx, gangId, vote.initiatorId, { gangSnapData: gang });
        plan.votes = (plan.votes || []).filter((v) => v.id !== voteId);
        core.applyRemoval(tx, ctx, plan, `${vote.type}_failed`, { notifyText: `🗳️ ${vote.type === 'devirme' ? 'Devirme' : 'Ayaklanma'} yeterli desteği alamadı (${pct}) — çeteden çıkarıldın.` });
        core.announce(tx, ctx, gangId, '🪦', `${vote.type === 'devirme' ? 'Devirme' : 'Ayaklanma'} başarısız (${pct}): ${initiator.name} çeteden çıkarıldı.`);
      } else {
        // Ayaklanma başarısız: hiçbir şey değişmez.
        core.announce(tx, ctx, gangId, '🗳️', `Ayaklanma yeterli desteği alamadı (${pct}) — Mafya Babası yerinde.`);
      }
      tx.update(voteRef, { status: 'resolved', resolvedAtMs: ctx.now, result });
      ctx.logs.push({ gang: 'vote_resolved', world: ctx.worldId, gangId, voteId, type: vote.type, passed });
      return result;
    });
  }

  async function startPendingVotes(ctx, gangId) {
    return db.runTransaction(async (tx) => {
      const [pendSnap, membersSnap, gangSnap, activeSnap] = await Promise.all([
        tx.get(ctx.ref.pending(gangId).where('status', '==', 'pending')),
        tx.get(ctx.ref.members(gangId)),
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.votes(gangId).where('status', '==', 'active')),
      ]);
      const gang = gangSnap.data();
      if (gang?.status !== 'active') return { skipped: true };
      const members = new Map(membersSnap.docs.map((d) => [d.id, d.data()]));
      const baba = members.get(gang.babaId);
      const voters = [...members.entries()].filter(([, m]) => ['baba', 'sagkol', 'kidemli'].includes(m.rank));
      const voterIds = voters.map(([id]) => id);
      const voterStint = Object.fromEntries(voters.map(([id, m]) => [id, m.stint || null]));
      let leadershipTaken = activeSnap.docs.some((d) => d.data().type !== 'kick');
      const kickTargets = new Set(activeSnap.docs.filter((d) => d.data().type === 'kick').map((d) => d.data().targetId));
      const pend = pendSnap.docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() })).filter((p) => p.requestedAtMs < ctx.now);
      pend.sort((a, b) => a.requestedAtMs - b.requestedAtMs);
      let started = 0;
      for (const p of pend) {
        const ini = members.get(p.initiatorId);
        let valid = Boolean(ini);
        if (valid && p.type === 'kick') {
          const t = members.get(p.targetId);
          valid = Boolean(t) && voteActions.kickAllowed(ini.rank, t.rank) && !kickTargets.has(p.targetId);
        } else if (valid) {
          valid = ini.rank === 'sagkol' && !leadershipTaken && Boolean(baba) && p.targetId === gang.babaId;
          if (valid && p.type === 'devirme') valid = (ini.prestige || 0) > (baba.prestige || 0);
        }
        if (!valid) {
          // Şartlar sağlanmıyor → SESSİZCE iptal (bildirim yok)
          tx.update(p.ref, { status: 'cancelled', cancelReason: 'invalid_at_midnight' });
          continue;
        }
        if (p.type !== 'kick') leadershipTaken = true;
        else kickTargets.add(p.targetId);
        const voteRef = ctx.ref.votes(gangId).doc();
        tx.set(voteRef, {
          type: p.type,
          status: 'active',
          initiatorId: p.initiatorId,
          initiatorName: ini.name,
          targetId: p.targetId,
          targetName: members.get(p.targetId)?.name || p.targetName,
          voterIds,
          voterStint,
          yes: 0,
          no: 0,
          votedCount: 0,
          startDateKey: ctx.dateKey,
          startsAtMs: ctx.now,
          endsAtMs: midnightMsOf(addDays(ctx.dateKey, 1)),
        });
        tx.update(p.ref, { status: 'started', voteId: voteRef.id, startDateKey: ctx.dateKey });
        started += 1;
        const label = p.type === 'devirme' ? 'Devirme' : p.type === 'ayaklanma' ? 'Ayaklanma' : 'Çıkarma';
        for (const id of voterIds) notify(tx, ctx, id, `🗳️ ${label} oylaması başladı (${gang.name}). 24 saat içinde oyunu kullan.`, 'vote');
      }
      return { started };
    });
  }

  // ---------------------------------------------------------------------------
  // Aktiflik + rütbe + kasa anlık görüntüsü (çete bazında)
  // ---------------------------------------------------------------------------
  async function processInactivity(ctx, gangId) {
    const snap = await ctx.ref.members(gangId).get();
    const midnight = ctx.now;
    const toRemove = [];
    const batch = db.batch();
    let writes = 0;
    // Aktiflik = SADECE savaşa katılım (zar atma). lastActiveAtMs katılmada ve
    // her zar atışında güncellenir. Mafya Babası da muaf DEĞİL: atılırsa en
    // yüksek prestijli üye Baba olur; kimse kalmazsa çete kapanır.
    for (const d of snap.docs) {
      const m = d.data();
      const last = Number(m.lastActiveAtMs || m.joinedAtMs || midnight);
      const days = Math.floor((midnight - last) / MS_DAY);
      if (days >= GANG.INACTIVE_REMOVE_DAYS) toRemove.push({ id: d.id, name: m.name, lastActiveAtMs: last, isBaba: m.rank === 'baba' });
      else if (days >= GANG.INACTIVE_WARN_DAYS && !m.inactiveWarn) {
        batch.update(d.ref, { inactiveWarn: true });
        writes += 1;
      }
    }
    if (writes > 0) await safe(ctx, `inactive-warn:${gangId}`, () => batch.commit());
    // Baba en son: halef, aktif kalan üyeler arasından seçilsin
    toRemove.sort((a, b) => Number(a.isBaba) - Number(b.isBaba));
    for (const r of toRemove) {
      await safe(ctx, `inactive-remove:${gangId}:${r.id}`, () =>
        db.runTransaction(async (tx) => {
          const plan = await core.planRemoval(tx, ctx, gangId, r.id);
          if (!plan.member) return;
          const last = Number(plan.member.lastActiveAtMs || plan.member.joinedAtMs || ctx.now);
          if (Math.floor((ctx.now - last) / MS_DAY) < GANG.INACTIVE_REMOVE_DAYS) return; // bu arada savaşa katıldı
          const res = core.applyRemoval(tx, ctx, plan, 'inactive', { notifyText: `💤 ${GANG.INACTIVE_REMOVE_DAYS} gündür hiçbir savaşa katılmadığın için ${plan.gang?.name || 'çete'} üyeliğin sona erdi.` });
          if (!res.dissolved) core.announce(tx, ctx, gangId, '💤', `${plan.member.name} ${GANG.INACTIVE_REMOVE_DAYS} gündür savaşa katılmadığı için çeteden çıkarıldı.`);
        })
      );
    }
  }

  async function recomputeGangRanks(ctx, gangId) {
    return db.runTransaction(async (tx) => {
      const [gangSnap, membersSnap] = await Promise.all([tx.get(ctx.ref.gang(gangId)), tx.get(ctx.ref.members(gangId))]);
      const gang = gangSnap.data();
      if (gang?.status !== 'active') return { skipped: true };
      const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const ranks = computeGangRanks(members, gang.babaId);
      const changed = members.filter((m) => ranks[m.id] !== m.rank);
      for (const m of changed) {
        tx.update(ctx.ref.member(gangId, m.id), { rank: ranks[m.id] });
        tx.set(ctx.ref.membership(m.id), { gangRank: ranks[m.id] }, { merge: true });
        const up = ['baba', 'sagkol', 'kidemli', 'tetikci', 'comez'].indexOf(ranks[m.id]) < ['baba', 'sagkol', 'kidemli', 'tetikci', 'comez'].indexOf(m.rank);
        notify(tx, ctx, m.id, `${up ? '⬆️' : '⬇️'} ${gang.name}: yeni rütben ${core.constants?.RANK_LABELS?.[ranks[m.id]] || ranks[m.id]}.`, 'rank');
      }
      ctx.logs.push({ gang: 'rank_recompute', world: ctx.worldId, gangId, changed: changed.length });
      return { changed: changed.length };
    });
  }

  async function snapshotKasa(ctx, stateRef) {
    return db.runTransaction(async (tx) => {
      const s = await tx.get(stateRef);
      if (!s.exists || s.data().midnightDateKey === ctx.dateKey) return { skipped: true };
      const kasa = Number(s.data().kasa || 0);
      tx.update(stateRef, { kasaAtMidnight: kasa, distributableLeft: Math.floor(kasa * GANG.DISTRIBUTABLE_RATIO), midnightDateKey: ctx.dateKey });
      return { kasa };
    });
  }

  async function recomputeIntelRanks(ctx) {
    const rosterSnap = await ctx.ref.rosterCol().get();
    if (rosterSnap.empty) {
      await ctx.ref.intel().set({ baskanCode: null }, { merge: true });
      return;
    }
    const roster = rosterSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ranks = computeIntelRanks(roster);
    // Çeteler listesindeki İstihbarat kartı için Başkanın KOD ADI (kimlik değil)
    const baskan = roster.find((r) => ranks[r.id] === 'baskan');
    await ctx.ref.intel().set({ baskanCode: baskan?.codeName || null }, { merge: true });
    const changed = roster.filter((r) => ranks[r.id] !== r.rank);
    for (const r of changed) {
      await safe(ctx, `intel-rank:${r.id}`, () =>
        db.runTransaction(async (tx) => {
          const [rs, link] = await Promise.all([tx.get(ctx.ref.roster(r.id)), tx.get(intelActions.linkRef(ctx, r.id))]);
          if (!rs.exists) return;
          tx.update(ctx.ref.roster(r.id), { rank: ranks[r.id] });
          const actorId = link.data()?.actorId;
          if (actorId) {
            tx.set(ctx.ref.membership(actorId), { intelRank: ranks[r.id] }, { merge: true });
            notify(tx, ctx, actorId, `🕵️ İstihbarat rütben: ${core.constants?.RANK_LABELS?.[ranks[r.id]] || ranks[r.id]}.`, 'rank');
          }
        })
      );
    }
  }

  // İstihbarat üyesi Baba karar süresi doldu → sessizce İstihbarattan çıkar.
  async function processIntelDecisions(ctx) {
    const snap = await ctx.ref.memberships().where('intelDecisionDeadline', '<=', ctx.dateKey).get();
    for (const d of snap.docs) {
      await safe(ctx, `intel-decision:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const m = await core.readMembership(tx, ctx, d.id);
          if (!m.intelDecisionDeadline || m.intelDecisionDeadline > ctx.dateKey) return;
          if (!m.intelRosterId) {
            tx.set(ctx.ref.membership(d.id), { intelDecisionGangId: null, intelDecisionDeadline: null }, { merge: true });
            return;
          }
          const plan = await intelActions.planIntelLeave(tx, { ...ctx, actorId: d.id }, m);
          intelActions.applyIntelLeave(tx, ctx, plan, { actorId: d.id });
        })
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Bahis teklif zaman aşımı / başlatma, ittifak geçişleri, tır kalkışı
  // ---------------------------------------------------------------------------
  async function expireBetOffers(ctx) {
    const snap = await ctx.ref.wars().where('type', '==', 'bet').where('status', '==', 'offered').get();
    for (const d of snap.docs) {
      if (d.data().offeredDateKey >= ctx.dateKey) continue;
      await safe(ctx, `bet-expire:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const w = (await tx.get(d.ref)).data();
          if (!w || w.status !== 'offered' || w.offeredDateKey >= ctx.dateKey) return;
          const alive = (await tx.get(ctx.ref.gang(w.proposerGangId))).data()?.status === 'active';
          if (alive) tx.update(ctx.ref.gangState(w.proposerGangId), { kasa: FV.increment(w.stake) });
          tx.update(d.ref, { status: 'expired', activeGangIds: [], resolvedAtMs: ctx.now });
          ledger(tx, ctx, { type: alive ? 'bet_refund' : 'bet_refund_burn', amount: w.stake, from: { kind: 'escrow', id: d.id }, to: alive ? { kind: 'gang', id: w.proposerGangId } : { kind: 'burn' }, refId: d.id, actorId: 'system' });
          if (alive) gangLog(tx, ctx, w.proposerGangId, '⌛', `Bahis teklifi cevapsız kaldı, ${w.stake.toLocaleString('tr-TR')} kasaya döndü.`);
        })
      );
    }
  }

  async function startBets(ctx) {
    const snap = await ctx.ref.wars().where('type', '==', 'bet').where('status', '==', 'accepted').get();
    for (const d of snap.docs) {
      if (d.data().dateKey > ctx.dateKey) continue;
      await safe(ctx, `bet-start:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const w = (await tx.get(d.ref)).data();
          if (!w || w.status !== 'accepted' || w.dateKey > ctx.dateKey) return;
          const [a, b] = w.gangIds;
          const [ga, gb] = await Promise.all([tx.get(ctx.ref.gang(a)), tx.get(ctx.ref.gang(b))]);
          const aliveA = ga.data()?.status === 'active';
          const aliveB = gb.data()?.status === 'active';
          if (w.dateKey < ctx.dateKey || !aliveA || !aliveB) {
            // başlayamadı (kaçırılmış gün ya da taraf dağıldı) → iade
            for (const [g, alive] of [[a, aliveA], [b, aliveB]]) {
              if (alive) tx.update(ctx.ref.gangState(g), { kasa: FV.increment(w.stake) });
              ledger(tx, ctx, { type: alive ? 'bet_refund' : 'bet_refund_burn', amount: w.stake, from: { kind: 'escrow', id: d.id }, to: alive ? { kind: 'gang', id: g } : { kind: 'burn' }, refId: d.id, actorId: 'system' });
            }
            tx.update(d.ref, { status: 'cancelled', activeGangIds: [], resolvedAtMs: ctx.now });
            return;
          }
          tx.update(d.ref, { status: 'active', visibility: 'public', startsAtMs: midnightMsOf(ctx.dateKey), endsAtMs: midnightMsOf(addDays(ctx.dateKey, 1)) });
          gangLog(tx, ctx, a, '⚔️', `Bahisli savaş başladı: ${w.sides[b]?.name}`);
          gangLog(tx, ctx, b, '⚔️', `Bahisli savaş başladı: ${w.sides[a]?.name}`);
        })
      );
    }
  }

  async function processAlliances(ctx) {
    const [acc, ending] = await Promise.all([
      ctx.ref.alliances().where('status', '==', 'accepted').get(),
      ctx.ref.alliances().where('status', '==', 'ending').get(),
    ]);
    for (const d of acc.docs) {
      if (d.data().startDateKey > ctx.dateKey) continue;
      await safe(ctx, `alliance-start:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const a = (await tx.get(d.ref)).data();
          if (a?.status !== 'accepted' || a.startDateKey > ctx.dateKey) return;
          tx.update(d.ref, { status: 'active', activeSinceDateKey: ctx.dateKey });
          for (const g of a.gangIds) gangLog(tx, ctx, g, '🤝', `İttifak aktif: ${a.names[a.gangIds.find((x) => x !== g)]}`);
        })
      );
    }
    for (const d of ending.docs) {
      if (d.data().endDateKey > ctx.dateKey) continue;
      await safe(ctx, `alliance-end:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const a = (await tx.get(d.ref)).data();
          if (a?.status !== 'ending' || a.endDateKey > ctx.dateKey) return;
          tx.update(d.ref, { status: 'ended', endedAtMs: ctx.now });
          for (const g of a.gangIds) gangLog(tx, ctx, g, '💔', `İttifak sona erdi: ${a.names[a.gangIds.find((x) => x !== g)]}`);
        })
      );
    }
  }

  // Tır kalkışı: önce ömrü dolan boştaki tırlar hurdaya, sonra bekleyen
  // siparişler (dünkü) yola çıkar. Sipariş yükü tırın cargo/main belgesine
  // kopyalanır (içerik sadece çetenin Kıdemli+ üyelerine görünür).
  async function departTrucks(ctx) {
    const idle = await ctx.ref.trucks().where('status', '==', 'idle').get();
    for (const d of idle.docs) {
      if (!d.data().expiresDateKey || d.data().expiresDateKey > ctx.dateKey) continue;
      await safe(ctx, `truck-retire:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const t = (await tx.get(d.ref)).data();
          if (t?.status !== 'idle' || t.expiresDateKey > ctx.dateKey) return;
          tx.update(d.ref, { status: 'retired', retiredDateKey: ctx.dateKey });
          tx.delete(ctx.ref.truckCode(t.code));
          core.announce(tx, ctx, t.gangId, '🪦', `TIR #${t.code} ömrünü doldurdu ve hurdaya çıktı.`);
        })
      );
    }
    const orders = await ctx.ref.orders().where('status', '==', 'pending').get();
    for (const o of orders.docs) {
      if (o.data().departDateKey > ctx.dateKey) continue;
      await safe(ctx, `truck-depart:${o.id}`, () =>
        db.runTransaction(async (tx) => {
          const order = (await tx.get(o.ref)).data();
          if (order?.status !== 'pending' || order.departDateKey > ctx.dateKey) return;
          const [tSnap, gSnap] = await Promise.all([tx.get(ctx.ref.truck(order.truckId)), tx.get(ctx.ref.gang(order.gangId))]);
          const t = tSnap.data();
          if (gSnap.data()?.status !== 'active') {
            tx.update(o.ref, { status: 'cancelled', cancelReason: 'gang_gone' });
            return;
          }
          if (!t || t.status === 'retired') {
            // olağan dışı: tır yok → para ve depo yeri iade
            tx.update(ctx.ref.gangState(order.gangId), { kasa: FV.increment(order.cost || 0) });
            tx.update(ctx.ref.depot(order.gangId), { reservedUnits: FV.increment(-(order.units || 0)) });
            tx.update(o.ref, { status: 'cancelled', cancelReason: 'truck_gone' });
            ledger(tx, ctx, { type: 'trade_order_refund', amount: order.cost || 0, from: { kind: 'burn' }, to: { kind: 'gang', id: order.gangId }, refId: o.id, actorId: 'system' });
            return;
          }
          if (t.status !== 'idle') return; // önceki sefer henüz çözülmedi → bir sonraki çalıştırmada
          tx.update(tSnap.ref, { status: 'in_transit', departDateKey: ctx.dateKey });
          tx.set(ctx.ref.cargo(order.truckId), { items: order.items, product: order.product, units: order.units, cost: order.cost, orderId: o.id, loadedBy: order.createdByName, departDateKey: ctx.dateKey });
          tx.update(o.ref, { status: 'in_transit', departedDateKey: ctx.dateKey });
          core.announce(tx, ctx, order.gangId, '🚛', `TIR #${t.code} yola çıktı — yarın 00:00'da varacak.`);
        })
      );
    }
  }

  // Ticaret yolunun 21 günü dolunca (yeni savaşta kimse almadıysa) boşa çıkar.
  async function expireRoutes(ctx) {
    const snap = await ctx.ref.routes().get();
    for (const d of snap.docs) {
      const r = d.data();
      if (!r.holderId || !r.untilDateKey || r.untilDateKey > ctx.dateKey) continue;
      await safe(ctx, `route-expire:${d.id}`, () =>
        db.runTransaction(async (tx) => {
          const cur = (await tx.get(d.ref)).data();
          if (!cur?.holderId || !cur.untilDateKey || cur.untilDateKey > ctx.dateKey) return;
          const g = cur.holderType === 'gang' ? (await tx.get(ctx.ref.gang(cur.holderId))).data() : null;
          tx.update(d.ref, { holderType: null, holderId: null, holderName: null, holderLogo: null, dailyOrderLimit: 0, untilDateKey: null });
          if (g) {
            tx.update(ctx.ref.gang(cur.holderId), { routeProducts: FV.arrayRemove(d.id) });
            if (g.status === 'active') core.announce(tx, ctx, cur.holderId, '⌛', `${productById(d.id)?.label || d.id} ticaret yolunun 21 günü doldu.`);
          }
        })
      );
    }
  }

  // ---------------------------------------------------------------------------
  // GÜNLÜK TICK — sıra önemlidir (bkz. docs)
  // ---------------------------------------------------------------------------
  async function runDailyTick(worldId, world, dayKey) {
    const ctx = tickCtx(worldId, world, dayKey);
    const lock = await acquireTick(ctx, dayKey);
    if (lock !== 'acquired') return { dayKey, lock };
    const prev = addDays(dayKey, -1);
    ctx.logs.push({ gang: 'tick_start', world: worldId, dayKey });

    // 1) dünkü seferler
    const trucks = await ctx.ref.trucks().where('status', '==', 'in_transit').get();
    for (const d of trucks.docs) {
      if (d.data().departDateKey >= dayKey) continue;
      await safe(ctx, `trip:${d.id}`, () => resolveTruckTrip(ctx, d.id, d.data().departDateKey));
    }
    // 2) biten bahisli savaşlar
    const bets = await ctx.ref.wars().where('type', '==', 'bet').where('status', '==', 'active').get();
    for (const d of bets.docs) {
      if (d.data().dateKey >= dayKey) continue;
      await safe(ctx, `bet:${d.id}`, () => resolveBet(ctx, d.id, d.data().dateKey));
    }
    // 3) ticaret yolu savaşı (dün pazar ise)
    const trades = await ctx.ref.wars().where('type', '==', 'trade').where('status', '==', 'active').get();
    for (const d of trades.docs) {
      if (d.data().dateKey >= dayKey) continue;
      await safe(ctx, `trade:${d.id}`, () => resolveTradeWar(ctx, d.data().dateKey));
      await safe(ctx, `sunday-power:${d.id}`, () => recordSundayPowers(ctx, d.data().dateKey));
    }
    await safe(ctx, 'routes-expire', () => expireRoutes(ctx));
    // 4–5) İstihbarat-Baba karar süresi, bahis teklif zaman aşımı, ittifaklar
    await safe(ctx, 'intel-decisions', () => processIntelDecisions(ctx));
    await safe(ctx, 'bet-offers', () => expireBetOffers(ctx));
    await safe(ctx, 'alliances', () => processAlliances(ctx));

    // 6) çete bazında: oylama sonucu → aktiflik → rütbe → yeni oylamalar → kasa
    const gangs = await ctx.ref.gangs().where('status', '==', 'active').get();
    for (const g of gangs.docs) {
      const gangId = g.id;
      const votes = await ctx.ref.votes(gangId).where('status', '==', 'active').get();
      // Belirlilik: önce çıkarma oylamaları, sonra liderlik (devirme/ayaklanma); aynı türde başlangıç sırası.
      const ordered = [...votes.docs].sort((a, b) => Number(a.data().type !== 'kick') - Number(b.data().type !== 'kick') || (a.data().startsAtMs || 0) - (b.data().startsAtMs || 0) || (a.id < b.id ? -1 : 1));
      for (const v of ordered) {
        if (v.data().endsAtMs > ctx.now) continue;
        await safe(ctx, `vote:${gangId}:${v.id}`, () => resolveVote(ctx, gangId, v.id));
      }
      await safe(ctx, `inactivity:${gangId}`, () => processInactivity(ctx, gangId));
      await safe(ctx, `ranks:${gangId}`, () => recomputeGangRanks(ctx, gangId));
      await safe(ctx, `pending-votes:${gangId}`, () => startPendingVotes(ctx, gangId));
      await safe(ctx, `kasa:${gangId}`, () => snapshotKasa(ctx, ctx.ref.gangState(gangId)));
    }
    // 7) İstihbarat: rütbe + kasa
    await safe(ctx, 'intel-votes', () => intelActions.resolveIntelVotes(ctx, safe));
    await safe(ctx, 'intel-ranks', () => recomputeIntelRanks(ctx));
    await safe(ctx, 'intel-pending-votes', () => intelActions.startIntelPendingVotes(ctx));
    await safe(ctx, 'intel-kasa', () => snapshotKasa(ctx, ctx.ref.intelState()));

    // 8) bugünün başlangıçları
    await safe(ctx, 'bet-start', () => startBets(ctx));
    await safe(ctx, 'trade-war', () => createTradeWar(ctx, dayKey));
    await safe(ctx, 'trucks-depart', () => departTrucks(ctx));

    const ok = !(ctx.errors && ctx.errors.length);
    await ctx.ref.tick(dayKey).set(
      { status: ok ? 'done' : 'failed', leaseUntil: 0, finishedAtMs: Date.now(), errors: ctx.errors || [], prev },
      { merge: true }
    );
    if (ok) {
      await db.runTransaction(async (tx) => {
        const w = await tx.get(ctx.ref.world());
        if ((w.data()?.lastTickDateKey || '') < dayKey) tx.set(ctx.ref.world(), { lastTickDateKey: dayKey }, { merge: true });
      });
    }
    ctx.logs.push({ gang: 'tick_done', world: worldId, dayKey, ok, errors: ctx.errors?.length || 0 });
    core.flushLogs(ctx);
    return { dayKey, ok, errors: ctx.errors || [] };
  }

  // ---------------------------------------------------------------------------
  // Dağılmış çete temizliği (idempotent; parça parça)
  // ---------------------------------------------------------------------------
  async function cleanupGang(ctx, gangId) {
    const gangSnap = await ctx.ref.gang(gangId).get();
    const gang = gangSnap.data();
    if (!gang || gang.status !== 'disbanded' || gang.cleanupDone) return { skipped: true };
    const takedown = gang.dissolvedReason === 'intel_takedown';
    // üyeler
    const members = await ctx.ref.members(gangId).get();
    for (const m of members.docs) {
      await safe(ctx, `cleanup-member:${m.id}`, () =>
        db.runTransaction(async (tx) => {
          const ms = await core.readMembership(tx, ctx, m.id);
          const mem = await tx.get(m.ref);
          if (!mem.exists) return;
          tx.delete(m.ref);
          if (ms.gangId === gangId) {
            tx.set(ctx.ref.membership(m.id), { gangId: null, gangRank: null, gangJoinedAtMs: null, ...(ms.intelDecisionGangId === gangId ? { intelDecisionGangId: null, intelDecisionDeadline: null } : {}) }, { merge: true });
          }
          notify(tx, ctx, m.id, takedown ? `🕵️ Çeteniz (${gang.name}) İstihbarat tarafından ele geçirildi ve dağıtıldı.` : `🏚️ ${gang.name} çetesi dağıldı.`, 'dissolved');
        })
      );
    }
    // açık dağıtım havuzları → önce kasaya iade (sonra kasa işlemine girer)
    const dists = await ctx.ref.distributions().where('orgId', '==', gangId).get();
    for (const d of dists.docs) {
      if (d.data().status !== 'open') continue;
      await safe(ctx, `cleanup-dist:${d.id}`, async () => {
        await d.ref.update({ expiresAtMs: Math.min(d.data().expiresAtMs, ctx.now) });
        await treasury.expireDistribution(ctx, d.id, { refundToDisbanded: true });
      });
    }
    // kasa → İstihbarata teslim edildiyse İstihbarat kasasına, değilse yakılır
    await safe(ctx, `cleanup-kasa:${gangId}`, () =>
      db.runTransaction(async (tx) => {
        const [s, intelSt] = await Promise.all([tx.get(ctx.ref.gangState(gangId)), takedown ? tx.get(ctx.ref.intelState()) : null]);
        const kasa = Number(s.data()?.kasa || 0);
        if (!s.exists || kasa <= 0) return;
        tx.update(ctx.ref.gangState(gangId), { kasa: 0 });
        if (takedown && intelSt?.exists) {
          tx.update(ctx.ref.intelState(), { kasa: FV.increment(kasa) });
          ledger(tx, ctx, { type: 'gang_takedown_to_intel', amount: kasa, from: { kind: 'gang', id: gangId }, to: { kind: 'intel', id: 'main' }, refId: gangId, actorId: 'system' });
          core.announceIntel(tx, ctx, '💰', `${gang.name} çetesinin kasası (${kasa.toLocaleString('tr-TR')}) İstihbarat kasasına geçti.`);
        } else {
          ledger(tx, ctx, { type: 'gang_dissolved_burn', amount: kasa, from: { kind: 'gang', id: gangId }, to: { kind: 'burn' }, refId: gangId, actorId: 'system' });
        }
      })
    );
    await safe(ctx, `cleanup-depot:${gangId}`, () => ctx.ref.depot(gangId).set({ items: {}, capacity: 0, usedUnits: 0, reservedUnits: 0 }));
    // boştaki tırlar hurda (yoldakiler varışta kaybolur); bekleyen siparişler iptal
    const trucks = await ctx.ref.trucks().where('gangId', '==', gangId).get();
    for (const t of trucks.docs) {
      if (t.data().status !== 'idle') continue;
      await safe(ctx, `cleanup-truck:${t.id}`, () =>
        db.runTransaction(async (tx) => {
          const tr = (await tx.get(t.ref)).data();
          if (tr?.status !== 'idle') return;
          tx.update(t.ref, { status: 'retired' });
          tx.delete(ctx.ref.truckCode(tr.code));
        })
      );
    }
    const listings = await ctx.ref.listings().where('gangId', '==', gangId).get();
    for (const l of listings.docs) {
      if (l.data().status !== 'open') continue;
      await safe(ctx, `cleanup-listing:${l.id}`, () => l.ref.update({ status: 'cancelled', cancelReason: 'gang_gone' }));
    }
    const orders = await ctx.ref.orders().where('gangId', '==', gangId).get();
    for (const o of orders.docs) {
      if (o.data().status !== 'pending') continue;
      await safe(ctx, `cleanup-order:${o.id}`, () => o.ref.update({ status: 'cancelled', cancelReason: 'gang_gone' }));
    }
    // ticaret yolları
    for (const p of gang.routeProducts || []) {
      await safe(ctx, `cleanup-route:${p}`, () =>
        db.runTransaction(async (tx) => {
          const r = (await tx.get(ctx.ref.route(p))).data();
          if (r?.holderId !== gangId) return;
          tx.update(ctx.ref.route(p), { holderType: null, holderId: null, holderName: null, holderLogo: null, dailyOrderLimit: 0 });
        })
      );
    }
    // ittifaklar
    const als = await ctx.ref.alliances().where('gangIds', 'array-contains', gangId).get();
    for (const a of als.docs) {
      if (['ended', 'declined'].includes(a.data().status)) continue;
      await safe(ctx, `cleanup-alliance:${a.id}`, () => a.ref.update({ status: 'ended', endedAtMs: ctx.now, endedReason: 'dissolved' }));
    }
    // bekleyen bahis teklifleri (başlamış olanlar tick'te karşı tarafa yazılır)
    const bets = await ctx.ref.wars().where('gangIds', 'array-contains', gangId).get();
    for (const b of bets.docs) {
      const w = b.data();
      if (w.type !== 'bet' || !['offered', 'accepted'].includes(w.status)) continue;
      await safe(ctx, `cleanup-bet:${b.id}`, () =>
        db.runTransaction(async (tx) => {
          const cur = (await tx.get(b.ref)).data();
          if (!['offered', 'accepted'].includes(cur?.status)) return;
          const other = cur.gangIds.find((g) => g !== gangId);
          const otherAlive = (await tx.get(ctx.ref.gang(other))).data()?.status === 'active';
          const otherPaid = cur.status === 'accepted' || cur.proposerGangId === other;
          if (otherPaid && otherAlive) {
            tx.update(ctx.ref.gangState(other), { kasa: FV.increment(cur.stake) });
            ledger(tx, ctx, { type: 'bet_refund', amount: cur.stake, from: { kind: 'escrow', id: b.id }, to: { kind: 'gang', id: other }, refId: b.id, actorId: 'system' });
          }
          const ownPaid = cur.status === 'accepted' || cur.proposerGangId === gangId;
          if (ownPaid) ledger(tx, ctx, { type: 'bet_refund_burn', amount: cur.stake, from: { kind: 'escrow', id: b.id }, to: { kind: 'burn' }, refId: b.id, actorId: 'system' });
          tx.update(b.ref, { status: 'cancelled', activeGangIds: [], resolvedAtMs: ctx.now });
        })
      );
    }
    // oylamalar / talepler
    for (const coll of [ctx.ref.votes(gangId), ctx.ref.pending(gangId)]) {
      const s = await coll.get();
      const batch = db.batch();
      let n = 0;
      s.forEach((d) => {
        if (['active', 'pending'].includes(d.data().status)) {
          batch.update(d.ref, { status: 'cancelled', cancelReason: 'dissolved' });
          n += 1;
        }
      });
      if (n) await safe(ctx, `cleanup-votes:${gangId}`, () => batch.commit());
    }
    await ctx.ref.gang(gangId).update({ cleanupDone: true, memberCount: 0, routeProducts: [] });
    ctx.logs.push({ gang: 'gang_cleanup', world: ctx.worldId, gangId, takedown });
    core.flushLogs(ctx);
    return { cleaned: true };
  }

  // ---------------------------------------------------------------------------
  // Saat — kaçırılmış günler + süpürücüler
  // ---------------------------------------------------------------------------
  async function runClock(worldId, { maxDays = MAX_CATCHUP_DAYS } = {}) {
    const world = await core.loadWorld(worldId);
    if (!world) return { skipped: 'no_world' };
    const ctx0 = core.makeCtx(worldId, world, { actorId: 'system' });
    let last = world.lastTickDateKey;
    if (!last) {
      last = ctx0.dateKey;
      await ctx0.ref.world().set({ lastTickDateKey: last, launchDateKey: world.launchDateKey || last }, { merge: true });
      world.launchDateKey = world.launchDateKey || last;
    }
    const results = [];
    let n = 0;
    while (last < ctx0.dateKey && n < maxDays) {
      const next = addDays(last, 1);
      if (!ctx0.isTest && ctx0.now < midnightMsOf(next) + LIVE_GRACE_MS) break;
      const r = await runDailyTick(worldId, world, next);
      results.push(r);
      if (!r.ok) break; // başarısız gün tekrar denenecek; sonraki güne geçme
      last = next;
      n += 1;
    }
    // 12:00 saldırı duyuruları (bugün)
    if (last >= ctx0.dateKey) {
      await safe(ctx0, 'announce-attacks', () => announceAttacks(ctx0));
    }
    // süresi dolan dağıtımlar
    const dists = await ctx0.ref.distributions().where('openUntilMs', '<=', ctx0.now).limit(200).get();
    for (const d of dists.docs) await safe(ctx0, `dist:${d.id}`, () => treasury.expireDistribution(ctx0, d.id));
    // savaş göstergesi uzlaştırma — gösterge sadece best-effort artırıldığı
    // için nadiren sapabilir; okuma maliyeti için saatte bir (ilk 5 dk) ya da
    // test dünyasında her çalışmada yapılır. Sonuçlar HER ZAMAN shard'lardan.
    const reconcileNow = ctx0.isTest || new Date(core.deps.realNow ? core.deps.realNow() : Date.now()).getUTCMinutes() < 5;
    const active = reconcileNow ? await ctx0.ref.wars().where('status', '==', 'active').limit(60).get() : { docs: [] };
    for (const w of active.docs) {
      await safe(ctx0, `reconcile:${w.id}`, async () => {
        const { totals } = await warActions.sumShards(ctx0, w.id);
        const disp = w.data().display || {};
        const differs = Object.keys({ ...totals, ...disp }).some((k) => (totals[k] || 0) !== (disp[k] || 0));
        if (differs) await w.ref.update({ display: totals });
      });
    }
    // dağılmış çeteler
    const dis = await ctx0.ref.gangs().where('status', '==', 'disbanded').where('cleanupDone', '==', false).limit(20).get();
    for (const g of dis.docs) await safe(ctx0, `cleanup:${g.id}`, () => cleanupGang(ctx0, g.id));
    core.flushLogs(ctx0);
    return { ticks: results, errors: ctx0.errors || [] };
  }

  return { runClock, runDailyTick, cleanupGang, resolveTruckTrip, productForSunday, dateKeyOf };
}
