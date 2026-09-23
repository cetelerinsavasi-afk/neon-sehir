// OYLAMALAR — devirme / ayaklanma / rütbeli çıkarma
//  - Talep anında GİZLİ (sadece başlatan görür), 00:00'a kadar iptal edilebilir.
//  - 00:00'da şartlar yeniden doğrulanır; geçersizse sessizce iptal.
//  - Geçerliyse oylama 00:00'da başlar, 24 saat sürer. Oy hakkı başladığı
//    andaki 7 rütbeliye (Baba + 2 Sağ Kol + 4 Kıdemli) aittir (snapshot).
//  - Toplamlar canlı görünür; kimin ne oy verdiği görünmez (ballot belgesi
//    sadece sahibine okunur).
//  - Tetikçiler oylamaları görür ama oy veremez; Çömezler görmez (rules).
//  - Çıkarma oylaması %51'den fazla evetle geçer.
import { GANG } from '../config.js';

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
    const targetId = type === 'kick' ? String(data.targetId || '') : null;
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const gangId = requireGangMember(membership);
      const [meSnap, gangSnap, pendingSnap, activeSnap] = await Promise.all([
        tx.get(ctx.ref.member(gangId, ctx.actorId)),
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.pending(gangId).where('status', '==', 'pending')),
        tx.get(ctx.ref.votes(gangId).where('status', '==', 'active')),
      ]);
      const me = meSnap.data();
      const gang = gangSnap.data();
      const pending = pendingSnap.docs.map((d) => d.data());
      const active = activeSnap.docs.map((d) => d.data());
      let target = null;
      if (type === 'kick') {
        if (!targetId || targetId === ctx.actorId) fail('invalid-argument', 'Geçersiz hedef.');
        target = (await tx.get(ctx.ref.member(gangId, targetId))).data();
        if (!target) fail('failed-precondition', 'Bu oyuncu artık çetede değil.');
        if (!kickAllowed(me.rank, target.rank)) fail('permission-denied', 'Bu üye için çıkarma oylaması başlatamazsın.');
        // Başkalarının gizli talepleri ifşa edilmez: sadece süren oylamalar ve kendi talebin kontrol edilir.
        // Aynı hedefe birden çok gizli talep varsa 00:00'da ilki başlar, diğerleri sessizce düşer.
        if (active.some((v) => v.type === 'kick' && v.targetId === targetId)) fail('already-exists', 'Bu üye için zaten bir oylama var.');
        if (pending.some((v) => v.type === 'kick' && v.targetId === targetId && v.initiatorId === ctx.actorId)) fail('already-exists', 'Bu üye için zaten talebin var.');
      } else {
        if (me.rank !== 'sagkol') fail('permission-denied', 'Bunu sadece Sağ Kol başlatabilir.');
        const babaMember = (await tx.get(ctx.ref.member(gangId, gang.babaId))).data();
        if (type === 'devirme' && !((me.prestige || 0) > (babaMember?.prestige || 0))) {
          fail('failed-precondition', 'Devirme hakkı için prestijin Mafya Babasını geçmeli.');
        }
        if (pending.some((v) => v.type !== 'kick' && v.initiatorId === ctx.actorId)) fail('already-exists', 'Zaten bekleyen bir talebin var.');
        if (active.some((v) => v.type !== 'kick')) fail('failed-precondition', 'Şu an süren bir liderlik oylaması var.');
      }
      const ref = ctx.ref.pending(gangId).doc();
      tx.set(ref, {
        type,
        status: 'pending',
        initiatorId: ctx.actorId,
        initiatorName: me.name,
        targetId: type === 'kick' ? targetId : gang.babaId,
        targetName: type === 'kick' ? target.name : gang.babaName,
        requestedAtMs: ctx.now,
        startDateKey: null,
      });
      ctx.logs.push({ gang: 'vote_requested', world: ctx.worldId, gangId, type });
      return { pendingId: ref.id };
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
