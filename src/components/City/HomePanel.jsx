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
import { CATALOG, CATALOG_MAP, CATEGORIES, TINTS, formatPrice } from '../HouseScreen/houseCatalog.js';
import { CATALOG_KEYS } from '../../../functions/v196Shared.js';
import { checkPlacement, homeIdOf, FLOOR_NAMES, MAX_HOME_ITEMS } from '../../../functions/homeGeometry.js';
import { useVehicles } from '../../hooks/useVehicles';
import ItemThumb from '../HouseScreen/ItemThumb';
import { releaseThumbRenderer } from '../HouseScreen/itemThumbs.js';
import { FLOORS, WALLS } from '../HouseScreen/houseTextures.js';
import { SURFACE_KEYS, FREE_SURFACES, surfacePrice } from '../../../functions/houseCatalogData.js';
import { WIN_MODELS, WIN_COLORS, HOME_FLOOR_DEFAULT, HOME_WALL_DEFAULT } from './world/houseFloors.js';
import { vehicleCatalog } from '../../data/vehicleCatalog.js';

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
// sunucudaki checkout ile aynı: deneme eşyaları + sahip olunmayan kaplamalar (aynı kaplama bir kez)
const costOf = (items, surf = {}, sInv = null) => {
  let gold = 0;
  let gem = 0;
  const add = (pr) => {
    if (pr?.t === 'gem') gem += pr.v;
    else if (pr) gold += pr.v;
  };
  for (const it of items) {
    if (it.p === 1) continue;
    add(CATALOG_MAP[it.k]?.price);
  }
  const seen = new Set();
  for (const v of Object.values(surf)) {
    for (const type of ['wall', 'floor']) {
      const key = v?.[type];
      if (!key || seen.has(`${type}:${key}`) || ownsSurf(sInv, type, key)) continue;
      seen.add(`${type}:${key}`);
      add(surfacePrice(type, key));
    }
  }
  return { gold, gem };
};
const tintCount = (def) => (def?.tints && TINTS[def.tints] ? TINTS[def.tints].length : 1);
const SHOP = CATALOG.filter((d) => CATALOG_KEYS.has(d.k) && !d.hidden && !d.venueOnly && !d.door && d.price);
// evde önce ev eşyaları (oturma, masa, yatak…), sonra diğerleri
const HOME_FIRST = ['oturma', 'masa', 'yatak', 'banyo', 'mutfak', 'dekor', 'hali', 'duvar', 'elektronik', 'luks', 'eglence', 'spor', 'dis', 'hayvan', 'petshop', 'yapi', 'kapi', 'resim'];
const catRank = (k) => (HOME_FIRST.includes(k) ? HOME_FIRST.indexOf(k) : 100);
const SHOP_CATS = CATEGORIES.filter((c) => SHOP.some((d) => d.cat === c.key)).sort((a, b) => catRank(a.key) - catRank(b.key));

export default function HomePanel({ eng, uid, inside, flash, evtRef, Sheet, listOpen = false, onListClose, onInfo, settingsReq = 0 }) {
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
      {mode === 'design' && home && mine && <HomeDesign eng={eng} home={home} evtRef={evtRef} flash={flash} settings={(close) => (
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
              eng?.homeGarage(h.garage?.cid || h.garageCar || null, h.garage?.mods || null);
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
  const [car, setCar] = useState(null);
  const { vehicles } = useVehicles();
  const cars = vehicles.filter((v) => !v.seizedByBank && !v.listed && !v.mortgaged);
  const patch = () => {
    const p = {};
    if (name.trim() !== home.name) p.name = name;
    if (locked !== Boolean(home.locked)) p.locked = locked;
    if (door !== (home.door?.t || 'ahsap')) p.doorType = door;
    if (car != null) p.vehicleId = car;
    return p;
  };
  return (
    <Sheet title="⚙️ Evin" onClose={onClose} closeLabel="Kapat">
      <label className="hm-field">Evin adı<input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
      <label className="hm-check"><input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> 🔒 Ziyaretçilere kapalı</label>
      <div className="hm-field">Ana kapı
        <div className="hm-chips">{HOME_DOORS.map(([k, n]) => <button key={k} className={door === k ? 'on' : ''} onClick={() => setDoor(k)}>{n}</button>)}</div>
      </div>
      <div className="hm-field">❤️ Favori araç (garajda durur)
        <div className="hm-chips">
          {cars.map((v) => <button key={v.id} className={car === v.id || (car == null && home.garage?.id === v.id) ? 'on' : ''} onClick={() => setCar(v.id)}>{vehicleCatalog[v.catalogId]?.name || `#${v.catalogId}`}</button>)}
        </div>
      </div>
      <p className="hm-note">10+ eşyalı ve açık evler Evler listesinde görünür. 20 gün girmezsen listeden düşer.</p>
      <button className="ws-panel-btn hm-save" disabled={busy || !Object.keys(patch()).length} onClick={() => onSave(patch())}>Kaydet</button>
    </Sheet>
  );
}

// ---- Tasarım: kat seç, eşya ekle / taşı / döndür / renk / sil, kaydet, satın al ---------
function HomeDesign({ eng, home, evtRef, flash, onDone, settings }) {
  const [setOpen, setSetOpen] = useState(false);
  const [items, setItems] = useState(() => (home.items || []).map((x) => ({ ...x })));
  const [inv, setInv] = useState(() => ({ ...(home.inv?.items || {}) }));
  const [f, setF] = useState(() => eng.homeLevel());
  const [sel, setSel] = useState(null);
  const [cat, setCat] = useState(SHOP_CATS[0]?.key || null);
  const [panel, setPanel] = useState('shelf'); // 'shelf' (varsayılan açık) | 'surf' | null
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [surf, setSurf] = useState(() => cleanSurfState(home.surf));
  const [win, setWin] = useState(() => ({ ...(home.win || {}) }));
  const [winSel, setWinSel] = useState(null);
  const sInv = home.inv || null;
  const st = useRef({});
  st.current = { items, inv, f, sel };
  useEffect(() => () => setTimeout(releaseThumbRenderer, 1500), []); // tasarım kapanınca ikinci WebGL bağlamı bırakılır
  useEffect(() => {
    eng.homeDesign(f);
  }, [eng, f]);
  const apply = useCallback((next, keepSel = true) => {
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
          flash('Buraya konmaz.');
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
      if (e.idx != null) {
        setSel(e.idx);
        return;
      }
      if (e.x == null || e.f !== fl) {
        setSel(null);
        return;
      }
      if (s != null && cur[s]) {
        const it = { ...cur[s] };
        if (!eng.homePlace(it, e.x, e.z) || !placeOk(it)) return flash('Buraya konmaz.');
        apply(cur.map((x, i) => (i === s ? it : x)));
      }
    };
    return () => {
      evtRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evtRef, eng, apply, flash]);
  // rafa dokununca eşya hemen ekranın ortasına konur (doluysa yakınında boş bir yere), seçili gelir → sürükle
  const add = (k) => {
    if (items.length >= MAX_HOME_ITEMS) return flash(`En fazla ${MAX_HOME_ITEMS} eşya.`);
    const c = eng.homeViewCenter();
    const it = { i: newId(), k, x: 0, z: 0, r: 0, c: 0, f };
    let ok = false;
    for (let rr = 0; rr <= 6 && !ok; rr += 0.7) {
      const n = rr === 0 ? 1 : Math.max(6, Math.round(rr * 6));
      for (let a = 0; a < n && !ok; a++) {
        const x = c.x + Math.cos((a / n) * Math.PI * 2) * rr;
        const z = c.z + Math.sin((a / n) * Math.PI * 2) * rr;
        const t = { ...it };
        if (eng.homePlace(t, x, z) && placeOk(t)) {
          Object.assign(it, t);
          ok = true;
        }
      }
    }
    if (!ok) return flash('Bu katta yer yok — başka bir kata geç.');
    if ((inv[k] || 0) > 0) {
      it.p = 1;
      setInv({ ...inv, [k]: inv[k] - 1 });
    }
    const next = [...items, it];
    apply(next);
    setSel(next.length - 1);
    setWinSel(null);
  };
  const cur = sel != null ? items[sel] : null;
  const cost = useMemo(() => costOf(items, surf, sInv), [items, surf, sInv]);
  const edit = (fn) => cur && apply(items.map((x, i) => (i === sel ? fn({ ...x }) : x)));
  const rotate = () => {
    if (!cur) return;
    const it = { ...cur, r: (cur.r + 1) % 8 };
    if (CATALOG_MAP[cur.k]?.wall) return; // duvar eşyası duvara göre döner
    if (!placeOk(it)) return flash('Burada dönmüyor.');
    apply(items.map((x, i) => (i === sel ? it : x)));
  };
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
  const save = async () => {
    setBusy(true);
    try {
      await houseAction({ op: 'homeSave', items: items.map(({ i, k, x, z, r, c, f: fl, p }) => ({ i, k, x, z, r, c, f: fl, ...(p ? { p } : {}) })), surf, win });
      setDirty(false);
      return true;
    } catch (e) {
      flash(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const buy = async () => {
    if (!(await save())) return;
    setBusy(true);
    try {
      const r = await houseAction({ op: 'homeCheckout', expect: cost });
      flash(`✅ Satın alındı: ${r.data?.count || 0} eşya`);
      onDone(true);
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    if (dirty && !(await save())) return;
    onDone(dirty);
  };
  const owned = Object.entries(inv).filter(([, n]) => n > 0);
  const list = cat === '__inv' ? owned.map(([k, n]) => ({ ...CATALOG_MAP[k], n })).filter((d) => d?.k) : SHOP.filter((d) => d.cat === cat);
  const curDef = cur ? CATALOG_MAP[cur.k] : null;
  return (
    <div className="hm-design">
      <div className="hm-dtop">
        <div className="hm-floors" role="tablist">
          {FLOOR_NAMES.map((n, i) => (
            <button key={n} type="button" className={f === i ? 'on' : ''} onClick={() => { setF(i); setSel(null); setWinSel(null); }}>{n}</button>
          ))}
        </div>
        <button type="button" className="hm-done" disabled={busy} onClick={close}>✓ Bitti</button>
      </div>
      <div className="hm-dtools">
        <button type="button" className={panel === 'surf' ? 'on' : ''} onClick={() => { setPanel(panel === 'surf' ? 'shelf' : 'surf'); setSel(null); setWinSel(null); }}>🎨 Duvar · Zemin</button>
        <button type="button" onClick={() => setSetOpen(true)}>⚙️ Ad · Kilit · Kapı</button>
      </div>
      {setOpen && settings(() => setSetOpen(false))}
      {!cur && !winSel && <div className="hm-tip">Eşyayı sürükle: taşı · boşluğu sürükle: döndür · pencereye dokun: pencere</div>}
      {winSel && !cur && (
        <div className="hm-card hm-win">
          <div className="hm-card-head">
            <b>🪟 Pencere</b>
            <button type="button" onClick={() => setWinSel(null)}>✕</button>
          </div>
          <div className="hm-chips">
            {WIN_MODELS.map((n, i) => <button key={n} type="button" className={((win[winSel]?.m) | 0) === i ? 'on' : ''} onClick={() => setWinStyle({ m: i })}>{n}</button>)}
          </div>
          <div className="hm-swatches">
            {WIN_COLORS.map(([n, hex], i) => <button key={n} type="button" title={n} aria-label={n} className={((win[winSel]?.c) | 0) === i ? 'on' : ''} style={{ background: hex }} onClick={() => setWinStyle({ c: i })} />)}
          </div>
          <span className="hm-dim">Ücretsiz · Kaydet ile kalıcı olur</span>
        </div>
      )}
      {cur && (
        <div className="hm-card hm-selcard">
          <div className="hm-card-head">
            <ItemThumb k={cur.k} icon={curDef?.icon} />
            <div className="hm-card-t">
              <b>{curDef?.name}</b>
              <span>{cur.p === 1 ? 'Senin' : `Deneme · ${formatPrice(curDef?.price)}`}</span>
            </div>
            <button type="button" onClick={() => setSel(null)}>✕</button>
          </div>
          <div className="hm-actions">
            {!curDef?.wall && <button type="button" onClick={rotate}>↻ Döndür</button>}
            {tintCount(curDef) > 1 && <button type="button" onClick={() => edit((x) => ({ ...x, c: (x.c + 1) % tintCount(curDef) }))}>🎨 Renk</button>}
            <button type="button" className="hm-danger" onClick={remove}>{cur.p === 1 ? '📦 Envantere' : '🗑️ Kaldır'}</button>
          </div>
        </div>
      )}
      <div className={`hm-dock${panel ? '' : ' closed'}`}>
        <div className="hm-dock-bar">
          <button type="button" className="hm-handle" onClick={() => setPanel(panel ? null : 'shelf')}>{panel ? '▾ Gizle' : '▴ Eşyalar'}</button>
          <button type="button" disabled={busy || !dirty} onClick={save}>💾 Kaydet</button>
          {(cost.gold > 0 || cost.gem > 0) && (
            <button type="button" className="hm-buy" disabled={busy} onClick={buy}>
              🛒 Satın al · {cost.gold ? formatPrice({ t: 'gold', v: cost.gold }) : ''}{cost.gold && cost.gem ? ' + ' : ''}{cost.gem ? formatPrice({ t: 'gem', v: cost.gem }) : ''}
            </button>
          )}
        </div>
        {panel === 'shelf' && (
          <>
            <div className="hm-cats">
              {owned.length > 0 && <button type="button" className={cat === '__inv' ? 'on' : ''} onClick={() => setCat('__inv')}>📦 Envanter</button>}
              {SHOP_CATS.map((c) => <button key={c.key} type="button" className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>{c.icon} {c.name}</button>)}
            </div>
            <div className="hm-items">
              {list.map((d) => (
                <button key={d.k} type="button" onClick={() => add(d.k)}>
                  <ItemThumb k={d.k} icon={d.icon} />
                  <b>{d.name}</b>
                  <i>{d.n ? `📦 ${d.n}` : (inv[d.k] || 0) > 0 ? `📦 ${inv[d.k]}` : formatPrice(d.price)}</i>
                </button>
              ))}
              {!list.length && <span className="hm-dim">Bu kategoride eşya yok.</span>}
            </div>
          </>
        )}
        {panel === 'surf' && (
          <div className="hm-surf">
            {[['floor', 'Zemin', SURF_OPTS.floor], ['wall', 'Duvar', SURF_OPTS.wall]].map(([type, label, opts]) => (
              <div key={type} className="hm-surf-row">
                <b>{FLOOR_NAMES[f]} · {label}</b>
                <div className="hm-surf-list">
                  <button type="button" className={!surf[f]?.[type] ? 'on' : ''} onClick={() => pickSurf(type, null)}>
                    <span className="hm-sw" style={{ background: (type === 'floor' ? FLOORS : WALLS).find((d) => d.key === (type === 'floor' ? HOME_FLOOR_DEFAULT : HOME_WALL_DEFAULT))?.swatch }} />
                    <b>Varsayılan</b>
                    <i>Ücretsiz</i>
                  </button>
                  {opts.map((d) => (
                    <button key={d.key} type="button" className={surf[f]?.[type] === d.key ? 'on' : ''} onClick={() => pickSurf(type, d.key)}>
                      <span className="hm-sw" style={{ background: d.swatch }} />
                      <b>{d.name}</b>
                      <i>{ownsSurf(sInv, type, d.key) ? (FREE_SURFACES[type].includes(d.key) ? 'Ücretsiz' : '📦 Sende') : formatPrice(surfacePrice(type, d.key))}</i>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export { HomeDesign }; // test / harness
