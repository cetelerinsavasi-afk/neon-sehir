#!/usr/bin/env node
// =============================================================================
// delete-user.mjs — Neon Şehir hesap silme aracı (YEREL, Faz 5b-2)
// =============================================================================
//
// İKİ MOD:
//   1) DENEME (varsayılan): Hiçbir veriyi değiştirmez. Firestore ve Auth'un
//      tüm yazma metotları kilitlenir (enforceReadOnly) ve kilit doğrulanır.
//   2) SİLME (--apply): Aynı planı yeniden hesaplar; ENGEL varsa hiçbir şey
//      yapmadan çıkar. Yoksa planı gösterir, [y/N] onayı ister, onaydan
//      HEMEN SONRA planı bir kez daha hesaplar (arada değişen bir şey var
//      mı?) ve adımları sırayla uygular. Her adım tekrar çalıştırılabilir
//      (idempotent): bir hata olursa durur; betik aynı komutla yeniden
//      çalıştırıldığında kaldığı yerden devam eder.
//
// Çalıştırma (proje kökünden; ayrıntı: docs/HESAP_SILME_REHBERI.md):
//   node functions/scripts/delete-user.mjs --email oyuncu@gmail.com --key C:\guvenli\neon-sehir-admin.json
//   node functions/scripts/delete-user.mjs --uid <UID> --email <e-posta> --key <anahtar> --apply
//
// Seçenekler:
//   --uid <uid>          Silinecek hesabın Firebase uid'si
//   --email <e-posta>    Talebi gönderen e-posta; hesabın Auth e-postasıyla
//                        EŞLEŞMESİ kontrol edilir. --apply için ZORUNLU.
//   --key <dosya>        Firebase servis hesabı anahtarı (JSON). Verilmezse
//                        GOOGLE_APPLICATION_CREDENTIALS ortam değişkeni kullanılır.
//   --project <id>       Firebase proje kimliği (varsayılan: neon-sehir)
//   --json <dosya>       Tam planı JSON olarak da kaydet
//   --verbose            Her kategorideki TÜM doküman yollarını yaz (varsayılan: ilk 5)
//   --apply              GERÇEK SİLME. Etkileşimli [y/N] onayı ister; terminal
//                        değilse (ör. başka bir programdan çağrılırsa) çalışmaz.
//
// --apply modunda oyunun kendi Cloud Functions kodu (functions/index.js)
// yüklenir ve bazı işlemler (takımı sisteme devretme, menajerlikten ayrılma,
// çeteden ayrılma, soygun planından çıkma) oyuncunun kimliğiyle, CANLIDAKİ
// fonksiyonun .run() metodu üzerinden BİREBİR AYNI kodla yapılır.
//
// Bu dosya functions/scripts/ altındadır: functions/node_modules içindeki
// firebase-admin'i kullanır (yeni paket yok) ve firebase.json'daki
// "scripts/**" kuralı sayesinde Cloud Functions'a DEPLOY EDİLMEZ.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const TOMBSTONE_NAME = 'Silinmiş Oyuncu';
const SAMPLE_LIMIT = 5;

// Uygulama sırası (küçükten büyüğe). Önce hesabı dondur, sonra arka plan
// işlerinin silinmiş hesaba yazmasına yol açabilecek bağları kopar, en son
// kişisel verileri ve Auth kaydını sil.
export const PHASES = {
  FREEZE: 0,
  PRECLEAN: 1,
  OTHER_FACTORY: 2,
  OWN_FACTORY: 3,
  FUTBOL: 4,
  GANG: 5,
  ROLES: 6,
  ANONYMIZE: 7,
  CONTENT: 8,
  USER_DOC: 9,
  AUTH: 10,
};
const PHASE_LABEL = {
  0: 'Hesabı dondur (giriş kapatılır)',
  1: 'Ön temizlik (bekleyen işler)',
  2: 'Başka fabrikalarla bağlar',
  3: 'Kendi fabrikası',
  4: 'Futbol',
  5: 'Çete',
  6: 'Roller',
  7: 'Anonimleştirme',
  8: 'İçerik ve kişisel veriler',
  9: 'users/{uid}',
  10: 'Auth kaydı',
};

// -----------------------------------------------------------------------------
// Salt-okunur kilit (geri alınabilir)
// -----------------------------------------------------------------------------
export function enforceReadOnly(db, auth) {
  const restore = [];
  const patch = (obj, m, what) => {
    if (!obj || typeof obj[m] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, m);
    const orig = obj[m];
    obj[m] = function denied() {
      throw new Error(`SALT-OKUNUR MOD: "${what}" çağrısı engellendi. Bu betik deneme modunda hiçbir veriyi değiştiremez.`);
    };
    restore.push(() => {
      if (had) obj[m] = orig;
      else delete obj[m];
    });
  };
  const docProto = Object.getPrototypeOf(db.doc('__ro__/x'));
  const colProto = Object.getPrototypeOf(db.collection('__ro__'));
  for (const m of ['set', 'update', 'delete', 'create']) patch(docProto, m, `DocumentReference.${m}`);
  patch(colProto, 'add', 'CollectionReference.add');
  for (const m of ['runTransaction', 'batch', 'bulkWriter', 'recursiveDelete']) patch(db, m, `Firestore.${m}`);
  if (auth) for (const m of ['deleteUser', 'deleteUsers', 'updateUser', 'revokeRefreshTokens', 'setCustomUserClaims', 'createUser', 'importUsers']) patch(auth, m, `Auth.${m}`);
  const unlock = () => {
    while (restore.length) restore.pop()();
  };
  try {
    db.doc('__ro__/check').set({});
  } catch (e) {
    if (String(e.message).startsWith('SALT-OKUNUR')) return unlock;
  }
  unlock();
  throw new Error('Salt-okunur kilit doğrulanamadı — güvenlik için durduruldu.');
}

// -----------------------------------------------------------------------------
// Yardımcılar
// -----------------------------------------------------------------------------
const tsToIso = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
};
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.toDate !== 'function' && !(v.constructor && v.constructor.name === 'DocumentReference');

export function findUidRefs(obj, uid, base = '') {
  const out = [];
  if (obj == null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = base ? `${base}.${k}` : k;
    if (k === uid) out.push(`${p} (anahtar)`);
    if (v === uid) out.push(p);
    else if (Array.isArray(v) && v.includes(uid)) out.push(`${p}[]`);
    else if (v && typeof v === 'object' && typeof v.toDate !== 'function') out.push(...findUidRefs(v, uid, p));
  }
  return out;
}

export function findNameFields(obj, names, base = '') {
  const out = [];
  if (obj == null || typeof obj !== 'object' || !names.length) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = base ? `${base}.${k}` : k;
    if (typeof v === 'string' && names.includes(v)) out.push(p);
    else if (v && typeof v === 'object' && typeof v.toDate !== 'function') out.push(...findNameFields(v, names, p));
  }
  return out;
}

function textMentions(obj, names) {
  const s = JSON.stringify(obj || {});
  return names.some((n) => n && n.length >= 3 && s.includes(n));
}

// Adı "Silinmiş Oyuncu" ile değiştirir: adın TAMAMI olan alanlar ve metin
// içinde geçen ad. Yalnızca DEĞİŞEN üst düzey alanları döndürür.
export function anonymizeData(data, names) {
  const valid = names.filter((n) => n && n.length >= 3).sort((a, b) => b.length - a.length);
  const walk = (v) => {
    if (typeof v === 'string') {
      if (names.includes(v)) return TOMBSTONE_NAME;
      let s = v;
      for (const n of valid) s = s.split(n).join(TOMBSTONE_NAME);
      return s;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const changes = {};
  for (const [k, v] of Object.entries(data || {})) {
    const nv = walk(v);
    if (JSON.stringify(nv) !== JSON.stringify(v)) changes[k] = nv;
  }
  return changes;
}

async function getDocs(q) {
  const snap = await q.get();
  return snap.docs;
}

async function getMany(refs, chunk = 100) {
  const out = [];
  for (let i = 0; i < refs.length; i += chunk) {
    const part = await Promise.all(refs.slice(i, i + chunk).map((r) => r.get()));
    out.push(...part.filter((s) => s.exists));
  }
  return out;
}

async function countSubtree(docRef) {
  const res = [];
  if (typeof docRef.listCollections !== 'function') return res;
  const cols = await docRef.listCollections();
  for (const c of cols) {
    const docs = await c.listDocuments();
    res.push({ collection: c.id, count: docs.length });
  }
  return res;
}

// -----------------------------------------------------------------------------
// Plan
// -----------------------------------------------------------------------------
// Her kalem: { what, paths, detail?, note?, ops?: [{ phase, type, ... }] }
// ops, --apply modunda sırayla uygulanır; rapor yalnızca metinleri gösterir.
export async function buildDeletionPlan({ db, auth, uid, email, FieldPath, now = Date.now(), log = () => {} }) {
  const plan = {
    generatedAt: new Date(now).toISOString(),
    mode: 'DRY-RUN',
    uid: null,
    identity: {},
    names: [],
    delete: [],
    anonymize: [],
    flow: [],
    blocker: [],
    retain: [],
    info: [],
    reads: 0,
  };
  const add = (cat, item) => plan[cat].push(item);
  const counted = async (p) => {
    const r = await p;
    plan.reads += Array.isArray(r) ? Math.max(1, r.length) : 1;
    return r;
  };
  const del = (path, phase = PHASES.CONTENT) => ({ phase, type: 'deleteDoc', path });

  // ---- 1) Kimlik -------------------------------------------------------------
  let authUser = null;
  if (email && !uid) {
    try {
      authUser = await auth.getUserByEmail(email);
      uid = authUser.uid;
    } catch {
      throw new Error(`Bu e-postayla kayıtlı bir hesap bulunamadı: ${email}`);
    }
  }
  if (!uid) throw new Error('--uid veya --email gerekli.');
  plan.uid = uid;
  if (!authUser) {
    try {
      authUser = await auth.getUser(uid);
    } catch {
      authUser = null;
    }
  }
  const userRef = db.collection('users').doc(uid);
  const userSnap = await counted(userRef.get());
  const user = userSnap.exists ? userSnap.data() : null;

  const emailMatch = email && authUser?.email ? authUser.email.toLowerCase() === String(email).toLowerCase() : null;
  plan.identity = {
    authExists: Boolean(authUser),
    authDisabled: Boolean(authUser?.disabled),
    authEmail: authUser?.email || null,
    authDisplayName: authUser?.displayName || null,
    providers: (authUser?.providerData || []).map((p) => p.providerId),
    authCreatedAt: authUser?.metadata?.creationTime || null,
    authLastSignIn: authUser?.metadata?.lastSignInTime || null,
    requestEmail: email || null,
    emailMatches: emailMatch,
    userDocExists: Boolean(user),
    displayName: user?.displayName || null,
    gold: user?.gold ?? null,
    bankBalance: user?.bankBalance ?? null,
    debtToState: user?.debtToState ?? null,
    bankDebt: user?.bankDebt ?? null,
    profession: user?.profession ?? null,
    createdAt: tsToIso(user?.createdAt),
  };
  if (email && emailMatch === false) {
    add('blocker', {
      what: 'KİMLİK EŞLEŞMEDİ',
      detail: `Talep e-postası (${email}) hesabın Google e-postasıyla (${authUser?.email}) aynı değil. Talebi, oyuna giriş yapılan adresten tekrar göndermesini iste.`,
    });
  }
  if (!authUser && !user) {
    add('blocker', { what: 'HESAP YOK', detail: 'Ne Auth kaydı ne users dokümanı bulundu. (Silme tamamlandıysa beklenen sonuç budur.)' });
    return plan;
  }

  const names = new Set();
  if (user?.displayName) names.add(user.displayName);
  if (authUser?.displayName) names.add(authUser.displayName);

  // ---- 2) Oyuncuya ait, doğrudan silinecekler --------------------------------
  log('Kişisel dokümanlar okunuyor…');
  if (authUser) {
    add('delete', {
      what: 'Firebase Authentication kaydı',
      paths: [`auth/${uid}`],
      note: `e-posta: ${authUser.email || '-'} (en başta DONDURULUR, EN SON silinir)`,
      ops: [
        { phase: PHASES.FREEZE, type: 'freezeAuth', uid },
        { phase: PHASES.AUTH, type: 'deleteAuth', uid },
      ],
    });
  }
  if (user) {
    const sub = await counted(countSubtree(userRef));
    add('delete', {
      what: 'users/{uid} ve tüm alt koleksiyonları',
      paths: [`users/${uid}`],
      note: sub.length ? sub.map((s) => `${s.collection}: ${s.count}`).join(', ') : 'alt koleksiyon yok',
      ops: [{ phase: PHASES.USER_DOC, type: 'recursiveDelete', path: `users/${uid}` }],
    });
    if (user.debtToState || user.bankDebt) {
      add('info', { what: 'Borçlar', detail: `Devlete borç: ${user.debtToState || 0}, banka kredisi: ${user.bankDebt ? JSON.stringify(user.bankDebt) : 'yok'} — karar gereği hesapla birlikte silinir.` });
    }
  }

  const byIdCollections = ['trainingProgress', 'flappyScores', 'photoSnapshots', 'parkPresence', 'interiorPresence', 'sixtagramProfiles', 'sixtagramUserLikes'];
  const byIdSnaps = await counted(getMany(byIdCollections.map((c) => db.collection(c).doc(uid))));
  for (const s of byIdSnaps) {
    if (s.ref.parent.id === 'sixtagramProfiles' && s.data()?.displayName) names.add(s.data().displayName);
    add('delete', { what: s.ref.parent.id, paths: [s.ref.path], ops: [del(s.ref.path)] });
  }

  if (user?.redemptionCode) {
    const rc = await counted(db.collection('redemptionCodes').doc(user.redemptionCode).get());
    if (rc.exists) add('delete', { what: 'redemptionCodes (teslimat kodu)', paths: [rc.ref.path], ops: [del(rc.ref.path)] });
  }

  const usernameDocs = await counted(getDocs(db.collection('usernames').where('uid', '==', uid)));
  if (usernameDocs.length) add('delete', { what: 'usernames (ad serbest kalır)', paths: usernameDocs.map((d) => d.ref.path), ops: usernameDocs.map((d) => del(d.ref.path)) });

  for (const coll of ['dailyActions', 'feedbackLimits']) {
    const docs = await counted(
      getDocs(db.collection(coll).where(FieldPath.documentId(), '>=', `${uid}_`).where(FieldPath.documentId(), '<', `${uid}_\uf8ff`))
    );
    if (docs.length) add('delete', { what: `${coll} ({uid}_tarih)`, paths: docs.map((d) => d.ref.path), ops: docs.map((d) => del(d.ref.path)) });
  }

  const simpleQueries = [
    ['vehicles', 'ownerId', 'Araçlar'],
    ['weapons', 'ownerId', 'Silahlar'],
    ['investmentTrades', 'uid', 'Yatırım işlem kayıtları'],
    ['globalChat', 'uid', 'ChatsApp mesajları'],
    ['feedback', 'uid', '"Bi fikrin mi var?" önerileri'],
    ['sponsorshipNotes', 'factoryOwnerUid', 'Sponsorluk notları'],
  ];
  for (const [coll, field, label] of simpleQueries) {
    const docs = await counted(getDocs(db.collection(coll).where(field, '==', uid)));
    if (docs.length) add('delete', { what: `${label} (${coll})`, paths: docs.map((d) => d.ref.path), ops: docs.map((d) => del(d.ref.path)) });
  }

  // Sixtagram
  const posts = await counted(getDocs(db.collection('sixtagramPosts').where('uid', '==', uid)));
  if (posts.length) {
    add('delete', {
      what: 'Sixtagram gönderileri (altındaki yorum ve beğenilerle birlikte)',
      paths: posts.map((d) => d.ref.path),
      ops: posts.map((d) => ({ phase: PHASES.CONTENT, type: 'recursiveDelete', path: d.ref.path })),
    });
  }
  log('Sixtagram yorum/beğenileri taranıyor…');
  const allPostRefs = await counted(db.collection('sixtagramPosts').listDocuments());
  const myPostIds = new Set(posts.map((d) => d.id));
  const commentDocs = [];
  for (const pr of allPostRefs) {
    if (myPostIds.has(pr.id)) continue;
    const cs = await counted(getDocs(pr.collection('comments').where('uid', '==', uid)));
    commentDocs.push(...cs);
  }
  if (commentDocs.length) {
    add('delete', {
      what: 'Başka gönderilere yazdığı yorumlar',
      paths: commentDocs.map((c) => c.ref.path),
      note: `${new Set(commentDocs.map((c) => c.ref.parent.parent.id)).size} gönderinin commentCount sayacı düşürülecek`,
      ops: commentDocs.map((c) => ({ phase: PHASES.CONTENT, type: 'deleteWithCounter', path: c.ref.path, parentPath: c.ref.parent.parent.path, counter: 'commentCount' })),
    });
  }
  const likesDoc = byIdSnaps.find((s) => s.ref.parent.id === 'sixtagramUserLikes');
  const likedIds = Object.keys(likesDoc?.data()?.postIds || {}).filter((id) => !myPostIds.has(id));
  if (likedIds.length) {
    const likeSnaps = await counted(getMany(likedIds.map((id) => db.collection('sixtagramPosts').doc(id).collection('likes').doc(uid))));
    if (likeSnaps.length)
      add('delete', {
        what: 'Başka gönderilere verdiği beğeniler',
        paths: likeSnaps.map((s) => s.ref.path),
        note: `${likeSnaps.length} gönderinin likeCount sayacı düşürülecek`,
        ops: likeSnaps.map((s) => ({ phase: PHASES.CONTENT, type: 'deleteWithCounter', path: s.ref.path, parentPath: s.ref.parent.parent.path, counter: 'likeCount' })),
      });
  }

  // Tarihli alt koleksiyonlar (doküman kimliği = uid). Dilenci kaydı ÖN
  // TEMİZLİKTE silinir: bağış gelirse silinmiş hesaba yazılmasın.
  log('Tarihli kayıtlar (dilenci, cami, piyango) taranıyor…');
  for (const [parent, child, label, phase] of [
    ['beggars', 'entries', 'Dilenci kayıtları', PHASES.PRECLEAN],
    ['mosqueAttendance', 'members', 'Cami katılım kayıtları', PHASES.CONTENT],
  ]) {
    const parents = await counted(db.collection(parent).listDocuments());
    const snaps = await counted(getMany(parents.map((p) => p.collection(child).doc(uid))));
    if (snaps.length) add('delete', { what: `${label} (${parent}/*/${child}/{uid})`, paths: snaps.map((s) => s.ref.path), ops: snaps.map((s) => del(s.ref.path, phase)) });
  }

  // ---- 3) Bahisler / emanetteki altın ------------------------------------------
  for (const [coll, label] of [
    ['futbolBets', 'Lig bahisleri'],
    ['futbolCupBets', 'Kupa bahisleri'],
  ]) {
    const docs = await counted(getDocs(db.collection(coll).where('uid', '==', uid)));
    const pending = docs.filter((d) => d.data().status === 'pending');
    const settled = docs.filter((d) => d.data().status !== 'pending');
    if (settled.length) add('delete', { what: `${label} — sonuçlanmış (${coll})`, paths: settled.map((d) => d.ref.path), ops: settled.map((d) => del(d.ref.path)) });
    if (pending.length) add('blocker', { what: `${label} — SONUÇ BEKLİYOR`, paths: pending.map((d) => d.ref.path), detail: 'Bahis sonuçlanınca tekrar çalıştır (maç günü sonrası).' });
  }

  const lotteryParents = await counted(db.collection('lottery').listDocuments());
  const tickets = await counted(getMany(lotteryParents.map((p) => p.collection('tickets').doc(uid))));
  const lotteryDocs = await counted(getMany(lotteryParents));
  const drawn = new Set(lotteryDocs.filter((d) => d.data()?.drawnAt).map((d) => d.id));
  const openTickets = tickets.filter((t) => !drawn.has(t.ref.parent.parent.id));
  const doneTickets = tickets.filter((t) => drawn.has(t.ref.parent.parent.id));
  if (doneTickets.length) add('delete', { what: 'Piyango biletleri — çekilişi yapılmış', paths: doneTickets.map((t) => t.ref.path), ops: doneTickets.map((t) => del(t.ref.path)) });
  if (openTickets.length) add('blocker', { what: 'Piyango bileti — ÇEKİLİŞ BEKLİYOR', paths: openTickets.map((t) => t.ref.path), detail: 'Çekilişten sonra tekrar çalıştır.' });
  const lotteryWins = lotteryDocs.filter((d) => d.data()?.winnerUid === uid);
  if (lotteryWins.length) add('anonymize', { what: 'Piyango kazanan kaydı', paths: lotteryWins.map((d) => d.ref.path), fields: ['winnerName'] });

  const tables = await counted(getDocs(db.collection('onNumaraTables').where('seatOrder', 'array-contains', uid)));
  const activeTables = tables.filter((d) => !['finished', 'closed', 'cancelled'].includes(d.data().status));
  const pastTables = tables.filter((d) => ['finished', 'closed', 'cancelled'].includes(d.data().status));
  if (activeTables.length)
    add('blocker', {
      what: '10 Numara masası — AÇIK/DEVAM EDİYOR',
      paths: activeTables.map((d) => `${d.ref.path} (durum: ${d.data().status}, bahis: ${d.data().betAmount})`),
      detail: 'Masa kapanınca tekrar çalıştır.',
    });
  if (pastTables.length) add('anonymize', { what: '10 Numara masası — geçmiş', paths: pastTables.map((d) => d.ref.path), fields: [`seats.${uid}.displayName`] });

  const rooms = await counted(getDocs(db.collection('raceRooms').where('participantUids', 'array-contains', uid)));
  const activeRooms = rooms.filter((d) => !['finished', 'cancelled'].includes(d.data().status));
  const pastRooms = rooms.filter((d) => ['finished', 'cancelled'].includes(d.data().status));
  if (activeRooms.length)
    add('blocker', {
      what: 'Yarış odası — AÇIK/DEVAM EDİYOR',
      paths: activeRooms.map((d) => `${d.ref.path} (durum: ${d.data().status})`),
      detail: 'Yarış bitince ya da oda kapanınca tekrar çalıştır.',
    });
  if (pastRooms.length) add('anonymize', { what: 'Yarış odası — geçmiş', paths: pastRooms.map((d) => d.ref.path), fields: [`players.${uid}.displayName`] });

  const champs = await counted(getDocs(db.collection('championshipDaily').where('leaderUid', '==', uid)));
  if (champs.length) add('anonymize', { what: 'Günlük şampiyona lideri kaydı', paths: champs.map((d) => d.ref.path), fields: ['leaderName'] });

  // Soygun planları (açık)
  const openPlans = await counted(getDocs(db.collection('heistPlans').where('status', '==', 'open')));
  const myPlanSnaps = await counted(getMany(openPlans.map((p) => p.ref.collection('participants').doc(uid))));
  for (const ps of myPlanSnaps) {
    const planDoc = openPlans.find((p) => p.id === ps.ref.parent.parent.id);
    const isCreator = planDoc?.data()?.creatorUid === uid;
    add('flow', {
      what: isCreator ? 'Soygun planı — KURUCU' : 'Soygun planı — katılımcı',
      paths: [planDoc.ref.path],
      detail: isCreator ? 'Oyunun cancelHeistPlan fonksiyonu çalıştırılır (plan iptal).' : 'Oyunun leaveHeistPlan fonksiyonu çalıştırılır.',
      ops: [{ phase: PHASES.PRECLEAN, type: 'callable', fn: isCreator ? 'cancelHeistPlan' : 'leaveHeistPlan', data: { planId: planDoc.id } }],
    });
  }

  const liman = await counted(db.collection('limanOrders').doc(uid).get());
  if (liman.exists) add('delete', { what: 'Liman siparişi (teslimat bekleyen kalemler)', paths: [liman.ref.path], note: 'teslimatın silinmiş hesaba yazılmaması için ön temizlikte silinir', ops: [del(liman.ref.path, PHASES.PRECLEAN)] });

  // ---- 4) 2. el ilanları ------------------------------------------------------
  const listings = await counted(getDocs(db.collection('marketplaceListings').where('sellerId', '==', uid)));
  const openListings = listings.filter((d) => !d.data().sold);
  const soldListings = listings.filter((d) => d.data().sold);
  if (openListings.length)
    add('flow', {
      what: '2. El — açık ilanlar',
      paths: openListings.map((d) => d.ref.path),
      detail: 'İlan kaldırılır (ön temizlik; satılıp silinmiş hesaba ödeme yazılmasın). İlandaki eşya hesapla birlikte silinir.',
      ops: openListings.map((d) => del(d.ref.path, PHASES.PRECLEAN)),
    });
  if (soldListings.length) add('anonymize', { what: '2. El — satılmış ilanlar', paths: soldListings.map((d) => d.ref.path), fields: ['sellerName'] });

  // Sponsorluk teklifleri ve menajerlik başvuruları (ön temizlik)
  const offerDocs = new Map();
  for (const f of ['factoryOwnerUid', 'senderUid', 'receiverUid']) {
    const ds = await counted(getDocs(db.collection('sponsorshipOffers').where(f, '==', uid)));
    ds.forEach((d) => offerDocs.set(d.ref.path, d));
  }
  if (offerDocs.size) add('delete', { what: 'Sponsorluk teklifleri (sponsorshipOffers)', paths: [...offerDocs.keys()], ops: [...offerDocs.keys()].map((p) => del(p, PHASES.PRECLEAN)) });

  // ---- 5) Fabrika ---------------------------------------------------------------
  log('Fabrika ilişkileri taranıyor…');
  const factoryRef = db.collection('factories').doc(uid);
  const factorySnap = await counted(factoryRef.get());
  if (factorySnap.exists) {
    const machines = await counted(getDocs(factoryRef.collection('machines')));
    const workers = machines.filter((m) => m.data().workerId && m.data().workerId !== uid);
    const shares = await counted(getDocs(factoryRef.collection('shares')));
    // Hisse durumları: listed (satışta) · active (satılmış, temettü işliyor) · cancelled · expired
    const soldShares = shares.filter((s) => s.data().status === 'active' && s.data().buyerId && s.data().buyerId !== uid);
    const sponsoredTeams = await counted(getDocs(db.collection('futbolTeams').where('sponsorFactoryOwnerUid', '==', uid)));
    const pendingSponsorTeams = await counted(getDocs(db.collection('futbolTeams').where('pendingSponsor.factoryOwnerUid', '==', uid)));
    const refundTotal = soldShares.reduce((n, s) => n + (Number(s.data().price) || 0), 0);
    add('flow', {
      what: `Fabrika sahibi: "${factorySnap.data().name || '(adsız)'}"`,
      paths: [factoryRef.path],
      detail:
        `${machines.length} makine, ${workers.length} başka oyuncu çalışıyor, ${soldShares.length} hisse başka oyuncularda, ` +
        `${sponsoredTeams.length} takıma sponsor, ${pendingSponsorTeams.length} bekleyen sponsorluk. ` +
        'Karar: fabrika kapatılır, işçiler serbest kalır, aktif hisse sahiplerine alış fiyatı iade edilir.',
      ops: [
        ...sponsoredTeams.map((t) => ({ phase: PHASES.OWN_FACTORY, type: 'endSponsorship', teamPath: t.ref.path })),
        ...pendingSponsorTeams.map((t) => ({ phase: PHASES.OWN_FACTORY, type: 'clearPendingSponsor', teamPath: t.ref.path })),
        ...soldShares.map((s) => ({ phase: PHASES.OWN_FACTORY, type: 'refundShare', path: s.ref.path })),
        ...workers.map((m) => ({ phase: PHASES.OWN_FACTORY, type: 'releaseWorker', machinePath: m.ref.path, workerUid: m.data().workerId })),
        { phase: PHASES.OWN_FACTORY, type: 'recursiveDelete', path: factoryRef.path },
      ],
    });
    if (workers.length) add('info', { what: 'Serbest kalacak işçiler (SMS ile bilgilendirilir)', paths: workers.map((m) => `users/${m.data().workerId} (makine: ${m.ref.path})`) });
    if (soldShares.length)
      add('info', {
        what: `Hisse iadesi — toplam ${refundTotal.toLocaleString('tr-TR')} altın`,
        paths: soldShares.map((s) => `${s.ref.path} → alıcı users/${s.data().buyerId}: ${Number(s.data().price || 0).toLocaleString('tr-TR')} altın`),
        detail: 'Karar gereği alış fiyatının tamamı iade edilir, alıcıya SMS gider, hisse kaydı silinir.',
      });
    if (sponsoredTeams.length || pendingSponsorTeams.length)
      add('info', { what: 'Sona erecek sponsorluklar (takım sahibine SMS)', paths: [...sponsoredTeams, ...pendingSponsorTeams].map((t) => `${t.ref.path} ("${t.data().name || t.id}")`) });
  }
  const factoryRefs = await counted(db.collection('factories').listDocuments());
  const workMachines = [];
  const heldShares = [];
  for (const fr of factoryRefs) {
    if (fr.id === uid) continue;
    const [ms, ss] = await Promise.all([
      counted(getDocs(fr.collection('machines').where('workerId', '==', uid))),
      counted(getDocs(fr.collection('shares').where('buyerId', '==', uid))),
    ]);
    workMachines.push(...ms);
    heldShares.push(...ss);
  }
  if (workMachines.length)
    add('flow', {
      what: 'Başka fabrikada işçi',
      paths: workMachines.map((m) => m.ref.path),
      detail: 'resignFromFactory ile aynı: makinedeki workerId/workerName temizlenir.',
      ops: workMachines.map((m) => ({ phase: PHASES.OTHER_FACTORY, type: 'unsetWorker', machinePath: m.ref.path })),
    });
  if (heldShares.length)
    add('delete', {
      what: 'Başka fabrikalardaki hisseleri',
      paths: heldShares.map((s) => s.ref.path),
      note: 'hisse düşer; fabrika sahibinin bu hisse için temettü yükümlülüğü biter',
      ops: heldShares.map((s) => del(s.ref.path, PHASES.OTHER_FACTORY)),
    });

  // ---- 6) Futbol ----------------------------------------------------------------
  const [ownedTeams, managedTeams, handoverTeams] = await Promise.all([
    counted(getDocs(db.collection('futbolTeams').where('ownerUid', '==', uid))),
    counted(getDocs(db.collection('futbolTeams').where('managerUid', '==', uid))),
    counted(getDocs(db.collection('futbolTeams').where('pendingHandoverUid', '==', uid))),
  ]);
  for (const t of ownedTeams)
    add('flow', {
      what: `Futbol takımı sahibi: "${t.data().name || t.id}"`,
      paths: [t.ref.path],
      detail: 'Karar: takım sahipsiz sistem (bot) takımına döner — oyunun sellFutbolTeam fonksiyonu çalıştırılır (menajer başkasıysa onun maaş hesabı da oyun kuralıyla kapanır).',
      ops: [{ phase: PHASES.FUTBOL, type: 'callable', fn: 'sellFutbolTeam', data: { teamId: t.id } }],
    });
  for (const t of managedTeams)
    if (!ownedTeams.some((o) => o.id === t.id))
      add('flow', {
        what: `Futbol menajeri: "${t.data().name || t.id}"`,
        paths: [t.ref.path],
        detail: 'Oyunun resignFutbolManager fonksiyonu çalıştırılır.',
        ops: [{ phase: PHASES.FUTBOL, type: 'callable', fn: 'resignFutbolManager', data: { teamId: t.id } }],
      });
  for (const t of handoverTeams)
    add('flow', { what: 'Bekleyen takım devri (alıcı)', paths: [t.ref.path], detail: 'pendingHandover* alanları temizlenir.', ops: [{ phase: PHASES.PRECLEAN, type: 'clearHandover', teamPath: t.ref.path }] });
  if (typeof db.collectionGroup === 'function') {
    try {
      const apps = await counted(getDocs(db.collectionGroup('managerApplications').where('applicantUid', '==', uid)));
      if (apps.length) add('delete', { what: 'Menajerlik başvuruları', paths: apps.map((a) => a.ref.path), ops: apps.map((a) => del(a.ref.path, PHASES.PRECLEAN)) });
    } catch (e) {
      add('info', { what: 'Menajerlik başvuruları taranamadı', detail: String(e.message).slice(0, 200) });
    }
  }

  // ---- 7) Çeteler ---------------------------------------------------------------
  log('Çete üyelikleri taranıyor…');
  const gangCfg = await counted(db.doc('gangSystem/config').get());
  const liveWorldId = gangCfg.exists ? gangCfg.data().liveWorldId || null : null;
  const worlds = await counted(db.collection('gangWorlds').listDocuments());
  for (const w of worlds) {
    const ms = await counted(w.collection('memberships').doc(uid).get());
    if (!ms.exists) continue;
    const m = ms.data();
    const gangId = m.gangId;
    if (!gangId) {
      add('delete', { what: `Çete dünyası "${w.id}" — üyelik kaydı (çetesiz)`, paths: [ms.ref.path], ops: [del(ms.ref.path, PHASES.GANG)] });
      continue;
    }
    const gangRef = w.collection('gangs').doc(gangId);
    const [gSnap, members] = await Promise.all([counted(gangRef.get()), counted(getDocs(gangRef.collection('members')))]);
    const g = gSnap.data() || {};
    const isBaba = g.babaId === uid;
    const others = members.filter((x) => x.id !== uid).length;
    const isLive = w.id === liveWorldId;
    if (!isLive) {
      add('blocker', {
        what: `Canlı OLMAYAN çete dünyasında üyelik ("${w.id}")`,
        paths: [ms.ref.path],
        detail: 'Oyunun çeteden ayrılma işlemi yalnızca canlı dünyada çalışır. Bu kayıt beklenmedik — raporu geliştiriciye ilet.',
      });
      continue;
    }
    add('flow', {
      what: `Çete üyesi: "${g.name || gangId}" (rütbe: ${m.gangRank || '-'})`,
      paths: [gangRef.path],
      detail: isBaba
        ? others > 0
          ? `MAFYA BABASI, çetede ${others} üye daha var. Oyunun gangAction/leaveGang işlemi çalıştırılır; gece saat işleminde (gang/clock.js) yeni Baba atanır.`
          : 'MAFYA BABASI ve tek üye: leaveGang ile ayrılınca çete dağılır (mevcut kural).'
        : 'Oyunun gangAction/leaveGang işlemi çalıştırılır (istihbarat kaydı da temizlenir).',
      ops: [
        { phase: PHASES.GANG, type: 'callable', fn: 'gangAction', data: { action: 'leaveGang', payload: {} } },
        { phase: PHASES.GANG, type: 'deleteDoc', path: ms.ref.path, ifExists: true },
      ],
    });
    const chatDocs = [];
    for (const ch of ['chat_genel', 'chat_yonetim']) chatDocs.push(...(await counted(getDocs(gangRef.collection(ch).where('authorId', '==', uid)))));
    if (chatDocs.length) add('delete', { what: 'Çete sohbet mesajları', paths: chatDocs.map((c) => c.ref.path), ops: chatDocs.map((c) => del(c.ref.path)) });
    const logs = await counted(getDocs(gangRef.collection('log')));
    const logHits = logs.filter((l) => findUidRefs(l.data(), uid).length || textMentions(l.data(), [...names]));
    // Çete kayıtları uygulama ANINDA yeniden taranır: leaveGang'in kendisi de
    // "X ayrıldı" gibi yeni bir kayıt yazar ve o kayıt planda henüz yoktur.
    add('anonymize', {
      what: 'Çete geçmiş kayıtları (log)',
      paths: logHits.map((l) => l.ref.path),
      fields: ['(adın geçtiği alanlar)'],
      rescanCollection: gangRef.collection('log').path,
    });
  }

  // ---- 8) Roller ----------------------------------------------------------------
  const imam = await counted(db.collection('imamState').doc('current').get());
  if (imam.exists && imam.data()?.uid === uid) {
    add('flow', { what: 'İmam', paths: [imam.ref.path], detail: 'imamState/current silinir (imamlık boşalır — oyunun azil işlemiyle aynı).', ops: [{ phase: PHASES.ROLES, type: 'deleteDoc', path: imam.ref.path }] });
  }
  if (user?.profession === 'polis') add('flow', { what: 'Polis', paths: [`users/${uid}.profession`], detail: 'users dokümanıyla birlikte düşer; polis maaş havuzu hesabında artık yer almaz.' });

  // ---- 9) Anonimleştirme — haberler + op'ların üretilmesi ---------------------
  const nameList = [...names];
  plan.names = nameList;
  try {
    const news = await counted(getDocs(db.collection('newsEvents').orderBy('createdAt', 'desc').limit(1000)));
    const hits = news.filter((n) => findUidRefs(n.data(), uid).length || textMentions(n.data(), nameList));
    if (hits.length) add('anonymize', { what: 'Haber kayıtları (newsEvents, son 1000)', paths: hits.map((n) => n.ref.path), fields: ['(adın geçtiği metinler)'] });
  } catch (e) {
    add('info', { what: 'Haber kayıtları taranamadı', detail: String(e.message).slice(0, 200) });
  }
  for (const item of plan.anonymize) {
    const detected = new Set();
    for (const p of item.paths.slice(0, 50)) {
      const s = await counted(db.doc(p).get());
      findNameFields(s.data(), nameList).forEach((f) => detected.add(f));
    }
    if (detected.size) item.detectedFields = [...detected];
    item.ops = item.rescanCollection
      ? [{ phase: PHASES.ANONYMIZE, type: 'anonymizeCollection', path: item.rescanCollection }]
      : item.paths.map((p) => ({ phase: PHASES.ANONYMIZE, type: 'anonymize', path: p }));
  }

  // ---- 10) Yasal saklama ---------------------------------------------------------
  const orders = await counted(getDocs(db.collection('shopierOrders').where('uid', '==', uid)));
  if (orders.length) add('retain', { what: 'Web satın alma kayıtları (shopierOrders)', paths: orders.map((o) => o.ref.path), detail: 'Mevzuattaki saklama süresi boyunca SİLİNMEZ (Gizlilik Politikası md. 6).' });
  if (authUser?.email) {
    const unmatched = await counted(getDocs(db.collection('shopierUnmatchedOrders').where('email', '==', authUser.email)));
    if (unmatched.length) add('retain', { what: 'Eşleşmemiş satın alma kayıtları (e-postayla)', paths: unmatched.map((o) => o.ref.path), detail: 'Yasal saklama.' });
  }

  // ---- 11) Bilgi ---------------------------------------------------------------------
  const referred = await counted(getDocs(db.collection('users').where('referredBy', '==', uid)));
  if (referred.length) add('info', { what: 'Bu oyuncunun davet ettiği oyuncular', detail: `${referred.length} oyuncunun "referredBy" alanında bu uid kalır (kimliksiz rastgele kod; Auth ve users kaydı silinince kimseyle eşleşmez).` });
  add('info', {
    what: 'Zombi doküman kontrolü',
    detail: 'Silmeden 24 saat sonra betiği aynı uid ile tekrar çalıştır: "HESAP YOK" görmelisin (arka plan işleri silinmiş hesaba yazmamış demektir).',
  });
  add('info', {
    what: 'Sınırlama',
    detail:
      'Başka oyuncuların SMS kutularındaki serbest metinlerde (örn. "X seni soydu") ve Sixtagram bildirimlerinde bu oyuncunun eski adı geçebilir; bunlar diğer oyuncuların özel kutusunda olduğu için taranmadı.',
  });

  return plan;
}

// Plandaki tüm op'ları uygulama sırasına göre düz liste yapar
export function collectOps(plan) {
  const ops = [];
  for (const cat of ['delete', 'anonymize', 'flow']) for (const item of plan[cat]) for (const op of item.ops || []) ops.push({ ...op, what: item.what });
  const seen = new Set();
  return ops
    .filter((op) => {
      const key = JSON.stringify({ ...op, what: undefined });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.phase - b.phase);
}

// -----------------------------------------------------------------------------
// Uygulama (--apply)
// -----------------------------------------------------------------------------
// deps: { db, auth, FieldValue, callables: { name: (request) => Promise } }
export async function applyPlan({ db, auth, FieldValue, callables, plan, log = () => {} }) {
  const uid = plan.uid;
  const names = plan.names || [];
  const ops = collectOps(plan);
  const results = [];
  const sms = (writer, toUid, text, type) =>
    writer.set(db.collection('users').doc(toUid).collection('messages').doc(), { text, createdAt: FieldValue.serverTimestamp(), read: false, type });

  const handlers = {
    async freezeAuth() {
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
    },
    async deleteAuth() {
      try {
        await auth.deleteUser(uid);
      } catch (e) {
        if (!/not.found/i.test(`${e.code} ${e.message}`)) throw e;
      }
    },
    async deleteDoc(op) {
      await db.doc(op.path).delete();
    },
    async recursiveDelete(op) {
      await db.recursiveDelete(db.doc(op.path));
    },
    async callable(op) {
      const fn = callables?.[op.fn];
      if (!fn) throw new Error(`Oyun fonksiyonu yüklenemedi: ${op.fn}`);
      await fn({ auth: { uid, token: {} }, data: op.data });
    },
    async unsetWorker(op) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(op.machinePath);
        const s = await tx.get(ref);
        if (s.exists && s.data().workerId === uid) tx.update(ref, { workerId: null, workerName: null });
      });
    },
    async clearHandover(op) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(op.teamPath);
        const s = await tx.get(ref);
        if (!s.exists || s.data().pendingHandoverUid !== uid) return;
        tx.update(ref, {
          pendingHandoverUid: FieldValue.delete(),
          pendingHandoverLevel: FieldValue.delete(),
          pendingHandoverAt: FieldValue.delete(),
          pendingHandoverApproved: FieldValue.delete(),
        });
      });
    },
    async endSponsorship(op) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(op.teamPath);
        const s = await tx.get(ref);
        const t = s.data();
        if (!s.exists || t.sponsorFactoryOwnerUid !== uid) return;
        // Oyunun sponsorluk bitiş sıfırlamasıyla aynı alanlar (functions/index.js ~17963)
        tx.update(ref, {
          sponsorFactoryOwnerUid: null,
          sponsorFactoryName: null,
          sponsorDailyAmount: 0,
          sponsorSince: null,
          sponsorCancelPending: false,
          sponsorCancelInitiatedBy: null,
          sponsorFeeRaiseRequest: null,
        });
        if (t.ownerUid && t.ownerUid !== uid) sms(tx, t.ownerUid, `🏭 ${t.name || 'Takımın'} sponsoru olan fabrika kapandığı için sponsorluk sona erdi.`, 'sponsorship_ended');
      });
    },
    async clearPendingSponsor(op) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(op.teamPath);
        const s = await tx.get(ref);
        const t = s.data();
        if (!s.exists || t.pendingSponsor?.factoryOwnerUid !== uid) return;
        tx.update(ref, { pendingSponsor: null });
        if (t.ownerUid && t.ownerUid !== uid) sms(tx, t.ownerUid, `🏭 ${t.name || 'Takımın'} için bekleyen sponsorluk, fabrika kapandığı için iptal oldu.`, 'sponsorship_ended');
      });
    },
    async refundShare(op) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(op.path);
        const s = await tx.get(ref);
        if (!s.exists) return; // zaten iade edilip silinmiş
        const sh = s.data();
        if (sh.status === 'active' && sh.buyerId && sh.buyerId !== uid) {
          const amount = Math.max(0, Math.round(Number(sh.price) || 0));
          if (amount > 0) tx.update(db.collection('users').doc(sh.buyerId), { gold: FieldValue.increment(amount) });
          sms(tx, sh.buyerId, `🏭 Hissesini aldığın fabrika kapandı. Hisse için ödediğin ${amount.toLocaleString('tr-TR')} altın hesabına iade edildi.`, 'factory_share_refund');
        }
        tx.delete(ref); // aynı işlemde silinir → tekrar çalışırsa çift iade olmaz
      });
    },
    async releaseWorker(op) {
      await db.runTransaction(async (tx) => {
        const mRef = db.doc(op.machinePath);
        const wRef = db.collection('users').doc(op.workerUid);
        const [m, w] = await Promise.all([tx.get(mRef), tx.get(wRef)]);
        if (m.exists && m.data().workerId === op.workerUid) tx.update(mRef, { workerId: null, workerName: null });
        if (w.exists && w.data().employment?.factoryId === uid) {
          tx.update(wRef, { employment: FieldValue.delete() });
          sms(tx, op.workerUid, '🏭 Çalıştığın fabrika kapandı; işinden serbest kaldın. Başka bir fabrikada iş bulabilirsin.', 'factory_closed');
        }
      });
    },
    async deleteWithCounter(op) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(op.path);
        const parent = db.doc(op.parentPath);
        const [s, p] = await Promise.all([tx.get(ref), tx.get(parent)]);
        if (!s.exists) return;
        tx.delete(ref);
        if (p.exists && (p.data()[op.counter] || 0) > 0) tx.update(parent, { [op.counter]: FieldValue.increment(-1) });
      });
    },
    async anonymizeCollection(op) {
      const docs = await getDocs(db.collection(op.path));
      for (const d of docs) {
        const changes = anonymizeData(d.data(), names);
        if (Object.keys(changes).length) await d.ref.update(changes);
      }
    },
    async anonymize(op) {
      const ref = db.doc(op.path);
      const s = await ref.get();
      if (!s.exists) return;
      const changes = anonymizeData(s.data(), names);
      if (Object.keys(changes).length) await ref.update(changes);
    },
  };

  let phase = -1;
  for (const op of ops) {
    if (op.phase !== phase) {
      phase = op.phase;
      log(`\n▶ ${PHASE_LABEL[phase] || phase}`);
    }
    const label = `${op.type}${op.fn ? `:${op.fn}` : ''} ${op.path || op.teamPath || op.machinePath || (op.data ? JSON.stringify(op.data) : '')}`.trim();
    try {
      if (op.ifExists && op.type === 'deleteDoc') {
        const s = await db.doc(op.path).get();
        if (!s.exists) {
          results.push({ op: label, ok: true, skipped: true });
          continue;
        }
      }
      await handlers[op.type](op);
      results.push({ op: label, ok: true });
      log(`   ✓ ${label}`);
    } catch (e) {
      results.push({ op: label, ok: false, error: String(e.message || e) });
      log(`   ✗ ${label}\n     HATA: ${e.message || e}`);
      return { ok: false, results, failedAt: label };
    }
  }
  return { ok: true, results };
}

// -----------------------------------------------------------------------------
// Rapor
// -----------------------------------------------------------------------------
export function formatPlan(plan, { verbose = false } = {}) {
  const L = [];
  const line = (s = '') => L.push(s);
  const bar = '═'.repeat(72);
  const list = (paths = []) => {
    const shown = verbose ? paths : paths.slice(0, SAMPLE_LIMIT);
    shown.forEach((p) => line(`      · ${p}`));
    if (!verbose && paths.length > SAMPLE_LIMIT) line(`      · … ve ${paths.length - SAMPLE_LIMIT} tane daha (--verbose ile hepsi)`);
  };
  const section = (title, items, render) => {
    line('');
    line(`■ ${title}`);
    if (!items.length) return line('    — yok');
    items.forEach(render);
  };
  const total = (items) => items.reduce((n, i) => n + (i.paths?.length || 0), 0);
  const id = plan.identity;

  line(bar);
  line(` NEON ŞEHİR — HESAP SİLME PLANI  ·  ${plan.mode === 'APPLY' ? 'SİLME ÖNİZLEMESİ' : 'DENEME MODU (HİÇBİR ŞEY DEĞİŞTİRİLMEDİ)'}`);
  line(bar);
  line(` uid              : ${plan.uid}`);
  line(` Auth e-posta     : ${id.authEmail || '— (Auth kaydı yok)'}${id.authDisabled ? '   [GİRİŞ KAPALI]' : ''}`);
  if (id.requestEmail) line(` Talep e-postası  : ${id.requestEmail}  →  ${id.emailMatches === true ? 'EŞLEŞİYOR ✓' : id.emailMatches === false ? 'EŞLEŞMİYOR ✗' : 'kontrol edilemedi'}`);
  line(` Oyun içi ad      : ${id.displayName || '-'}   (Google adı: ${id.authDisplayName || '-'})`);
  line(` Hesap açılış     : ${id.createdAt || id.authCreatedAt || '-'}   ·  son giriş: ${id.authLastSignIn || '-'}`);
  line(` Altın / banka    : ${id.gold ?? '-'} / ${id.bankBalance ?? '-'}   ·  borç: ${id.debtToState ?? 0}   ·  meslek: ${id.profession || '-'}`);

  section(`ENGELLER — silmeden önce çözülmeli/beklenmeli (${plan.blocker.length})`, plan.blocker, (b) => {
    line(`  ✗ ${b.what}`);
    if (b.detail) line(`      ${b.detail}`);
    list(b.paths);
  });
  section(`SİLİNECEK — ${plan.delete.length} kalem, ${total(plan.delete)} doküman`, plan.delete, (d) => {
    line(`  − ${d.what}  [${d.paths.length}]${d.note ? '  — ' + d.note : ''}`);
    if (d.detail) line(`      ${d.detail}`);
    list(d.paths);
  });
  section(`ANONİMLEŞTİRİLECEK → "${TOMBSTONE_NAME}" — ${total(plan.anonymize)} doküman`, plan.anonymize, (a) => {
    line(`  ~ ${a.what}  [${a.paths.length}]  alanlar: ${(a.detectedFields || a.fields || []).join(', ')}`);
    list(a.paths);
  });
  section(`OYUN KURALIYLA ÇÖZÜLECEK (${plan.flow.length})`, plan.flow, (f) => {
    line(`  ↻ ${f.what}`);
    if (f.detail) line(`      ${f.detail}`);
    list(f.paths);
  });
  section(`SAKLANACAK — yasal (${plan.retain.length})`, plan.retain, (r) => {
    line(`  ◆ ${r.what}  [${r.paths.length}]${r.detail ? '  — ' + r.detail : ''}`);
    list(r.paths);
  });
  section(`BİLGİ (${plan.info.length})`, plan.info, (i) => {
    line(`  i ${i.what}${i.detail ? ': ' + i.detail : ''}`);
    list(i.paths);
  });
  if (plan.blocker.length === 0 && plan.identity.userDocExists !== undefined) {
    const ops = collectOps(plan);
    const byPhase = new Map();
    ops.forEach((o) => byPhase.set(o.phase, (byPhase.get(o.phase) || 0) + 1));
    line('');
    line(`■ UYGULAMA ADIMLARI (--apply) — ${ops.length} işlem`);
    [...byPhase.entries()].sort((a, b) => a[0] - b[0]).forEach(([p, n]) => line(`    ${String(p).padStart(2)}. ${PHASE_LABEL[p]}  [${n}]`));
  }
  line('');
  line(bar);
  const ready = plan.blocker.length === 0;
  line(ready ? ' SONUÇ: Engel yok.' : ` SONUÇ: ${plan.blocker.length} engel var — önce bunlar çözülmeli.`);
  line(` Okuma sayısı (yaklaşık): ${plan.reads}   ·  Rapor zamanı: ${plan.generatedAt}`);
  line(bar);
  return L.join('\n');
}

// -----------------------------------------------------------------------------
// Komut satırı
// -----------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--uid') a.uid = next();
    else if (k === '--email') a.email = next();
    else if (k === '--key') a.key = next();
    else if (k === '--project') a.project = next();
    else if (k === '--json') a.json = next();
    else if (k === '--verbose') a.verbose = true;
    else if (k === '--apply') a.apply = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Bilinmeyen seçenek: ${k}`);
  }
  return a;
}

// Planı özetleyen parmak izi: onaydan sonra yeniden hesaplanan planda
// silinecek/iade/değişecek işler değiştiyse işlem iptal edilir.
export function planFingerprint(plan) {
  return JSON.stringify(collectOps(plan).map((o) => [o.phase, o.type, o.fn || '', o.path || o.teamPath || o.machinePath || JSON.stringify(o.data || {})]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.uid && !args.email)) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 40).join('\n'));
    process.exit(args.help ? 0 : 2);
  }
  const projectId = args.project || 'neon-sehir';
  if (args.key) process.env.GOOGLE_APPLICATION_CREDENTIALS = args.key;
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || projectId;
  const log = (m) => console.error(`… ${m}`);

  if (args.apply) {
    if (!args.email) {
      console.error('✗ --apply için --email ZORUNLU (talebi gönderen adres; hesapla eşleşmesi kontrol edilir).');
      process.exit(2);
    }
    if (!process.stdin.isTTY) {
      console.error('✗ --apply yalnızca etkileşimli bir terminalde çalışır ([y/N] onayı gerekir).');
      process.exit(2);
    }
  }

  let db, auth, FieldPath, FieldValue, callables = null;
  if (args.apply) {
    // Oyunun kendi Cloud Functions kodu: varsayılan admin uygulamasını o başlatır.
    console.error('… Oyun fonksiyonları yükleniyor (functions/index.js)…');
    const fns = await import('../index.js');
    const pick = (name) => {
      const f = fns[name];
      if (!f || typeof f.run !== 'function') throw new Error(`functions/index.js içinde ${name}.run bulunamadı`);
      return (req) => f.run(req);
    };
    callables = Object.fromEntries(['sellFutbolTeam', 'resignFutbolManager', 'leaveHeistPlan', 'cancelHeistPlan', 'gangAction'].map((n) => [n, pick(n)]));
    const fs = await import('firebase-admin/firestore');
    db = fs.getFirestore();
    FieldPath = fs.FieldPath;
    FieldValue = fs.FieldValue;
    const { getAuth } = await import('firebase-admin/auth');
    auth = getAuth();
  } else {
    const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const fs = await import('firebase-admin/firestore');
    const { getAuth } = await import('firebase-admin/auth');
    const credential = args.key ? cert(JSON.parse(readFileSync(args.key, 'utf8'))) : applicationDefault();
    const app = initializeApp({ credential, projectId });
    db = fs.getFirestore(app);
    FieldPath = fs.FieldPath;
    auth = getAuth(app);
  }

  // Plan her zaman salt-okunur kilit altında hesaplanır.
  const makePlan = async () => {
    const unlock = enforceReadOnly(db, auth);
    try {
      return await buildDeletionPlan({ db, auth, uid: args.uid, email: args.email, FieldPath, log });
    } finally {
      unlock();
    }
  };

  const plan = await makePlan();
  plan.mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(formatPlan(plan, { verbose: args.verbose }));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(plan, null, 2));
    console.error(`Plan JSON olarak kaydedildi: ${args.json}`);
  }
  if (!args.apply) process.exit(plan.blocker.length ? 1 : 0);

  // ---- --apply ----
  if (plan.blocker.length) {
    console.error('\n✗ ENGEL VAR — hiçbir şey yapılmadı.');
    process.exit(1);
  }
  if (plan.identity.emailMatches !== true) {
    console.error('\n✗ Talep e-postası hesapla eşleşmedi/kontrol edilemedi — hiçbir şey yapılmadı.');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(
    `\n⚠️  BU İŞLEM GERİ ALINAMAZ.\n   ${plan.identity.authEmail} (${plan.uid}) hesabı yukarıdaki plana göre silinecek.\n   Devam edilsin mi? [y/N] `
  );
  rl.close();
  if (!/^(y|yes|e|evet)$/i.test(answer.trim())) {
    console.error('Vazgeçildi — hiçbir şey yapılmadı.');
    process.exit(0);
  }

  // Onaydan HEMEN SONRA planı yeniden hesapla (bekleme sırasında bir şey değiştiyse dur)
  console.error('… Plan yeniden kontrol ediliyor…');
  const fresh = await makePlan();
  if (fresh.blocker.length) {
    console.error('✗ Onaydan sonra yeni bir ENGEL oluştu — hiçbir şey yapılmadı:\n' + fresh.blocker.map((b) => `   - ${b.what}`).join('\n'));
    process.exit(1);
  }
  if (planFingerprint(fresh) !== planFingerprint(plan)) {
    console.error('✗ Onay beklenirken hesabın verisi değişti (oyuncu bu arada oynamış olabilir). Hiçbir şey yapılmadı — betiği yeniden çalıştır.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const res = await applyPlan({ db, auth, FieldValue, callables, plan: fresh, log: (m) => console.error(m) });
  const auditFile = `silme-kaydi-${plan.uid}-${startedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(auditFile, JSON.stringify({ uid: plan.uid, startedAt, finishedAt: new Date().toISOString(), ok: res.ok, failedAt: res.failedAt || null, results: res.results }, null, 2));
  if (!res.ok) {
    console.error(`\n✗ İşlem "${res.failedAt}" adımında durdu. Hesap girişe KAPALI kaldı. Hatayı giderip AYNI komutu tekrar çalıştır; kalan adımlardan devam eder.\n   Kayıt: ${auditFile}`);
    process.exit(1);
  }

  // Son doğrulama
  const after = await makePlan();
  const gone = after.blocker.some((b) => b.what === 'HESAP YOK');
  console.error(`\n${gone ? '✓ SİLME TAMAMLANDI — hesap artık yok.' : '⚠️  Silme adımları bitti ama hesap hâlâ görünüyor; betiği --uid ile tekrar çalıştırıp raporu incele.'}`);
  console.error(`   Kayıt: ${auditFile}  ·  24 saat sonra aynı komutu (deneme modunda) tekrar çalıştırıp "HESAP YOK" gör.`);
  process.exit(gone ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
