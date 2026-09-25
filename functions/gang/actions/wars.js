// SAVAŞ ÇEKİRDEĞİ + bahisli savaş + ittifak + sabotaj + İstihbarat operasyonu
//
// Zar: 2 zar (sunucuda crypto.randomInt) → katkı = (z1+z2) × güç (anlık görüntü)
// Pencere (v38): 3 saatlik 8 dilim — oyuncu her dilimde TEK bir savaşa
// katılabilir (slots/{oyuncu}_{gün}_{pencere} deterministik kilit → çift
// katılım imkânsız). Savaş toplamları shard belgelerinde tutulur (sonuç
// buradan hesaplanır); savaş kartındaki gösterge best-effort artırılır ve
// saat (clock) tarafından periyodik uzlaştırılır.
import { GANG, INTEL, LEGACY_WINDOW_HOURS, WAR_SHARDS, RANK_LABELS, productById, atLeast } from '../config.js';
import { addDays, dateKeyOf, hhmmOf, midnightMsOf, nextWindowStartMs, slotIdOf, windowStartMs } from '../time.js';

export const ALLIANCE_BLOCKING = ['accepted', 'active', 'ending'];
export const ALLIANCE_DEFENSIVE = ['active', 'ending'];

export function pairKeyOf(a, b) {
  return [a, b].sort().join('__');
}

export function createWarActions(core) {
  const { FV, fail, readMembership, readWallet, ledger, gangLog, announce, notify, posInt, requireGangMember, requireIntel, requestGuard } = core;

  // ---------------------------------------------------------------------------
  // ZAR AT / SAVAŞA KATIL
  // ---------------------------------------------------------------------------
  async function rollDice(ctx, data) {
    const warId = String(data.warId || '');
    const wantIntel = data.side === 'intel';
    const warSnap = await ctx.ref.war(warId).get();
    if (!warSnap.exists) fail('not-found', 'Savaş bulunamadı.');
    const war = warSnap.data();
    // v35: kabul edilmiş bahis başlangıç diliminde saat turunu beklemeden oynanabilir
    const dueBet = war.type === 'bet' && war.status === 'accepted' && ctx.now >= war.startsAtMs;
    if (war.status !== 'active' && !dueBet) fail('failed-precondition', 'Bu savaş artık aktif değil.');
    if (ctx.now < war.startsAtMs) fail('failed-precondition', 'Bu savaş henüz başlamadı.');
    if (ctx.now >= war.endsAtMs) fail('deadline-exceeded', 'Bu savaşın süresi doldu.');
    // İstihbarat bahse operasyonla girdiyse (savaş başladıktan sonra da olabilir)
    let betIntel = Boolean(war.sides?.intel);
    if (war.type === 'bet' && wantIntel && !betIntel) betIntel = Boolean((await ctx.ref.betReport(warId).get()).data()?.opStarted);
    const livePower = ctx.isTest ? null : await core.readPower(ctx, ctx.actorId);
    const slotId = slotIdOf(ctx.actorId, ctx.now);
    // v38 geçiş günü: eski 6 saatlik dilimde bu 3 saatlik dilim içinde saldırdıysa hak kullanılmış sayılır
    const legacySlotId = `${ctx.actorId}_${ctx.dateKey}_${Math.floor(ctx.hour / LEGACY_WINDOW_HOURS)}`;

    const out = await core.db.runTransaction(async (tx) => {
      const [slotSnap, legacySnap] = await Promise.all([tx.get(ctx.ref.slot(slotId)), tx.get(ctx.ref.slot(legacySlotId))]);
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const wallet = ctx.isTest ? await readWallet(tx, ctx, ctx.actorId) : null;
      let sideKey;
      let org; // { type:'gang', gangId, member } | { type:'intel', rosterId, roster }
      if ((war.type === 'trade' || (war.type === 'bet' && betIntel)) && wantIntel) {
        const rid = requireIntel(membership);
        const r = (await tx.get(ctx.ref.roster(rid))).data();
        if (!r) fail('failed-precondition', 'İstihbarat üyesi değilsin.');
        sideKey = 'intel';
        org = { type: 'intel', rosterId: rid, roster: r };
      } else if (war.type === 'intelop' && data.side !== 'defense') {
        const rid = requireIntel(membership);
        const r = (await tx.get(ctx.ref.roster(rid))).data();
        if (!r) fail('failed-precondition', 'İstihbarat üyesi değilsin.');
        sideKey = 'attacker';
        org = { type: 'intel', rosterId: rid, roster: r };
      } else {
        const gangId = requireGangMember(membership);
        const m = (await tx.get(ctx.ref.member(gangId, ctx.actorId))).data();
        if (!m) fail('failed-precondition', 'Bir çetede değilsin.');
        org = { type: 'gang', gangId, member: m };
        if (war.type === 'trade') {
          sideKey = gangId;
        } else if (war.type === 'bet') {
          if (!war.sides?.[gangId]) fail('permission-denied', 'Bu savaş senin çetenin değil.');
          sideKey = gangId;
        } else if (war.type === 'sabotage') {
          if (war.attackerGangId !== gangId) fail('permission-denied', 'Bu saldırı senin çetenin değil.');
          sideKey = 'attacker';
        } else if (war.type === 'defense') {
          if (war.defenderGangId !== gangId) {
            const al = await tx.get(ctx.ref.alliance(pairKeyOf(gangId, war.defenderGangId)));
            if (!ALLIANCE_DEFENSIVE.includes(al.data()?.status)) fail('permission-denied', 'Sadece tır sahibi ve müttefikleri savunabilir.');
          }
          sideKey = gangId;
        } else {
          fail('failed-precondition', 'Bu savaşa katılamazsın.');
        }
      }
      const legacyUsed = legacySnap.exists && Number(legacySnap.data()?.atMs || 0) >= windowStartMs(ctx.now);
      if (slotSnap.exists || legacyUsed) fail('already-exists', 'Bu 3 saatlik dilimde zaten bir savaşa katıldın.');
      const power = ctx.isTest ? Number(wallet.testPower || 0) : livePower;
      if (!(power > 0)) fail('failed-precondition', 'Gücün yok — önce bir silah edin.');
      const d1 = core.randomInt(1, 7);
      const d2 = core.randomInt(1, 7);
      const contribution = (d1 + d2) * power;
      const name = org.type === 'intel' ? org.roster.codeName : org.member.name;
      const shardKey = `${sideKey}__${core.randomInt(0, WAR_SHARDS)}`;
      tx.set(ctx.ref.slot(slotId), { warId, warType: war.type, sideKey, dice: [d1, d2], power, contribution, atMs: ctx.now });
      tx.set(ctx.ref.roll(warId, slotId), { sideKey, name, orgType: org.type, dice: [d1, d2], power, contribution, atMs: ctx.now });
      tx.set(ctx.ref.shard(warId, shardKey), { sideKey, power: FV.increment(contribution), rolls: FV.increment(1) }, { merge: true });
      const prestige = Math.floor(contribution * GANG.WAR_PRESTIGE_PER_POWER);
      if (org.type === 'intel') {
        tx.update(ctx.ref.roster(org.rosterId), { prestige: FV.increment(prestige), lastActiveAtMs: ctx.now });
      } else {
        tx.update(ctx.ref.member(org.gangId, ctx.actorId), { prestige: FV.increment(prestige), lastActiveAtMs: ctx.now, inactiveWarn: false });
      }
      return { sideKey, org, dice: [d1, d2], power, contribution, prestige };
    });

    // Gösterge (best-effort; sonuç shard toplamından hesaplanır)
    try {
      const upd = { [`display.${out.sideKey}`]: FV.increment(out.contribution), updatedAtMs: ctx.now };
      if (war.type === 'trade' && !war.sides?.[out.sideKey]) {
        if (out.org.type === 'intel') upd[`sides.${out.sideKey}`] = { orgType: 'intel', orgId: 'main', name: INTEL.NAME, logo: INTEL.LOGO };
        else {
          const g = (await ctx.ref.gang(out.org.gangId).get()).data();
          upd[`sides.${out.sideKey}`] = { orgType: 'gang', orgId: out.org.gangId, name: g?.name || '', logo: g?.logo || null };
        }
      }
      if (war.type === 'bet' && out.sideKey === 'intel' && !war.sides?.intel) {
        upd['sides.intel'] = { orgType: 'intel', orgId: 'main', name: INTEL.NAME, logo: INTEL.LOGO, role: 'intel' };
        upd.intelInvolved = true;
      }
      if (war.type === 'defense' && !war.sides?.[out.sideKey]) {
        const g = (await ctx.ref.gang(out.org.gangId).get()).data();
        upd[`sides.${out.sideKey}`] = { orgType: 'gang', orgId: out.org.gangId, name: g?.name || '', logo: g?.logo || null, role: 'defender' };
      }
      await ctx.ref.war(warId).update(upd);
    } catch (err) {
      ctx.logs.push({ gang: 'display_update_failed', warId, err: String(err?.message || err) });
    }
    ctx.logs.push({ gang: 'war_roll', world: ctx.worldId, warId, sideKey: out.sideKey, contribution: out.contribution });
    return { dice: out.dice, power: out.power, contribution: out.contribution, prestige: out.prestige, sideKey: out.sideKey };
  }

  async function sumShards(ctx, warId) {
    const snap = await ctx.ref.shards(warId).get();
    const totals = {};
    const rolls = {};
    snap.forEach((d) => {
      const s = d.data();
      totals[s.sideKey] = (totals[s.sideKey] || 0) + Number(s.power || 0);
      rolls[s.sideKey] = (rolls[s.sideKey] || 0) + Number(s.rolls || 0);
    });
    return { totals, rolls };
  }

  // ---------------------------------------------------------------------------
  // Ortak okuma: çağıranın çetesi + rütbesi
  // ---------------------------------------------------------------------------
  async function myGangRole(tx, ctx, allowed, msg) {
    const membership = await readMembership(tx, ctx, ctx.actorId);
    const gangId = requireGangMember(membership);
    const me = (await tx.get(ctx.ref.member(gangId, ctx.actorId))).data();
    if (!me) fail('failed-precondition', 'Bir çetede değilsin.');
    if (allowed && !allowed.includes(me.rank)) fail('permission-denied', msg || 'Bu işlem için yetkin yok.');
    return { gangId, me, membership };
  }

  function midnightAllowance(state, dateKey, ratio) {
    return state?.midnightDateKey === dateKey ? Math.floor(Number(state.kasaAtMidnight || 0) * ratio) : 0;
  }

  async function blockingRelations(tx, ctx, a, b) {
    const pk = pairKeyOf(a, b);
    const [al, wars] = await Promise.all([tx.get(ctx.ref.alliance(pk)), tx.get(ctx.ref.wars().where('pairKey', '==', pk))]);
    const allianceStatus = al.data()?.status || null;
    const liveWars = wars.docs.map((d) => ({ id: d.id, ...d.data() })).filter((w) => ['offered', 'accepted', 'active'].includes(w.status));
    return { pk, allianceStatus, allianceBlocks: ALLIANCE_BLOCKING.includes(allianceStatus), liveWars };
  }

  const LEADERS = ['baba', 'sagkol'];
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

  // ---------------------------------------------------------------------------
  // BAHİSLİ SAVAŞ — Baba + Sağ Kol teklif eder / cevaplar. Üst sınır: iki
  // çetenin 00:00 kasalarından KÜÇÜĞÜNÜN 1/4'ü. Çete başına günde 1 teklif.
  // Teklif edenin altını havuza alınır; kabul edilince karşı çeteden aynı
  // miktar alınır; savaş sonraki 00:00'da başlar, 24 saat sürer, kazanan
  // hepsini alır.
  // ---------------------------------------------------------------------------
  function betLimit(stateA, stateB, dateKey) {
    const a = stateA?.midnightDateKey === dateKey ? Number(stateA.kasaAtMidnight || 0) : 0;
    const b = stateB?.midnightDateKey === dateKey ? Number(stateB.kasaAtMidnight || 0) : 0;
    return Math.floor(Math.min(a, b) * GANG.BET_MAX_RATIO_OF_SMALLER_MIDNIGHT_KASA);
  }

  // Geri çekilen / reddedilen teklif, aynı günün teklif hakkını iade eder.
  function offerSlotBack(st, war) {
    if (!st || st.betOfferDateKey !== war.offeredDateKey || Number(st.betOffersToday || 0) <= 0) return {};
    return { betOffersToday: FV.increment(-1) };
  }

  async function offerBet(ctx, data) {
    const targetGangId = String(data.targetGangId || '');
    const stake = posInt(data.stake, 'Bahis');
    if (!GANG.BET_OFFER_WEEKDAYS.includes(ctx.weekday)) fail('failed-precondition', 'Bugün bahis yapamazsın.');
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Bahis teklifini sadece Mafya Babası ve Sağ Kol yapabilir.');
      if (targetGangId === gangId) fail('invalid-argument', 'Kendi çetene bahis teklif edemezsin.');
      const [myGang, targetGang, myState, targetState] = await Promise.all([
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.gang(targetGangId)),
        tx.get(ctx.ref.gangState(gangId)),
        tx.get(ctx.ref.gangState(targetGangId)),
      ]);
      if (targetGang.data()?.status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
      const rel = await blockingRelations(tx, ctx, gangId, targetGangId);
      if (rel.allianceBlocks) fail('failed-precondition', '🤝 İttifak varken bahisli savaş yapılamaz.');
      if (rel.liveWars.some((w) => w.type === 'bet')) fail('failed-precondition', 'Bu çeteyle zaten bir bahis var.');
      const st = myState.data() || {};
      if (st.betOfferDateKey === ctx.dateKey && Number(st.betOffersToday || 0) >= GANG.BET_OFFERS_PER_DAY) fail('resource-exhausted', 'Bugün zaten bir bahis teklifi gönderdiniz.');
      if (stake < GANG.BET_MIN_STAKE) fail('invalid-argument', `En az ${fmt(GANG.BET_MIN_STAKE)} altın bahis gerekir.`);
      const max = betLimit(st, targetState.data(), ctx.dateKey);
      if (stake > max) fail('failed-precondition', `En fazla ${fmt(max)} altın bahse girebilirsin.`);
      if (Number(st.kasa || 0) < stake) fail('failed-precondition', 'Kasada yeterli para yok.');
      const warRef = ctx.ref.wars().doc();
      const mg = myGang.data();
      const tg = targetGang.data();
      const warDay = addDays(ctx.dateKey, 1);
      tx.update(ctx.ref.gangState(gangId), {
        kasa: FV.increment(-stake),
        betOfferDateKey: ctx.dateKey,
        betOffersToday: st.betOfferDateKey === ctx.dateKey ? FV.increment(1) : 1,
      });
      tx.set(warRef, {
        type: 'bet',
        status: 'offered',
        visibility: 'private',
        pairKey: rel.pk,
        gangIds: [gangId, targetGangId],
        activeGangIds: [gangId, targetGangId],
        intelInvolved: false,
        proposerGangId: gangId,
        proposedByName: me.name,
        targetGangId,
        // v37: tutar belgede YOK → wars/{id}/secret/stake (Çömez/Tetikçi göremez)
        offeredDateKey: ctx.dateKey,
        dateKey: warDay,
        startsAtMs: midnightMsOf(warDay),
        endsAtMs: midnightMsOf(addDays(warDay, 1)),
        sides: {
          [gangId]: { orgType: 'gang', orgId: gangId, name: mg.name, logo: mg.logo, role: 'proposer' },
          [targetGangId]: { orgType: 'gang', orgId: targetGangId, name: tg.name, logo: tg.logo, role: 'target' },
        },
        display: { [gangId]: 0, [targetGangId]: 0 },
        createdAtMs: ctx.now,
      });
      tx.set(ctx.ref.betSecret(warRef.id), { stake, gangIds: [gangId, targetGangId], createdAtMs: ctx.now });
      ledger(tx, ctx, { type: 'bet_lock', amount: stake, from: { kind: 'gang', id: gangId }, to: { kind: 'escrow', id: warRef.id }, before: st.kasa, refId: warRef.id });
      announce(tx, ctx, gangId, '🎲', `${me.name}, ${tg.name} çetesine bahisli savaş teklif etti.`);
      announce(tx, ctx, targetGangId, '🎲', `${mg.name} çetesi bahisli savaş teklif etti! 00:00'a kadar cevap verilmeli.`);
      core.announceMgmt(tx, ctx, gangId, '💰', `${tg.name} bahsi: ${fmt(stake)} altın (sadece rütbeliler görür).`);
      core.announceMgmt(tx, ctx, targetGangId, '💰', `${mg.name} bahis teklifi: ${fmt(stake)} altın (sadece rütbeliler görür).`);
      notify(tx, ctx, tg.babaId, `🎲 ${mg.name} çetesi ${fmt(stake)} altınlık bahisli savaş teklif etti. 00:00'a kadar cevap ver.`, 'bet');
      ctx.logs.push({ gang: 'bet_created', world: ctx.worldId, warId: warRef.id, stake });
      const res = { warId: warRef.id };
      guard.save(res);
      return res;
    });
  }

  async function respondBet(ctx, data) {
    const warId = String(data.warId || '');
    const accept = Boolean(data.accept);
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Bahse sadece Mafya Babası ve Sağ Kol cevap verebilir.');
      const warSnap = await tx.get(ctx.ref.war(warId));
      const war = warSnap.data();
      if (!war || war.type !== 'bet' || war.targetGangId !== gangId) fail('not-found', 'Teklif bulunamadı.');
      if (war.status !== 'offered') fail('failed-precondition', 'Bu teklif artık geçerli değil.');
      if (war.offeredDateKey !== ctx.dateKey) fail('deadline-exceeded', 'Teklifin süresi doldu.');
      const [myState, rel, propState, stake] = await Promise.all([
        tx.get(ctx.ref.gangState(gangId)),
        accept ? blockingRelations(tx, ctx, gangId, war.proposerGangId) : null,
        accept ? null : tx.get(ctx.ref.gangState(war.proposerGangId)),
        core.readBetStake(tx, ctx, warId, war),
      ]);
      const myName = war.sides?.[gangId]?.name || '';
      if (!accept) {
        // Reddedilen teklif günlük hakkı geri verir: teklif eden aynı gün yeni teklif gönderebilir.
        tx.update(ctx.ref.gangState(war.proposerGangId), { kasa: FV.increment(stake), ...offerSlotBack(propState.data(), war) });
        tx.update(ctx.ref.war(warId), { status: 'declined', activeGangIds: [], resolvedAtMs: ctx.now });
        ledger(tx, ctx, { type: 'bet_refund', amount: stake, from: { kind: 'escrow', id: warId }, to: { kind: 'gang', id: war.proposerGangId }, refId: warId });
        announce(tx, ctx, war.proposerGangId, '🙅', `${myName} bahisli savaş teklifini reddetti, bahis kasaya döndü.`);
        core.announceMgmt(tx, ctx, war.proposerGangId, '💰', `${fmt(stake)} altın kasaya döndü.`);
        announce(tx, ctx, gangId, '🙅', `${me.name} bahis teklifini reddetti.`);
        return { declined: true };
      }
      if (rel.allianceBlocks) fail('failed-precondition', '🤝 İttifak varken bahisli savaş yapılamaz.');
      if (Number(myState.data()?.kasa || 0) < stake) fail('failed-precondition', 'Kasada yeterli para yok.');
      // v35: bir sonraki saldırı diliminde başlar (v38: 3 saatlik dilimler), 24 saat sürer
      const startsAtMs = nextWindowStartMs(ctx.now);
      const endsAtMs = startsAtMs + GANG.BET_DURATION_MS;
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-stake) });
      tx.update(ctx.ref.war(warId), { status: 'accepted', acceptedAtMs: ctx.now, startsAtMs, endsAtMs, dateKey: dateKeyOf(startsAtMs), slotTiming: true });
      ledger(tx, ctx, { type: 'bet_lock', amount: stake, from: { kind: 'gang', id: gangId }, to: { kind: 'escrow', id: warId }, before: myState.data()?.kasa, refId: warId });
      announce(tx, ctx, gangId, '⚔️', `${me.name} bahisli savaşı kabul etti — ${hhmmOf(startsAtMs)}'de başlıyor, 24 saat sürer.`);
      announce(tx, ctx, war.proposerGangId, '⚔️', `${myName} bahisli savaş teklifini kabul etti — ${hhmmOf(startsAtMs)}'de başlıyor, 24 saat sürer.`);
      return { accepted: true, startsAtMs, endsAtMs };
    });
  }

  async function withdrawBet(ctx, data) {
    const warId = String(data.warId || '');
    return core.db.runTransaction(async (tx) => {
      const { gangId } = await myGangRole(tx, ctx, LEADERS, 'Sadece Mafya Babası ve Sağ Kol geri çekebilir.');
      const [warSnap, stSnap] = await Promise.all([tx.get(ctx.ref.war(warId)), tx.get(ctx.ref.gangState(gangId))]);
      const war = warSnap.data();
      if (!war || war.type !== 'bet' || war.proposerGangId !== gangId) fail('not-found', 'Teklif bulunamadı.');
      if (war.status !== 'offered') fail('failed-precondition', 'Bu teklif artık geri çekilemez.');
      const stake = await core.readBetStake(tx, ctx, warId, war);
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(stake), ...offerSlotBack(stSnap.data(), war) });
      tx.update(ctx.ref.war(warId), { status: 'withdrawn', activeGangIds: [], resolvedAtMs: ctx.now });
      ledger(tx, ctx, { type: 'bet_refund', amount: stake, from: { kind: 'escrow', id: warId }, to: { kind: 'gang', id: gangId }, refId: warId });
      gangLog(tx, ctx, war.targetGangId, '↩️', `${war.sides?.[gangId]?.name || ''} bahis teklifini geri çekti.`);
      return { withdrawn: true };
    });
  }

  // ---------------------------------------------------------------------------
  // ÖNERİ — Tetikçi ve Kıdemli, çetelerine gelen bahis/ittifak teklifi için
  // "kabul et / reddet" önerisini sohbete gönderir (karar Baba/Sağ Kol'da).
  // Üye başına teklif başına 1 öneri.
  // ---------------------------------------------------------------------------
  async function suggest(ctx, data) {
    const kind = data.kind === 'alliance' ? 'alliance' : data.kind === 'bet' ? 'bet' : null;
    const choice = data.choice === 'accept' ? 'accept' : data.choice === 'reject' ? 'reject' : null;
    const refId = String(data.refId || '');
    if (!kind || !choice || !refId) fail('invalid-argument', 'Geçersiz öneri.');
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, ['kidemli', 'tetikci'], 'Öneriyi Kıdemli ve Tetikçiler gönderir.');
      const markRef = ctx.ref.request(`sugg_${ctx.actorId}_${refId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`);
      const [mark, refSnap] = await Promise.all([tx.get(markRef), tx.get(kind === 'bet' ? ctx.ref.war(refId) : ctx.ref.alliance(refId))]);
      const ref = refSnap.data();
      let otherName;
      if (kind === 'bet') {
        if (!ref || ref.type !== 'bet' || ref.targetGangId !== gangId || ref.status !== 'offered') fail('failed-precondition', 'Bu teklif artık geçerli değil.');
        otherName = ref.sides?.[ref.proposerGangId]?.name || '';
      } else {
        if (!ref || !ref.gangIds?.includes(gangId) || ref.requestedBy === gangId || ref.status !== 'requested') fail('failed-precondition', 'Bu teklif artık geçerli değil.');
        otherName = ref.names?.[ref.requestedBy] || '';
      }
      if (mark.exists) fail('already-exists', 'Bu teklif için zaten öneri gönderdin.');
      tx.set(markRef, { atMs: ctx.now, choice });
      const what = kind === 'bet' ? `${otherName} bahis teklifini` : `${otherName} ittifak teklifini`;
      core.systemChat(tx, ctx, ctx.ref.gangChat(gangId, 'genel'), `💬 ${me.name} (${RANK_LABELS[me.rank]}) öneriyor: ${what} ${choice === 'accept' ? 'KABUL ET ✅' : 'REDDET ❌'}`);
      return { suggested: true };
    });
  }

  // ---------------------------------------------------------------------------
  // İTTİFAK — Baba + Sağ Kol. Başlangıç ve bitiş 00:00'da. Aralarında süren
  // sabotaj/bahis varken kurulamaz. Aktifken bahis/sabotaj yok; savunmada
  // müttefik güç ekleyebilir (saldırıda yok). Müttefike kısa not gönderilir.
  // ---------------------------------------------------------------------------
  async function requestAlliance(ctx, data) {
    const targetGangId = String(data.targetGangId || '');
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'İttifakı sadece Mafya Babası ve Sağ Kol teklif edebilir.');
      if (targetGangId === gangId) fail('invalid-argument', 'Geçersiz çete.');
      const [myGang, targetGang] = await Promise.all([tx.get(ctx.ref.gang(gangId)), tx.get(ctx.ref.gang(targetGangId))]);
      if (targetGang.data()?.status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
      const rel = await blockingRelations(tx, ctx, gangId, targetGangId);
      if (['requested', ...ALLIANCE_BLOCKING].includes(rel.allianceStatus)) fail('failed-precondition', 'Bu çeteyle zaten bir ittifak süreci var.');
      if (rel.liveWars.length > 0) fail('failed-precondition', 'Aranızda süren bir bahis/sabotaj varken ittifak kurulamaz.');
      const mg = myGang.data();
      const tg = targetGang.data();
      tx.set(ctx.ref.alliance(rel.pk), {
        gangIds: [gangId, targetGangId].sort(),
        names: { [gangId]: mg.name, [targetGangId]: tg.name },
        logos: { [gangId]: mg.logo, [targetGangId]: tg.logo },
        status: 'requested',
        requestedBy: gangId,
        requestedAtMs: ctx.now,
        startDateKey: null,
        endDateKey: null,
        notes: {},
      });
      announce(tx, ctx, gangId, '🤝', `${me.name}, ${tg.name} çetesine ittifak teklif etti.`);
      announce(tx, ctx, targetGangId, '🤝', `${mg.name} çetesi ittifak teklif etti.`);
      notify(tx, ctx, tg.babaId, `🤝 ${mg.name} çetesi ittifak teklif etti.`, 'alliance');
      return { allianceId: rel.pk };
    });
  }

  async function respondAlliance(ctx, data) {
    const allianceId = String(data.allianceId || '');
    const accept = Boolean(data.accept);
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Sadece Mafya Babası ve Sağ Kol cevap verebilir.');
      const al = (await tx.get(ctx.ref.alliance(allianceId))).data();
      if (!al || !al.gangIds.includes(gangId) || al.requestedBy === gangId) fail('not-found', 'Teklif bulunamadı.');
      if (al.status !== 'requested') fail('failed-precondition', 'Bu teklif artık geçerli değil.');
      const other = al.gangIds.find((g) => g !== gangId);
      if (!accept) {
        tx.update(ctx.ref.alliance(allianceId), { status: 'declined', resolvedAtMs: ctx.now });
        announce(tx, ctx, other, '🙅', `${al.names[gangId]} ittifak teklifini reddetti.`);
        return { declined: true };
      }
      const rel = await blockingRelations(tx, ctx, gangId, other);
      if (rel.liveWars.length > 0) fail('failed-precondition', 'Aranızda süren bir bahis/sabotaj varken ittifak kurulamaz.');
      const startDateKey = addDays(ctx.dateKey, 1);
      tx.update(ctx.ref.alliance(allianceId), { status: 'accepted', startDateKey, acceptedAtMs: ctx.now });
      announce(tx, ctx, gangId, '🤝', `${me.name} ittifakı kabul etti: ${al.names[other]} — 00:00'da başlıyor.`);
      announce(tx, ctx, other, '🤝', `${al.names[gangId]} ittifak teklifini kabul etti — 00:00'da başlıyor.`);
      return { accepted: true, startDateKey };
    });
  }

  async function endAlliance(ctx, data) {
    const allianceId = String(data.allianceId || '');
    return core.db.runTransaction(async (tx) => {
      const { gangId } = await myGangRole(tx, ctx, LEADERS, 'İttifakı sadece Mafya Babası ve Sağ Kol bitirebilir.');
      const al = (await tx.get(ctx.ref.alliance(allianceId))).data();
      if (!al || !al.gangIds.includes(gangId)) fail('not-found', 'İttifak bulunamadı.');
      const other = al.gangIds.find((g) => g !== gangId);
      if (al.status === 'requested' || al.status === 'accepted') {
        tx.update(ctx.ref.alliance(allianceId), { status: 'ended', endedAtMs: ctx.now, endedBy: gangId });
        gangLog(tx, ctx, other, '💔', `${al.names[gangId]} ittifak sürecini iptal etti.`);
        return { ended: true };
      }
      if (al.status !== 'active') fail('failed-precondition', 'İttifak zaten bitiyor.');
      const endDateKey = addDays(ctx.dateKey, 1);
      tx.update(ctx.ref.alliance(allianceId), { status: 'ending', endDateKey, endRequestedBy: gangId });
      announce(tx, ctx, other, '💔', `${al.names[gangId]} ittifakı bitirdi — 00:00'da sona erecek.`);
      announce(tx, ctx, gangId, '💔', `${al.names[other]} ile ittifak 00:00'da sona erecek.`);
      return { ending: true, endDateKey };
    });
  }

  async function sendAllianceNote(ctx, data) {
    const allianceId = String(data.allianceId || '');
    const text = core.cleanText(data.text, { min: 1, max: GANG.NOTE_MAX, field: 'Not' });
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Müttefike notu sadece Mafya Babası ve Sağ Kol gönderebilir.');
      const al = (await tx.get(ctx.ref.alliance(allianceId))).data();
      if (!al || !al.gangIds.includes(gangId) || !['accepted', 'active', 'ending'].includes(al.status)) fail('failed-precondition', 'Aktif bir ittifak yok.');
      const other = al.gangIds.find((g) => g !== gangId);
      tx.update(ctx.ref.alliance(allianceId), { [`notes.${gangId}`]: { text, byName: me.name, atMs: ctx.now } });
      core.systemChat(tx, ctx, ctx.ref.gangChat(other, 'genel'), `✉️ Müttefik ${al.names[gangId]}: “${text}”`);
      return { sent: true };
    });
  }

  // ---------------------------------------------------------------------------
  // SABOTAJ (çete) — 00:00–12:00 arası Baba/Sağ Kol başlatır; saldırılar
  // tır sahibine 12:00'de duyurulur; saldırı 12–24 (v38: 4 dilim); haraç (alt/üst
  // sınır yok) 21:00'e kadar ödenir; sonuç tır varışında (00:00).
  // Ücret: OYUN GENELİNDE 10.000 → 20.000 → … (her yeni sabotaj/operasyon
  // +10.000, 00:00'da sıfırlanır).
  // Depo: saldıran çetenin deposunda tırın GERÇEK yükü kadar boş yer olmalı
  // (başlarken ayrılır, sonuçta/haraçta serbest kalır).
  // ---------------------------------------------------------------------------
  function sabotagePrice(dayDoc) {
    const count = Number(dayDoc?.count || 0);
    return { price: GANG.SABOTAGE_BASE_PRICE + GANG.SABOTAGE_PRICE_STEP * count, count };
  }

  async function readActiveAllies(tx, ctx, gangId) {
    const snap = await tx.get(ctx.ref.alliances().where('gangIds', 'array-contains', gangId));
    return snap.docs
      .map((d) => d.data())
      .filter((a) => ALLIANCE_DEFENSIVE.includes(a.status))
      .map((a) => a.gangIds.find((g) => g !== gangId));
  }

  function defenseWarDoc(ctx, truck, defenderGang) {
    return {
      type: 'defense',
      status: 'active',
      visibility: 'private',
      truckId: truck.id,
      truckCode: truck.code,
      defenderGangId: truck.gangId,
      // 12:00 duyurusuna kadar tır sahibi ve müttefikleri görmez
      gangIds: [],
      activeGangIds: [],
      announced: false,
      intelInvolved: false,
      attackWarIds: [],
      dateKey: ctx.dateKey,
      startsAtMs: midnightMsOf(ctx.dateKey) + GANG.ATTACK_PHASE_1_START_HOUR * 3600_000,
      endsAtMs: midnightMsOf(addDays(ctx.dateKey, 1)),
      sides: { [truck.gangId]: { orgType: 'gang', orgId: truck.gangId, name: defenderGang.name, logo: defenderGang.logo, role: 'defender' } },
      display: {},
      createdAtMs: ctx.now,
    };
  }

  function parseHarac(v) {
    const n = Number(v || 0);
    if (!Number.isSafeInteger(n) || n < 0) fail('invalid-argument', 'Geçersiz haraç.');
    return n;
  }

  async function startSabotage(ctx, data) {
    const truckId = String(data.truckId || '');
    const harac = parseHarac(data.harac);
    if (ctx.hour >= GANG.SABOTAGE_START_DEADLINE_HOUR) fail('deadline-exceeded', 'Sabotaj sadece 00:00–12:00 arasında başlatılabilir.');
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Sabotajı sadece Mafya Babası ve Sağ Kol başlatabilir.');
      const truckSnap = await tx.get(ctx.ref.truck(truckId));
      const truck = truckSnap.exists ? { id: truckSnap.id, ...truckSnap.data() } : null;
      if (!truck || truck.status !== 'in_transit' || truck.departDateKey !== ctx.dateKey) fail('failed-precondition', 'Bu tır şu an yolda değil.');
      if (truck.gangId === gangId) fail('invalid-argument', 'Kendi tırına saldıramazsın.');
      const warId = `sab_${truckId}_${ctx.dateKey}_${gangId}`;
      const defId = `def_${truckId}_${ctx.dateKey}`;
      const [myGang, myState, myDepot, defGang, cargoSnap, warSnap, defSnap, daySnap] = await Promise.all([
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.gangState(gangId)),
        tx.get(ctx.ref.depot(gangId)),
        tx.get(ctx.ref.gang(truck.gangId)),
        tx.get(ctx.ref.cargo(truckId)),
        tx.get(ctx.ref.war(warId)),
        tx.get(ctx.ref.war(defId)),
        tx.get(ctx.ref.sabotageDay(ctx.dateKey)),
      ]);
      const rel = await blockingRelations(tx, ctx, gangId, truck.gangId);
      const def = defSnap.data() || null;
      const allies = def?.announced ? await readActiveAllies(tx, ctx, truck.gangId) : [];
      if (warSnap.exists) fail('already-exists', 'Bu tıra zaten sabotaj başlattınız.');
      if (rel.allianceBlocks) fail('failed-precondition', '🤝 İttifak varken sabotaj yapılamaz.');
      if (defGang.data()?.status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
      const units = Number(cargoSnap.data()?.units || 0);
      if (core.depotFree(myDepot.data()) < units) fail('failed-precondition', 'Deponda bu tırın yükünü alacak yer yok.');
      const { price, count } = sabotagePrice(daySnap.data());
      if (Number(myState.data()?.kasa || 0) < price) fail('failed-precondition', `Sabotaj ücreti ${fmt(price)} altın — kasada yeterli para yok.`);

      const mg = myGang.data();
      const dg = defGang.data();
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-price) });
      tx.set(ctx.ref.sabotageDay(ctx.dateKey), { count: count + 1 }, { merge: true });
      if (units > 0) tx.set(ctx.ref.depot(gangId), { reservedUnits: FV.increment(units) }, { merge: true });
      const visibleLater = def?.announced ? [truck.gangId, ...allies] : [];
      if (!def) {
        const doc = defenseWarDoc(ctx, truck, dg);
        doc.gangIds = [gangId];
        doc.activeGangIds = [gangId];
        doc.attackWarIds = [warId];
        tx.set(ctx.ref.war(defId), doc);
      } else {
        tx.update(ctx.ref.war(defId), { attackWarIds: FV.arrayUnion(warId), gangIds: FV.arrayUnion(gangId), activeGangIds: FV.arrayUnion(gangId) });
      }
      const visibleTo = [...new Set([gangId, ...visibleLater])];
      tx.set(ctx.ref.war(warId), {
        type: 'sabotage',
        status: 'active',
        visibility: 'private',
        pairKey: rel.pk,
        truckId,
        truckCode: truck.code,
        attackerGangId: gangId,
        defenderGangId: truck.gangId,
        defenseWarId: defId,
        gangIds: visibleTo,
        activeGangIds: visibleTo,
        announced: Boolean(def?.announced),
        intelInvolved: false,
        harac,
        haracPaid: false,
        cost: price,
        reservedUnits: units,
        startedByName: me.name,
        dateKey: ctx.dateKey,
        startsAtMs: midnightMsOf(ctx.dateKey) + GANG.ATTACK_PHASE_1_START_HOUR * 3600_000,
        endsAtMs: midnightMsOf(addDays(ctx.dateKey, 1)),
        sides: {
          attacker: { orgType: 'gang', orgId: gangId, name: mg.name, logo: mg.logo, role: 'attacker' },
          defender: { orgType: 'gang', orgId: truck.gangId, name: dg.name, logo: dg.logo, role: 'defender' },
        },
        display: { attacker: 0 },
        createdAtMs: ctx.now,
      });
      ledger(tx, ctx, { type: 'sabotage_cost', amount: price, from: { kind: 'gang', id: gangId }, to: { kind: 'burn' }, before: myState.data()?.kasa, refId: warId });
      announce(tx, ctx, gangId, '💣', `${me.name}, TIR #${truck.code} (${dg.name}) için sabotaj başlattı (${fmt(price)})${harac > 0 ? ` — haraç: ${fmt(harac)}` : ''}. Saldırı 12:00'de başlar.`);
      ctx.logs.push({ gang: 'sabotage_started', world: ctx.worldId, warId, price });
      const res = { warId, price };
      guard.save(res);
      return res;
    });
  }

  // Kıdemli / Tetikçi: sabotaj başlatma TALEBİ → çete sohbetine düşer.
  async function requestSabotage(ctx, data) {
    const truckId = String(data.truckId || '');
    if (ctx.hour >= GANG.SABOTAGE_START_DEADLINE_HOUR) fail('deadline-exceeded', 'Sabotaj talebi sadece 00:00–12:00 arasında gönderilebilir.');
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, ['kidemli', 'tetikci'], 'Sabotaj talebini Kıdemli ve Tetikçiler gönderir.');
      const markRef = ctx.ref.request(`sabreq_${ctx.actorId}_${truckId.replace(/[^a-zA-Z0-9]/g, '')}_${ctx.dateKey}`);
      const [mark, truckSnap] = await Promise.all([tx.get(markRef), tx.get(ctx.ref.truck(truckId))]);
      const truck = truckSnap.data();
      if (!truck || truck.status !== 'in_transit' || truck.departDateKey !== ctx.dateKey) fail('failed-precondition', 'Bu tır şu an yolda değil.');
      if (truck.gangId === gangId) fail('invalid-argument', 'Kendi tırınız.');
      if (mark.exists) fail('already-exists', 'Bu tır için zaten talep gönderdin.');
      tx.set(markRef, { atMs: ctx.now });
      core.systemChat(tx, ctx, ctx.ref.gangChat(gangId, 'genel'), `📣 ${me.name} (${RANK_LABELS[me.rank]}) sabotaj talebi gönderdi: TIR #${truck.code} (${truck.gangName})`);
      return { requested: true };
    });
  }

  async function payHarac(ctx, data) {
    const warId = String(data.warId || '');
    if (ctx.hour >= GANG.HARAC_PAY_DEADLINE_HOUR) fail('deadline-exceeded', `Haraç ödeme süresi ${GANG.HARAC_PAY_DEADLINE_HOUR}:00'de kapandı.`);
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Haracı sadece Mafya Babası ve Sağ Kol ödeyebilir.');
      const war = (await tx.get(ctx.ref.war(warId))).data();
      if (!war || war.type !== 'sabotage' || war.defenderGangId !== gangId || !war.announced) fail('not-found', 'Saldırı bulunamadı.');
      if (war.status !== 'active' || war.haracPaid) fail('failed-precondition', 'Bu saldırı artık aktif değil.');
      if (!(war.harac > 0)) fail('failed-precondition', 'Bu saldırıda haraç talebi yok.');
      const [st, attGang] = await Promise.all([tx.get(ctx.ref.gangState(gangId)), tx.get(ctx.ref.gang(war.attackerGangId))]);
      if (Number(st.data()?.kasa || 0) < war.harac) fail('failed-precondition', 'Kasada yeterli para yok.');
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-war.harac) });
      const attAlive = attGang.data()?.status === 'active';
      if (attAlive) {
        tx.update(ctx.ref.gangState(war.attackerGangId), { kasa: FV.increment(war.harac) });
        if (war.reservedUnits) tx.set(ctx.ref.depot(war.attackerGangId), { reservedUnits: FV.increment(-war.reservedUnits) }, { merge: true });
      }
      tx.update(ctx.ref.war(warId), { status: 'cancelled_harac', haracPaid: true, activeGangIds: [], resolvedAtMs: ctx.now });
      ledger(tx, ctx, { type: attAlive ? 'harac_paid' : 'harac_paid_burn', amount: war.harac, from: { kind: 'gang', id: gangId }, to: attAlive ? { kind: 'gang', id: war.attackerGangId } : { kind: 'burn' }, before: st.data()?.kasa, refId: warId });
      announce(tx, ctx, gangId, '🤑', `${me.name}, TIR #${war.truckCode} için ${war.sides?.attacker?.name || ''} çetesine ${fmt(war.harac)} haraç ödedi — o saldırı durdu.`);
      if (attAlive) announce(tx, ctx, war.attackerGangId, '🤑', `TIR #${war.truckCode} sahibi ${fmt(war.harac)} haraç ödedi — saldırı bitti, para kasada.`);
      return { paid: war.harac };
    });
  }

  // ---------------------------------------------------------------------------
  // İSTİHBARAT OPERASYONU — ihbar edilmiş tıra (veya bugünkü tüm ihbarlara)
  // 12:00'ye kadar Başkan/Şef başlatır; ücret = (oyun geneli) sabotaj ücreti.
  // RÜŞVET tutarını operasyonu başlatan belirler (0 = rüşvet kabul edilmez);
  // tır sahibi 21:00'e kadar öderse operasyon durur, para İstihbarat kasasına.
  // ---------------------------------------------------------------------------
  async function startOperation(ctx, data) {
    if (ctx.hour >= GANG.SABOTAGE_START_DEADLINE_HOUR) fail('deadline-exceeded', 'Operasyon sadece 00:00–12:00 arasında başlatılabilir.');
    const bribe = parseHarac(data.bribe);
    let reportIds;
    if (data.all) {
      const snap = await ctx.ref.intelReports().where('departDateKey', '==', ctx.dateKey).get();
      reportIds = snap.docs.filter((d) => !d.data().opWarId).map((d) => d.id);
      if (reportIds.length === 0) fail('failed-precondition', 'Operasyon yapılabilecek ihbarlı tır yok.');
    } else {
      reportIds = [String(data.reportId || '')];
    }
    const started = [];
    const errors = [];
    for (const reportId of reportIds) {
      try {
        started.push(await startOneOperation(ctx, reportId, bribe));
      } catch (err) {
        if (!data.all) throw err;
        errors.push({ reportId, message: err.message });
        if (/kasa/i.test(err.message)) break;
      }
    }
    return { started, errors };
  }

  async function startOneOperation(ctx, reportId, bribe) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const [me, repSnap, stSnap, daySnap] = await Promise.all([
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.intelReport(reportId)),
        tx.get(ctx.ref.intelState()),
        tx.get(ctx.ref.sabotageDay(ctx.dateKey)),
      ]);
      if (!['baskan', 'sef'].includes(me.data()?.rank)) fail('permission-denied', 'Operasyonu sadece Başkan ve Şefler başlatabilir.');
      const rep = repSnap.data();
      if (!rep) fail('not-found', 'İhbar bulunamadı.');
      if (rep.opWarId) fail('already-exists', 'Bu tıra zaten operasyon var.');
      if (rep.departDateKey !== ctx.dateKey) fail('failed-precondition', 'Bu tırın seferi bitti.');
      const truckSnap = await tx.get(ctx.ref.truck(rep.truckId));
      const truck = truckSnap.exists ? { id: truckSnap.id, ...truckSnap.data() } : null;
      if (!truck || truck.status !== 'in_transit' || truck.departDateKey !== ctx.dateKey) fail('failed-precondition', 'Bu tır şu an yolda değil.');
      const warId = `op_${truck.id}_${ctx.dateKey}`;
      const defId = `def_${truck.id}_${ctx.dateKey}`;
      const [defSnap, defGang] = await Promise.all([tx.get(ctx.ref.war(defId)), tx.get(ctx.ref.gang(truck.gangId))]);
      const def = defSnap.data() || null;
      const allies = def?.announced ? await readActiveAllies(tx, ctx, truck.gangId) : [];
      const state = stSnap.data() || {};
      const { price, count } = sabotagePrice(daySnap.data());
      if (Number(state.kasa || 0) < price) fail('failed-precondition', `Operasyon ücreti ${fmt(price)} — İstihbarat kasasında yeterli para yok.`);
      const dg = defGang.data();
      tx.update(ctx.ref.intelState(), { kasa: FV.increment(-price) });
      tx.set(ctx.ref.sabotageDay(ctx.dateKey), { count: count + 1 }, { merge: true });
      if (!def) {
        const doc = defenseWarDoc(ctx, truck, dg);
        doc.intelInvolved = true;
        doc.attackWarIds = [warId];
        tx.set(ctx.ref.war(defId), doc);
      } else {
        tx.update(ctx.ref.war(defId), { attackWarIds: FV.arrayUnion(warId), intelInvolved: true });
      }
      const visibleTo = def?.announced ? [...new Set([truck.gangId, ...allies])] : [];
      tx.set(ctx.ref.war(warId), {
        type: 'intelop',
        status: 'active',
        visibility: 'private',
        truckId: truck.id,
        truckCode: truck.code,
        reportId,
        defenderGangId: truck.gangId,
        defenseWarId: defId,
        gangIds: visibleTo,
        activeGangIds: visibleTo,
        announced: Boolean(def?.announced),
        intelInvolved: true,
        bribe,
        bribePaid: false,
        estReward: rep.leaked ? rep.estReward || 0 : null,
        cost: price,
        startedByCode: me.data().codeName,
        dateKey: ctx.dateKey,
        startsAtMs: midnightMsOf(ctx.dateKey) + GANG.ATTACK_PHASE_1_START_HOUR * 3600_000,
        endsAtMs: midnightMsOf(addDays(ctx.dateKey, 1)),
        sides: {
          attacker: { orgType: 'intel', orgId: 'main', name: INTEL.NAME, logo: INTEL.LOGO, role: 'attacker' },
          defender: { orgType: 'gang', orgId: truck.gangId, name: dg.name, logo: dg.logo, role: 'defender' },
        },
        display: { attacker: 0 },
        createdAtMs: ctx.now,
      });
      tx.update(ctx.ref.intelReport(reportId), { opWarId: warId });
      ledger(tx, ctx, { type: 'intel_op_cost', amount: price, from: { kind: 'intel', id: 'main' }, to: { kind: 'burn' }, before: state.kasa, refId: warId });
      core.announceIntel(tx, ctx, '🎯', `${me.data().codeName}, TIR #${truck.code} (${dg.name}) için operasyon başlattı (${fmt(price)})${bribe > 0 ? ` — rüşvet: ${fmt(bribe)}` : ''}.`);
      ctx.logs.push({ gang: 'intel_operation', world: ctx.worldId, warId, price });
      return { warId, price };
    });
  }

  // Tır sahibi, İstihbaratın belirlediği rüşveti 21:00'e kadar öder → operasyon durur.
  async function payBribe(ctx, data) {
    const warId = String(data.warId || '');
    if (ctx.hour >= GANG.HARAC_PAY_DEADLINE_HOUR) fail('deadline-exceeded', `Rüşvet süresi ${GANG.HARAC_PAY_DEADLINE_HOUR}:00'de kapandı.`);
    return core.db.runTransaction(async (tx) => {
      const { gangId, me } = await myGangRole(tx, ctx, LEADERS, 'Rüşveti sadece Mafya Babası ve Sağ Kol ödeyebilir.');
      const war = (await tx.get(ctx.ref.war(warId))).data();
      if (!war || war.type !== 'intelop' || war.defenderGangId !== gangId || !war.announced) fail('not-found', 'Operasyon bulunamadı.');
      if (war.status !== 'active' || war.bribePaid) fail('failed-precondition', 'Operasyon artık aktif değil.');
      if (!(war.bribe > 0)) fail('failed-precondition', 'İstihbarat bu operasyon için rüşvet kabul etmiyor.');
      const [st, intelSt] = await Promise.all([tx.get(ctx.ref.gangState(gangId)), tx.get(ctx.ref.intelState())]);
      if (Number(st.data()?.kasa || 0) < war.bribe) fail('failed-precondition', 'Kasada yeterli para yok.');
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-war.bribe) });
      if (intelSt.exists) tx.update(ctx.ref.intelState(), { kasa: FV.increment(war.bribe) });
      tx.update(ctx.ref.war(warId), { status: 'cancelled_bribe', bribePaid: true, activeGangIds: [], resolvedAtMs: ctx.now });
      ledger(tx, ctx, { type: 'bribe_paid', amount: war.bribe, from: { kind: 'gang', id: gangId }, to: { kind: 'intel', id: 'main' }, before: st.data()?.kasa, refId: warId });
      announce(tx, ctx, gangId, '💼', `${me.name}, TIR #${war.truckCode} için İstihbarata ${fmt(war.bribe)} rüşvet ödedi — operasyon durdu.`);
      core.announceIntel(tx, ctx, '💼', `TIR #${war.truckCode} sahibi ${fmt(war.bribe)} rüşvet ödedi — operasyon durdu, para kasada.`);
      return { paid: war.bribe };
    });
  }

  return {
    rollDice,
    sumShards,
    offerBet,
    respondBet,
    withdrawBet,
    suggest,
    requestAlliance,
    respondAlliance,
    endAlliance,
    sendAllianceNote,
    startSabotage,
    requestSabotage,
    payHarac,
    startOperation,
    payBribe,
    sabotagePrice,
    betLimit,
    readActiveAllies,
    midnightAllowance,
    productById,
    atLeast,
  };
}
