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
import { vehicleCatalog } from '../../data/vehicleCatalog.js';

const HOME_DOORS = [
  ['ahsap', '🚪 Ahşap'],
  ['beyaz', '🚪 Beyaz panel'],
  ['cift', '🏨 Çift kanat'],
  ['salon', '🤠 Salon'],
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
const costOf = (items) => {
  let gold = 0;
  let gem = 0;
  for (const it of items) {
    if (it.p === 1) continue;
    const pr = CATALOG_MAP[it.k]?.price;
    if (pr?.t === 'gem') gem += pr.v;
    else if (pr) gold += pr.v;
  }
  return { gold, gem };
};
const tintCount = (def) => (def?.tints && TINTS[def.tints] ? TINTS[def.tints].length : 1);
const SHOP = CATALOG.filter((d) => CATALOG_KEYS.has(d.k) && !d.hidden && !d.venueOnly && !d.door && d.price);
const SHOP_CATS = CATEGORIES.filter((c) => SHOP.some((d) => d.cat === c.key));

export default function HomePanel({ eng, uid, inside, flash, evtRef, Sheet }) {
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
      const h = r.data?.home || null;
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

  const goHome = (id) => {
    setMode(null);
    setVisit(id === own ? null : id);
    if (!inside) eng?.homeSpawn();
  };

  return (
    <>
      {inside && !mode && (
        <div className="hm-bar">
          <span className="hm-floor">{FLOOR_NAMES[lv]}{home && !mine ? ` · ${home.name}` : ''}</span>
          <button onClick={() => setMode('list')}>🏘️ Evler</button>
          {mine ? (
            <>
              <button onClick={() => setMode('design')}>⚙️ Ayarlar</button>
            </>
          ) : (
            <button onClick={() => goHome(own)}>🏠 Evim</button>
          )}
        </div>
      )}
      {mode === 'list' && <HomeList Sheet={Sheet} eng={eng} own={own} onPick={goHome} onClose={() => setMode(null)} flash={flash} />}
      {mode === 'design' && home && mine && <HomeDesign eng={eng} home={home} evtRef={evtRef} flash={flash} settings={(close) => (
        <HomeSettings Sheet={Sheet} home={home} busy={busy} onClose={close} onSave={async (patch) => {
          setBusy(true);
          try {
            await houseAction({ op: 'homeSettings', ...patch });
            flash('✅ Kaydedildi');
            const r = await houseAction({ op: 'homeEnter' });
            const h = r.data?.home || null;
            if (h) {
              setHome((old) => ({ ...h, items: old?.items || h.items }));
              eng?.homeDoor(h.door?.t || 'ahsap');
              eng?.homeGarage(h.garageCar || null);
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
  const cars = vehicles.filter((v) => !v.seizedByBank);
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
      <div className="hm-field">Garajdaki araç
        <div className="hm-chips">
          <button className={car === 0 || (car == null && !home.garageCar) ? 'on' : ''} onClick={() => setCar(0)}>Boş</button>
          {cars.map((v) => <button key={v.id} className={car === v.id || (car == null && home.garageCar === v.catalogId) ? 'on' : ''} onClick={() => setCar(v.id)}>{vehicleCatalog[v.catalogId]?.name || `#${v.catalogId}`}</button>)}
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
  const [adding, setAdding] = useState(null);
  const [cat, setCat] = useState(SHOP_CATS[0]?.key || null);
  const [shelf, setShelf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const st = useRef({});
  st.current = { items, inv, f, sel, adding };
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
  // motor dokunuşu: eşyaya dokunursan seçilir; boş zemine dokunursan eklenen / seçili eşya oraya gider
  useEffect(() => {
    evtRef.current = (e) => {
      if (e.type !== 'homeTap') return;
      const { items: cur, inv: iv, f: fl, sel: s, adding: ad } = st.current;
      if (e.idx != null && !ad) {
        setSel(e.idx);
        return;
      }
      if (e.x == null || e.f !== fl) return;
      if (ad) {
        if (cur.length >= MAX_HOME_ITEMS) return flash(`En fazla ${MAX_HOME_ITEMS} eşya.`);
        const it = { i: newId(), k: ad, x: e.x, z: e.z, r: 0, c: 0, f: fl };
        if ((iv[ad] || 0) > 0) {
          it.p = 1;
          setInv({ ...iv, [ad]: iv[ad] - 1 });
        }
        if (!eng.homePlace(it, e.x, e.z)) return flash('Buraya konmaz.');
        const bad = checkPlacement(it, { wall: Boolean(CATALOG_MAP[ad]?.wall), ceil: Boolean(CATALOG_MAP[ad]?.ceil) });
        if (bad) return flash(PLACE_ERR[bad] || 'Buraya konmaz.');
        const next = [...cur, it];
        apply(next);
        setSel(next.length - 1);
        setAdding(null);
        return;
      }
      if (s != null && cur[s]) {
        const it = { ...cur[s] };
        if (!eng.homePlace(it, e.x, e.z) || checkPlacement(it, { wall: Boolean(CATALOG_MAP[it.k]?.wall), ceil: Boolean(CATALOG_MAP[it.k]?.ceil) })) return flash('Buraya konmaz.');
        apply(cur.map((x, i) => (i === s ? it : x)));
      }
    };
    return () => {
      evtRef.current = null;
    };
  }, [evtRef, eng, apply, flash]);
  const cur = sel != null ? items[sel] : null;
  const cost = useMemo(() => costOf(items), [items]);
  const edit = (fn) => cur && apply(items.map((x, i) => (i === sel ? fn({ ...x }) : x)));
  const remove = () => {
    if (!cur) return;
    if (cur.p === 1) setInv({ ...inv, [cur.k]: (inv[cur.k] || 0) + 1 });
    apply(items.filter((_, i) => i !== sel), false);
  };
  const save = async () => {
    setBusy(true);
    try {
      await houseAction({ op: 'homeSave', items: items.map(({ i, k, x, z, r, c, f: fl, p }) => ({ i, k, x, z, r, c, f: fl, ...(p ? { p } : {}) })) });
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
  return (
    <div className="hm-design">
      <div className="hm-top">
        {FLOOR_NAMES.map((n, i) => <button key={n} className={f === i ? 'on' : ''} onClick={() => { setF(i); setSel(null); setAdding(null); }}>{n}</button>)}
        <button onClick={() => setSetOpen(true)}>🔒 Ad · Kilit · Kapı</button>
        <button className="hm-done" disabled={busy} onClick={close}>✓ Bitti</button>
      </div>
      {setOpen && settings(() => setSetOpen(false))}
      {adding && <div className="hm-hint">📍 {CATALOG_MAP[adding]?.name}: zemine dokun · <button onClick={() => setAdding(null)}>Vazgeç</button></div>}
      {cur && !adding && (
        <div className="hm-sel">
          <b>{CATALOG_MAP[cur.k]?.icon} {CATALOG_MAP[cur.k]?.name}{cur.p === 1 ? '' : ' · deneme'}</b>
          <span>Taşımak için zemine dokun</span>
          <div>
            <button onClick={() => edit((x) => ({ ...x, r: (x.r + 1) % 8 }))}>↻ Döndür</button>
            {tintCount(CATALOG_MAP[cur.k]) > 1 && <button onClick={() => edit((x) => ({ ...x, c: (x.c + 1) % tintCount(CATALOG_MAP[cur.k]) }))}>🎨 Renk</button>}
            <button onClick={remove}>🗑️ Kaldır</button>
            <button onClick={() => setSel(null)}>✕</button>
          </div>
        </div>
      )}
      <div className="hm-foot">
        <button onClick={() => setShelf((v) => !v)}>➕ Eşya</button>
        <button disabled={busy || !dirty} onClick={save}>💾 Kaydet</button>
        {(cost.gold > 0 || cost.gem > 0) && <button className="hm-buy" disabled={busy} onClick={buy}>🛒 Satın al · {cost.gold ? formatPrice({ t: 'gold', v: cost.gold }) : ''}{cost.gold && cost.gem ? ' + ' : ''}{cost.gem ? formatPrice({ t: 'gem', v: cost.gem }) : ''}</button>}
      </div>
      {shelf && (
        <div className="hm-shelf">
          <div className="hm-cats">
            {owned.length > 0 && <button className={cat === '__inv' ? 'on' : ''} onClick={() => setCat('__inv')}>📦 Envanter</button>}
            {SHOP_CATS.map((c) => <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>{c.icon} {c.name}</button>)}
          </div>
          <div className="hm-items">
            {(cat === '__inv' ? owned.map(([k, n]) => ({ ...CATALOG_MAP[k], n })) : SHOP.filter((d) => d.cat === cat)).filter((d) => d?.k).map((d) => (
              <button key={d.k} onClick={() => { setAdding(d.k); setSel(null); setShelf(false); }}>
                <span>{d.icon}</span>
                <b>{d.name}</b>
                <i>{d.n ? `× ${d.n}` : (inv[d.k] || 0) > 0 ? `📦 ${inv[d.k]}` : formatPrice(d.price)}</i>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
