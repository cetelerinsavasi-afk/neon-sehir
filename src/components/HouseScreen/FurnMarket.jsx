import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { houseAction } from '../../services/gameActions';
import { CATALOG_MAP, CATEGORIES } from './houseCatalog';
import { furnPriceBand } from '../../../functions/furnMarket.js';
import ItemThumb from './ItemThumb';

// =============================================================================
// v132 — MOBİLYA PAZARI (Tasarla › Pazar). Sunucu: functions/furnMarket.js
//   • Mobilyaların: kendi ilanların (fiyat + iptal)
//   • Kategoriler: sadece pazarda eşyası olanlar; her eşyadan EN UCUZ ilan
//   • Eşyaya dokun → odaya "deneme" olarak gelir (ilan fiyatıyla sepete girer)
// =============================================================================

// Pazar vitrini (tek belge): { k: { id, t, v, at, uid } }
export function useFurnBest(enabled) {
  const [best, setBest] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, 'furnMarket', 'main'),
      (s) => setBest(s.data()?.best || {}),
      () => setBest({})
    );
  }, [enabled]);
  return best;
}

// Odadaki pazar eşyalarının ilanları (fiyat + açık mı). ids: ilan kimlikleri
export function useListingWatch(ids) {
  const key = [...new Set(ids)].sort().join(',');
  const [map, setMap] = useState({});
  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) {
      setMap({});
      return undefined;
    }
    const unsubs = list.map((id) =>
      onSnapshot(
        doc(db, 'furnListings', id),
        (s) => setMap((m) => ({ ...m, [id]: s.exists() ? { id, ...s.data() } : { id, status: 'gone' } })),
        () => setMap((m) => ({ ...m, [id]: { id, status: 'gone' } }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return map;
}

function useMyListings(uid, enabled) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled || !uid) return undefined;
    return onSnapshot(
      query(collection(db, 'furnListings'), where('sellerUid', '==', uid), where('status', '==', 'open')),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))),
      () => setRows([])
    );
  }, [uid, enabled]);
  return rows;
}

export function MarketShelf({ uid, best, Price, onPlace, flash }) {
  const mine = useMyListings(uid, true);
  const [cat, setCat] = useState('mine');
  const [busy, setBusy] = useState(null);
  const cats = useMemo(() => {
    const has = new Set(
      Object.keys(best)
        .map((k) => CATALOG_MAP[k])
        .filter((d) => d && !d.venueOnly)
        .map((d) => d.cat)
    );
    return CATEGORIES.filter((c) => has.has(c.key));
  }, [best]);
  const items = useMemo(
    () =>
      Object.entries(best)
        .map(([k, b]) => ({ def: CATALOG_MAP[k], b }))
        .filter((x) => x.def && !x.def.venueOnly && x.def.cat === cat),
    [best, cat]
  );
  useEffect(() => {
    if (cat !== 'mine' && !cats.some((c) => c.key === cat)) setCat('mine');
  }, [cats, cat]);
  const cancel = async (l) => {
    setBusy(l.id);
    try {
      await houseAction({ op: 'furnCancel', id: l.id });
      flash?.(`📦 ${CATALOG_MAP[l.k]?.name || 'Mobilya'} envanterine döndü.`);
    } catch (err) {
      flash?.(err?.message || 'İptal edilemedi.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="hs-shelf-tabs">
        <button className={cat === 'mine' ? 'on' : ''} onClick={() => setCat('mine')}>
          🏷️ Mobilyaların{mine.length > 0 ? ` (${mine.length})` : ''}
        </button>
        {cats.length > 0 && <i className="hs-shelf-sep" aria-hidden="true" />}
        {cats.map((c) => (
          <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
            {c.icon} {c.name}
          </button>
        ))}
      </div>
      <div className="hs-shelf-items">
        {cat === 'mine' && mine.length === 0 && <p className="hs-dim hs-inv-empty">🏷️ —</p>}
        {cat === 'mine' &&
          mine.map((l) => {
            const def = CATALOG_MAP[l.k];
            return (
              <div key={l.id} className="hs-card fm-card">
                <ItemThumb k={l.k} icon={def?.icon} />
                <span className="hs-card-name">{def?.name || l.k}</span>
                <Price price={{ t: l.t, v: l.v }} small />
                <button className="fm-cancel" disabled={busy === l.id} onClick={() => cancel(l)}>
                  {busy === l.id ? '…' : 'İptal'}
                </button>
              </div>
            );
          })}
        {cat !== 'mine' &&
          items.map(({ def, b }) => (
            <button
              key={def.k}
              className="hs-card"
              onClick={() => {
                if (b.uid === uid) {
                  flash?.('🏷️ Bu senin ilanın.');
                  return;
                }
                onPlace(def.k, b);
              }}
            >
              <ItemThumb k={def.k} icon={def.icon} />
              <span className="hs-card-name">{def.name}</span>
              <Price price={{ t: b.t, v: b.v }} small />
              {def.price?.v > b.v && <s className="fm-store">{def.price.v.toLocaleString('tr-TR')}</s>}
            </button>
          ))}
      </div>
    </>
  );
}

// Odadaki satın alınmış eşyayı pazara koy: fiyat (yarısı – 1 birim altı)
export function SellSheet({ k, Price, busy, onConfirm, onClose }) {
  const def = CATALOG_MAP[k];
  const band = furnPriceBand(k);
  const [v, setV] = useState(() => (band ? band.max : 0));
  if (!band) return null;
  const step = band.t === 'gem' ? 1 : band.store >= 100_000 ? 1000 : band.store >= 10_000 ? 100 : 10;
  const clamp = (x) => Math.min(band.max, Math.max(band.min, Math.round(x)));
  const down = () => setV((x) => clamp(x === band.max && step > 1 ? Math.floor(x / step) * step : x - step));
  const up = () => setV((x) => clamp(x + step >= band.max ? band.max : x + step));
  return (
    <div className="bz-modal-bg" onClick={() => !busy && onClose()}>
      <div className="bz-modal bz fm-sell" onClick={(e) => e.stopPropagation()}>
        <div className="bz-head">
          <div className="bz-head-main">
            <h3>🏷️ {def?.name} · Pazara koy</h3>
          </div>
          <button className="bz-x" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="fm-sell-body">
          <ItemThumb k={k} icon={def?.icon} />
          {/* v132: mağaza bedeli (karşılaştırma için) */}
          <span className="fm-store-row">
            🏬 Mağazada <Price price={{ t: band.t, v: band.store }} small />
          </span>
          <div className="fm-sell-price">
            <button type="button" className="pf-step" disabled={busy || v <= band.min} onClick={down} aria-label="Azalt">
              −
            </button>
            <b>
              <Price price={{ t: band.t, v }} />
            </b>
            <button type="button" className="pf-step" disabled={busy || v >= band.max} onClick={up} aria-label="Artır">
              +
            </button>
          </div>
          <input type="range" min={band.min} max={band.max} step={1} value={v} onChange={(e) => setV(clamp(Number(e.target.value)))} aria-label="Fiyat" />
          <span className="hs-dim fm-band">
            <Price price={{ t: band.t, v: band.min }} small /> – <Price price={{ t: band.t, v: band.max }} small />
          </span>
        </div>
        <button className="bz-btn gold wide" disabled={busy} onClick={() => onConfirm(v)}>
          {busy ? '…' : '🏷️ Satışa sun'}
        </button>
      </div>
    </div>
  );
}
