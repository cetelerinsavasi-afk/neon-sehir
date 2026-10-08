import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { usePolledPresence } from '../../hooks/usePolledPresence';
import { useAuth } from '../../contexts/AuthContext';
import { regionEmojis, regionLabels } from '../../data/regions';
import GuestOverlay from '../GuestOverlay/GuestOverlay';
import { useHouseList } from '../../hooks/useHouseList';
import { useBusinessList } from '../../hooks/useBusinessList';
import PlaceTypePicker from '../PlaceTypePicker/PlaceTypePicker';
import { BIZ_TYPES, BIZ_TYPE_KEYS, midnightDayKey, prevDayKey } from '../../../functions/businessCatalogData.js';
import './VisitTab.css';

// =============================================================================
// VisitTab (Ziyaret) — v77 yeniden düzen
//   Üstte açılır/kapanır tür seçici. Varsayılan "Popüler":
//     dünün en çok ziyaret edilen 8 mekânı (oyunun mekânları + herkese açık
//     evler/işletmeler) + şu an içinde biri olan mekânlar → önce anlık kişi
//     sayısı, eşitlikte dünkü ziyaret. Liste her zaman (en fazla) 8 mekân.
//   Diğer seçenekler: Oyunun mekânları, her işletme türü, Evler.
// Ziyaretler sunucuda sayılır (functions/visits.js; gün 00:00'da döner).
// =============================================================================
const GAME_VENUES = [
  { key: 'park', region: 'park', openKey: 'park' },
  { key: 'banka', region: 'banka', openKey: 'banka' },
  { key: 'karakol', region: 'karakol', openKey: 'karakol' },
  { key: 'camii', region: 'camii', openKey: 'mosque' },
  { key: 'gazino', region: 'casino', openKey: 'casino' },
  { key: 'araba_galerisi', region: 'araba_galerisi', openKey: 'dealership' },
  { key: 'silah_magazasi', region: 'silah_magazasi', openKey: 'weaponShop' },
  { key: 'modifiye_garaji', region: 'modifiye_garaji', openKey: 'tuningGarage' },
];
const GAME_BY_KEY = Object.fromEntries(GAME_VENUES.map((g) => [g.key, g]));
// işletme türü → oyunun aynı türdeki mekânı
const GAME_OF_TYPE = { silahci: 'silah_magazasi', galeri: 'araba_galerisi', modifiye: 'modifiye_garaji' };
const POPULAR_N = 8;

const OPTIONS = [
  { key: 'popular', icon: '🔥', label: 'Popüler' },
  { key: 'game', icon: '🏙️', label: 'Oyunun mekânları' },
  ...BIZ_TYPE_KEYS.map((k) => ({ key: k, icon: BIZ_TYPES[k].icon, label: BIZ_TYPES[k].label })),
  { key: 'houses', icon: '🏠', label: 'Evler' },
];

// Dünün ziyaret sayıları (5 dk'da bir yenilenir)
function useYesterdayVisits(enabled) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const day = prevDayKey(midnightDayKey(Date.now()));
        const snap = await getDocs(query(collection(db, 'venueVisits'), where('dayKey', '==', day), orderBy('count', 'desc'), limit(60)));
        if (alive) setRows(snap.docs.map((d) => d.data()));
      } catch (err) {
        console.warn('venueVisits:', err?.code || err);
      }
    };
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [enabled]);
  return rows;
}

export default function VisitTab({ onVisitVenue, onVisitHouse }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState('popular');
  const isBiz = Boolean(BIZ_TYPES[filter]);
  // v73 — maliyet: canlı dinleyici yerine 30 sn'de bir aktif oyuncu sorgusu
  const houseList = useHouseList({ onlyLive: true });
  const parkList = usePolledPresence('parkPresence', { max: 200 });
  const interiorList = usePolledPresence('interiorPresence', { max: 400 });
  const yVisits = useYesterdayVisits(Boolean(user) && filter === 'popular');
  const biz = useBusinessList(isBiz ? filter : null, { enabled: isBiz, includeGame: true });

  const venuePeople = useMemo(() => {
    const out = { park: parkList.length };
    interiorList.forEach((p) => {
      if (p.locationId) out[p.locationId] = (out[p.locationId] || 0) + 1;
    });
    return out;
  }, [parkList, interiorList]);

  const gameItem = (key, yv = 0) => {
    const g = GAME_BY_KEY[key];
    return {
      id: `v_${key}`,
      icon: regionEmojis[g.region],
      name: regionLabels[g.region],
      sub: 'Oyunun mekânı',
      people: venuePeople[key] || 0,
      yv,
      open: () => onVisitVenue?.(g.openKey),
    };
  };
  const houseItem = (h, yv = 0) => ({
    id: `h_${h.id || h.houseId}`,
    icon: h.biz?.type || h.bizType ? BIZ_TYPES[h.biz?.type || h.bizType]?.icon || '🏪' : '🏠',
    name: h.name || 'Ev',
    sub: h.biz?.type || h.bizType ? `${BIZ_TYPES[h.biz?.type || h.bizType]?.label || 'İşletme'} · ${h.ownerName || 'Oyuncu'}` : h.ownerName || 'Oyuncu',
    people: h.people || 0,
    yv,
    open: () => onVisitHouse?.(h.id || h.houseId),
  });

  const liveHouses = useMemo(() => [...houseList.mine, ...houseList.enterable].filter((h) => h.people > 0 && !h.bizGame), [houseList]);

  const items = useMemo(() => {
    const byPeople = (a, b) => b.people - a.people || b.yv - a.yv;
    if (filter === 'popular') {
      const yv = Object.fromEntries(yVisits.map((r) => [r.key, r]));
      const cand = new Map();
      // dünün en çok ziyaret edilen 8'i
      yVisits.slice(0, POPULAR_N).forEach((r) => {
        if (GAME_BY_KEY[r.key]) cand.set(`v_${r.key}`, gameItem(r.key, r.count));
        else if (r.houseId) {
          const live = liveHouses.find((h) => h.id === r.houseId);
          cand.set(`h_${r.houseId}`, houseItem(live || r, r.count));
        }
      });
      // şu an içinde biri olanlar
      GAME_VENUES.forEach((g) => {
        if ((venuePeople[g.key] || 0) > 0) cand.set(`v_${g.key}`, gameItem(g.key, yv[g.key]?.count || 0));
      });
      liveHouses.forEach((h) => cand.set(`h_${h.id}`, houseItem(h, yv[`h_${h.id}`]?.count || 0)));
      // dün hiç kayıt yoksa liste oyunun mekânlarıyla tamamlanır
      GAME_VENUES.forEach((g) => {
        if (cand.size < POPULAR_N && !cand.has(`v_${g.key}`)) cand.set(`v_${g.key}`, gameItem(g.key, yv[g.key]?.count || 0));
      });
      return [...cand.values()].sort(byPeople).slice(0, POPULAR_N);
    }
    if (filter === 'game') return GAME_VENUES.map((g) => gameItem(g.key)).sort(byPeople);
    if (filter === 'houses') return liveHouses.filter((h) => !h.biz?.type).map((h) => houseItem(h)).sort(byPeople);
    // işletme türü: önce kalabalık, eşitlikte dünkü ciro sırası
    const rank = (r) => (Number.isFinite(r) && r > 0 ? r : 9999);
    const list = biz.list.map((h, i) => ({ ...houseItem(h), sub: `Sahibi: ${h.bizGame ? 'Neon Şehir' : h.ownerName || 'Oyuncu'}`, yv: -rank(h.bizRank) - i * 1e-6 }));
    const gk = GAME_OF_TYPE[filter];
    if (gk) list.push({ ...gameItem(gk), sub: 'Sahibi: Neon Şehir', yv: -rank(biz.gameRank) });
    return list.sort(byPeople);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, yVisits, venuePeople, liveHouses, biz.list, biz.gameRank]);

  return (
    <div className="visit-tab">
      <GuestOverlay>
        <PlaceTypePicker options={OPTIONS} value={filter} onChange={setFilter} />
        <p className="visit-hint">
          {filter === 'popular'
            ? 'En kalabalık mekânlar üstte; boşsa dünün en çok ziyaret edilenleri.'
            : 'En kalabalık üstte. Girmek için dokun; çıkınca bu ekrana dönersin.'}
        </p>
        <div className="visit-list">
          {items.map((item) => (
            <button key={item.id} className="visit-card" onClick={item.open}>
              <span className="visit-card-emoji">{item.icon}</span>
              <span className="visit-card-name">
                {item.name}
                {item.sub && <small className="visit-card-sub">{item.sub}</small>}
              </span>
              <span className={`visit-card-count ${item.people > 0 ? 'active' : ''}`}>👤 {item.people} kişi</span>
            </button>
          ))}
          {items.length === 0 && (
            <p className="visit-hint">{isBiz && biz.loading ? 'Yükleniyor…' : filter === 'houses' ? 'Şu an içinde kimse olan ev yok.' : 'Burada henüz mekân yok.'}</p>
          )}
        </div>
      </GuestOverlay>
    </div>
  );
}
