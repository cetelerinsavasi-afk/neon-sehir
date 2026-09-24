import { system, PREVIEW_UID, fakeDb } from './backend.js';
export function getFunctions() {
  return {};
}
export function httpsCallable(functions, name) {
  return async (data) => {
    const request = { auth: { uid: PREVIEW_UID }, data };
    try {
      if (name === 'gangAction') return { data: await system.handleAction(request) };
      if (name === 'gangAdmin') return { data: await system.handleAdmin(request) };
      if (name === 'submitFeedback') {
        // önizleme: gerçek sunucu mantığının sadeleştirilmiş taklidi
        const text = String(data?.text || '').trim();
        if (text.length < 10) throw Object.assign(new Error('En az 10 karakter yaz.'), { code: 'invalid-argument' });
        await fakeDb.collection('feedback').doc().set({ uid: PREVIEW_UID, displayName: 'Önizleme', kind: data.kind, text, createdAtMs: Date.now() });
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
