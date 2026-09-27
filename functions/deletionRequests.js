// =============================================================================
// deletionRequests.js — v62 Hesap silme talepleri + Yönetim Paneli'nden silme
// =============================================================================
//
// Akış (onaylı):
//   1) Oyuncu Profil › "Hesabımı Sil" → talep kaydı açılır (requestAccountDeletion)
//      ve eskisi gibi hazır e-posta da açılır (yönetici e-postayla da haberdar olur).
//      Web'deki /hesap-silme sayfasından yalnızca e-posta gelir; yönetici o talebi
//      panelde "E-postayla gelen talep ekle" ile e-posta adresinden kaydeder.
//   2) Yönetim Paneli › 🗑️ Silme (yalnızca YÖNETİCİ): talepler listelenir;
//      "Önizle" silme planını gösterir (engeller dahil), "Hesabı sil" planı
//      yeniden hesaplar, önizlenen planla aynıysa uygular; "Talebi iptal et"
//      talebi kapatır ve oyuncuya SMS gider.
//   Silme kodu yerel betikle AYNIDIR (functions/accountDeletion.js).
//
// Koleksiyon: deletionRequests/{uid} — { uid, name, email, source:'app'|'email',
//   status:'pending'|'processing'|'failed'|'cancelled', createdAtMs, ... }
//   Yalnızca sunucu yazar; oyuncu kendi talebini, yetkililer hepsini okur.
//   Silme tamamlanınca talep kaydı silinir; iz admin_logs'ta ('account_delete') kalır.
// =============================================================================

import { buildDeletionPlan, applyPlan, planFingerprint, TOMBSTONE_NAME } from './accountDeletion.js';

const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const OPEN = ['pending', 'processing', 'failed'];

// deps: { db, auth, FieldValue, FieldPath, HttpsError, requireAuth, onCall, getActor, logAction, callables, bootstrapAdminUids, now?, heavyOpts? }
export function createDeletionRequests({ db, auth, FieldValue, FieldPath, HttpsError, requireAuth, onCall, getActor, logAction, callables, bootstrapAdminUids = [], now = () => Date.now(), heavyOpts = {} }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const reqRef = (uid) => db.collection('deletionRequests').doc(uid);
  const sms = (uid, text) =>
    db.collection('users').doc(uid).collection('messages').add({ text, createdAt: FieldValue.serverTimestamp(), read: false, type: 'account_deletion' });

  // ---- Oyuncu: talep aç -----------------------------------------------------------
  async function requestImpl(uid, email) {
    const [userSnap, cur] = await Promise.all([db.collection('users').doc(uid).get(), reqRef(uid).get()]);
    if (cur.exists && OPEN.includes(cur.data().status)) return { ok: true, already: true, createdAtMs: cur.data().createdAtMs };
    let authEmail = email || null;
    if (!authEmail) {
      try {
        authEmail = (await auth.getUser(uid)).email || null;
      } catch {
        authEmail = null;
      }
    }
    const t = now();
    await reqRef(uid).set({ uid, name: userSnap.data()?.displayName || 'Oyuncu', email: authEmail, source: 'app', status: 'pending', createdAtMs: t, updatedAtMs: t });
    return { ok: true, createdAtMs: t };
  }

  // ---- Yönetici işlemleri ---------------------------------------------------------------
  async function requireAdmin(uid) {
    const actor = await getActor(uid);
    if (actor.role !== 'admin') fail('permission-denied', 'Hesap silme yalnızca yöneticilere açık.');
    return actor;
  }

  function publicReq(d) {
    const x = d.data();
    return { uid: d.id, name: x.name || 'Oyuncu', email: x.email || null, source: x.source || 'app', status: x.status, createdAtMs: x.createdAtMs || 0, failedAt: x.failedAt || null, error: x.error || null };
  }

  async function list() {
    const snaps = await Promise.all(OPEN.map((st) => db.collection('deletionRequests').where('status', '==', st).get()));
    const rows = snaps.flatMap((s) => s.docs.map(publicReq)).sort((a, b) => a.createdAtMs - b.createdAtMs);
    return { requests: rows };
  }

  async function addByEmail(actor, p) {
    const email = String(p.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) fail('invalid-argument', 'Geçerli bir e-posta adresi yaz.');
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch {
      fail('not-found', 'Bu e-postayla kayıtlı bir oyun hesabı yok. Talep başka bir adresten gelmiş olabilir; oyuncudan oyuna giriş yaptığı adresten yazmasını iste.');
    }
    const cur = await reqRef(user.uid).get();
    if (cur.exists && OPEN.includes(cur.data().status)) return { ok: true, already: true, uid: user.uid };
    const u = await db.collection('users').doc(user.uid).get();
    const t = now();
    await reqRef(user.uid).set({ uid: user.uid, name: u.data()?.displayName || user.displayName || 'Oyuncu', email: user.email || email, source: 'email', addedBy: actor.uid, status: 'pending', createdAtMs: t, updatedAtMs: t });
    await logAction(actor, 'deletion_request_add', { targetUid: user.uid, targetName: u.data()?.displayName || null, details: { source: 'email' } });
    return { ok: true, uid: user.uid };
  }

  async function loadOpen(uid) {
    if (!isUid(uid)) fail('invalid-argument', 'Geçersiz oyuncu.');
    const s = await reqRef(uid).get();
    if (!s.exists || !OPEN.includes(s.data().status)) fail('not-found', 'Açık bir silme talebi yok.');
    return s.data();
  }

  async function makePlan(uid, email) {
    return buildDeletionPlan({ db, auth, uid, email: email || undefined, FieldPath, now: now() });
  }

  function summarize(plan) {
    const pick = (cat) => (plan[cat] || []).map((i) => ({ what: i.what, detail: i.detail || i.note || null, count: (i.paths || []).length }));
    return {
      uid: plan.uid,
      identity: {
        displayName: plan.identity.displayName,
        authEmail: plan.identity.authEmail,
        emailMatches: plan.identity.emailMatches,
        gold: plan.identity.gold,
        bankBalance: plan.identity.bankBalance,
        createdAt: plan.identity.createdAt,
        lastSignIn: plan.identity.authLastSignIn,
      },
      blocker: pick('blocker'),
      delete: pick('delete'),
      anonymize: pick('anonymize'),
      flow: pick('flow'),
      retain: pick('retain'),
      info: pick('info'),
      fingerprint: planFingerprint(plan),
    };
  }

  function staffGuard(actor, uid, targetRole) {
    if (uid === actor.uid) fail('failed-precondition', 'Kendi hesabını panelden silemezsin.');
    if (bootstrapAdminUids.includes(uid)) fail('failed-precondition', 'Kurucu yöneticinin hesabı panelden silinemez.');
    if (targetRole === 'admin' || targetRole === 'moderator') fail('failed-precondition', 'Yetkili bir hesabı silmeden önce rolünü kaldır (Oyuncular › 🎖️ Rol).');
  }

  async function preview(actor, p) {
    const r = await loadOpen(p.uid);
    const plan = await makePlan(p.uid, r.email);
    return { plan: summarize(plan) };
  }

  async function cancel(actor, p) {
    const r = await loadOpen(p.uid);
    if (r.status === 'processing') fail('failed-precondition', 'Silme şu an işleniyor; iptal edilemez.');
    await reqRef(p.uid).set({ status: 'cancelled', cancelledBy: actor.uid, cancelledAtMs: now(), updatedAtMs: now() }, { merge: true });
    try {
      await sms(p.uid, '🗑️ Hesap silme talebin iptal edildi. Hesabın ve oyun verilerin olduğu gibi duruyor. Bir sorun olduğunu düşünüyorsan destek adresine yazabilirsin.');
    } catch {
      /* hesap yoksa SMS gerekmez */
    }
    await logAction(actor, 'deletion_request_cancel', { targetUid: p.uid, targetName: r.name || null, reason: String(p.reason || '').slice(0, 200) || null });
    return { ok: true };
  }

  async function apply(actor, p) {
    const r = await loadOpen(p.uid);
    const target = await db.collection('users').doc(p.uid).get();
    staffGuard(actor, p.uid, target.data()?.role);
    // Aynı anda iki kez basılmasın
    const claimed = await db.runTransaction(async (tx) => {
      const s = await tx.get(reqRef(p.uid));
      const st = s.data()?.status;
      if (st === 'processing' && now() - Number(s.data()?.processingAtMs || 0) < 10 * 60 * 1000) return false;
      if (!OPEN.includes(st)) return false;
      tx.set(reqRef(p.uid), { status: 'processing', processingAtMs: now(), processingBy: actor.uid, updatedAtMs: now() }, { merge: true });
      return true;
    });
    if (!claimed) fail('failed-precondition', 'Bu talep şu an işleniyor ya da kapanmış.');
    const release = (fields) => reqRef(p.uid).set({ ...fields, updatedAtMs: now() }, { merge: true });
    let plan;
    try {
      plan = await makePlan(p.uid, r.email);
    } catch (err) {
      await release({ status: 'failed', error: String(err.message).slice(0, 300) });
      throw err;
    }
    if (plan.blocker.length) {
      await release({ status: 'pending' });
      fail('failed-precondition', `Engel var: ${plan.blocker.map((b) => b.what).join(' · ')}`);
    }
    if (plan.identity.emailMatches !== true) {
      await release({ status: 'pending' });
      fail('failed-precondition', 'Talep e-postası hesabın e-postasıyla eşleşmedi; silinemez.');
    }
    if (!p.fingerprint || planFingerprint(plan) !== p.fingerprint) {
      await release({ status: 'pending' });
      fail('aborted', 'Önizlemeden sonra hesabın verisi değişti. Tekrar "Önizle" deyip kontrol et.');
    }
    const res = await applyPlan({ db, auth, FieldValue, callables, plan });
    if (!res.ok) {
      await release({ status: 'failed', failedAt: res.failedAt || null, error: 'Bir adımda durdu; tekrar "Hesabı sil" ile kaldığı yerden devam eder.' });
      await logAction(actor, 'account_delete_failed', { targetUid: p.uid, targetName: r.name || null, details: { failedAt: res.failedAt || null } });
      fail('internal', `Silme "${res.failedAt}" adımında durdu. Hesap girişe kapalı; tekrar "Hesabı sil" ile devam edebilirsin.`);
    }
    // Talep kaydı silinir (ad/e-posta tutulmaz); işlemin izi admin_logs'ta kalır
    await reqRef(p.uid).delete();
    await logAction(actor, 'account_delete', { targetUid: p.uid, targetName: TOMBSTONE_NAME, details: { source: r.source || 'app', ops: res.results?.length || 0 } });
    return { ok: true };
  }

  const ACTIONS = { list: (a) => list(a), addByEmail, preview, cancel, apply };
  async function handleAdmin(uid, data) {
    const fn = ACTIONS[data?.action];
    if (!fn) fail('invalid-argument', 'Geçersiz işlem.');
    const actor = await requireAdmin(uid);
    return fn(actor, data.payload || {});
  }

  return {
    requestAccountDeletion: onCall(async (request) => {
      const uid = requireAuth(request);
      return requestImpl(uid, request.auth?.token?.email || null);
    }),
    adminAccountDeletion: (Object.keys(heavyOpts).length ? (fn) => onCall(heavyOpts, fn) : (fn) => onCall(fn))(async (request) => handleAdmin(requireAuth(request), request.data || {})),
    _impl: { requestImpl, handleAdmin },
  };
}
