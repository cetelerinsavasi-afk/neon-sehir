// KASA — serbest %20 + dağıtım havuzu + Baba'nın kendine aktarımı + çeteler
// arası gönderim (Çete + İstihbarat ortak mantık).
//
//  - Her gece 00:00'da kasanın %20'si "serbest" olur (distributableLeft).
//    Dağıtım, Baba'nın kendi hesabına aktarımı ve başka çeteye gönderim bu
//    TEK günlük hakkı paylaşır. (Sabotaj/sipariş/depo/tır/bahis kasanın
//    tamamını kullanabilir — onlar bu hakka dahil değil.)
//  - Dağıtım: yetkili (Çete: Baba/Sağ Kol · İstihbarat: Başkan/Şef) KİŞİ BAŞI
//    tutar ve EN FAZLA KAÇ KİŞİNİN alabileceğini seçer. Rütbeliler grubu
//    sabit 7 kişidir; diğer gruplarda en az 7 kişi seçilir. Havuz = kişi başı
//    × kişi sayısı. Grubun üyeleri 24 saat içinde elle alır (kişi başı bir
//    kez, ilk gelen alır); alınmayan tutar 24 saat sonra kasaya döner.
//    Dağıtım kimsenin prestijini düşürmez. Mafya Babası rütbeli dağıtımından
//    alabilir. İstihbaratta Başkan hiçbir dağıtımdan alamaz, dağıtımı yapan
//    da kendi dağıtımından alamaz.
//  - Baba kendi hesabına: serbest paradan; her altın için 5 prestij düşer.
//  - Başka çeteye: Baba/Sağ Kol, serbest paradan; iki çetenin sohbetine düşer.
//  - claim/iade aynı belge üzerinden transaction ile serileşir → çift claim,
//    çift iade, claim–iade yarışı imkânsız.
import { GANG, DIST_GROUPS, RANK_LABELS } from '../config.js';

export function createTreasuryActions(core) {
  const { FV, fail, readMembership, readWallet, creditGold, ledger, gangLog, announce, announceIntel, requestGuard, posInt, requireGangMember, requireIntel } = core;
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

  const GROUP_LABEL = { rutbeli: 'Rütbeliler', tetikci: 'Tetikçiler', comez: 'Çömezler', hepsi: 'Tüm üyeler' };
  const INTEL_GROUP_LABEL = { rutbeli: 'Rütbeliler', tetikci: 'Ajanlar', comez: 'Muhbirler', hepsi: 'Tüm üyeler' };

  function inGroup(rank, group, isIntel) {
    const eq = isIntel ? core.intelRankEquiv(rank) : rank;
    if (group === 'hepsi') return true;
    if (group === 'rutbeli') return eq === 'baba' || eq === 'sagkol' || eq === 'kidemli';
    if (group === 'tetikci') return eq === 'tetikci';
    if (group === 'comez') return eq === 'comez';
    return false;
  }

  function allowanceOf(state, dateKey) {
    return state?.midnightDateKey === dateKey ? Number(state.distributableLeft || 0) : 0;
  }

  function requireFree(state, dateKey, amount) {
    const allowance = allowanceOf(state, dateKey);
    if (amount > allowance) fail('failed-precondition', `Bugün serbest para: en fazla ${fmt(allowance)} altın.`);
    if (amount > Number(state?.kasa || 0)) fail('failed-precondition', 'Kasada yeterli para yok.');
  }

  // ---------------------------------------------------------------------------
  // Dağıtım aç
  // ---------------------------------------------------------------------------
  async function createDistribution(ctx, data) {
    const org = data.org === 'intel' ? 'intel' : 'gang';
    const isIntel = org === 'intel';
    const group = String(data.group || '');
    if (!DIST_GROUPS.includes(group)) fail('invalid-argument', 'Geçersiz grup.');
    const perPerson = posInt(data.perPerson, 'Kişi başı tutar');
    let slots;
    if (group === 'rutbeli') slots = GANG.DIST_RANKED_SLOTS;
    else {
      slots = posInt(data.slots, 'Kişi sayısı');
      if (slots < GANG.DIST_MIN_SLOTS) fail('invalid-argument', `En az ${GANG.DIST_MIN_SLOTS} kişi seçmelisin.`);
      if (slots > GANG.DIST_MAX_SLOTS) fail('invalid-argument', `En fazla ${GANG.DIST_MAX_SLOTS} kişi seçebilirsin.`);
    }
    const total = perPerson * slots;
    if (!Number.isSafeInteger(total)) fail('invalid-argument', 'Tutar çok büyük.');

    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const membership = await readMembership(tx, ctx, ctx.actorId);
      let orgId;
      let stateRef;
      let creatorName;
      let creatorKey;
      if (isIntel) {
        const rosterId = requireIntel(membership);
        const me = (await tx.get(ctx.ref.roster(rosterId))).data();
        if (me?.rank !== 'baskan' && me?.rank !== 'sef') fail('permission-denied', 'Dağıtımı sadece Başkan ve Şefler yapabilir.');
        orgId = 'main';
        stateRef = ctx.ref.intelState();
        creatorName = me.codeName;
        creatorKey = rosterId;
      } else {
        const gangId = requireGangMember(membership);
        const me = (await tx.get(ctx.ref.member(gangId, ctx.actorId))).data();
        if (me?.rank !== 'baba' && me?.rank !== 'sagkol') fail('permission-denied', 'Dağıtımı sadece Mafya Babası ve Sağ Kol yapabilir.');
        orgId = gangId;
        stateRef = ctx.ref.gangState(gangId);
        creatorName = me.name;
        creatorKey = ctx.actorId;
      }
      const state = (await tx.get(stateRef)).data() || {};
      requireFree(state, ctx.dateKey, total);

      const distRef = ctx.ref.distributions().doc();
      const groupLabel = (isIntel ? INTEL_GROUP_LABEL : GROUP_LABEL)[group];
      tx.update(stateRef, { kasa: FV.increment(-total), distributableLeft: FV.increment(-total) });
      tx.set(distRef, {
        orgType: org,
        orgId,
        group,
        groupLabel,
        createdByName: creatorName,
        creatorKey,
        perPerson,
        slots,
        total,
        claims: {},
        claimedCount: 0,
        claimedTotal: 0,
        status: 'open',
        createdAtMs: ctx.now,
        expiresAtMs: ctx.now + GANG.DISTRIBUTION_TTL_MS,
        openUntilMs: ctx.now + GANG.DISTRIBUTION_TTL_MS,
      });
      ledger(tx, ctx, { type: 'distribution_create', amount: total, from: { kind: org, id: orgId }, to: { kind: 'pool', id: distRef.id }, before: state.kasa, refId: distRef.id });
      const text = `${creatorName} altın dağıtıyor: ${groupLabel} · kişi başı ${fmt(perPerson)} · ${slots} kişi (24 saat). Savaş sekmesinden al!`;
      if (isIntel) announceIntel(tx, ctx, '💰', text);
      else announce(tx, ctx, orgId, '💰', text);
      const res = { distributionId: distRef.id, perPerson, slots, total };
      guard.save(res);
      return res;
    });
  }

  // ---------------------------------------------------------------------------
  // Payını al (ilk gelen, kişi başı bir kez)
  // ---------------------------------------------------------------------------
  async function claimDistribution(ctx, data) {
    const distId = String(data.distributionId || '');
    if (!distId) fail('invalid-argument', 'Dağıtım seçilmedi.');
    return core.db.runTransaction(async (tx) => {
      const distSnap = await tx.get(ctx.ref.distribution(distId));
      if (!distSnap.exists) fail('not-found', 'Dağıtım bulunamadı.');
      const dist = distSnap.data();
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const isIntel = dist.orgType === 'intel';
      let key;
      let who;
      if (isIntel) {
        key = membership.intelRosterId;
        who = key ? (await tx.get(ctx.ref.roster(key))).data() : null;
        if (!who) fail('permission-denied', 'Artık İstihbaratta değilsin.');
        if (who.rank === 'baskan') fail('permission-denied', 'Başkan İstihbarat kasasından kendine para alamaz.');
        if (key === dist.creatorKey) fail('permission-denied', 'Kendi açtığın dağıtımdan alamazsın.');
      } else {
        key = ctx.actorId;
        if (membership.gangId !== dist.orgId) fail('permission-denied', 'Bu çetenin üyesi değilsin.');
        who = (await tx.get(ctx.ref.member(dist.orgId, key))).data();
        if (!who) fail('permission-denied', 'Bu çetenin üyesi değilsin.');
      }
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      if (dist.status !== 'open' || ctx.now >= dist.expiresAtMs) fail('deadline-exceeded', 'Süre doldu, para kasaya döndü.');
      if (dist.claims?.[key]) fail('failed-precondition', 'Payını zaten aldın.');
      if (Number(who.joinedAtMs || 0) > Number(dist.createdAtMs || 0)) fail('permission-denied', 'Bu dağıtım sen katılmadan önce açıldı.');
      if (!inGroup(who.rank, dist.group, isIntel)) fail('permission-denied', `Bu dağıtım sadece ${dist.groupLabel} için.`);
      if (Number(dist.claimedCount || 0) >= Number(dist.slots || 0)) fail('resource-exhausted', 'Bu dağıtımın tüm payları alındı.');
      const before = wallet.gold;
      creditGold(tx, ctx, ctx.actorId, wallet, dist.perPerson);
      const name = isIntel ? who.codeName : who.name;
      const upd = {
        [`claims.${key}`]: { name, atMs: ctx.now },
        claimedCount: FV.increment(1),
        claimedTotal: FV.increment(dist.perPerson),
      };
      if (Number(dist.claimedCount || 0) + 1 >= Number(dist.slots || 0)) {
        upd.status = 'completed';
        upd.openUntilMs = FV.delete();
      }
      tx.update(ctx.ref.distribution(distId), upd);
      ledger(tx, ctx, { type: 'distribution_claim', amount: dist.perPerson, from: { kind: 'pool', id: distId }, to: { kind: 'player', id: ctx.actorId }, before, refId: distId });
      const text = `${name} dağıtımdan ${fmt(dist.perPerson)} altın aldı.`;
      if (isIntel) core.systemChat(tx, ctx, ctx.ref.intelChat('genel'), `💵 ${text}`);
      else core.systemChat(tx, ctx, ctx.ref.gangChat(dist.orgId, 'genel'), `💵 ${text}`);
      return { claimed: dist.perPerson };
    });
  }

  // Süresi dolan havuzun alınmayan kısmını kasaya iade eder (idempotent).
  // refundToDisbanded: dağılan çetenin temizliğinde, para önce kasaya döner
  // (sonra temizlik kasayı İstihbarata aktarır ya da yakar).
  async function expireDistribution(ctx, distId, { refundToDisbanded = false } = {}) {
    return core.db.runTransaction(async (tx) => {
      const snap = await tx.get(ctx.ref.distribution(distId));
      if (!snap.exists) return { skipped: true };
      const dist = snap.data();
      if (dist.status !== 'open' || ctx.now < dist.expiresAtMs) return { skipped: true };
      const stateRef = dist.orgType === 'intel' ? ctx.ref.intelState() : ctx.ref.gangState(dist.orgId);
      const stateSnap = await tx.get(stateRef);
      let orgActive = stateSnap.exists;
      if (dist.orgType === 'gang' && orgActive && !refundToDisbanded) {
        const g = await tx.get(ctx.ref.gang(dist.orgId));
        orgActive = g.exists && g.data().status === 'active';
      }
      const refund = Number(dist.total || 0) - Number(dist.claimedTotal || 0);
      tx.update(ctx.ref.distribution(distId), { status: 'expired', refunded: refund, openUntilMs: FV.delete(), expiredAtMs: ctx.now });
      if (refund > 0) {
        if (orgActive) {
          tx.update(stateRef, { kasa: FV.increment(refund) });
          ledger(tx, ctx, { type: 'distribution_refund', amount: refund, from: { kind: 'pool', id: distId }, to: { kind: dist.orgType, id: dist.orgId }, refId: distId, actorId: 'system' });
          if (dist.orgType === 'gang') gangLog(tx, ctx, dist.orgId, '↩️', `Alınmayan ${fmt(refund)} altın kasaya döndü.`);
          else core.intelLog(tx, ctx, '↩️', `Alınmayan ${fmt(refund)} altın kasaya döndü.`);
        } else {
          ledger(tx, ctx, { type: 'distribution_refund_burn', amount: refund, from: { kind: 'pool', id: distId }, to: { kind: 'burn' }, refId: distId, actorId: 'system' });
        }
      }
      ctx.logs.push({ gang: 'distribution_expired', world: ctx.worldId, distId, refund });
      return { refunded: refund };
    });
  }

  // ---------------------------------------------------------------------------
  // Baba → kendi hesabına (serbest paradan; prestij −tutar×5)
  // ---------------------------------------------------------------------------
  async function withdrawToSelf(ctx, data) {
    const amount = posInt(data.amount);
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const [meSnap, stateSnap] = await Promise.all([tx.get(ctx.ref.member(gangId, ctx.actorId)), tx.get(ctx.ref.gangState(gangId))]);
      const me = meSnap.data();
      if (me?.rank !== 'baba') fail('permission-denied', 'Kasadan kendi hesabına sadece Mafya Babası para alabilir.');
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const state = stateSnap.data() || {};
      requireFree(state, ctx.dateKey, amount);
      const penalty = amount * GANG.WITHDRAW_PRESTIGE_PER_GOLD;
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-amount), distributableLeft: FV.increment(-amount) });
      tx.update(ctx.ref.member(gangId, ctx.actorId), { prestige: FV.increment(-penalty) });
      const before = wallet.gold;
      creditGold(tx, ctx, ctx.actorId, wallet, amount);
      ledger(tx, ctx, { type: 'gang_withdraw_baba', amount, from: { kind: 'gang', id: gangId }, to: { kind: 'player', id: ctx.actorId }, before });
      announce(tx, ctx, gangId, '🏦', `Mafya Babası ${me.name} kasadan kendi hesabına ${fmt(amount)} altın aldı (prestij −${fmt(penalty)}).`);
      ctx.logs.push({ gang: 'prestige', world: ctx.worldId, event: 'withdraw_penalty', gangId, amount: -penalty });
      const res = { withdrawn: amount, prestigePenalty: penalty };
      guard.save(res);
      return res;
    });
  }

  // ---------------------------------------------------------------------------
  // Başka çeteye para gönder (Baba / Sağ Kol, serbest paradan)
  // ---------------------------------------------------------------------------
  async function transferToGang(ctx, data) {
    const amount = posInt(data.amount);
    const targetGangId = String(data.targetGangId || '');
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      if (!targetGangId || targetGangId === gangId) fail('invalid-argument', 'Geçersiz çete.');
      const [meSnap, stateSnap, myGangSnap, tgSnap, tStateSnap] = await Promise.all([
        tx.get(ctx.ref.member(gangId, ctx.actorId)),
        tx.get(ctx.ref.gangState(gangId)),
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.gang(targetGangId)),
        tx.get(ctx.ref.gangState(targetGangId)),
      ]);
      const me = meSnap.data();
      if (me?.rank !== 'baba' && me?.rank !== 'sagkol') fail('permission-denied', 'Başka çeteye parayı sadece Mafya Babası ve Sağ Kol gönderebilir.');
      if (tgSnap.data()?.status !== 'active' || !tStateSnap.exists) fail('failed-precondition', 'Bu çete artık yok.');
      const state = stateSnap.data() || {};
      requireFree(state, ctx.dateKey, amount);
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-amount), distributableLeft: FV.increment(-amount) });
      tx.update(ctx.ref.gangState(targetGangId), { kasa: FV.increment(amount) });
      ledger(tx, ctx, { type: 'gang_transfer', amount, from: { kind: 'gang', id: gangId }, to: { kind: 'gang', id: targetGangId }, before: state.kasa });
      const myName = myGangSnap.data()?.name || '';
      const tName = tgSnap.data()?.name || '';
      announce(tx, ctx, gangId, '📤', `${me.name} (${RANK_LABELS[me.rank]}) ${tName} çetesine ${fmt(amount)} altın gönderdi.`);
      announce(tx, ctx, targetGangId, '📥', `${myName} çetesi kasamıza ${fmt(amount)} altın gönderdi.`);
      const res = { sent: amount };
      guard.save(res);
      return res;
    });
  }

  return { createDistribution, claimDistribution, expireDistribution, withdrawToSelf, transferToGang, inGroup, allowanceOf };
}
