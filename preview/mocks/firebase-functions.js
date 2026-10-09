import { system, PREVIEW_UID, fakeDb, houses, shop, futbolPro, visits, raceTa, cosmetics } from './backend.js';
import { FieldValue } from '../../functions/gang/test/fakeFirestore.js';
import { sanitizeDrawing } from '../../functions/drawingData.js';
import { nextReaction, replyQuoteOf } from '../../functions/chatExtras.js';
export function getFunctions() {
  return {};
}
export function httpsCallable(functions, name) {
  return async (data) => {
    const request = { auth: { uid: PREVIEW_UID }, data };
    try {
      if (name === 'gangAction') return { data: await system.handleAction(request) };
      if (name === 'cosmeticsAction') return { data: await cosmetics.action(PREVIEW_UID, data) };
      if (name === 'raceHubAction') {
        if (data.action === 'taStart') return { data: await raceTa.start(request) };
        if (data.action === 'taFinish') return { data: await raceTa.finish(request) };
        if (data.action === 'taTimeout') return { data: await raceTa.timeout(request) };
        if (data.action === 'createTrainingRace' && window.__createTraining) return { data: await window.__createTraining(data.level) };
        return { data: { ok: true } };
      }
      if (name === 'forfeitRace') {
        await fakeDb.doc(`raceRooms/${data.roomId}`).set({ status: 'finished', winnerUid: 'bot' }, { merge: true });
        return { data: { ok: true } };
      }
      if (name === 'houseAction') return { data: await houses.houseAction(request) };
      if (name === 'shopAction') return { data: await shop.shopAction(request) };
      if (name === 'recordVenueVisit') return { data: await visits.recordVenueVisit(PREVIEW_UID, data) };
      if (name === 'futbolProAction') return { data: await futbolPro.action(PREVIEW_UID, data) };
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
      // v72 önizleme: genel sohbet (yanıt + tepki) ve Sixtagram çizim paylaşımı
      if (name === 'sendChatMessage') {
        let replyTo = null;
        if (data.replyToId) {
          const r = await fakeDb.doc(`globalChat/${data.replyToId}`).get();
          replyTo = r.exists ? replyQuoteOf(data.replyToId, r.data()) : null;
          if (!replyTo) throw Object.assign(new Error('Yanıtlanan mesaj artık yok.'), { code: 'failed-precondition' });
        }
        await fakeDb.collection('globalChat').doc().set({ uid: PREVIEW_UID, displayName: 'Önizleme Admin', avatar: null, text: data.text, ...(replyTo ? { replyTo } : {}), createdAt: FieldValue.serverTimestamp() });
        return { data: { ok: true } };
      }
      if (name === 'reactChatMessage') {
        const ref = fakeDb.doc(`globalChat/${data.msgId}`);
        const d = (await ref.get()).data();
        const r = nextReaction(d?.reactions?.[PREVIEW_UID], data.emoji);
        if (r.error) throw Object.assign(new Error(r.error), { code: 'invalid-argument' });
        await ref.update({ [`reactions.${PREVIEW_UID}`]: r.remove ? FieldValue.delete() : r.value });
        return { data: { ok: true } };
      }
      if (name === 'createSixtagramPost') {
        let attachment = null;
        if (data.attachment?.type === 'drawing') {
          const r = sanitizeDrawing(data.attachment);
          if (r.error) throw Object.assign(new Error(r.error), { code: 'invalid-argument' });
          attachment = r.drawing;
        }
        const now = Date.now();
        await fakeDb.collection('sixtagramPosts').doc().set({ uid: PREVIEW_UID, authorName: 'Önizleme Admin', authorAvatar: null, text: data.text || '', attachment, likeCount: 0, createdAt: FieldValue.serverTimestamp(), createdAtMs: now, expiresAtMs: now + 86400000 });
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
