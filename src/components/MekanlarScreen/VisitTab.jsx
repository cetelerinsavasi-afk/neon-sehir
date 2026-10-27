import { useEffect, useMemo, useState } from 'react';
import { useYesterdayVisits } from '../../hooks/useYesterdayVisits';
import { usePolledPresence } from '../../hooks/usePolledPresence';
import { useAuth } from '../../contexts/AuthContext';
import { regionEmojis, regionLabels } from '../../data/regions';
import GuestVenue from '../Guest/GuestVenue';
import { guestPlaces } from '../../lib/guestApi';
import { useHouseList } from '../../hooks/useHouseList';
import { useBusinessList } from '../../hooks/useBusinessList';
import { useOfficeList } from '../../hooks/useOfficeList';
import { houseKind } from '../../../functions/officeData.js';
import PlaceTypePicker from '../PlaceTypePicker/PlaceTypePicker';
import { BIZ_TYPES, BIZ_TYPE_KEYS } from '../../../functions/businessCatalogData.js';
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
  { key: 'belediye', region: 'belediye', openKey: 'belediye' }, // v127
];
const GAME_BY_KEY = Object.fromEntries(GAME_VENUES.map((g) => [g.key, g]));
// işletme türü → oyunun aynı türdeki mekânı
const GAME_OF_TYPE = { silahci: 'silah_magazasi', galeri: 'araba_galerisi', modifiye: 'modifiye_garaji' };
const POPULAR_N = 8;

const OPTIONS = [
  { key: 'popular', icon: '🔥', label: 'Popüler' },
  { key: 'game', icon: '🏙️', label: 'Oyunun mekânları' },
  ...BIZ_TYPE_KEYS.map((k) => ({ key: k, icon: BIZ_TYPES[k].icon, label: BIZ_TYPES[k].label })),
  { key: 'offices', icon: '🏢', label: 'Ofisler' },
  { key: 'houses', icon: '🏠', label: 'Evler' },
];

// v134 — misafir: popüler / evler yok (canlı sayılar girişli); oyunun mekânları,
// işletmeler ve ofisler sunucudan gelen salt-okuma listeyle gezilir
const GUEST_OPTIONS = OPTIONS.filter((o) => o.key !== 'popular' && o.key !== 'houses');

export default function VisitTab({ onVisitVenue, onVisitHouse }) {
  const { user, loading: authLoading } = useAuth();
  const isGuest = !user && !authLoading;
  const [filter, setFilter] = useState(isGuest ? 'game' : 'popular');
  useEffect(() => {
    if (isGuest && (filter === 'popular' || filter === 'houses')) setFilter('game');
  }, [isGuest, filter]);
  const isBiz = Boolean(BIZ_TYPES[filter]);
  const guestType = isGuest && (isBiz || filter === 'offices') ? (filter === 'offices' ? 'ofis' : filter) : null;
  const [guestLists, setGuestLists] = useState({});
  const [guestHouseId, setGuestHouseId] = useState(null);
  useEffect(() => {
    if (!guestType || guestLists[guestType]) return undefined;
    let alive = true;
    guestPlaces(guestType)
      .then((l) => alive && setGuestLists((m) => ({ ...m, [guestType]: l })))
      .catch(() => alive && setGuestLists((m) => ({ ...m, [guestType]: [] })));
    return () => {
      alive = false;
    };
  }, [guestType, guestLists]);
  // v73 — maliyet: canlı dinleyici yerine 30 sn'de bir aktif oyuncu sorgusu
  const houseList = useHouseList({ onlyLive: true });
  // v78 — Evler filtresi: içinde kimse olmasa da girebileceğim tüm evler
  const allHouses = useHouseList({ enabled: Boolean(user) && filter === 'houses' });
  const [showAllHouses, setShowAllHouses] = useState(false);
  const parkList = usePolledPresence('parkPresence', { max: 200 });
  const interiorList = usePolledPresence('interiorPresence', { max: 400 });
  const yVisits = useYesterdayVisits(Boolean(user) && (filter === 'popular' || filter === 'houses'));
  const biz = useBusinessList(isBiz ? filter : null, { enabled: isBiz, includeGame: true });
  const offices = useOfficeList({ enabled: filter === 'offices' });

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
    if (isGuest) {
      if (filter === 'game') return GAME_VENUES.map((g) => gameItem(g.key));
      const gl = guestType ? guestLists[guestType] : null;
      if (!gl) return [];
      const rank = (r) => (Number.isFinite(r) && r > 0 ? r : 9999);
      const list = gl.map((h, i) => ({
        id: `h_${h.id}`,
        icon: h.bizType ? BIZ_TYPES[h.bizType]?.icon || '🏪' : h.emoji || '🏢',
        name: h.name || (filter === 'offices' ? 'Ofis' : BIZ_TYPES[filter]?.label || 'İşletme'),
        sub: `Sahibi: ${h.ownerName || 'Oyuncu'}`,
        people: 0,
        yv: -rank(h.bizRank) - i * 1e-6,
        open: () => setGuestHouseId(h.id),
      }));
      const gk = GAME_OF_TYPE[filter];
      if (gk) list.push({ ...gameItem(gk), sub: 'Sahibi: Neon Şehir', yv: -rank(null) });
      return list.sort(byPeople);
    }
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
    if (filter === 'offices') {
      if (offices.loading) return [];
      return offices.list.map((h) => ({ ...houseItem(h, h.yv), icon: h.office?.emoji || '🏢', sub: `Sahibi: ${h.ownerName || 'Oyuncu'}` }));
    }
    if (filter === 'houses') {
      // v78: dolu evler kişi sayısına göre en üstte; ardından boş ama girilebilir
      // evler dünün ziyaretine göre (en popüler 8; "tümünü göster" ile hepsi).
      const yv = Object.fromEntries(yVisits.map((r) => [r.key, r.count || 0]));
      const seen = new Set();
      const all = [];
      [...liveHouses, ...allHouses.mine, ...allHouses.enterable].forEach((h) => {
        if (!h?.id || seen.has(h.id) || h.biz?.type || h.bizType || h.bizGame || houseKind(h) === 'ofis') return;
        seen.add(h.id);
        const people = Math.max(h.people || 0, allHouses.counts?.[h.id] || 0);
        all.push(houseItem({ ...h, people }, yv[`h_${h.id}`] || 0));
      });
      const full = all.filter((x) => x.people > 0).sort(byPeople);
      const empty = all
        .filter((x) => !(x.people > 0))
        .sort((a, b) => b.yv - a.yv || a.name.localeCompare(b.name, 'tr'));
      const out = [...full, ...(showAllHouses ? empty : empty.slice(0, POPULAR_N))];
      out.hiddenEmpty = showAllHouses ? 0 : Math.max(0, empty.length - POPULAR_N);
      return out;
    }
    // işletme türü: önce kalabalık, eşitlikte dünkü ciro sırası
    // v91: oyuncu dükkânları yüklenmeden oyunun dükkânı tek başına gösterilmez.
    if (biz.loading) return [];
    const rank = (r) => (Number.isFinite(r) && r > 0 ? r : 9999);
    const list = biz.list.map((h, i) => ({ ...houseItem(h), sub: `Sahibi: ${h.bizGame ? 'Neon Şehir' : h.ownerName || 'Oyuncu'}`, yv: -rank(h.bizRank) - i * 1e-6 }));
    const gk = GAME_OF_TYPE[filter];
    if (gk) list.push({ ...gameItem(gk), sub: 'Sahibi: Neon Şehir', yv: -rank(biz.gameRank) });
    return list.sort(byPeople);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, yVisits, venuePeople, liveHouses, biz.list, biz.gameRank, biz.loading, allHouses, showAllHouses, offices, isGuest, guestType, guestLists]);
  const hiddenEmpty = filter === 'houses' ? items.hiddenEmpty || 0 : 0;

  return (
    <div className="visit-tab">
      <>
        <PlaceTypePicker options={isGuest ? GUEST_OPTIONS : OPTIONS} value={filter} onChange={setFilter} />
        <p className="visit-hint">
          {filter === 'popular'
            ? 'En kalabalık mekânlar üstte; boşsa dünün en çok ziyaret edilenleri.'
            : filter === 'houses'
              ? 'İçinde biri olan evler üstte; boş evler dünün en çok ziyaret edilenlerine göre.'
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
          {hiddenEmpty > 0 && (
            <button className="visit-more" onClick={() => setShowAllHouses(true)}>
              Tüm evleri göster (+{hiddenEmpty})
            </button>
          )}
          {items.length === 0 && (
            <p className="visit-hint">
              {(isBiz && biz.loading) || (filter === 'houses' && allHouses.loading) || (filter === 'offices' && offices.loading) || (guestType && !guestLists[guestType])
                ? 'Yükleniyor…'
                : filter === 'houses'
                  ? 'Girebileceğin bir ev yok.'
                  : 'Burada henüz mekân yok.'}
            </p>
          )}
        </div>
      </>
      {guestHouseId && <GuestVenue houseId={guestHouseId} onExit={() => setGuestHouseId(null)} />}
    </div>
  );
}
