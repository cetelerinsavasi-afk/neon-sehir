// =============================================================================
// houses.js — v65 3D Ev (tasarım + davet + canlı sohbet)
// =============================================================================
//
// ŞİMDİLİK TEST SÜRÜMÜ: ev sadece ADMIN'e açık. Admin kendi evini tasarlar ve
// test için oyuncu davet eder; davetli oyuncu haritada "Ev"e tıklayınca
// admin'in evine girer. Diğer herkes istemcide "Tadilatta" ekranını görür.
//
// Koleksiyonlar:
//   houses/{ownerUid}             — { ownerUid, ownerName, items[], wall, floor,
//                                     guestUids[], guests:{uid:{name}}, updatedAtMs }
//                                   (sahibi + guestUids okur; sadece sunucu yazar)
//   houses/{ownerUid}/chat/{id}   — { uid, name, text, createdAtMs } (aynı okuma kuralı)
//   houseInvites/{guestUid}       — { houseId, ownerName, createdAtMs } (sadece kendisi okur)
//   housePresence/{uid}           — { houseId, displayName, avatar, x, z, left, seat, updatedAt }
//                                   create SADECE burada (enter); istemci sadece
//                                   konum alanlarını günceller (firestore.rules).
//
// Tek callable: houseAction({ op, ... })
//   enter · save · invite · uninvite · chat
//
// İLERİSİ (satış sistemi): eşya fiyatları istemcideki houseCatalog.js'te
// (price: altın ya da 💎). Satın alma açıldığında fiyat listesi sunucuya da
// taşınmalı ve 'save' sadece SAHİP OLUNAN eşyalara izin vermeli.
// =============================================================================

export const HOUSE = {
  W: 18,
  D: 14,
  MAX_ITEMS: 300,
  MAX_GUESTS: 25,
  CHAT_MAX: 200,
  CHAT_MIN_INTERVAL_MS: 700,
  CHAT_KEEP: 120,
};

const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const KEY_RE = /^[a-z0-9_]{1,32}$/;
const ID_RE = /^[a-z0-9]{1,16}$/;
const nameOf = (u) => String(u?.displayName || 'Oyuncu').slice(0, 40);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// deps: { db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, now? }
export function createHouses({ db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const inviteRef = (uid) => db.collection('houseInvites').doc(uid);
  const presenceRef = (uid) => db.collection('housePresence').doc(uid);
  const userRef = (uid) => db.collection('users').doc(uid);

  // Tasarımı doğrula + temizle (bilinmeyen alanlar atılır).
  function cleanDesign(raw) {
    const d = raw && typeof raw === 'object' ? raw : {};
    const items = Array.isArray(d.items) ? d.items : [];
    if (items.length > HOUSE.MAX_ITEMS) fail('invalid-argument', `En fazla ${HOUSE.MAX_ITEMS} eşya.`);
    const seen = new Set();
    const out = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const i = String(it.i || '');
      const k = String(it.k || '');
      const x = num(it.x);
      const z = num(it.z);
      if (!ID_RE.test(i) || !KEY_RE.test(k) || x === null || z === null || seen.has(i)) continue;
      if (Math.abs(x) > HOUSE.W / 2 + 0.1 || Math.abs(z) > HOUSE.D / 2 + 0.1) continue;
      seen.add(i);
      const r = Number.isInteger(it.r) ? ((it.r % 8) + 8) % 8 : 0;
      const c = Number.isInteger(it.c) && it.c >= 0 && it.c < 32 ? it.c : 0;
      const row = { i, k, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, r, c };
      if (typeof it.o === 'boolean') row.o = it.o;
      out.push(row);
    }
    const wall = KEY_RE.test(String(d.wall || '')) ? d.wall : 'boya_beyaz';
    const floor = KEY_RE.test(String(d.floor || '')) ? d.floor : 'parke_mese';
    return { items: out, wall, floor };
  }

  async function ensureHouse(uid, user) {
    const ref = houseRef(uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data();
    const data = {
      ownerUid: uid,
      ownerName: nameOf(user),
      items: [],
      wall: 'boya_beyaz',
      floor: 'parke_mese',
      guestUids: [],
      guests: {},
      createdAtMs: now(),
      updatedAtMs: now(),
    };
    await ref.set(data);
    return data;
  }

  // Oyuncunun girebileceği ev: admin → kendi evi; davetli → davet eden evi.
  async function resolveHouse(uid) {
    if (isAdmin(uid)) return { houseId: uid, isOwner: true };
    const inv = await inviteRef(uid).get();
    const houseId = inv.exists ? inv.data()?.houseId : null;
    if (!isUid(houseId)) return null;
    const h = await houseRef(houseId).get();
    if (!h.exists || !(h.data()?.guestUids || []).includes(uid)) return null;
    return { houseId, isOwner: false };
  }

  async function enter(uid) {
    const uSnap = await userRef(uid).get();
    const user = uSnap.data() || {};
    const where = await resolveHouse(uid);
    if (!where) return { status: 'maintenance' };
    let house;
    if (where.isOwner) {
      house = await ensureHouse(uid, user);
      if (house.ownerName !== nameOf(user)) await houseRef(uid).update({ ownerName: nameOf(user) });
    } else {
      house = (await houseRef(where.houseId).get()).data() || {};
    }
    await presenceRef(uid).set({
      houseId: where.houseId,
      displayName: nameOf(user),
      avatar: user.avatar || null,
      x: 5,
      z: HOUSE.D / 2 - 3.2,
      left: false,
      seat: null,
      updatedAt: FieldValue.serverTimestamp(),
      enteredAt: FieldValue.serverTimestamp(),
    });
    return { status: 'ok', houseId: where.houseId, isOwner: where.isOwner, ownerName: house.ownerName || 'Ev' };
  }

  async function save(uid, p) {
    if (!isAdmin(uid)) fail('permission-denied', 'Ev tasarımı şimdilik sadece yöneticiye açık.');
    const design = cleanDesign(p.design);
    const snap = await houseRef(uid).get();
    if (!snap.exists) await ensureHouse(uid, (await userRef(uid).get()).data());
    await houseRef(uid).update({ ...design, updatedAtMs: now() });
    return { ok: true, count: design.items.length };
  }

  async function invite(uid, p) {
    if (!isAdmin(uid)) fail('permission-denied', 'Davet şimdilik sadece yöneticiye açık.');
    let target = null;
    if (isUid(p.uid)) target = p.uid;
    else {
      const name = String(p.name || '').trim();
      if (name.length < 2) fail('invalid-argument', 'Oyuncu adını yaz.');
      const key = name.toLocaleLowerCase('tr-TR').replace(/\//g, '_');
      const nameSnap = await db.collection('usernames').doc(key).get();
      target = nameSnap.exists ? nameSnap.data()?.uid : null;
      if (!isUid(target)) fail('not-found', 'Bu isimde bir oyuncu bulunamadı.');
    }
    if (target === uid) fail('invalid-argument', 'Kendini davet edemezsin.');
    const [tSnap, owner] = await Promise.all([userRef(target).get(), userRef(uid).get()]);
    if (!tSnap.exists) fail('not-found', 'Oyuncu bulunamadı.');
    const house = await ensureHouse(uid, owner.data());
    const guests = house.guestUids || [];
    if (!guests.includes(target) && guests.length >= HOUSE.MAX_GUESTS) fail('resource-exhausted', `En fazla ${HOUSE.MAX_GUESTS} davetli.`);
    const tName = nameOf(tSnap.data());
    const batch = db.batch();
    batch.update(houseRef(uid), {
      guestUids: FieldValue.arrayUnion(target),
      [`guests.${target}`]: { name: tName, sinceMs: now() },
    });
    batch.set(inviteRef(target), { houseId: uid, ownerName: nameOf(owner.data()), createdAtMs: now() });
    await batch.commit();
    return { ok: true, uid: target, name: tName };
  }

  async function uninvite(uid, p) {
    if (!isAdmin(uid)) fail('permission-denied', 'Sadece yönetici.');
    if (!isUid(p.uid)) fail('invalid-argument', 'Geçersiz oyuncu.');
    const target = p.uid;
    const [inv, pres] = await Promise.all([inviteRef(target).get(), presenceRef(target).get()]);
    const batch = db.batch();
    batch.update(houseRef(uid), { guestUids: FieldValue.arrayRemove(target), [`guests.${target}`]: FieldValue.delete() });
    if (inv.exists && inv.data()?.houseId === uid) batch.delete(inviteRef(target));
    if (pres.exists && pres.data()?.houseId === uid) batch.delete(presenceRef(target));
    await batch.commit();
    return { ok: true };
  }

  async function chat(uid, p) {
    const houseId = String(p.houseId || '');
    if (!isUid(houseId)) fail('invalid-argument', 'Geçersiz ev.');
    const text = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, HOUSE.CHAT_MAX);
    if (!text) fail('invalid-argument', 'Boş mesaj.');
    await assertCanSpeak(uid);
    const [hSnap, uSnap, pSnap] = await Promise.all([houseRef(houseId).get(), userRef(uid).get(), presenceRef(uid).get()]);
    const h = hSnap.data();
    if (!h || (h.ownerUid !== uid && !(h.guestUids || []).includes(uid))) fail('permission-denied', 'Bu eve erişimin yok.');
    const last = Number(pSnap.data()?.lastChatMs || 0);
    if (now() - last < HOUSE.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş 🙂');
    const ref = houseRef(houseId).collection('chat').doc();
    await ref.set({ uid, name: nameOf(uSnap.data()), text, createdAtMs: now(), createdAt: FieldValue.serverTimestamp() });
    if (pSnap.exists) await presenceRef(uid).update({ lastChatMs: now() }).catch(() => {});
    // Eski mesajları budama (koleksiyon sınırsız büyümesin) — okuma maliyeti
    // için her mesajda değil, ~her 25 mesajda bir.
    if (Math.random() < 0.04) {
      const all = await houseRef(houseId).collection('chat').orderBy('createdAtMs', 'desc').limit(HOUSE.CHAT_KEEP + 100).get();
      const extra = all.docs.slice(HOUSE.CHAT_KEEP);
      if (extra.length) {
        const b = db.batch();
        extra.forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }
    return { ok: true };
  }

  const houseAction = onCall(async (request) => {
    const uid = requireAuth(request);
    const p = request.data || {};
    switch (p.op) {
      case 'enter':
        return enter(uid);
      case 'save':
        return save(uid, p);
      case 'invite':
        return invite(uid, p);
      case 'uninvite':
        return uninvite(uid, p);
      case 'chat':
        return chat(uid, p);
      default:
        return fail('invalid-argument', 'Bilinmeyen işlem.');
    }
  });

  // Uygulamayı kapatıp çıkamayanların canlı kayıtlarını süpür.
  async function expirePresence(maxAgeMs = 2 * 60 * 1000, Timestamp) {
    const cutoff = Timestamp.fromMillis(now() - maxAgeMs);
    const stale = await db.collection('housePresence').where('updatedAt', '<', cutoff).get();
    await Promise.all(stale.docs.map((d) => d.ref.delete()));
    return stale.size;
  }

  return { houseAction, cleanDesign, expirePresence };
}
