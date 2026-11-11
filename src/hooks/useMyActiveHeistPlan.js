import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMyActiveHeistPlans — kullanıcının hâlihazırda kurduğu ya da katıldığı,
 * hâlâ açık (status='open') TÜM ekip soygun planlarını döner (birden
 * fazla olabilir — kısıtlama HEDEFE ÖZELDİR: aynı anda farklı hedeflerde
 * ayrı ekiplerde olabilirsin, sadece aynı hedefte ikinci bir ekipte
 * olamazsın). Soygun ekranında "Ekip Soygunlarım" hızlı erişimi ve
 * "bu hedefte zaten bir ekibim var mı" kontrolü için kullanılır.
 *
 * v145 — "kendi ekibim önce altta görünüp 1-2 sn sonra üste çıkıyor":
 *   • Liste cihazda saklanır (localStorage, oyuncuya özel) → panel açılır
 *     açılmaz kendi ekiplerin en üstte.
 *   • Tek ortak dinleyici: Soygun sekmesi ve hedef paneli aynı anda açıkken
 *     iki ayrı sorgu / iki kat okuma yapılmaz.
 *   • Üyelik sonucu hatırlanır: her plan değişikliğinde tüm planların
 *     katılımcı belgeleri yeniden OKUNMAZ (eskiden her seferinde N okuma).
 *     Katıl / ayrıl / kur / sil bu cihazdan yapılınca anında güncellenir
 *     (noteMyHeistPlan). "Değilim" sonucu 5 dk sonra bir kez yeniden sorulur
 *     (başka cihazdan katılma ihtimali için).
 */
const NEG_TTL_MS = 5 * 60 * 1000;
const lsKey = (uid) => `ns_myHeistPlans_${uid}`;

const store = {
  uid: null,
  plans: [], // [{ planId, target }]
  open: [], // son anlık görüntüdeki açık planlar [{ id, target, creatorUid }]
  member: new Map(), // planId → { v: bool, at: ms }
  subs: new Set(),
  unsub: null,
  gen: 0,
};

function readCache(uid) {
  try {
    const arr = JSON.parse(localStorage.getItem(lsKey(uid)) || '[]');
    return Array.isArray(arr) ? arr.filter((p) => p && typeof p.planId === 'string' && typeof p.target === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}
function writeCache(uid, plans) {
  try {
    localStorage.setItem(lsKey(uid), JSON.stringify(plans.slice(0, 20)));
  } catch {
    /* depolama kapalı olabilir */
  }
}
function emit() {
  const same = (a, b) => a.length === b.length && a.every((p, i) => p.planId === b[i]?.planId && p.target === b[i]?.target);
  store.subs.forEach((fn) => fn(store.plans, same));
}
function setPlans(next) {
  const prev = store.plans;
  if (prev.length === next.length && prev.every((p, i) => p.planId === next[i].planId && p.target === next[i].target)) return;
  store.plans = next;
  if (store.uid) writeCache(store.uid, next);
  emit();
}

async function recompute() {
  const uid = store.uid;
  const gen = store.gen;
  if (!uid) return;
  const t = Date.now();
  // v154: plan belgesinde üye listesi (memberUids) varsa okuma yok
  // (bu cihazdan az önce katıl / ayrıl yapıldıysa sunucu yazımı gelene kadar yerel bilgi geçerli)
  store.open.forEach((p) => {
    if (!Array.isArray(p.memberUids)) return;
    const m = store.member.get(p.id);
    const v = p.memberUids.includes(uid);
    if (m?.local && t - m.at < 20000 && m.v !== v) return;
    store.member.set(p.id, { v, at: t });
  });
  const need = store.open.filter((p) => {
    if (p.creatorUid === uid || Array.isArray(p.memberUids)) return false;
    const m = store.member.get(p.id);
    return !m || (!m.v && t - m.at > NEG_TTL_MS);
  });
  if (need.length) {
    await Promise.all(
      need.map(async (p) => {
        try {
          const s = await getDoc(doc(db, 'heistPlans', p.id, 'participants', uid));
          store.member.set(p.id, { v: s.exists(), at: Date.now() });
        } catch {
          /* okunamadı → sonraki görüntüde yeniden denenir */
        }
      })
    );
  }
  if (gen !== store.gen || uid !== store.uid) return;
  setPlans(store.open.filter((p) => p.creatorUid === uid || store.member.get(p.id)?.v).map((p) => ({ planId: p.id, target: p.target })));
}

function start(uid) {
  if (store.uid !== uid) {
    store.unsub?.();
    store.unsub = null;
    store.gen += 1;
    store.uid = uid;
    store.member = new Map();
    store.open = [];
    store.plans = uid ? readCache(uid) : [];
    store.plans.forEach((p) => store.member.set(p.planId, { v: true, at: Date.now() }));
  }
  if (!uid || store.unsub) return;
  const q = query(collection(db, 'heistPlans'), where('status', '==', 'open'));
  store.unsub = onSnapshot(
    q,
    (snap) => {
      store.open = snap.docs.map((d) => ({ id: d.id, target: d.data().target, creatorUid: d.data().creatorUid, memberUids: d.data().memberUids }));
      recompute();
    },
    () => {}
  );
}
function stopIfIdle() {
  if (store.subs.size) return;
  store.unsub?.();
  store.unsub = null;
}

// Bu cihazdan katıl / ayrıl / kur / sil yapılınca hemen işaretle (beklemeden üste çıksın)
export function noteMyHeistPlan(planId, target, isMine) {
  if (!store.uid || !planId) return;
  store.member.set(planId, { v: Boolean(isMine), at: Date.now(), local: true });
  if (isMine) {
    if (!store.open.some((p) => p.id === planId)) store.open = [...store.open, { id: planId, target, creatorUid: null, memberUids: null }];
    if (!store.plans.some((p) => p.planId === planId)) setPlans([...store.plans, { planId, target }]);
  } else {
    setPlans(store.plans.filter((p) => p.planId !== planId));
  }
}

export function useMyActiveHeistPlans() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [plans, setLocal] = useState(() => {
    start(uid);
    return store.plans;
  });

  useEffect(() => {
    start(uid);
    setLocal(store.plans);
    if (!uid) return undefined;
    const fn = (next) => setLocal(next);
    store.subs.add(fn);
    return () => {
      store.subs.delete(fn);
      stopIfIdle();
    };
  }, [uid]);

  return uid ? plans : [];
}
