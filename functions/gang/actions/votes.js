// OYLAMALAR — devirme / ayaklanma / rütbeli çıkarma (v33)
//  - Oylama SADECE 00:00–12:00 arasında başlatılır ve ANINDA başlar
//    (gizli talep / bekleme yok). Ne zaman başlarsa başlasın o gecenin
//    00:00'ında biter (11:59'da başlayan ~12 saat, 00:00'da başlayan 24 saat).
//  - 00:00'da önce oylamalar sonuçlanır, SONRA rütbeler yeniden hesaplanır;
//    rütbeler gün içinde değişmediği için oylama boyunca oy hakları sabittir.
//  - Oy hakkı başladığı andaki 7 rütbeliye (Baba + 2 Sağ Kol + 4 Kıdemli).
//  - Toplamlar canlı görünür; kimin ne oy verdiği görünmez (ballot belgesi
//    sadece sahibine okunur). Tetikçiler görür ama oy veremez; Çömezler görmez.
//  - Aynı anda tek liderlik oylaması (devirme/ayaklanma) ve bir üyeye tek
//    çıkarma oylaması: kilit belgeleri (voteLocks) ile yarış koşulsuz.
//  - Eski "bekleyen talep" belgeleri (v32'den kalan) 00:00'da başlatılmaya
//    devam eder (veri kaybı yok); yeni talep oluşturulmaz.
import { GANG } from '../config.js';
import { addDays, midnightMsOf } from '../time.js';

export function createVoteActions(core) {
  const { FV, fail, readMembership, requireGangMember } = core;

  const TYPES = ['devirme', 'ayaklanma', 'kick'];

  // Çıkarma OYLAMASI yetkileri (doğrudan atılamayanlar için):
  //   Baba → Sağ Kol / Kıdemli; Sağ Kol → Kıdemli / Tetikçi; Kıdemli → Tetikçi / Çömez
  const KICK_VOTE_TARGETS = { baba: ['sagkol', 'kidemli'], sagkol: ['kidemli', 'tetikci'], kidemli: ['tetikci', 'comez'] };
  function kickAllowed(initiatorRank, targetRank) {
    return (KICK_VOTE_TARGETS[initiatorRank] || []).includes(targetRank);
  }

  async function requestVote(ctx, data) {
    const type = String(data.type || '');
    if (!TYPES.includes(type)) fail('invalid-argument', 'Geçersiz oylama türü.');
    if (ctx.hour >= GANG.VOTE_START_DEADLINE_HOUR) fail('deadline-exceeded', 'Oylama sadece 00:00–12:00 arasında başlatılabilir.');
    const targetId = type === 'kick' ? String(data.targetId || '') : null;
    if (type === 'kick' && (!targetId || targetId === ctx.actorId)) fail('invalid-argument', 'Geçersiz hedef.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const lockKey = type === 'kick' ? `kick_${targetId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}` : 'leadership';
      const lockRef = ctx.ref.voteLock(gangId, lockKey);
      const [gangSnap, membersSnap, activeSnap, lockSnap] = await Promise.all([
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.members(gangId)),
        tx.get(ctx.ref.votes(gangId).where('status', '==', 'active')),
        tx.get(lockRef),
      ]);
      const gang = gangSnap.data();
      if (gang?.status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
      const members = new Map(membersSnap.docs.map((d) => [d.id, d.data()]));
      const me = members.get(ctx.actorId);
      if (!me) fail('failed-precondition', 'Bir çetede değilsin.');
      const active = activeSnap.docs.map((d) => d.data());
      // Kilit: aynı konuda süren oylama varsa yenisi açılamaz (eşzamanlı çift istek dahil)
      if (lockSnap.exists && Number(lockSnap.data().endsAtMs || 0) > ctx.now) {
        const lv = (await tx.get(ctx.ref.votes(gangId).doc(lockSnap.data().voteId))).data();
        if (lv?.status === 'active') fail('already-exists', type === 'kick' ? 'Bu üye için zaten bir oylama var.' : 'Şu an süren bir liderlik oylaması var.');
      }
      let target;
      if (type === 'kick') {
        target = members.get(targetId);
        if (!target) fail('failed-precondition', 'Bu oyuncu artık çetede değil.');
        if (!kickAllowed(me.rank, target.rank)) fail('permission-denied', 'Bu üye için çıkarma oylaması başlatamazsın.');
        if (active.some((v) => v.type === 'kick' && v.targetId === targetId)) fail('already-exists', 'Bu üye için zaten bir oylama var.');
      } else {
        if (me.rank !== 'sagkol') fail('permission-denied', 'Bunu sadece Sağ Kol başlatabilir.');
        target = members.get(gang.babaId);
        if (!target) fail('failed-precondition', 'Mafya Babası bulunamadı.');
        if (type === 'devirme' && !((me.prestige || 0) > (target.prestige || 0))) fail('failed-precondition', 'Devirme hakkı için prestijin Mafya Babasını geçmeli.');
        if (active.some((v) => v.type !== 'kick')) fail('failed-precondition', 'Şu an süren bir liderlik oylaması var.');
      }
      const voters = [...members.entries()].filter(([, m]) => ['baba', 'sagkol', 'kidemli'].includes(m.rank));
      const voterIds = voters.map(([id]) => id);
      const endsAtMs = midnightMsOf(addDays(ctx.dateKey, 1));
      const voteRef = ctx.ref.votes(gangId).doc();
      tx.set(voteRef, {
        type,
        status: 'active',
        initiatorId: ctx.actorId,
        initiatorName: me.name,
        targetId: type === 'kick' ? targetId : gang.babaId,
        targetName: target.name,
        // v34: kişi ayrılıp geri gelirse (yeni üyelik) eski oylamanın sonucundan etkilenmez
        initiatorStint: me.stint || null,
        targetStint: target.stint || null,
        voterIds,
        voterStint: Object.fromEntries(voters.map(([id, m]) => [id, m.stint || null])),
        yes: 0,
        no: 0,
        votedCount: 0,
        startDateKey: ctx.dateKey,
        startsAtMs: ctx.now,
        endsAtMs,
      });
      tx.set(lockRef, { voteId: voteRef.id, endsAtMs });
      const label = type === 'devirme' ? 'Devirme' : type === 'ayaklanma' ? 'Ayaklanma' : 'Çıkarma';
      for (const id of voterIds) if (id !== ctx.actorId) core.notify(tx, ctx, id, `🗳️ ${label} oylaması başladı (${gang.name}). 00:00'a kadar oyunu kullan.`, 'vote');
      ctx.logs.push({ gang: 'vote_started', world: ctx.worldId, gangId, type });
      return { voteId: voteRef.id };
    });
  }

  async function cancelVoteRequest(ctx, data) {
    const pendingId = String(data.pendingId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const ref = ctx.ref.pending(gangId).doc(pendingId);
      const p = (await tx.get(ref)).data();
      if (!p || p.initiatorId !== ctx.actorId) fail('not-found', 'Talep bulunamadı.');
      if (p.status !== 'pending') fail('failed-precondition', 'Bu talep artık iptal edilemez.');
      tx.update(ref, { status: 'cancelled', cancelReason: 'by_initiator' });
      return { cancelled: true };
    });
  }

  async function castVote(ctx, data) {
    const voteId = String(data.voteId || '');
    const choice = data.choice === 'yes' ? 'yes' : data.choice === 'no' ? 'no' : null;
    if (!choice) fail('invalid-argument', 'Geçersiz oy.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const voteRef = ctx.ref.votes(gangId).doc(voteId);
      const ballotRef = ctx.ref.ballot(gangId, voteId, ctx.actorId);
      const [voteSnap, ballotSnap, meSnap] = await Promise.all([tx.get(voteRef), tx.get(ballotRef), tx.get(ctx.ref.member(gangId, ctx.actorId))]);
      const vote = voteSnap.data();
      if (!vote) fail('not-found', 'Oylama bulunamadı.');
      if (vote.status !== 'active' || ctx.now >= vote.endsAtMs) fail('deadline-exceeded', 'Oylama kapandı.');
      if (!(vote.voterIds || []).includes(ctx.actorId)) fail('permission-denied', 'Bu oylamada oy hakkın yok.');
      if (!meSnap.exists || meSnap.data().stint !== vote.voterStint?.[ctx.actorId]) fail('permission-denied', 'Bu oylamada oy hakkın yok.');
      if (ballotSnap.exists) fail('already-exists', 'Oyunu zaten kullandın.');
      tx.set(ballotRef, { choice, atMs: ctx.now });
      tx.update(voteRef, { [choice === 'yes' ? 'yes' : 'no']: FV.increment(1), votedCount: FV.increment(1) });
      ctx.logs.push({ gang: 'vote_cast', world: ctx.worldId, gangId, voteId });
      return { voted: true };
    });
  }

  // Sonuç kuralı (geçerli oylara göre; oy kullanmayan sayılmaz)
  function voteOutcome(vote) {
    const yes = Number(vote.yes || 0);
    const no = Number(vote.no || 0);
    const total = yes + no;
    const ratio = total > 0 ? yes / total : 0;
    if (vote.type === 'devirme') return { passed: total > 0 && ratio >= GANG.DEVIRME_MIN_RATIO, ratio };
    if (vote.type === 'ayaklanma') return { passed: total > 0 && ratio > GANG.AYAKLANMA_MIN_RATIO_EXCLUSIVE, ratio };
    return { passed: total > 0 && ratio > GANG.KICK_MIN_RATIO_EXCLUSIVE, ratio };
  }

  return { requestVote, cancelVoteRequest, castVote, voteOutcome, kickAllowed };
}
