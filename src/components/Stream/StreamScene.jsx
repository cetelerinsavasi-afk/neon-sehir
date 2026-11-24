import { useEffect, useRef } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { createHouseEngine } from '../HouseScreen/houseEngine';
import { watchLive, mergeLive } from '../../lib/liveNet';
import { useBlocks } from '../../contexts/BlocksContext';
import { streamPose } from './streamShared';
// v198: şehirdeki internet kafenin gerçek düzeni — açılışta yüklenmesin (sadece yayın izlenirken)
let layoutsP = null;
const netkafeLayout = () => (layoutsP ||= import('../City/world/layouts.js').then((m) => m.NEW_VENUES.netkafe));

// =============================================================================
// v80 — Yayın sahnesi (izleyici): evi, bilgisayarın üstündeki kameradan canlı
// yeniden kurar. Kişiler/avatarlar/hareketler: housePresence (Firestore) +
// live/house (RTDB, akıcı konum). Kameranın görüş alanına giren herkes görünür;
// "yayında görünme" diyenler (noStream) ve izleyicinin engelledikleri gizlenir.
// =============================================================================
const PRESENCE_STALE_MS = 90_000; // v147.1: nabız 60 sn — 60 sn eşik duran avatarı kırpıştırıyordu

// v196: şehirdeki yayın (stream.city — oyunun kafesi / kişisel ev): odadakiler housePresence'ta yok →
// yayıncı koltuğunda çizilir; evde sadece yayının katı (eşyalar + o katın duvar / zemin kaplaması).
const HOME_WALL = 'boya_krem';
const HOME_FLOOR = 'parke_ceviz';
export default function StreamScene({ houseId, chairId, pcId, bubble = null, className = '', stream = null }) {
  const cityRef = useRef(null);
  cityRef.current = stream?.city ? { uid: stream.uid, name: stream.name, avatar: stream.avatar || null, floor: stream.floor ?? null } : null;
  const mountRef = useRef(null);
  const engRef = useRef(null);
  const fsRef = useRef([]);
  const liveRef = useRef({});
  const { isBlocked } = useBlocks();
  const blockedRef = useRef(isBlocked);
  blockedRef.current = isBlocked;

  useEffect(() => {
    if (!mountRef.current || !houseId) return undefined;
    const eng = createHouseEngine(mountRef.current, { canEdit: false, selfUid: '__viewer__', spectate: true });
    engRef.current = eng;
    const push = () => {
      const t = Date.now();
      const list = fsRef.current
        .filter((p) => !p.noStream && !blockedRef.current?.(p.uid))
        .filter((p) => {
          const ms = p.updatedAt?.toMillis?.() ?? Number(p.updatedAt || 0);
          return !ms || t - ms < PRESENCE_STALE_MS;
        })
        .map((p) => mergeLive({ ...p, holdingVisible: p.holding || null }, liveRef.current[p.uid], p.updatedAt?.toMillis?.() ?? 0));
      const cs = cityRef.current;
      if (cs?.uid && !list.some((p) => p.uid === cs.uid)) list.push({ uid: cs.uid, displayName: cs.name, avatar: cs.avatar, x: 0, z: 0, seat: `${chairId}:0` });
      eng.setOthers(list);
    };
    const offHouse = onSnapshot(doc(db, 'houses', houseId), (s) => {
      if (!s.exists()) return;
      const h = s.data();
      const cs = cityRef.current;
      if (h.kind === 'home') {
        const f = cs?.floor ?? (h.items || []).find((it) => it.i === chairId)?.f ?? 0;
        const items = (h.items || []).filter((it) => (it.f ?? 0) === f && it.p === 1);
        const sf = h.surf?.[f] || {};
        eng.setDesign({ items, wall: sf.wall || HOME_WALL, floor: sf.floor || HOME_FLOOR }, { force: true });
        eng.setFixedCamera(streamPose(items, chairId, pcId));
      } else if (houseId === 'game_internet') {
        // v198: oyunun internet kafesi şehirde — belgede sadece cihazlar var; yayının arkası şehirdeki
        // kafenin GERÇEK hâli (bütün eşyalar, duvar / zemin kaplaması) olsun
        netkafeLayout()
          .then((nk) => {
            if (engRef.current !== eng) return;
            eng.setDesign({ items: nk.items, wall: nk.wall, floor: nk.floor }, { force: true });
            eng.setFixedCamera(streamPose(nk.items, chairId, pcId));
          })
          .catch(() => {
            eng.setDesign({ items: h.items || [], wall: h.wall, floor: h.floor }, { force: true });
            eng.setFixedCamera(streamPose(h.items, chairId, pcId));
          });
      } else {
        eng.setDesign({ items: h.items || [], wall: h.wall, floor: h.floor }, { force: true });
        eng.setFixedCamera(streamPose(h.items, chairId, pcId));
      }
      push();
    });
    const offPres = onSnapshot(query(collection(db, 'housePresence'), where('houseId', '==', houseId), limit(40)), (s) => {
      fsRef.current = s.docs.map((d) => ({ uid: d.id, ...d.data() }));
      push();
    });
    // v81: odadakilerin sohbeti → kameradaki avatarlarının üstünde konuşma balonu
    const seenMsg = new Set();
    const since = Date.now() - 3000;
    const offChat = onSnapshot(
      query(collection(db, 'houses', houseId, 'chat'), orderBy('createdAtMs', 'desc'), limit(15)),
      (s) => {
        s.docs.forEach((d) => {
          if (seenMsg.has(d.id)) return;
          seenMsg.add(d.id);
          const m = d.data();
          if (Number(m.createdAtMs || 0) < since || blockedRef.current?.(m.uid)) return;
          if (fsRef.current.some((p) => p.uid === m.uid && p.noStream)) return;
          if (m.viaStream) return; // v86: yayıncının yayın mesajı — balonu StreamViewer zaten gösteriyor
          eng.say(m.uid, String(m.text || ''));
        });
      },
      () => {}
    );
    let timer = 0;
    const offLive = watchLive(`house/${houseId}`, (m) => {
      liveRef.current = m;
      if (!timer) timer = setTimeout(() => ((timer = 0), push()), 120);
    });
    return () => {
      offHouse();
      offPres();
      offChat();
      offLive();
      clearTimeout(timer);
      eng.dispose();
      engRef.current = null;
    };
  }, [houseId, chairId, pcId]);

  // v81: yayıncının izleyicilere yazdığı mesaj → avatarının üstünde konuşma balonu
  useEffect(() => {
    if (!bubble?.uid || !bubble.text) return undefined;
    let tries = 0;
    // avatar henüz yüklenmemiş olabilir: kısa süre yeniden dene
    const t = setInterval(() => {
      tries += 1;
      const eng = engRef.current;
      if (eng && (eng.hasOther?.(bubble.uid) ?? true)) {
        eng.say(bubble.uid, bubble.text);
        clearInterval(t);
      } else if (tries > 10) clearInterval(t);
    }, 300);
    return () => clearInterval(t);
  }, [bubble?.key, bubble?.uid, bubble?.text]);

  return <div ref={mountRef} className={`st-scene ${className}`} />;
}
