// Çete kurma / katılma / ayrılma / atma / saygı / profil / bağış / sohbet
import { GANG, LOGO_EMOJIS, LOGO_COLORS, LOGO_BGS, RANK_LABELS, isRanked, rankLevel } from '../config.js';

export function createMembershipActions(core, intelHelpers) {
  const { FV, fail, readWallet, debitGold, readMembership, planRemoval, applyRemoval, ledger, gangLog, notify, systemChat, cleanText, posInt, nameKeyOf, requireGangMember, requireRank, requestGuard } = core;

  function validLogo(logo) {
    const l = logo || {};
    const emoji = LOGO_EMOJIS.includes(l.emoji) ? l.emoji : null;
    const color = LOGO_COLORS.includes(l.color) ? l.color : null;
    const bg = LOGO_BGS.includes(l.bg) ? l.bg : null;
    if (!emoji || !color || !bg) fail('invalid-argument', 'Geçersiz logo seçimi.');
    return { emoji, color, bg };
  }

  // ---------------------------------------------------------------------------
  // createGang — şartlar: 1M altın, 100 saygınlık, 40.000 güç.
  // Başka çetedeyse o çeteden çıkar (prestij silinir), İstihbarattaysa
  // İstihbarattan da çıkar. Kurucu = Mafya Babası, 10.000.000 prestij.
  // ---------------------------------------------------------------------------
  async function createGang(ctx, data) {
    const name = cleanText(data.name, { min: GANG.NAME_MIN, max: GANG.NAME_MAX, field: 'Çete adı' });
    const logo = validLogo(data.logo);
    const note = cleanText(data.note || '', { max: GANG.NOTE_MAX, field: 'Not' });
    const nameKey = nameKeyOf(name);
    const power = await core.readPower(ctx, ctx.actorId); // anlık görüntü

    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const nameSnap = await tx.get(ctx.ref.gangName(nameKey));
      let removalPlan = null;
      if (membership.gangId) {
        if (!data.confirmLeave) fail('failed-precondition', 'CONFIRM_LEAVE_REQUIRED');
        removalPlan = await planRemoval(tx, ctx, membership.gangId, ctx.actorId);
      }
      const intelPlan = membership.intelRosterId ? await intelHelpers.planIntelLeave(tx, ctx, membership) : null;

      if (nameSnap.exists) fail('already-exists', 'Bu çete adı alınmış.');
      if (wallet.gold < GANG.CREATE_MIN_GOLD || wallet.gold < GANG.CREATE_FEE) fail('failed-precondition', `Çete kurmak için ${GANG.CREATE_MIN_GOLD.toLocaleString('tr-TR')} altın gerekli.`);
      if (wallet.reputation < GANG.CREATE_MIN_REPUTATION) fail('failed-precondition', `Çete kurmak için ${GANG.CREATE_MIN_REPUTATION} saygınlık gerekli.`);
      const effectivePower = ctx.isTest ? wallet.testPower : power;
      if (effectivePower < GANG.CREATE_MIN_POWER) fail('failed-precondition', `Çete kurmak için ${GANG.CREATE_MIN_POWER.toLocaleString('tr-TR')} güç gerekli.`);

      // --- yazmalar ---
      if (GANG.CREATE_FEE > 0) {
        const before = wallet.gold;
        debitGold(tx, ctx, ctx.actorId, wallet, GANG.CREATE_FEE);
        ledger(tx, ctx, { type: 'gang_create_fee', amount: GANG.CREATE_FEE, from: { kind: 'player', id: ctx.actorId }, to: { kind: 'burn' }, before });
      }
      if (removalPlan) applyRemoval(tx, ctx, removalPlan, 'left_for_new_gang');
      if (intelPlan) intelHelpers.applyIntelLeave(tx, ctx, intelPlan, { silent: true });

      const gangRef = ctx.ref.gangs().doc();
      const gangId = gangRef.id;
      const stint = ctx.ref.gangs().doc().id; // bu üyeliğe özgü kimlik (ayrılıp gelince değişir)
      tx.set(gangRef, {
        name,
        nameKey,
        logo,
        note,
        status: 'active',
        memberCount: 1,
        babaId: ctx.actorId,
        babaName: wallet.displayName,
        routeProducts: [],
        createdAtMs: ctx.now,
      });
      tx.set(ctx.ref.gangState(gangId), {
        kasa: 0,
        kasaAtMidnight: 0,
        midnightDateKey: ctx.dateKey,
        distributableLeft: 0,
        orderSpent: { dateKey: null, byProduct: {} },
      });
      tx.set(ctx.ref.depot(gangId), { items: {}, capacity: 0, usedUnits: 0, reservedUnits: 0 });
      tx.set(ctx.ref.member(gangId, ctx.actorId), {
        name: wallet.displayName,
        avatar: wallet.avatar,
        rank: 'baba',
        prestige: GANG.FOUNDER_START_PRESTIGE,
        prestigeAtMidnight: GANG.FOUNDER_START_PRESTIGE,
        respected: false,
        stint,
        joinedAtMs: ctx.now,
        lastActiveAtMs: ctx.now,
        inactiveWarn: false,
      });
      tx.set(ctx.ref.gangName(nameKey), { gangId });
      tx.set(
        ctx.ref.membership(ctx.actorId),
        { gangId, gangRank: 'baba', gangJoinedAtMs: ctx.now, gangStint: stint, intelDecisionGangId: null, intelDecisionDeadline: null },
        { merge: true }
      );
      gangLog(tx, ctx, gangId, '🏴', `${wallet.displayName} çeteyi kurdu.`);
      systemChat(tx, ctx, ctx.ref.gangChat(gangId, 'genel'), `🏴 ${name} kuruldu.`);
      ctx.logs.push({ gang: 'gang_created', world: ctx.worldId, gangId, by: ctx.actorId });
      const result = { gangId };
      guard.save(result);
      return result;
    });
  }

  // ---------------------------------------------------------------------------
  // joinGang — açık katılım, yeni üye Çömez, prestij 0.
  // ---------------------------------------------------------------------------
  async function joinGang(ctx, data) {
    const gangId = String(data.gangId || '');
    if (!gangId) fail('invalid-argument', 'Çete seçilmedi.');
    return core.db.runTransaction(async (tx) => {
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangSnap = await tx.get(ctx.ref.gang(gangId));
      if (!gangSnap.exists || gangSnap.data().status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
      if (membership.gangId === gangId) fail('failed-precondition', 'Zaten bu çetedesin.');
      if (membership.gangExitDay?.[gangId] === ctx.dateKey) fail('failed-precondition', "Bugün ayrıldığın çeteye 00:00'a kadar giremezsin.");
      let removalPlan = null;
      if (membership.gangId) {
        if (!data.confirmLeave) fail('failed-precondition', 'CONFIRM_LEAVE_REQUIRED');
        removalPlan = await planRemoval(tx, ctx, membership.gangId, ctx.actorId);
      }
      if (removalPlan) applyRemoval(tx, ctx, removalPlan, 'left_for_other_gang');
      const stint = ctx.ref.gangs().doc().id;
      tx.set(ctx.ref.member(gangId, ctx.actorId), {
        name: wallet.displayName,
        avatar: wallet.avatar,
        rank: 'comez',
        prestige: 0,
        prestigeAtMidnight: 0,
        respected: false,
        stint,
        joinedAtMs: ctx.now,
        lastActiveAtMs: ctx.now,
        inactiveWarn: false,
      });
      tx.update(ctx.ref.gang(gangId), { memberCount: FV.increment(1) });
      tx.set(ctx.ref.membership(ctx.actorId), { gangId, gangRank: 'comez', gangJoinedAtMs: ctx.now, gangStint: stint }, { merge: true });
      core.announce(tx, ctx, gangId, '➕', `${wallet.displayName} çeteye katıldı.`);
      ctx.logs.push({ gang: 'membership', world: ctx.worldId, event: 'join', gangId, memberId: ctx.actorId });
      return { gangId };
    });
  }

  async function leaveGang(ctx) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const plan = await planRemoval(tx, ctx, gangId, ctx.actorId);
      if (!plan.member) fail('failed-precondition', 'Bir çetede değilsin.');
      const res = applyRemoval(tx, ctx, plan, 'left');
      if (!res.dissolved) core.announce(tx, ctx, gangId, '🚪', `${plan.member.name} çeteden ayrıldı.`);
      return { left: true, dissolved: res.dissolved };
    });
  }

  // Doğrudan atma: Baba → Tetikçi/Çömez; Sağ Kol → Çömez.
  async function kickMember(ctx, data) {
    const targetId = String(data.targetId || '');
    if (!targetId || targetId === ctx.actorId) fail('invalid-argument', 'Geçersiz üye.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const meSnap = await tx.get(ctx.ref.member(gangId, ctx.actorId));
      const plan = await planRemoval(tx, ctx, gangId, targetId);
      if (!plan.member) fail('failed-precondition', 'Bu oyuncu artık çetede değil.');
      const myRank = meSnap.data()?.rank;
      const t = plan.member.rank;
      const allowed = (myRank === 'baba' && (t === 'tetikci' || t === 'comez')) || (myRank === 'sagkol' && t === 'comez');
      if (!allowed) fail('permission-denied', 'Bu üyeyi doğrudan atamazsın (oylama gerekir).');
      applyRemoval(tx, ctx, plan, 'kicked', { notifyText: `🚫 ${plan.gang.name} çetesinden atıldın. Çete prestijin silindi.` });
      core.announce(tx, ctx, gangId, '🚫', `${plan.member.name}, ${meSnap.data().name} tarafından çeteden atıldı.`);
      return { kicked: true };
    });
  }

  // Mafya Babası saygısı: üyelik başına bir kez, +1.000.000 prestij.
  async function giveRespect(ctx, data) {
    const targetId = String(data.targetId || '');
    if (!targetId || targetId === ctx.actorId) fail('invalid-argument', 'Geçersiz üye.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const [meSnap, tSnap] = await Promise.all([tx.get(ctx.ref.member(gangId, ctx.actorId)), tx.get(ctx.ref.member(gangId, targetId))]);
      if (meSnap.data()?.rank !== 'baba') fail('permission-denied', 'Saygıyı sadece Mafya Babası gösterebilir.');
      if (!tSnap.exists) fail('failed-precondition', 'Bu oyuncu artık çetede değil.');
      if (tSnap.data().respected) fail('failed-precondition', 'Bu üyeye zaten saygı gösterildi.');
      tx.update(ctx.ref.member(gangId, targetId), { respected: true, prestige: FV.increment(GANG.RESPECT_PRESTIGE) });
      notify(tx, ctx, targetId, `🎩 Mafya Babası sana saygı gösterdi: +${GANG.RESPECT_PRESTIGE.toLocaleString('tr-TR')} prestij.`, 'prestige');
      gangLog(tx, ctx, gangId, '🎩', `Mafya Babası ${tSnap.data().name} adlı üyeye saygı gösterdi.`);
      ctx.logs.push({ gang: 'prestige', world: ctx.worldId, event: 'respect', gangId, memberId: targetId, amount: GANG.RESPECT_PRESTIGE });
      return { respected: true };
    });
  }

  // Ad/logo: Baba. Not: Baba + Sağ Kol.
  async function updateGangProfile(ctx, data) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const [meSnap, gangSnap] = await Promise.all([tx.get(ctx.ref.member(gangId, ctx.actorId)), tx.get(ctx.ref.gang(gangId))]);
      const rank = meSnap.data()?.rank;
      const gang = gangSnap.data();
      const upd = {};
      let newNameKey = null;
      if (data.name !== undefined || data.logo !== undefined) {
        if (rank !== 'baba') fail('permission-denied', 'Ad ve logoyu sadece Mafya Babası değiştirebilir.');
      }
      if (data.name !== undefined) {
        const name = cleanText(data.name, { min: GANG.NAME_MIN, max: GANG.NAME_MAX, field: 'Çete adı' });
        const key = nameKeyOf(name);
        if (key !== gang.nameKey) {
          const n = await tx.get(ctx.ref.gangName(key));
          if (n.exists) fail('already-exists', 'Bu çete adı alınmış.');
          newNameKey = key;
        }
        upd.name = name;
        upd.nameKey = key;
      }
      if (data.logo !== undefined) upd.logo = validLogo(data.logo);
      if (data.note !== undefined) {
        requireRank(rank, 'sagkol', 'Notu sadece Mafya Babası ve Sağ Kol değiştirebilir.');
        upd.note = cleanText(data.note, { max: GANG.NOTE_MAX, field: 'Not' });
      }
      if (Object.keys(upd).length === 0) return { updated: false };
      if (newNameKey) {
        tx.delete(ctx.ref.gangName(gang.nameKey));
        tx.set(ctx.ref.gangName(newNameKey), { gangId });
      }
      tx.update(ctx.ref.gang(gangId), upd);
      if (upd.name) gangLog(tx, ctx, gangId, '✏️', `Çetenin adı "${upd.name}" oldu.`);
      return { updated: true };
    });
  }

  // Bağış: altın → çete kasası, 1 altın = 5 prestij. (İstihbarata bağış yok.)
  async function donate(ctx, data) {
    const amount = posInt(data.amount);
    if (amount < GANG.MIN_DONATION) fail('invalid-argument', `En az ${GANG.MIN_DONATION} altın bağışlayabilirsin.`);
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const [memberSnap, stateSnap] = await Promise.all([tx.get(ctx.ref.member(gangId, ctx.actorId)), tx.get(ctx.ref.gangState(gangId))]);
      if (!memberSnap.exists || !stateSnap.exists) fail('failed-precondition', 'Çete bulunamadı.');
      const before = wallet.gold;
      debitGold(tx, ctx, ctx.actorId, wallet, amount);
      const prestige = Math.floor(amount * GANG.DONATION_PRESTIGE_PER_GOLD);
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(amount) });
      tx.update(ctx.ref.member(gangId, ctx.actorId), { prestige: FV.increment(prestige) });
      ledger(tx, ctx, { type: 'gang_donation', amount, from: { kind: 'player', id: ctx.actorId }, to: { kind: 'gang', id: gangId }, before });
      gangLog(tx, ctx, gangId, '💸', `${memberSnap.data().name} kasaya ${amount.toLocaleString('tr-TR')} altın bağışladı.`);
      ctx.logs.push({ gang: 'prestige', world: ctx.worldId, event: 'donation', gangId, memberId: ctx.actorId, amount: prestige });
      const result = { donated: amount, prestige };
      guard.save(result);
      return result;
    });
  }

  // ---------------------------------------------------------------------------
  // Sohbet — çete kanalları: genel (tüm üyeler) · yonetim (7 rütbeli).
  // Ayrıca TÜM ÇETELERİN rütbelilerinin yazdığı, tüm çete üyelerinin okuduğu
  // ortak sohbet (sendGlobalChat). Yeni katılan eski mesajları göremez
  // (rules: createdAtMs >= katılma zamanı). Sohbet aktiflik sayılmaz
  // (aktiflik = sadece savaşa katılım).
  // ---------------------------------------------------------------------------
  async function sendGangChat(ctx, data) {
    const channel = String(data.channel || 'genel');
    if (!['genel', 'yonetim'].includes(channel)) fail('invalid-argument', 'Geçersiz kanal.');
    const text = cleanText(data.text, { min: 1, max: GANG.CHAT_MAX, field: 'Mesaj' });
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const meSnap = await tx.get(ctx.ref.member(gangId, ctx.actorId));
      const me = meSnap.data();
      if (!me) fail('failed-precondition', 'Bir çetede değilsin.');
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      if (channel !== 'genel' && !isRanked(me.rank)) fail('permission-denied', 'Bu kanala sadece rütbeliler yazabilir.');
      if (me.lastChatAtMs && ctx.now - me.lastChatAtMs < GANG.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş!');
      tx.set(ctx.ref.gangChat(gangId, channel).doc(), {
        authorId: ctx.actorId,
        authorName: me.name,
        authorRank: me.rank,
        authorAvatar: wallet.avatar,
        text,
        createdAtMs: ctx.now,
      });
      tx.update(ctx.ref.member(gangId, ctx.actorId), { lastChatAtMs: ctx.now, avatar: wallet.avatar });
      return { sent: true };
    });
  }

  async function sendGlobalChat(ctx, data) {
    const text = cleanText(data.text, { min: 1, max: GANG.CHAT_MAX, field: 'Mesaj' });
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const [meSnap, gangSnap] = await Promise.all([tx.get(ctx.ref.member(gangId, ctx.actorId)), tx.get(ctx.ref.gang(gangId))]);
      const me = meSnap.data();
      if (!me) fail('failed-precondition', 'Bir çetede değilsin.');
      if (!isRanked(me.rank)) fail('permission-denied', 'Bu sohbete sadece çetelerin rütbelileri yazabilir.');
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      if (me.lastGlobalChatAtMs && ctx.now - me.lastGlobalChatAtMs < GANG.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş!');
      const g = gangSnap.data() || {};
      tx.set(ctx.ref.globalChat().doc(), {
        authorId: ctx.actorId,
        authorName: me.name,
        authorRank: me.rank,
        authorAvatar: wallet.avatar,
        gangId,
        gangName: g.name || '',
        gangLogo: g.logo || null,
        text,
        createdAtMs: ctx.now,
      });
      tx.update(ctx.ref.member(gangId, ctx.actorId), { lastGlobalChatAtMs: ctx.now });
      return { sent: true };
    });
  }

  return { createGang, joinGang, leaveGang, kickMember, giveRespect, updateGangProfile, donate, sendGangChat, sendGlobalChat, validLogo, RANK_LABELS, rankLevel };
}
