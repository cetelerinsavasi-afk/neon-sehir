import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useYesterdayVisits } from '../../hooks/useYesterdayVisits';
import { usePolledPresence } from '../../hooks/usePolledPresence';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerSelect } from '../../hooks/usePlayer';
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
// v149 — park ve seyyar satıcılar artık ayrı bir mekân değil, doğrudan şehir haritasına
// gömülü → Ziyaret listesinden kaldırıldı (şehirde yürüyerek gidilir)
const GAME_VENUES = [
  { key: 'banka', region: 'banka', openKey: 'banka' },
  { key: 'karakol', region: 'karakol', openKey: 'karakol' },
  { key: 'camii', region: 'camii', openKey: 'mosque' },
  { key: 'gazino', region: 'casino', openKey: 'casino' },
  { key: 'araba_galerisi', region: 'araba_galerisi', openKey: 'dealership' },
  { key: 'silah_magazasi', region: 'silah_magazasi', openKey: 'weaponShop' },
  { key: 'modifiye_garaji', region: 'modifiye_garaji', openKey: 'tuningGarage' },
  { key: 'belediye', region: 'belediye', openKey: 'belediye' }, // v127
  // v146.4 — Polis Teşkilatı: sadece polisler + başkan, yardımcıları, teşkilat bakanı (diğerlerine kilitli)
  { key: 'teskilat', icon: '🚓', label: 'Polis Teşkilatı', openKey: 'teskilat', houseId: 'game_teskilat', police: true },
];
const POLICE_SEATS = { bsk: 1, yrd1: 1, yrd2: 1, guv: 1 };
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
  { key: 'hq', icon: '🏴', label: 'Karargahlar' }, // v146
];

// v134 — misafir: popüler / evler yok (canlı sayılar girişli); oyunun mekânları,
// işletmeler ve ofisler sunucudan gelen salt-okuma listeyle gezilir
const GUEST_OPTIONS = OPTIONS.filter((o) => o.key !== 'popular' && o.key !== 'houses' && o.key !== 'hq');

// v146 — karargahlar / teşkilat: kendi çeten (ve davet eden çeteler), teşkilata polisler girer.
// Üyelik bilgisi bir kez okunur, 5 dk önbellekte (Ziyaret her açıldığında tekrar okunmasın).
const accessCache = { uid: null, at: 0, v: null };
function useMyOrgAccess(uid) {
  const [v, setV] = useState(() => (accessCache.uid === uid && Date.now() - accessCache.at < 300_000 ? accessCache.v : null));
  useEffect(() => {
    if (!uid || (accessCache.uid === uid && Date.now() - accessCache.at < 300_000)) return undefined;
    let alive = true;
    (async () => {
      const cfg = await getDoc(doc(db, 'gangSystem/config'));
      const w = cfg.data()?.liveWorldId || null;
      const ms = w ? await getDoc(doc(db, `gangWorlds/${w}/memberships/${uid}`)) : null;
      const out = { gangId: ms?.data()?.gangId || null, police: Boolean(ms?.data()?.intelRosterId) };
      Object.assign(accessCache, { uid, at: Date.now(), v: out });
      if (alive) setV(out);
    })().catch(() => alive && setV({ gangId: null, police: false }));
    return () => {
      alive = false;
    };
  }, [uid]);
  return v || { gangId: null, police: false };
}
function useHqList(enabled) {
  const [state, setState] = useState({ list: [], loading: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    getDocs(query(collection(db, 'houses'), where('kind', '==', 'karargah'), limit(100)))
      .then((hs) => alive && setState({ list: hs.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false }))
      .catch(() => alive && setState({ list: [], loading: false }));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

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
  const interiorList = usePolledPresence('interiorPresence', { max: 400 });
  const yVisits = useYesterdayVisits(Boolean(user) && (filter === 'popular' || filter === 'houses'));
  const biz = useBusinessList(isBiz ? filter : null, { enabled: isBiz, includeGame: true });
  const offices = useOfficeList({ enabled: filter === 'offices' });
  const hqs = useHqList(filter === 'hq');
  const access = useMyOrgAccess(user?.uid);
  const mySeat = usePlayerSelect((p) => p?.belediyeSeat || null);
  const canTeskilat = access.police || Boolean(POLICE_SEATS[mySeat]);
  const [lockNote, setLockNote] = useState(null);
  useEffect(() => setLockNote(null), [filter]);

  const venuePeople = useMemo(() => {
    const out = {};
    interiorList.forEach((p) => {
      if (p.locationId) out[p.locationId] = (out[p.locationId] || 0) + 1;
    });
    return out;
  }, [interiorList]);

  const gameItem = (key, yv = 0) => {
    const g = GAME_BY_KEY[key];
    const locked = Boolean(g.police) && !canTeskilat;
    return {
      id: `v_${key}`,
      icon: locked ? '🔒' : g.icon || regionEmojis[g.region],
      name: g.label || regionLabels[g.region],
      sub: g.police ? (locked ? 'Sadece polisler girebilir' : 'Polis Teşkilatı') : 'Oyunun mekânı',
      people: g.houseId ? houseList.counts?.[g.houseId] || 0 : venuePeople[key] || 0,
      yv,
      locked,
      open: locked ? () => setLockNote('🔒 Polis Teşkilatına sadece polisler girebilir.') : () => onVisitVenue?.(g.openKey),
    };
  };
  // v146.4 — karargah kartı (kendi çeten / davetli → girilir, diğerleri kilitli)
  const hqItem = (h, yv = 0) => {
    const gid = h.hq?.gangId || String(h.id || h.houseId || '').replace(/^hq_/, '');
    const mine = Boolean(access.gangId) && gid === access.gangId;
    const ok = mine || (Boolean(access.gangId) && (h.hqInvites || []).includes(access.gangId));
    const id = h.id || h.houseId;
    return {
      id: `h_${id}`,
      icon: ok ? '🏴' : '🔒',
      name: h.name || 'Karargah',
      sub: mine ? 'Senin çeten' : ok ? '📨 Davetlisin' : 'Çete karargahı · sadece üyeleri',
      people: houseList.counts?.[id] || h.people || 0,
      yv,
      locked: !ok,
      open: ok ? () => onVisitHouse?.(id) : () => setLockNote(`🔒 ${h.name || 'Bu karargah'}: sadece çetenin üyeleri ve davet ettikleri girebilir.`),
    };
  };
  const isHqId = (id) => String(id || '').startsWith('hq_');
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
      if (filter === 'game') return GAME_VENUES.filter((g) => !g.police).map((g) => gameItem(g.key));
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
          const live = liveHouses.find((h) => h.id === r.houseId) || (houseList.liveHq || []).find((h) => h.id === r.houseId);
          cand.set(`h_${r.houseId}`, isHqId(r.houseId) ? hqItem(live || r, r.count) : houseItem(live || r, r.count));
        }
      });
      // şu an içinde biri olanlar (v146.4: seyyar satıcılar, teşkilat ve karargahlar dahil)
      GAME_VENUES.forEach((g) => {
        const it = gameItem(g.key, yv[g.key]?.count || 0);
        if (it.people > 0) cand.set(it.id, it);
      });
      liveHouses.forEach((h) => cand.set(`h_${h.id}`, houseItem(h, yv[`h_${h.id}`]?.count || 0)));
      (houseList.liveHq || []).forEach((h) => h.people > 0 && cand.set(`h_${h.id}`, hqItem(h, yv[`h_${h.id}`]?.count || 0)));
      // dün hiç kayıt yoksa liste oyunun mekânlarıyla tamamlanır
      GAME_VENUES.forEach((g) => {
        if (g.police && !canTeskilat) return;
        if (cand.size < POPULAR_N && !cand.has(`v_${g.key}`)) cand.set(`v_${g.key}`, gameItem(g.key, yv[g.key]?.count || 0));
      });
      return [...cand.values()].sort(byPeople).slice(0, POPULAR_N);
    }
    if (filter === 'game') return GAME_VENUES.map((g) => gameItem(g.key)).sort(byPeople);
    if (filter === 'hq') {
      return hqs.list
        .map((h) => hqItem(h))
        .map((x) => ({ ...x, yv: x.sub === 'Senin çeten' ? 2 : x.locked ? 0 : 1 }))
        .sort((a, b) => b.yv - a.yv || b.people - a.people || a.name.localeCompare(b.name, 'tr'));
    }
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
  }, [filter, yVisits, venuePeople, liveHouses, biz.list, biz.gameRank, biz.loading, allHouses, showAllHouses, offices, isGuest, guestType, guestLists, hqs, houseList.counts, houseList.liveHq, access, canTeskilat]);
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
        {lockNote && (
          <p className="visit-hint visit-lock-note" onClick={() => setLockNote(null)}>
            {lockNote}
          </p>
        )}
        <div className="visit-list">
          {items.map((item) => (
            <button key={item.id} className={`visit-card${item.locked ? ' locked' : ''}`} onClick={item.open}>
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
                  : filter === 'hq'
                    ? hqs.loading ? 'Yükleniyor…' : 'Henüz açılmış karargah yok.'
                    : 'Burada henüz mekân yok.'}
            </p>
          )}
        </div>
      </>
      {guestHouseId && <GuestVenue houseId={guestHouseId} onExit={() => setGuestHouseId(null)} />}
    </div>
  );
}
