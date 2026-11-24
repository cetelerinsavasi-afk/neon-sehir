// =============================================================================
// HomePanel.jsx — v196 3 KATLI EV (şehirdeki ev binası)
// -----------------------------------------------------------------------------
// İçerideyken: 🏘️ Evler (ziyaret) · 🛠️ Tasarla · ⚙️ Ayarlar (sadece kendi evinde).
// Okuma: eve her girişte 1 belge (homeEnter). Evler listesi sadece açılınca (tek sorgu, ≤ 60 belge).
// Tasarım istemcide tutulur, "Kaydet" ile tek yazma; "Satın al" deneme eşyalarını tek işlemde alır.
// Sunucu: functions/home.js (kat / sınır / merdiven kuralları functions/homeGeometry.js — ortak).
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { houseAction } from '../../services/gameActions';
import { CATALOG, CATALOG_MAP, CATEGORIES, TINTS } from '../HouseScreen/houseCatalog.js';
import { CATALOG_KEYS } from '../../../functions/v196Shared.js';
import { checkPlacement, homeIdOf, FLOOR_NAMES, MAX_HOME_ITEMS } from '../../../functions/homeGeometry.js';
import { usePlayer } from '../../hooks/usePlayer';
import { MarketShelf, SellSheet, useFurnBest } from '../HouseScreen/FurnMarket';
import { furnPriceBand } from '../../../functions/furnMarket.js';
import ItemThumb from '../HouseScreen/ItemThumb';
import { releaseThumbRenderer } from '../HouseScreen/itemThumbs.js';
import { FLOORS, WALLS } from '../HouseScreen/houseTextures.js';
import { SURFACE_KEYS, FREE_SURFACES, surfacePrice } from '../../../functions/houseCatalogData.js';
import { WIN_MODELS, WIN_COLORS, HOME_FLOOR_DEFAULT, HOME_WALL_DEFAULT } from './world/houseFloors.js';

const HOME_DOORS = [
  ['ahsap', '🚪 Ahşap'],
  ['beyaz', '🚪 Beyaz panel'],
  ['cift', '🏨 Çift kanat'],
  ['salon', '🤠 Salon'],
  ['klasik', '🚪 Klasik'],
  ['modern', '🚪 Modern'],
  ['ferforje', '🚪 Ferforje'],
];
const PLACE_ERR = {
  floor: 'Bu kat yok.',
  pos: 'Geçersiz konum.',
  bounds: 'Buraya sığmaz.',
  hole: 'Kat boşluğu — buraya konmaz.',
  stairs: 'Merdivene eşya konmaz.',
  wall: 'Duvar eşyası duvara asılır.',
  'ceil-roof': 'Çatı katında tavan eşyası olmaz.',
};
const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(-12);
const errText = (e) => {
  const m = String(e?.message || '');
  if (m.startsWith('place-')) return PLACE_ERR[m.slice(6)] || 'Buraya konmaz.';
  if (m.startsWith('price-changed')) return 'Fiyatlar değişti, tekrar dene.';
  return m || 'Olmadı, tekrar dene.';
};
// kat başına kaplama seçenekleri (varsayılan kaplama listede yok: "Varsayılan" ücretsiz)
const SURF_OPTS = {
  floor: SURFACE_KEYS.floor.filter((k) => k !== HOME_FLOOR_DEFAULT).map((k) => FLOORS.find((d) => d.key === k)).filter(Boolean),
  wall: SURFACE_KEYS.wall.filter((k) => k !== HOME_WALL_DEFAULT).map((k) => WALLS.find((d) => d.key === k)).filter(Boolean),
};
const cleanSurfState = (surf) => {
  const out = {};
  for (const f of ['0', '1', '2']) {
    const v = surf?.[f];
    if (!v) continue;
    const o = {};
    if (v.wall) o.wall = v.wall;
    if (v.floor) o.floor = v.floor;
    if (o.wall || o.floor) out[f] = o;
  }
  return out;
};
const ownsSurf = (inv, type, key) => FREE_SURFACES[type].includes(key) || (inv?.[type === 'wall' ? 'walls' : 'floors'] || []).includes(key);
const SHOP = CATALOG.filter((d) => CATALOG_KEYS.has(d.k) && !d.hidden && !d.venueOnly && !d.door && d.price);
// evde önce ev eşyaları (oturma, masa, yatak…), sonra diğerleri
const HOME_FIRST = ['oturma', 'masa', 'yatak', 'banyo', 'mutfak', 'dekor', 'hali', 'duvar', 'elektronik', 'luks', 'eglence', 'spor', 'dis', 'hayvan', 'petshop', 'yapi', 'kapi', 'resim'];
const catRank = (k) => (HOME_FIRST.includes(k) ? HOME_FIRST.indexOf(k) : 100);
const SHOP_CATS = CATEGORIES.filter((c) => SHOP.some((d) => d.cat === c.key)).sort((a, b) => catRank(a.key) - catRank(b.key));

export default function HomePanel({ eng, uid, inside, flash, evtRef, Sheet, listOpen = false, onListClose, onInfo, settingsReq = 0 }) {
  const { player } = usePlayer(); // bakiye (tasarım: Bakiye / Sepet)
  const own = homeIdOf(uid);
  const [home, setHome] = useState(null);
  const [visit, setVisit] = useState(null); // ziyaret edilen ev (null = kendi evim)
  const [mode, setMode] = useState(null); // 'list' | 'design' | 'settings'
  const [busy, setBusy] = useState(false);
  const mine = home?.id === own;
  const [lv, setLv] = useState(0);
  useEffect(() => {
    if (!inside || !eng) return undefined;
    const t = setInterval(() => setLv(eng.homeLevel()), 700);
    return () => clearInterval(t);
  }, [inside, eng]);

  // içeri girince evi yükle (1 okuma); çıkınca boşalt + ziyaret biter
  const load = useCallback(async (id) => {
    try {
      const r = await houseAction({ op: 'homeEnter', ...(id && id !== own ? { homeId: id } : {}) });
      const h0 = r.data?.home || null;
      const h = h0 ? { ...h0, mine: h0.id === own } : null; // kendi evindeki setler sadece sahibine
      setHome(h);
      eng?.setHome(h);
    } catch (e) {
      flash(errText(e));
      setVisit(null);
      if (id && id !== own) load(null);
    }
  }, [eng, own, flash]);
  useEffect(() => {
    if (!eng) return;
    if (inside) load(visit);
    else {
      setHome(null);
      setMode(null);
      eng.homeDesign(null);
      eng.setHome(null);
      setVisit(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inside, visit, eng]);

  // v196: profilde favori araç değişince garaj hemen güncellenir (eve tekrar girmeden)
  useEffect(() => {
    const on = (e) => {
      const g = e.detail?.garage || null;
      eng?.homeGarage(g?.cid || null, g?.mods || null, g?.id || null);
      setHome((h) => (h && h.id === own ? { ...h, garage: g, garageCar: g?.cid || 0 } : h));
    };
    window.addEventListener('neon-home-garage', on);
    return () => window.removeEventListener('neon-home-garage', on);
  }, [eng, own]);
  // üstteki uzun başlık panelinde ev adı + kat; ⚙️ Ayarlar o panelin en sağında (CityScreen)
  useEffect(() => {
    onInfo?.(inside && home ? { name: home.name, owner: mine ? null : home.ownerName, floor: FLOOR_NAMES[lv], lv, mine, designing: mode === 'design' } : null);
  }, [inside, home, mine, lv, onInfo, mode]);
  useEffect(() => {
    if (settingsReq && inside && mine) setMode('design');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsReq]);
  const goHome = (id) => {
    setMode(null);
    onListClose?.();
    setVisit(id === own ? null : id);
    if (!inside) eng?.homeSpawn();
  };

  return (
    <>

      {(mode === 'list' || listOpen) && <HomeList Sheet={Sheet} eng={eng} own={own} onPick={goHome} onClose={() => { setMode(null); onListClose?.(); }} flash={flash} />}
      {mode === 'design' && home && mine && <HomeDesign eng={eng} home={home} player={player} evtRef={evtRef} flash={flash} settings={(close) => (
        <HomeSettings Sheet={Sheet} home={home} busy={busy} onClose={close} onSave={async (patch) => {
          setBusy(true);
          try {
            await houseAction({ op: 'homeSettings', ...patch });
            flash('✅ Kaydedildi');
            const r = await houseAction({ op: 'homeEnter' });
            const h = r.data?.home || null;
            if (h) {
              setHome((old) => ({ ...h, mine: true, items: old?.items || h.items }));
              eng?.homeDoor(h.door?.t || 'ahsap');
              eng?.homeGarage(h.garage?.cid || h.garageCar || null, h.garage?.mods || null, h.garage?.id || null);
            }
            close();
          } catch (e) {
            flash(errText(e));
          } finally {
            setBusy(false);
          }
        }} />
      )} onDone={async (reload) => {
        eng.homeDesign(null);
        setMode(null);
        if (reload) await load(null);
        else eng.setHome(home);
      }} />}
    </>
  );
}

// ---- Evler (en çok ziyaret edilen, içinde biri olan) ---------------------------------
function HomeList({ Sheet, eng, own, onPick, onClose, flash }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let dead = false;
    const occ = eng?.homeOccupancy?.() || {};
    houseAction({ op: 'homeList', homeIds: Object.keys(occ).slice(0, 10) })
      .then((r) => !dead && setRows((r.data?.homes || []).map((h) => ({ ...h, here: occ[h.id] || 0 })).sort((a, b) => b.here - a.here || b.pop - a.pop)))
      .catch((e) => {
        flash(errText(e));
        if (!dead) setRows([]);
      });
    return () => {
      dead = true;
    };
  }, [eng, flash]);
  return (
    <Sheet title="🏘️ Evler" onClose={onClose} closeLabel="Kapat">
      <button className="hm-row hm-mine" onClick={() => onPick(own)}>🏠 <b>Evim</b></button>
      {!rows && <div className="hm-empty">…</div>}
      {rows && !rows.length && <div className="hm-empty">Şu an gezilecek ev yok.</div>}
      {rows?.filter((h) => h.id !== own).map((h) => (
        <button key={h.id} className="hm-row" onClick={() => onPick(h.id)}>
          <b>{h.name}</b>
          <span>{h.ownerName}</span>
          <i>{h.here ? `👥 ${h.here} içeride · ` : ''}👣 {h.pop} bugün</i>
        </button>
      ))}
    </Sheet>
  );
}

// ---- Ayarlar: ad, kilit, kapı, garajdaki araç ----------------------------------------
function HomeSettings({ Sheet, home, busy, onClose, onSave }) {
  const [name, setName] = useState(home.name || '');
  const [locked, setLocked] = useState(Boolean(home.locked));
  const [door, setDoor] = useState(home.door?.t || 'ahsap');
  const patch = () => {
    const p = {};
    if (name.trim() !== home.name) p.name = name;
    if (locked !== Boolean(home.locked)) p.locked = locked;
    if (door !== (home.door?.t || 'ahsap')) p.doorType = door;
    return p;
  };
  return (
    <Sheet title="⚙️ Evin" onClose={onClose} closeLabel="Kapat">
      <label className="hm-field">Evin adı<input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
      <label className="hm-check"><input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> 🔒 Ziyaretçilere kapalı</label>
      <div className="hm-field">Ana kapı
        <div className="hm-chips">{HOME_DOORS.map(([k, n]) => <button key={k} className={door === k ? 'on' : ''} onClick={() => setDoor(k)}>{n}</button>)}</div>
      </div>
      <p className="hm-note">❤️ Garajdaki araç: soldaki 🚗 Arabalarım listesinde aracın sağ üstündeki kalple seçilir; garajdan binip gezebilirsin.</p>
      <p className="hm-note">10+ eşyalı ve açık evler Evler listesinde görünür. 20 gün girmezsen listeden düşer.</p>
      <button className="ws-panel-btn hm-save" disabled={busy || !Object.keys(patch()).length} onClick={() => onSave(patch())}>Kaydet</button>
    </Sheet>
  );
}

// ---- Tasarım: kat seç, eşya ekle / taşı / döndür / renk / sil, kaydet, satın al ---------
// Eski ev / karargah tasarım ekranıyla AYNI arayüz (aynı sınıflar: hs-top, hs-cartbar, hs-selbar, hs-shelf):
// üstte kat seçici + Bitti, bakiye + 🛒 Sepet (İptal / Alışverişi Tamamla), seçili eşya çubuğu, altta
// Mağaza / Envanter / Pazar rafı. Satın alınmamış eşya yarı saydam (deneme); Bitti'de sepet sorulur.
function PriceTag({ price, small }) {
  if (!price) return <span className={`hs-price free${small ? ' sm' : ''}`}>Ücretsiz</span>;
  if (price.t === 'gem')
    return (
      <span className={`hs-price gem${small ? ' sm' : ''}`}>
        <span className="emerald-icon" style={{ width: small ? 11 : 13, height: small ? 11 : 13 }} />
        {price.v.toLocaleString('tr-TR')}
      </span>
    );
  return (
    <span className={`hs-price gold${small ? ' sm' : ''}`}>
      <span className="gold-coin-icon" style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} />
      {price.v.toLocaleString('tr-TR')}
    </span>
  );
}
function Money({ gold = 0, gem = 0, small }) {
  return (
    <span className="hs-money">
      {(gold > 0 || gem === 0) && <PriceTag price={{ t: 'gold', v: gold }} small={small} />}
      {gem > 0 && <PriceTag price={{ t: 'gem', v: gem }} small={small} />}
    </span>
  );
}
const SHOP_ALL = SHOP_CATS;
function HomeDesign({ eng, home, evtRef, flash, onDone, settings, player = null }) {
  const [setOpen, setSetOpen] = useState(false);
  const [items, setItems] = useState(() => (home.items || []).map((x) => ({ ...x })));
  const [inv, setInv] = useState(() => ({ ...(home.inv?.items || {}) }));
  const [f, setF] = useState(() => eng.homeLevel());
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('magaza'); // magaza | envanter | pazar
  const [cat, setCat] = useState(SHOP_ALL[0]?.key || null); // ya da 'yuzey'
  const [shelfOpen, setShelfOpen] = useState(true);
  const [panel, setPanel] = useState(null); // checkout | leave | sell | buy
  const [buyAsk, setBuyAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [surf, setSurf] = useState(() => cleanSurfState(home.surf));
  const [win, setWin] = useState(() => ({ ...(home.win || {}) }));
  const [winSel, setWinSel] = useState(null);
  const [sInv, setSInv] = useState(() => home.inv || null);
  const best = useFurnBest(tab === 'pazar');
  // v197 — karargah tasarımındaki gibi: 👁️ göz (deneme eşyaları gerçek gör), tavan modu, ↶ geri al
  const [realLook, setRealLook] = useState(false);
  const [ceilMode, setCeilMode] = useState(false);
  const undoRef = useRef([]);
  const savedRef = useRef(false); // v197: bu oturumda kaydedildi / satın alındı → çıkışta ev yeniden yüklenir (bayat sepet olmasın)
  useEffect(() => {
    eng.homeRealLook?.(realLook);
  }, [eng, realLook]);
  useEffect(() => {
    eng.homeCeilMode?.(ceilMode);
  }, [eng, ceilMode]);
  useEffect(() => () => {
    eng.homeRealLook?.(false);
    eng.homeCeilMode?.(false);
  }, [eng]);
  const st = useRef({});
  st.current = { items, inv, f, sel };
  useEffect(() => () => setTimeout(releaseThumbRenderer, 1500), []); // tasarım kapanınca ikinci WebGL bağlamı bırakılır
  useEffect(() => {
    eng.homeDesign(f);
  }, [eng, f]);
  const apply = useCallback((next, keepSel = true) => {
    const prev = st.current.items;
    if (prev && prev !== next) {
      undoRef.current.push({ items: prev, inv: st.current.inv });
      if (undoRef.current.length > 40) undoRef.current.shift();
    }
    setItems(next);
    setDirty(true);
    eng.homeSetItems(next);
    if (!keepSel) setSel(null);
  }, [eng]);
  useEffect(() => {
    eng.homeSelect(sel);
  }, [eng, sel, items]);
  const placeOk = (it) => !checkPlacement(it, { wall: Boolean(CATALOG_MAP[it.k]?.wall), ceil: Boolean(CATALOG_MAP[it.k]?.ceil) });
  // motor: eşyaya dokun = seç · sürükle-bırak = taşı · boş zemine dokun = seçili eşya oraya · pencere = stil
  useEffect(() => {
    evtRef.current = (e) => {
      const { items: cur, f: fl, sel: s } = st.current;
      if (e.type === 'homeDrop') {
        const it = cur[e.idx];
        if (!it) return;
        const next = { ...it, x: e.x, z: e.z, r: e.r };
        if (!placeOk(next)) {
          flash(PLACE_ERR[checkPlacement(next, { wall: Boolean(CATALOG_MAP[next.k]?.wall), ceil: Boolean(CATALOG_MAP[next.k]?.ceil) })] || 'Buraya konmaz.');
          eng.homeSetItems(cur); // eski yerine
          return;
        }
        apply(cur.map((x, i) => (i === e.idx ? next : x)));
        setSel(e.idx);
        return;
      }
      if (e.type !== 'homeTap') return;
      if (e.win) {
        setWinSel(e.win);
        setSel(null);
        return;
      }
      setWinSel(null);
      // v197 (karargah gibi): eşyaya dokun = seç · boş yere dokun = seçimi bırak (eşya ışınlanmaz;
      // taşımak için seçili eşyayı parmakla sürükle)
      void s;
      void fl;
      setSel(e.idx != null ? e.idx : null);
    };
    return () => {
      evtRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evtRef, eng, apply, flash]);
  // eşya ekranın ortasına (doluysa yakınındaki boş yere) konur, seçili gelir → parmakla sürükle
  const freeSpot = (it, c) => {
    for (let rr = 0; rr <= 6; rr += 0.7) {
      const n = rr === 0 ? 1 : Math.max(6, Math.round(rr * 6));
      for (let a = 0; a < n; a++) {
        const t = { ...it };
        if (eng.homePlace(t, c.x + Math.cos((a / n) * Math.PI * 2) * rr, c.z + Math.sin((a / n) * Math.PI * 2) * rr) && placeOk(t)) return t;
      }
    }
    return null;
  };
  const add = (k, { owned = false, near = null } = {}) => {
    if (items.length >= MAX_HOME_ITEMS) return flash(`Eşya sınırına ulaştın (${MAX_HOME_ITEMS}).`);
    const base = { i: newId(), k, x: 0, z: 0, r: near?.r || 0, c: near?.c || 0, f };
    const it = freeSpot(base, near ? { x: near.x + 0.9, z: near.z } : eng.homeViewCenter());
    if (!it) return flash('Bu katta yer yok — başka bir kata geç.');
    const fromInv = owned || (inv[k] || 0) > 0;
    if (fromInv) {
      if (!((inv[k] || 0) > 0)) return flash('Envanterinde kalmadı.');
      it.p = 1;
      setInv({ ...inv, [k]: inv[k] - 1 });
      flash(`📦 Envanterindeki ${CATALOG_MAP[k]?.name || 'eşya'} kondu.`);
    }
    const next = [...items, it];
    apply(next);
    setSel(next.length - 1);
    setWinSel(null);
  };
  const cur = sel != null ? items[sel] : null;
  const curDef = cur ? CATALOG_MAP[cur.k] : null;
  // sepet: deneme eşyalar + sahip olunmayan kaplamalar
  const cart = useMemo(() => {
    const lines = {};
    let gold = 0;
    let gem = 0;
    const addL = (key, name, price) => {
      if (!price) return;
      if (!lines[key]) lines[key] = { name, price, n: 0 };
      lines[key].n += 1;
      if (price.t === 'gem') gem += price.v;
      else gold += price.v;
    };
    items.forEach((it) => {
      if (it.p !== 1) addL(it.k, CATALOG_MAP[it.k]?.name || it.k, CATALOG_MAP[it.k]?.price);
    });
    const seen = new Set();
    Object.entries(surf).forEach(([fl, v]) => {
      for (const type of ['wall', 'floor']) {
        const key = v?.[type];
        if (!key || seen.has(`${type}:${key}`) || ownsSurf(sInv, type, key)) continue;
        seen.add(`${type}:${key}`);
        const d = (type === 'wall' ? WALLS : FLOORS).find((x) => x.key === key);
        addL(`${type}:${key}`, `${type === 'wall' ? 'Duvar' : 'Zemin'}: ${d?.name || key} (${FLOOR_NAMES[fl]})`, surfacePrice(type, key));
      }
    });
    return { lines: Object.values(lines), gold, gem, count: Object.values(lines).reduce((a, l) => a + l.n, 0) };
  }, [items, surf, sInv]);
  const payGold = Number(player?.gold || 0);
  const payGem = Number(player?.emerald || 0);
  const rotate = (d) => {
    if (!cur || curDef?.wall) return;
    const it = { ...cur, r: (cur.r + d + 8) % 8 };
    if (!placeOk(it)) return flash('Burada dönmüyor.');
    apply(items.map((x, i) => (i === sel ? it : x)));
  };
  const tint = (c) => cur && apply(items.map((x, i) => (i === sel ? { ...x, c } : x)));
  const remove = () => {
    if (!cur) return;
    if (cur.p === 1) setInv({ ...inv, [cur.k]: (inv[cur.k] || 0) + 1 });
    apply(items.filter((_, i) => i !== sel), false);
  };
  const pickSurf = (type, key) => {
    const v = { ...(surf[f] || {}) };
    if (key) v[type] = key;
    else delete v[type];
    const next = { ...surf, [f]: v };
    if (!v.wall && !v.floor) delete next[f];
    setSurf(next);
    setDirty(true);
    eng.homeSurfaces(next);
  };
  const setWinStyle = (patch) => {
    if (!winSel) return;
    const v = { m: 0, c: 0, ...(win[winSel] || {}), ...patch };
    const next = { ...win };
    if (v.m || v.c) next[winSel] = v;
    else delete next[winSel];
    setWin(next);
    setDirty(true);
    eng.homeWindows(next);
  };
  const payload = (list = items) => ({ op: 'homeSave', items: list.map(({ i, k, x, z, r, c, f: fl, p }) => ({ i, k, x, z, r, c, f: fl, ...(p ? { p } : {}) })), surf, win });
  const save = async (list) => {
    setBusy(true);
    try {
      const r = await houseAction(payload(list));
      if (r.data?.inv) setSInv(r.data.inv);
      setDirty(false);
      savedRef.current = true;
      return true;
    } catch (e) {
      flash(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const doCheckout = async (exit = false) => {
    if (!(await save())) return;
    setBusy(true);
    try {
      const r = await houseAction({ op: 'homeCheckout', expect: { gold: cart.gold, gem: cart.gem } });
      // v197: alınan duvar / zemin kaplamaları artık senin — bütün katlarda ücretsiz (tekrar zümrüt istenmez)
      setSInv((old) => {
        if (r.data?.inv) return r.data.inv;
        const nx = { ...(old || {}), walls: [...(old?.walls || [])], floors: [...(old?.floors || [])] };
        Object.values(surf).forEach((v) => {
          if (v?.wall && !nx.walls.includes(v.wall)) nx.walls.push(v.wall);
          if (v?.floor && !nx.floors.includes(v.floor)) nx.floors.push(v.floor);
        });
        return nx;
      });
      const owned = items.map((it) => ({ ...it, p: 1 }));
      setItems(owned);
      eng.homeSetItems(owned);
      setPanel(null);
      flash(`🎉 ${r.data?.count || ''} ürün senin! Güle güle kullan.`);
      if (exit) onDone(true);
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };
  // sepeti boşalt: deneme eşyalar kalkar, sahip olunmayan kaplamalar varsayılana döner
  const cancelCart = () => {
    const next = items.filter((it) => it.p === 1);
    const ns = {};
    Object.entries(surf).forEach(([fl, v]) => {
      const o = {};
      for (const type of ['wall', 'floor']) if (v?.[type] && ownsSurf(sInv, type, v[type])) o[type] = v[type];
      if (o.wall || o.floor) ns[fl] = o;
    });
    setSurf(ns);
    eng.homeSurfaces(ns);
    apply(next, false);
    flash('Sepet boşaltıldı.');
    return next;
  };
  const finish = async () => {
    if (cart.count > 0) {
      setPanel('leave');
      return;
    }
    if (dirty && !(await save())) return;
    onDone(dirty || savedRef.current);
  };
  const leaveEmpty = async () => {
    const next = cancelCart();
    setPanel(null);
    if (await save(next)) onDone(true);
  };
  // seçili (satın alınmış) eşyayı pazara koy: odadan envantere alınır, kaydedilir, ilan verilir
  const sell = async (v) => {
    if (!cur || cur.p !== 1) return;
    const k = cur.k;
    const next = items.filter((_, i) => i !== sel);
    setInv({ ...inv, [k]: (inv[k] || 0) + 1 });
    apply(next, false);
    setPanel(null);
    if (!(await save(next))) return;
    try {
      await houseAction({ op: 'furnList', k, v });
      setInv((m) => ({ ...m, [k]: Math.max(0, (m[k] || 0) - 1) }));
      flash(`🏷️ ${CATALOG_MAP[k]?.name || 'Mobilya'} pazara kondu.`);
    } catch (e) {
      flash(errText(e));
    }
  };
  // pazardan al: envantere gelir (sonra Envanter'den konur)
  const buyListing = async () => {
    const b = buyAsk;
    if (!b) return;
    setBusy(true);
    try {
      await houseAction({ op: 'furnBuy', id: b.b.id, expect: { t: b.b.t, v: b.b.v } });
      setInv((m) => ({ ...m, [b.k]: (m[b.k] || 0) + 1 }));
      setBuyAsk(null);
      setTab('envanter');
      flash(`📦 ${CATALOG_MAP[b.k]?.name || 'Mobilya'} envanterine geldi.`);
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const undo = () => {
    const last = undoRef.current.pop();
    if (!last) return flash('Geri alınacak bir şey yok.');
    setItems(last.items);
    setInv(last.inv);
    setDirty(true);
    setSel(null);
    eng.homeSetItems(last.items);
  };
  const invList = Object.entries(inv)
    .filter(([k, n]) => n > 0 && CATALOG_MAP[k])
    .map(([k, n]) => ({ def: CATALOG_MAP[k], n }));
  const shelfItems = SHOP.filter((d) => d.cat === cat);
  return (
    <div className="hm-design hm-old">
      {/* üst: kat seçici (eski Tasarla / Gez yerinde) + Bitti */}
      <div className="hs-top hm-old-top">
        <div className="hs-seg">
          {FLOOR_NAMES.map((n, i) => (
            <button key={n} className={f === i ? 'on' : ''} onClick={() => { setF(i); setSel(null); setWinSel(null); }}>{n}</button>
          ))}
        </div>
        <button className="hs-icon-btn" onClick={() => setSetOpen(true)} title="Evin adı · kilit · kapı">⚙️</button>
        <button className="hs-btn gold hm-old-done" disabled={busy} onClick={finish}>✓ Bitti</button>
      </div>
      {setOpen && settings(() => setSetOpen(false))}

      {/* v197 — karargahtaki gibi: GÖZ (deneme eşyaları gerçek haliyle) + TAVAN MODU */}
      <button
        className={`hs-eye-btn hm-eye${realLook ? ' on' : ''}`}
        onClick={() => {
          setRealLook((v) => !v);
          flash(realLook ? '👁️ Deneme eşyalar yine saydam.' : '👁️ Deneme eşyaları gerçek haliyle görüyorsun.');
        }}
        title="Satın alınmamış eşyaları gerçek haliyle gör"
        aria-pressed={realLook}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3.2" fill={realLook ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
          {!realLook && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        </svg>
      </button>
      <button
        className={`hs-eye-btn hs-ceil-btn hm-eye${ceilMode ? ' on' : ''}`}
        onClick={() => {
          setCeilMode((v) => !v);
          setSel(null);
          flash(ceilMode ? 'Tavan modu kapandı.' : '💡 Tavan modu: sadece tavan eşyaları (avize, pervane) seçilir.');
        }}
        title="Tavan modu: tavan eşyalarını düzenle"
        aria-pressed={ceilMode}
      >
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
          <path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4z" fill="currentColor" fillOpacity={ceilMode ? 0.22 : 0.08} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </button>

      {/* bakiye + sepet */}
      <div className="hs-cartbar">
        <div className="hs-balance">
          <span>Bakiye</span>
          <Money gold={payGold} gem={payGem} small />
          {payGem === 0 && <PriceTag price={{ t: 'gem', v: 0 }} small />}
        </div>
        {cart.count > 0 && (
          <div className="hs-cart">
            <span className="hs-cart-label">🛒 Sepet ({cart.count})</span>
            <Money gold={cart.gold} gem={cart.gem} small />
            <div className="hs-cart-actions">
              <button className="ghost" onClick={cancelCart}>İptal</button>
              <button className="go" onClick={() => setPanel('checkout')}>Alışverişi Tamamla</button>
            </div>
          </div>
        )}
      </div>

      {/* pencere */}
      {winSel && !cur && (
        <div className="hs-selbar">
          <div className="hs-selbar-head">
            <b>🪟 Pencere</b>
            <span className="hs-owned-badge">Ücretsiz</span>
            <button className="hs-x" onClick={() => setWinSel(null)}>✕</button>
          </div>
          <div className="hs-selbar-actions">
            {WIN_MODELS.map((n, i) => <button key={n} className={((win[winSel]?.m) | 0) === i ? 'hm-on' : ''} onClick={() => setWinStyle({ m: i })}>{n}</button>)}
          </div>
          <div className="hs-swatches">
            {WIN_COLORS.map(([n, hex], i) => <button key={n} className={`hs-sw${((win[winSel]?.c) | 0) === i ? ' on' : ''}`} style={{ background: hex }} title={n} onClick={() => setWinStyle({ c: i })} />)}
          </div>
        </div>
      )}

      {/* seçili eşya */}
      {cur && (
        <div className="hs-selbar">
          <div className="hs-selbar-head">
            <b>{curDef?.name}</b>
            {cur.p === 1 ? <span className="hs-owned-badge">✓ Senin</span> : <span className="hs-trial-badge">Deneme</span>}
            {cur.p !== 1 && <PriceTag price={curDef?.price} small />}
            <button className="hs-x" onClick={() => setSel(null)}>✕</button>
          </div>
          {curDef?.tints && TINTS[curDef.tints] && (
            <div className="hs-swatches">
              {TINTS[curDef.tints].map((t, i) => (
                <button key={t.n} className={`hs-sw${(cur.c || 0) === i ? ' on' : ''}`} style={{ background: t.sw || t.c }} title={t.n} onClick={() => tint(i)} />
              ))}
            </div>
          )}
          <div className="hs-selbar-actions">
            {!curDef?.wall && <button onClick={() => rotate(-1)}>↺</button>}
            {!curDef?.wall && <button onClick={() => rotate(1)}>↻</button>}
            <button onClick={() => add(cur.k, { near: cur })}>⧉ Bir tane daha</button>
            <button className="danger" onClick={remove}>{cur.p === 1 ? '📦 Envantere' : '🗑 Kaldır'}</button>
            {cur.p === 1 && furnPriceBand(cur.k) && <button className="hs-sell-btn" onClick={() => setPanel('sell')}>🏷️ Sat</button>}
          </div>
        </div>
      )}

      {/* raf: Mağaza / Envanter / Pazar */}
      <div className={`hs-shelf${shelfOpen ? '' : ' closed'}`}>
        <div className="hs-shelf-main-tabs">
          <button className={tab === 'magaza' ? 'on' : ''} onClick={() => { setTab('magaza'); setShelfOpen(true); }}>🏬 Mağaza</button>
          <button className={tab === 'envanter' ? 'on' : ''} onClick={() => { setTab('envanter'); setShelfOpen(true); }}>
            📦 Envanter{invList.length > 0 && <i>{invList.reduce((a, x) => a + x.n, 0)}</i>}
          </button>
          <button className={tab === 'pazar' ? 'on' : ''} onClick={() => { setTab('pazar'); setShelfOpen(true); }}>🛒 Pazar</button>
          <button className="hs-undo" onClick={undo} title="Geri al">↶</button>
          <button className="hs-shelf-toggle" onClick={() => setShelfOpen((v) => !v)}>{shelfOpen ? '▾' : '▴'}</button>
        </div>
        {shelfOpen && tab === 'magaza' && (
          <>
            <div className="hs-shelf-tabs">
              {SHOP_ALL.map((c) => (
                <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
                  {c.icon} {c.name}
                </button>
              ))}
              <button className={cat === 'yuzey' ? 'on' : ''} onClick={() => setCat('yuzey')}>🎨 Duvar & Zemin</button>
            </div>
            {cat !== 'yuzey' && (
              <div className="hs-shelf-items">
                {shelfItems.map((d) => (
                  <button key={d.k} className="hs-card" onClick={() => add(d.k)}>
                    <ItemThumb k={d.k} icon={d.icon} />
                    <span className="hs-card-name">{d.name}</span>
                    <PriceTag price={d.price} small />
                    {d.tints && TINTS[d.tints] && <span className="hs-card-tints">{TINTS[d.tints].length} renk</span>}
                    {inv[d.k] > 0 && <span className="hs-card-own">📦 {inv[d.k]}</span>}
                  </button>
                ))}
              </div>
            )}
            {cat === 'yuzey' && (
              <div className="hs-shelf-surfaces">
                {[['wall', 'Duvar', SURF_OPTS.wall, HOME_WALL_DEFAULT, WALLS], ['floor', 'Zemin', SURF_OPTS.floor, HOME_FLOOR_DEFAULT, FLOORS]].map(([type, label, opts, def, all]) => (
                  <div className="hs-surf-row" key={type}>
                    <span className="hs-surf-label">{FLOOR_NAMES[f]} · {label}</span>
                    <button className={`hs-surf${!surf[f]?.[type] ? ' on' : ''}`} onClick={() => pickSurf(type, null)}>
                      <i style={{ background: all.find((x) => x.key === def)?.swatch }} />
                      <span>Varsayılan</span>
                      <span className="hs-price free sm">Ücretsiz</span>
                    </button>
                    {opts.map((w) => (
                      <button key={w.key} className={`hs-surf${surf[f]?.[type] === w.key ? ' on' : ''}`} onClick={() => pickSurf(type, w.key)}>
                        <i style={{ background: w.swatch }} />
                        <span>{w.name}</span>
                        {ownsSurf(sInv, type, w.key) ? <span className="hs-price free sm">✓ Senin</span> : <PriceTag price={surfacePrice(type, w.key)} small />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {shelfOpen && tab === 'pazar' && <MarketShelf uid={home.ownerUid} best={best} Price={PriceTag} onPlace={(k, b) => setBuyAsk({ k, b })} flash={flash} />}
        {shelfOpen && tab === 'envanter' && (
          <div className="hs-shelf-items">
            {invList.length === 0 && <p className="hs-dim hs-inv-empty">Envanterin boş. Satın aldığın eşyaları odadan kaldırınca ya da pazardan alınca buraya gelir.</p>}
            {invList.map(({ def, n }) => (
              <button key={def.k} className="hs-card" onClick={() => add(def.k, { owned: true })}>
                <ItemThumb k={def.k} icon={def.icon} />
                <span className="hs-card-name">{def.name}</span>
                <span className="hs-card-own big">× {n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* alışverişi tamamla */}
      {(panel === 'checkout' || panel === 'leave') && (
        <div className="hs-modal-bg" onClick={() => !busy && setPanel(null)}>
          <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hs-modal-head">
              <b>{panel === 'leave' ? '🛒 Sepette ürün var' : '🛒 Alışverişi Tamamla'}</b>
              <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
            </div>
            {panel === 'leave' && <p className="hs-dim">Yarı saydam eşyalar deneme — satın almadan çıkarsan evinden kalkar.</p>}
            <div className="hs-receipt">
              {cart.lines.map((l) => (
                <div key={l.name} className="hs-receipt-row">
                  <span>{l.n > 1 ? `${l.n} × ` : ''}{l.name}</span>
                  <PriceTag price={{ t: l.price.t, v: l.price.v * l.n }} small />
                </div>
              ))}
            </div>
            <div className="hs-receipt-total">
              <span>Toplam</span>
              <Money gold={cart.gold} gem={cart.gem} />
            </div>
            <div className="hs-receipt-bal">
              <span>Bakiyen</span>
              <Money gold={payGold} gem={payGem} small />
            </div>
            {(payGold < cart.gold || payGem < cart.gem) && <p className="hs-err">{payGold < cart.gold ? 'Altının yetmiyor. ' : ''}{payGem < cart.gem ? 'Zümrütün yetmiyor.' : ''}</p>}
            <div className="hh-modal-row">
              {panel === 'leave' ? (
                <button className="hs-btn ghost" disabled={busy} onClick={leaveEmpty}>Satın almadan çık</button>
              ) : (
                <button className="hs-btn ghost" disabled={busy} onClick={() => setPanel(null)}>Vazgeç</button>
              )}
              <button className="hs-btn gold" disabled={busy || payGold < cart.gold || payGem < cart.gem} onClick={() => doCheckout(panel === 'leave')}>
                {busy ? 'İşleniyor…' : 'Onayla ve Satın Al'}
              </button>
            </div>
          </div>
        </div>
      )}
      {panel === 'sell' && cur && <SellSheet k={cur.k} Price={PriceTag} busy={busy} onConfirm={sell} onClose={() => setPanel(null)} />}
      {buyAsk && (
        <div className="hs-modal-bg" onClick={() => !busy && setBuyAsk(null)}>
          <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hs-modal-head">
              <b>🛒 Pazardan al</b>
              <button className="hs-x" onClick={() => setBuyAsk(null)}>✕</button>
            </div>
            <div className="hs-receipt">
              <div className="hs-receipt-row">
                <span>{CATALOG_MAP[buyAsk.k]?.name}</span>
                <PriceTag price={{ t: buyAsk.b.t, v: buyAsk.b.v }} small />
              </div>
            </div>
            <p className="hs-dim">Envanterine gelir; oradan istediğin kata koyarsın.</p>
            <div className="hh-modal-row">
              <button className="hs-btn ghost" disabled={busy} onClick={() => setBuyAsk(null)}>Vazgeç</button>
              <button className="hs-btn gold" disabled={busy} onClick={buyListing}>{busy ? 'İşleniyor…' : 'Satın Al'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export { HomeDesign }; // test / harness
