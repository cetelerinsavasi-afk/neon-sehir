// İSTİHBARAT — sabit organizasyon (sabit ad + sabit logo), kod adıyla gizli
// kimlik, çetelere sızma (ihbar / içerik sızdırma), operasyon, rüşvet,
// İstihbarat üyesi Mafya Babası olursa karar paneli.
// Güncel onaylı kurallar: katılım şartı SADECE 50+ saygınlık (polislik
// şartı yok), karşı istihbarat yok, operasyona ekstra maliyet yok (sadece
// sabotaj ücreti).
import { GANG, INTEL, atLeast } from '../config.js';

const CODENAME_RE = /^[\p{L}\p{N}_\-. ]+$/u;

export function createIntelActions(core) {
  const { FV, fail, readMembership, readWallet, intelLog, announceIntel, notify, systemChat, cleanText, requireIntel } = core;

  const linkRef = (ctx, rosterId) => core.db.doc(`gangWorlds/${ctx.worldId}/intelRosterLinks/${rosterId}`);

  function intelDefaults() {
    return { name: INTEL.NAME, logo: INTEL.LOGO, note: 'Şehrin gölgesinde, her yerde.', memberCount: 0 };
  }
  function intelStateDefaults(ctx) {
    return { kasa: 0, kasaAtMidnight: 0, midnightDateKey: ctx.dateKey, distributableLeft: 0 };
  }

  // --- İstihbarattan ayrılma (sessiz): prestij silinir, kod adı serbest ---
  async function planIntelLeave(tx, ctx, membership) {
    const rosterSnap = await tx.get(ctx.ref.roster(membership.intelRosterId));
    return { rosterId: membership.intelRosterId, roster: rosterSnap.data() || null, actorId: ctx.actorId, membership };
  }
  function applyIntelLeave(tx, ctx, plan, { actorId = null } = {}) {
    const who = actorId || plan.actorId;
    tx.delete(ctx.ref.roster(plan.rosterId));
    tx.delete(linkRef(ctx, plan.rosterId));
    if (plan.roster?.codeName) tx.delete(ctx.ref.codeName(core.nameKeyOf(plan.roster.codeName)));
    tx.set(
      ctx.ref.membership(who),
      { intelRosterId: null, intelRank: null, intelCodeName: null, intelJoinedAtMs: null, intelDecisionGangId: null, intelDecisionDeadline: null },
      { merge: true }
    );
    tx.set(ctx.ref.intel(), { memberCount: FV.increment(-1) }, { merge: true });
    ctx.logs.push({ gang: 'intel_membership', world: ctx.worldId, event: 'leave' });
    // Gizlilik: kimseye "X ayrıldı" bildirimi GÖNDERİLMEZ.
  }

  function parseCodeName(v) {
    const codeName = cleanText(v, { min: INTEL.CODENAME_MIN, max: INTEL.CODENAME_MAX, field: 'Kod adı' });
    if (!CODENAME_RE.test(codeName)) fail('invalid-argument', 'Kod adında sadece harf, rakam, boşluk, _ - . kullanılabilir.');
    return { codeName, key: core.nameKeyOf(codeName) };
  }

  async function joinIntel(ctx, data) {
    const { codeName, key } = parseCodeName(data.codeName);
    return core.db.runTransaction(async (tx) => {
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const [codeSnap, intelSnap, stateSnap] = await Promise.all([tx.get(ctx.ref.codeName(key)), tx.get(ctx.ref.intel()), tx.get(ctx.ref.intelState())]);
      if (membership.intelRosterId) fail('failed-precondition', 'Zaten İstihbarattasın.');
      if (membership.gangRank === 'baba') fail('failed-precondition', 'Mafya Babası İstihbarata katılamaz.');
      if (wallet.reputation < INTEL.JOIN_MIN_REPUTATION) fail('failed-precondition', `İstihbarata katılmak için en az ${INTEL.JOIN_MIN_REPUTATION} saygınlık gerekli.`);
      if (codeSnap.exists) fail('already-exists', 'Bu kod adı kullanılıyor.');
      if (!intelSnap.exists) tx.set(ctx.ref.intel(), intelDefaults());
      if (!stateSnap.exists) tx.set(ctx.ref.intelState(), intelStateDefaults(ctx));
      const rosterRef = ctx.ref.rosterCol().doc();
      tx.set(rosterRef, { codeName, rank: 'muhbir', prestige: 0, joinedAtMs: ctx.now, lastActiveAtMs: ctx.now });
      tx.set(linkRef(ctx, rosterRef.id), { actorId: ctx.actorId });
      tx.set(ctx.ref.codeName(key), { rosterId: rosterRef.id });
      tx.set(
        ctx.ref.membership(ctx.actorId),
        { intelRosterId: rosterRef.id, intelRank: 'muhbir', intelCodeName: codeName, intelJoinedAtMs: ctx.now },
        { merge: true }
      );
      tx.set(ctx.ref.intel(), { memberCount: FV.increment(1) }, { merge: true });
      systemChat(tx, ctx, ctx.ref.intelChat('genel'), `🕵️ ${codeName} İstihbarata katıldı.`);
      ctx.logs.push({ gang: 'intel_membership', world: ctx.worldId, event: 'join' });
      return { rosterId: rosterRef.id, codeName };
    });
  }

  async function leaveIntel(ctx) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      requireIntel(membership);
      const plan = await planIntelLeave(tx, ctx, membership);
      applyIntelLeave(tx, ctx, plan);
      return { left: true };
    });
  }

  async function updateIntelNote(ctx, data) {
    const note = cleanText(data.note, { max: GANG.NOTE_MAX, field: 'Not' });
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const me = (await tx.get(ctx.ref.roster(rid))).data();
      if (!me || !['baskan', 'sef'].includes(me.rank)) fail('permission-denied', 'Notu sadece Başkan ve Şefler değiştirebilir.');
      tx.set(ctx.ref.intel(), { note }, { merge: true });
      return { updated: true };
    });
  }

  // Kod adı değiştirme (✏️) — benzersiz; eski mesajlarda eski ad kalır.
  async function changeCodeName(ctx, data) {
    const { codeName, key } = parseCodeName(data.codeName);
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const [me, codeSnap] = await Promise.all([tx.get(ctx.ref.roster(rid)), tx.get(ctx.ref.codeName(key))]);
      if (!me.exists) fail('failed-precondition', 'İstihbarat üyesi değilsin.');
      const oldName = me.data().codeName;
      const oldKey = core.nameKeyOf(oldName || '');
      if (oldKey === key && oldName === codeName) return { codeName };
      if (codeSnap.exists && codeSnap.data().rosterId !== rid) fail('already-exists', 'Bu kod adı kullanılıyor.');
      if (oldKey !== key) {
        tx.delete(ctx.ref.codeName(oldKey));
        tx.set(ctx.ref.codeName(key), { rosterId: rid });
      }
      tx.update(ctx.ref.roster(rid), { codeName });
      tx.set(ctx.ref.membership(ctx.actorId), { intelCodeName: codeName }, { merge: true });
      if (me.data().rank === 'baskan') tx.set(ctx.ref.intel(), { baskanCode: codeName }, { merge: true });
      systemChat(tx, ctx, ctx.ref.intelChat('genel'), `✏️ ${oldName} artık ${codeName} kod adını kullanıyor.`);
      return { codeName };
    });
  }

  // İstihbarat sohbeti: genel (tüm üyeler) + yonetim (Başkan, Şef, Uzman).
  async function sendIntelChat(ctx, data) {
    const channel = String(data.channel || 'genel');
    if (!['genel', 'yonetim'].includes(channel)) fail('invalid-argument', 'Geçersiz kanal.');
    const text = cleanText(data.text, { min: 1, max: GANG.CHAT_MAX, field: 'Mesaj' });
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const me = (await tx.get(ctx.ref.roster(rid))).data();
      if (!me) fail('failed-precondition', 'İstihbarat üyesi değilsin.');
      if (channel !== 'genel' && !atLeast(me.rank, 'kidemli')) fail('permission-denied', 'Bu kanala sadece rütbeliler yazabilir.');
      if (me.lastChatAtMs && ctx.now - me.lastChatAtMs < GANG.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş!');
      // Gerçek kimlik YOK: sadece kod adı + roster kimliği
      tx.set(ctx.ref.intelChat(channel).doc(), { rosterId: rid, codeName: me.codeName, rank: me.rank, text, createdAtMs: ctx.now });
      tx.update(ctx.ref.roster(rid), { lastChatAtMs: ctx.now });
      return { sent: true };
    });
  }

  // ---------------------------------------------------------------------------
  // İHBAR — İstihbarat üyesi, kendi çetesinde Tetikçi+ ise seferdeki tırı
  // ihbar edebilir. Bir tır (sefer) yalnızca BİR kez ihbar edilir.
  // ---------------------------------------------------------------------------
  async function reportTruck(ctx, data) {
    const truckId = String(data.truckId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!membership.gangId) fail('failed-precondition', 'Bir çetede değilsin.');
      const [meSnap, rosterSnap, truckSnap] = await Promise.all([
        tx.get(ctx.ref.member(membership.gangId, ctx.actorId)),
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.truck(truckId)),
      ]);
      const truck = truckSnap.data();
      if (!truck || truck.gangId !== membership.gangId) fail('permission-denied', 'Bu tırı göremezsin.');
      if (!atLeast(meSnap.data()?.rank, 'tetikci')) fail('permission-denied', 'Tırları görmek için en az Tetikçi olmalısın.');
      if (truck.status !== 'in_transit') fail('failed-precondition', 'Sadece seferdeki tırlar ihbar edilebilir.');
      const reportId = `${truckId}_${truck.departDateKey}`;
      const repSnap = await tx.get(ctx.ref.intelReport(reportId));
      if (repSnap.exists) fail('already-exists', 'Bu tır zaten ihbar edildi.');
      const gang = (await tx.get(ctx.ref.gang(membership.gangId))).data();
      tx.set(ctx.ref.intelReport(reportId), {
        truckId,
        truckCode: truck.code,
        gangId: truck.gangId,
        gangName: gang?.name || truck.gangName,
        gangLogo: gang?.logo || null,
        departDateKey: truck.departDateKey,
        reportedByCode: rosterSnap.data().codeName,
        reportedAtMs: ctx.now,
        leaked: false,
        opWarId: null,
      });
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.REPORT_PRESTIGE) });
      announceIntel(tx, ctx, '📡', `${rosterSnap.data().codeName}, TIR #${truck.code} (${gang?.name || ''}) tırını ihbar etti.`);
      ctx.logs.push({ gang: 'intel_report', world: ctx.worldId, reportId });
      return { reportId, prestige: INTEL.REPORT_PRESTIGE };
    });
  }

  // İÇERİK SIZDIRMA — Kıdemli+ ; ihbar edilmiş tırın yükünü bir kez sızdırır.
  async function leakTruck(ctx, data) {
    const reportId = String(data.reportId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const repSnap = await tx.get(ctx.ref.intelReport(reportId));
      if (!repSnap.exists) fail('failed-precondition', 'Önce tır ihbar edilmeli.');
      const rep = repSnap.data();
      if (membership.gangId !== rep.gangId) fail('permission-denied', 'Bu tırın içeriğini göremezsin.');
      const [meSnap, rosterSnap, cargoSnap, truckSnap] = await Promise.all([
        tx.get(ctx.ref.member(rep.gangId, ctx.actorId)),
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.cargo(rep.truckId)),
        tx.get(ctx.ref.truck(rep.truckId)),
      ]);
      if (!atLeast(meSnap.data()?.rank, 'kidemli')) fail('permission-denied', 'Tır içeriğini görmek için en az Kıdemli olmalısın.');
      if (rep.leaked) fail('already-exists', 'Bu tırın içeriği zaten sızdırıldı.');
      if (truckSnap.data()?.status !== 'in_transit' || truckSnap.data()?.departDateKey !== rep.departDateKey) fail('failed-precondition', 'Bu sefer bitti.');
      const items = cargoSnap.data()?.items || {};
      const estReward = core.instantValueOf(items);
      const opSnap = rep.opWarId ? await tx.get(ctx.ref.war(rep.opWarId)) : null;
      // İçerik adetleri İstihbarata gösterilmez — sadece ödül değeri.
      tx.update(ctx.ref.intelReport(reportId), {
        leaked: true,
        estReward,
        leakedByCode: rosterSnap.data().codeName,
        leakedAtMs: ctx.now,
      });
      if (opSnap?.exists) tx.update(opSnap.ref, { estReward });
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.LEAK_PRESTIGE) });
      announceIntel(tx, ctx, '📦', `${rosterSnap.data().codeName}, TIR #${rep.truckCode} içeriğini sızdırdı — ödül değeri ${estReward.toLocaleString('tr-TR')}.`);
      ctx.logs.push({ gang: 'intel_leak', world: ctx.worldId, reportId });
      return { leaked: true, estReward, prestige: INTEL.LEAK_PRESTIGE };
    });
  }

  // ---------------------------------------------------------------------------
  // KARAR PANELİ — İstihbarat üyesi Mafya Babası olduysa sonraki 00:00'a kadar:
  //  'disband' → çete dağıtılır (tüm üyeler atılır), çökertme prestiji
  //  'stay'    → İstihbarattan (sessizce) ayrılır, Baba olarak devam
  // Karar verilmezse 00:00'da 'stay' uygulanır (bkz. clock).
  // ---------------------------------------------------------------------------
  async function intelDecision(ctx, data) {
    const choice = data.choice;
    if (!['disband', 'stay'].includes(choice)) fail('invalid-argument', 'Geçersiz seçim.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!membership.gangId || membership.intelDecisionGangId !== membership.gangId) fail('failed-precondition', 'Bekleyen bir karar yok.');
      if (membership.intelDecisionDeadline && ctx.dateKey >= membership.intelDecisionDeadline) fail('deadline-exceeded', 'Karar süresi doldu.');
      const gangId = membership.gangId;
      const [gangSnap, meSnap, rosterSnap] = await Promise.all([tx.get(ctx.ref.gang(gangId)), tx.get(ctx.ref.member(gangId, ctx.actorId)), tx.get(ctx.ref.roster(rid))]);
      if (meSnap.data()?.rank !== 'baba' || gangSnap.data()?.status !== 'active') fail('failed-precondition', 'Artık Mafya Babası değilsin.');
      if (choice === 'stay') {
        const plan = { rosterId: rid, roster: rosterSnap.data(), actorId: ctx.actorId, membership };
        applyIntelLeave(tx, ctx, plan);
        return { choice };
      }
      const gang = gangSnap.data();
      tx.update(ctx.ref.gang(gangId), { status: 'disbanded', dissolvedReason: 'intel_takedown', dissolvedAtMs: ctx.now, cleanupDone: false });
      if (gang.nameKey) tx.delete(ctx.ref.gangName(gang.nameKey));
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.TAKEDOWN_PRESTIGE) });
      tx.set(ctx.ref.membership(ctx.actorId), { intelDecisionGangId: null, intelDecisionDeadline: null }, { merge: true });
      announceIntel(tx, ctx, '💥', `${rosterSnap.data().codeName}, ${gang.name} çetesini İstihbarata teslim etti! Çetenin kasası İstihbarat kasasına geçiyor.`);
      ctx.logs.push({ gang: 'intel_takedown', world: ctx.worldId, gangId });
      ctx.afterCommit.push(() => core.cleanupGang(ctx, gangId));
      return { choice, gangId };
    });
  }

  // ---------------------------------------------------------------------------
  // Polis kancası: İstihbarat üyesi bir polis suçlu yakalayıp ödül aldığında
  // aldığı miktar kadar İstihbarat prestiji kazanır (idempotent: refId).
  // Sadece canlı dünya; oyuncunun kendi suçları dahil değildir (bu kanca
  // sadece polis yakalama ödülünde çağrılır).
  // ---------------------------------------------------------------------------
  async function awardPoliceReward(ctx, actorId, amount, refId) {
    if (!(amount > 0)) return { skipped: true };
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, actorId);
      if (!membership.intelRosterId) return { skipped: true };
      const markRef = ctx.ref.request(`police_${actorId}_${String(refId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)}`);
      const [mark, roster] = await Promise.all([tx.get(markRef), tx.get(ctx.ref.roster(membership.intelRosterId))]);
      if (mark.exists || !roster.exists) return { skipped: true };
      const prestige = Math.floor(amount * INTEL.POLICE_REWARD_PRESTIGE_PER_GOLD);
      tx.update(ctx.ref.roster(membership.intelRosterId), { prestige: FV.increment(prestige) });
      tx.set(markRef, { atMs: ctx.now, prestige });
      ctx.logs.push({ gang: 'prestige', world: ctx.worldId, event: 'police_reward', amount: prestige });
      return { prestige };
    });
  }

  // ---------------------------------------------------------------------------
  // İSTİHBARAT ATMA SİSTEMİ (devirme/ayaklanma YOK)
  //  - Anında: Başkan → Ajan / Muhbir; Şef → Muhbir.
  //  - Oylama: Başkan ve Şef doğrudan atamadıkları herkes için (Şef, Başkan'ı
  //    da oylamaya götürebilir); Uzman, Başkan hariç herkes için.
  //  - Başkan için > %66, diğerleri için ≥ %51 evet gerekir. Başarısız
  //    oylamada hiçbir şey değişmez. Atılanın yeri 00:00'da dolar (rütbe).
  //  - Talep 00:00'a kadar gizli/iptal edilebilir; oylama 00:00'da başlar,
  //    24 saat sürer; oy hakkı o anki Başkan + Şefler + Uzmanlar (snapshot).
  // ---------------------------------------------------------------------------
  const DIRECT_KICK = { baskan: ['ajan', 'muhbir'], sef: ['muhbir'] };
  function intelKickVoteAllowed(initRank, targetRank) {
    if (!targetRank) return false;
    if (initRank === 'baskan' || initRank === 'sef') return !(DIRECT_KICK[initRank] || []).includes(targetRank);
    if (initRank === 'uzman') return targetRank !== 'baskan';
    return false;
  }
  function intelVoteOutcome(vote) {
    const yes = Number(vote.yes || 0);
    const no = Number(vote.no || 0);
    const total = yes + no;
    const ratio = total > 0 ? yes / total : 0;
    const passed = total > 0 && (vote.targetWasBaskan ? ratio > INTEL.KICK_BASKAN_MIN_RATIO_EXCLUSIVE : ratio >= INTEL.KICK_MIN_RATIO);
    return { passed, ratio };
  }

  async function removeFromIntel(tx, ctx, rosterId, roster, reasonText) {
    const link = await tx.get(linkRef(ctx, rosterId));
    const actorId = link.data()?.actorId || null;
    const ms = actorId ? await readMembership(tx, ctx, actorId) : null;
    return () => {
      if (!actorId || !ms || ms.intelRosterId !== rosterId) {
        // bağlantı yoksa sadece roster temizliği
        tx.delete(ctx.ref.roster(rosterId));
        tx.delete(linkRef(ctx, rosterId));
        if (roster?.codeName) tx.delete(ctx.ref.codeName(core.nameKeyOf(roster.codeName)));
        tx.set(ctx.ref.intel(), { memberCount: FV.increment(-1) }, { merge: true });
        return;
      }
      applyIntelLeave(tx, ctx, { rosterId, roster, actorId, membership: ms }, { actorId });
      notify(tx, ctx, actorId, reasonText, 'intel');
    };
  }

  async function kickIntelMember(ctx, data) {
    const targetRosterId = String(data.targetRosterId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!targetRosterId || targetRosterId === rid) fail('invalid-argument', 'Geçersiz üye.');
      const [me, target] = await Promise.all([tx.get(ctx.ref.roster(rid)), tx.get(ctx.ref.roster(targetRosterId))]);
      if (!target.exists) fail('failed-precondition', 'Bu ajan artık İstihbaratta değil.');
      if (!(DIRECT_KICK[me.data()?.rank] || []).includes(target.data().rank)) fail('permission-denied', 'Bu üyeyi doğrudan atamazsın (oylama gerekir).');
      const apply = await removeFromIntel(tx, ctx, targetRosterId, target.data(), '🚫 İstihbarattan çıkarıldın. İstihbarat prestijin silindi.');
      apply();
      announceIntel(tx, ctx, '🚫', `${target.data().codeName}, ${me.data().codeName} tarafından İstihbarattan çıkarıldı.`);
      return { kicked: true };
    });
  }

  async function requestIntelKickVote(ctx, data) {
    const targetRosterId = String(data.targetRosterId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!targetRosterId || targetRosterId === rid) fail('invalid-argument', 'Geçersiz hedef.');
      const [me, target, pend, act] = await Promise.all([
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.roster(targetRosterId)),
        tx.get(ctx.ref.intelPending().where('status', '==', 'pending')),
        tx.get(ctx.ref.intelVotes().where('status', '==', 'active')),
      ]);
      if (!target.exists) fail('failed-precondition', 'Bu ajan artık İstihbaratta değil.');
      if (!intelKickVoteAllowed(me.data()?.rank, target.data().rank)) fail('permission-denied', 'Bu üye için çıkarma oylaması başlatamazsın.');
      if ([...pend.docs, ...act.docs].some((d) => d.data().targetRosterId === targetRosterId)) fail('already-exists', 'Bu üye için zaten bir oylama var.');
      const ref = ctx.ref.intelPending().doc();
      tx.set(ref, {
        type: 'kick',
        status: 'pending',
        initiatorRosterId: rid,
        initiatorCode: me.data().codeName,
        targetRosterId,
        targetCode: target.data().codeName,
        requestedAtMs: ctx.now,
      });
      return { pendingId: ref.id };
    });
  }

  async function cancelIntelVoteRequest(ctx, data) {
    const pendingId = String(data.pendingId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const ref = ctx.ref.intelPending().doc(pendingId);
      const p = (await tx.get(ref)).data();
      if (!p || p.initiatorRosterId !== rid) fail('not-found', 'Talep bulunamadı.');
      if (p.status !== 'pending') fail('failed-precondition', 'Bu talep artık iptal edilemez.');
      tx.update(ref, { status: 'cancelled', cancelReason: 'by_initiator' });
      return { cancelled: true };
    });
  }

  async function castIntelVote(ctx, data) {
    const voteId = String(data.voteId || '');
    const choice = data.choice === 'yes' ? 'yes' : data.choice === 'no' ? 'no' : null;
    if (!choice) fail('invalid-argument', 'Geçersiz oy.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const voteRef = ctx.ref.intelVotes().doc(voteId);
      const [voteSnap, ballotSnap] = await Promise.all([tx.get(voteRef), tx.get(ctx.ref.intelBallot(voteId, rid))]);
      const vote = voteSnap.data();
      if (!vote) fail('not-found', 'Oylama bulunamadı.');
      if (vote.status !== 'active' || ctx.now >= vote.endsAtMs) fail('deadline-exceeded', 'Oylama kapandı.');
      if (!(vote.voterIds || []).includes(rid)) fail('permission-denied', 'Bu oylamada oy hakkın yok.');
      if (ballotSnap.exists) fail('already-exists', 'Oyunu zaten kullandın.');
      tx.set(ctx.ref.intelBallot(voteId, rid), { choice, atMs: ctx.now });
      tx.update(voteRef, { [choice]: FV.increment(1), votedCount: FV.increment(1) });
      return { voted: true };
    });
  }

  // 00:00: biten oylamalar sonuçlanır, bekleyen talepler (geçerliyse) başlar.
  async function resolveIntelVotes(ctx, safe) {
    const act = await ctx.ref.intelVotes().where('status', '==', 'active').get();
    for (const d of act.docs) {
      if (d.data().endsAtMs > ctx.now) continue;
      await safe(ctx, `intel-vote:${d.id}`, () =>
        core.db.runTransaction(async (tx) => {
          const vote = (await tx.get(d.ref)).data();
          if (!vote || vote.status !== 'active' || vote.endsAtMs > ctx.now) return;
          const target = await tx.get(ctx.ref.roster(vote.targetRosterId));
          const { passed, ratio } = intelVoteOutcome(vote);
          const pct = `%${Math.round(ratio * 100)}`;
          const result = { passed, ratio, yes: vote.yes || 0, no: vote.no || 0 };
          if (!target.exists) {
            tx.update(d.ref, { status: 'cancelled', cancelReason: 'member_left', resolvedAtMs: ctx.now, result });
            return;
          }
          let apply = null;
          if (passed) apply = await removeFromIntel(tx, ctx, vote.targetRosterId, target.data(), `🗳️ Oylama sonucu İstihbarattan çıkarıldın (${pct}).`);
          tx.update(d.ref, { status: 'resolved', resolvedAtMs: ctx.now, result });
          if (apply) apply();
          announceIntel(tx, ctx, '🗳️', passed ? `${vote.targetCode} oylamayla İstihbarattan çıkarıldı (${pct}).` : `${vote.targetCode} için çıkarma oylaması reddedildi (${pct}).`);
        })
      );
    }
  }

  async function startIntelPendingVotes(ctx) {
    return core.db.runTransaction(async (tx) => {
        const [pendSnap, rosterSnap] = await Promise.all([tx.get(ctx.ref.intelPending().where('status', '==', 'pending')), tx.get(ctx.ref.rosterCol())]);
        const roster = new Map(rosterSnap.docs.map((d) => [d.id, d.data()]));
        const voters = [...roster.entries()].filter(([, r]) => ['baskan', 'sef', 'uzman'].includes(r.rank)).map(([id]) => id);
        const pend = pendSnap.docs.map((d) => ({ ref: d.ref, ...d.data() })).filter((p) => p.requestedAtMs < ctx.now);
        pend.sort((a, b) => a.requestedAtMs - b.requestedAtMs);
        const started = new Set();
        for (const p of pend) {
          const ini = roster.get(p.initiatorRosterId);
          const tgt = roster.get(p.targetRosterId);
          if (!ini || !tgt || started.has(p.targetRosterId) || !intelKickVoteAllowed(ini.rank, tgt.rank)) {
            tx.update(p.ref, { status: 'cancelled', cancelReason: 'invalid_at_midnight' });
            continue;
          }
          started.add(p.targetRosterId);
          const vRef = ctx.ref.intelVotes().doc();
          tx.set(vRef, {
            type: 'kick',
            status: 'active',
            initiatorCode: ini.codeName,
            targetRosterId: p.targetRosterId,
            targetCode: tgt.codeName,
            targetWasBaskan: tgt.rank === 'baskan',
            voterIds: voters,
            yes: 0,
            no: 0,
            votedCount: 0,
            startsAtMs: ctx.now,
            endsAtMs: ctx.now + 24 * 3600_000,
          });
          tx.update(p.ref, { status: 'started', voteId: vRef.id });
        }
    });
  }

  // Şüpheyle yakalanma cezası → İstihbarat kasası (idempotent: refId)
  async function creditFineToIntel(ctx, amount, refId) {
    return core.db.runTransaction(async (tx) => {
      const markRef = ctx.ref.request(`fine_${String(refId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}`);
      const [mark, st] = await Promise.all([tx.get(markRef), tx.get(ctx.ref.intelState())]);
      if (mark.exists) return { skipped: true };
      if (!st.exists) tx.set(ctx.ref.intelState(), { ...intelStateDefaults(ctx), kasa: amount });
      else tx.update(ctx.ref.intelState(), { kasa: FV.increment(amount) });
      tx.set(markRef, { atMs: ctx.now, amount });
      core.ledger(tx, ctx, { type: 'intel_fine_income', amount, from: { kind: 'system' }, to: { kind: 'intel', id: 'main' }, refId: String(refId).slice(0, 100), actorId: 'system' });
      intelLog(tx, ctx, '🚓', `Şüpheyle yakalanan bir suçlunun cezası kasaya girdi: +${amount.toLocaleString('tr-TR')}`);
      return { credited: amount };
    });
  }

  return {
    creditFineToIntel,
    planIntelLeave,
    applyIntelLeave,
    joinIntel,
    leaveIntel,
    changeCodeName,
    kickIntelMember,
    requestIntelKickVote,
    cancelIntelVoteRequest,
    castIntelVote,
    intelKickVoteAllowed,
    intelVoteOutcome,
    updateIntelNote,
    sendIntelChat,
    reportTruck,
    leakTruck,
    intelDecision,
    awardPoliceReward,
    intelDefaults,
    intelStateDefaults,
    resolveIntelVotes,
    startIntelPendingVotes,
    linkRef,
  };
}
