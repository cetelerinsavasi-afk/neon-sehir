import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const actionFn = httpsCallable(functions, 'gangAction');

// Her sonuç doğuran işlem için istemci tarafı istek kimliği: aynı butona
// hızlı basılsa / ağ tekrarı olsa bile sunucu işlemi tek kez uygular.
export function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function callGang(mode, action, payload = {}) {
  const res = await actionFn({ world: mode.world, actAs: mode.world === 'test' ? mode.actorId : undefined, action, payload });
  return res.data;
}

// Firebase teknik hatalarını oyuncuya göstermeyiz — sunucunun kısa Türkçe
// mesajları (HttpsError) aynen, geri kalan her şey sade bir mesajla.
export function friendlyError(err) {
  const code = String(err?.code || '').replace('functions/', '');
  const msg = err?.message || '';
  if (code === 'internal' || code === 'unknown') return 'Bir şeyler ters gitti, tekrar dene.';
  if (code === 'unavailable' || (code === 'deadline-exceeded' && !msg)) return 'Bağlantı sorunu — tekrar dene.';
  if (code === 'unauthenticated') return 'Önce giriş yapmalısın.';
  if (code === 'aborted') return 'Başka bir işlemle çakıştı, tekrar dene.';
  if (!msg || /firebase|firestore|INTERNAL/i.test(msg)) return 'Bir şeyler ters gitti, tekrar dene.';
  return msg;
}
