import { system, PREVIEW_UID, fakeDb, houses } from './backend.js';
export function getFunctions() {
  return {};
}
export function httpsCallable(functions, name) {
  return async (data) => {
    const request = { auth: { uid: PREVIEW_UID }, data };
    try {
      if (name === 'gangAction') return { data: await system.handleAction(request) };
      if (name === 'houseAction') return { data: await houses.houseAction(request) };
      if (name === 'gangAdmin') return { data: await system.handleAdmin(request) };
      if (name === 'submitFeedback') {
        // önizleme: gerçek sunucu mantığının sadeleştirilmiş taklidi
        const text = String(data?.text || '').trim();
        if (text.length < 10) throw Object.assign(new Error('En az 10 karakter yaz.'), { code: 'invalid-argument' });
        await fakeDb.collection('feedback').doc().set({ uid: PREVIEW_UID, displayName: 'Önizleme', kind: data.kind, text, createdAtMs: Date.now() });
        return { data: { ok: true } };
      }
      if (name === 'getCreditInfo') {
        return { data: { vehicles: 420000, weapons: 85000, materials: 12500, factory: 350000, team: 0, total: 867500, limit: 173500, ratio: 0.2, termDays: 10, interest: 0.2, minAmount: 1000, credit: null, hasVehicleLoan: false, debtToState: 0 } };
      }
      if (name === 'takeCredit') {
        const amount = Number(data.amount);
        const now = Date.now();
        await fakeDb.doc(`users/${PREVIEW_UID}`).set({ credit: { principal: amount, totalOwed: Math.round(amount * 1.2), paid: 0, startedAtMs: now, dueAtMs: now + 10 * 86400000 } }, { merge: true });
        return { data: { ok: true, principal: amount } };
      }
      if (name === 'markAllMessagesRead') {
        const snap = await fakeDb.collection(`users/${PREVIEW_UID}/messages`).get();
        await Promise.all(snap.docs.map((d) => d.ref.set({ read: true }, { merge: true })));
        return { data: { ok: true, count: snap.size } };
      }
      if (name === 'toggleFeedbackLike') {
        const ref = fakeDb.doc(`feedback/${data.id}`);
        const d = (await ref.get()).data();
        const liked = Boolean(d.likes?.[PREVIEW_UID]);
        await ref.set({ likes: { ...(d.likes || {}), [PREVIEW_UID]: !liked }, likeCount: (d.likeCount || 0) + (liked ? -1 : 1) }, { merge: true });
        return { data: { ok: true } };
      }
      return { data: { ok: true } };
    } catch (err) {
      const e = new Error(err.message);
      e.code = `functions/${err.code || 'internal'}`;
      throw e;
    }
  };
}
