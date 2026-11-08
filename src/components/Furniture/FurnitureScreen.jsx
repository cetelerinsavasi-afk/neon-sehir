import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { houseAction } from '../../services/gameActions';
import { CATALOG, CATALOG_MAP, CATEGORIES } from '../HouseScreen/houseCatalog';
import { useFurnBest, SellSheet } from '../HouseScreen/FurnMarket';
import ItemThumb from '../HouseScreen/ItemThumb';
import { furnPriceBand } from '../../../functions/furnMarket.js';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import '../../styles/bizui.css';
import '../HouseScreen/HouseScreen.css';
import './FurnitureScreen.css';

// =============================================================================
// v146 — Profil › Mobilyalar: ev almadan / eve girmeden
//   • Envanterim: elindeki mobilyalar (adet + mağaza fiyatı) · "Pazara koy"
//   • Mağaza: tüm mobilyaların mağaza fiyatları (satın alma evin içinde)
//   • Pazar: oyuncuların ilanları (her eşyanın en ucuzu) → satın al → envantere
//   • İlanlarım: açık ilanlar · iptal (eşya envantere döner)
// Sunucu: houseAction furnList / furnCancel / furnBuy (functions/furnMarket.js)
// =============================================================================

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

function Price({ price, small }) {
  if (!price) return <span className={`fu-price free${small ? ' sm' : ''}`}>—</span>;
  const gem = price.t === 'gem';
  const sz = small ? 11 : 13;
  return (
    <span className={`fu-price ${gem ? 'gem' : 'gold'}${small ? ' sm' : ''}`}>
      <span className={gem ? 'emerald-icon' : 'gold-coin-icon'} style={{ width: sz, height: sz }} />
      {fmt(price.v)}
    </span>
  );
}

function useHouseInventory(uid) {
  const [inv, setInv] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      doc(db, 'houseInventories', uid),
      (s) => setInv(s.exists() ? s.data() : { items: {} }),
      () => setInv({ items: {} })
    );
  }, [uid]);
  return inv;
}

function useMyOpenListings(uid, enabled) {
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

const TABS = [
  { id: 'inv', label: '📦 Envanterim' },
  { id: 'store', label: '🏬 Mağaza' },
  { id: 'market', label: '🛒 Pazar' },
  { id: 'mine', label: '🏷️ İlanlarım' },
];

function CatChips({ cats, cat, setCat }) {
  return (
    <div className="fu-cats">
      {cats.map((c) => (
        <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
          {c.icon} {c.name}
        </button>
      ))}
    </div>
  );
}

export default function FurnitureScreen({ onBack }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const uid = user?.uid || null;
  const inv = useHouseInventory(uid);
  const [tab, setTab] = useState('inv');
  const best = useFurnBest(tab === 'market' || tab === 'store');
  const mine = useMyOpenListings(uid, true);
  const [storeCat, setStoreCat] = useState(CATEGORIES[0]?.key || null);
  const [marketCat, setMarketCat] = useState(null);
  const [sellK, setSellK] = useState(null);
  const [buyAsk, setBuyAsk] = useState(null); // { k, b }
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const invRows = useMemo(
    () =>
      Object.entries(inv?.items || {})
        .filter(([k, n]) => Number(n) > 0 && CATALOG_MAP[k])
        .map(([k, n]) => ({ k, n: Number(n), def: CATALOG_MAP[k] }))
        .sort((a, b) => a.def.name.localeCompare(b.def.name, 'tr')),
    [inv]
  );
  const invCount = invRows.reduce((a, r) => a + r.n, 0);
  const storeItems = useMemo(() => CATALOG.filter((d) => d.cat === storeCat && !d.venueOnly && d.price), [storeCat]);
  const marketCats = useMemo(() => {
    const has = new Set(
      Object.keys(best)
        .map((k) => CATALOG_MAP[k])
        .filter((d) => d && !d.venueOnly)
        .map((d) => d.cat)
    );
    return CATEGORIES.filter((c) => has.has(c.key));
  }, [best]);
  useEffect(() => {
    if (marketCats.length && !marketCats.some((c) => c.key === marketCat)) setMarketCat(marketCats[0].key);
  }, [marketCats, marketCat]);
  const marketItems = useMemo(
    () =>
      Object.entries(best)
        .map(([k, b]) => ({ k, b, def: CATALOG_MAP[k] }))
        .filter((x) => x.def && !x.def.venueOnly && x.def.cat === marketCat)
        .sort((a, b) => a.def.name.localeCompare(b.def.name, 'tr')),
    [best, marketCat]
  );

  const list = async (k, v) => {
    setBusy('sell');
    try {
      await houseAction({ op: 'furnList', k, v });
      setToast(`🏷️ ${CATALOG_MAP[k]?.name || 'Mobilya'} pazara kondu.`);
      setSellK(null);
    } catch (err) {
      setToast(err?.message || 'Pazara konamadı.');
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (l) => {
    setBusy(l.id);
    try {
      await houseAction({ op: 'furnCancel', id: l.id });
      setToast(`📦 ${CATALOG_MAP[l.k]?.name || 'Mobilya'} envanterine döndü.`);
    } catch (err) {
      setToast(err?.message || 'İptal edilemedi.');
    } finally {
      setBusy(null);
    }
  };
  const buy = async ({ k, b }) => {
    setBuyAsk(null);
    setBusy(`b_${k}`);
    try {
      await houseAction({ op: 'furnBuy', id: b.id, expect: { t: b.t, v: b.v } });
      setToast(`📦 ${CATALOG_MAP[k]?.name || 'Mobilya'} envanterine eklendi.`);
    } catch (err) {
      const m = String(err?.message || '');
      setToast(m.includes('price-changed') ? 'Fiyat değişti, tekrar bak.' : m || 'Satın alınamadı.');
    } finally {
      setBusy(null);
    }
  };

  if (!uid) return null;
  return (
    <div className="fu-root">
      <div className="fu-head">
        <button className="fu-back" onClick={onBack} aria-label="Geri">
          ←
        </button>
        <div className="fu-title">
          <b>🛋️ Mobilyalar</b>
          <small>{invCount > 0 ? `Envanterinde ${fmt(invCount)} mobilya` : 'Envanterin boş'}</small>
        </div>
        <div className="fu-wallet">
          <Price price={{ t: 'gold', v: Number(player?.gold || 0) }} small />
          <Price price={{ t: 'gem', v: Number(player?.emerald || 0) }} small />
        </div>
      </div>

      <div className="fu-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'mine' && mine.length > 0 ? ` (${mine.length})` : ''}
          </button>
        ))}
      </div>

      <div className="fu-body">
        {tab === 'inv' && (
          <>
            {inv && invRows.length === 0 && <p className="fu-empty">📦 Envanterinde mobilya yok. Pazardan alabilirsin.</p>}
            <div className="fu-grid">
              {invRows.map(({ k, n, def }) => {
                const band = furnPriceBand(k);
                return (
                  <div key={k} className="fu-card">
                    <ItemThumb k={k} icon={def.icon} />
                    <span className="fu-name">{def.name}</span>
                    <span className="fu-meta">
                      ×{n} · <Price price={def.price} small />
                    </span>
                    {band && (
                      <button className="fu-act" disabled={Boolean(busy)} onClick={() => setSellK(k)}>
                        🏷️ Pazara koy
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'store' && (
          <>
            <CatChips cats={CATEGORIES} cat={storeCat} setCat={setStoreCat} />
            <div className="fu-grid">
              {storeItems.map((def) => {
                const b = best[def.k];
                const have = Number(inv?.items?.[def.k] || 0);
                return (
                  <div key={def.k} className="fu-card">
                    <ItemThumb k={def.k} icon={def.icon} />
                    <span className="fu-name">{def.name}</span>
                    <span className="fu-meta">
                      <Price price={def.price} small />
                      {have > 0 && <em> · sende ×{have}</em>}
                    </span>
                    {b && b.v < def.price.v && (
                      <button className="fu-act ghost" onClick={() => { setMarketCat(def.cat); setTab('market'); }}>
                        🛒 Pazarda <Price price={{ t: b.t, v: b.v }} small />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="fu-note">Mağazadan satın alma evinin içinde (Tasarla) yapılır.</p>
          </>
        )}

        {tab === 'market' && (
          <>
            {marketCats.length === 0 && <p className="fu-empty">🛒 Pazarda şu an mobilya yok.</p>}
            {marketCats.length > 0 && <CatChips cats={marketCats} cat={marketCat} setCat={setMarketCat} />}
            <div className="fu-grid">
              {marketItems.map(({ k, b, def }) => {
                const own = b.uid === uid;
                return (
                  <div key={k} className="fu-card">
                    <ItemThumb k={k} icon={def.icon} />
                    <span className="fu-name">{def.name}</span>
                    <span className="fu-meta">
                      <Price price={{ t: b.t, v: b.v }} small />
                      {def.price?.v > b.v && <s className="fu-store">{fmt(def.price.v)}</s>}
                    </span>
                    <button className="fu-act buy" disabled={own || Boolean(busy)} onClick={() => setBuyAsk({ k, b })}>
                      {own ? '🏷️ Senin ilanın' : busy === `b_${k}` ? '…' : '🛒 Satın al'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'mine' && (
          <>
            {mine.length === 0 && <p className="fu-empty">🏷️ Açık ilanın yok.</p>}
            <div className="fu-grid">
              {mine.map((l) => {
                const def = CATALOG_MAP[l.k];
                return (
                  <div key={l.id} className="fu-card">
                    <ItemThumb k={l.k} icon={def?.icon} />
                    <span className="fu-name">{def?.name || l.k}</span>
                    <span className="fu-meta">
                      <Price price={{ t: l.t, v: l.v }} small />
                    </span>
                    <button className="fu-act ghost" disabled={busy === l.id} onClick={() => cancel(l)}>
                      {busy === l.id ? '…' : '↩ İptal'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {sellK && <SellSheet k={sellK} Price={Price} busy={busy === 'sell'} onConfirm={(v) => list(sellK, v)} onClose={() => setSellK(null)} />}
      {buyAsk && (
        <ConfirmModal
          title={`🛒 ${buyAsk.def?.name || CATALOG_MAP[buyAsk.k]?.name || 'Mobilya'}`}
          message={`${fmt(buyAsk.b.v)} ${buyAsk.b.t === 'gem' ? 'zümrüt' : 'altın'} karşılığında satın alınıp envanterine eklenecek.`}
          confirmLabel="Satın al"
          onConfirm={() => buy(buyAsk)}
          onCancel={() => setBuyAsk(null)}
        />
      )}
      {toast && <div className="fu-toast">{toast}</div>}
    </div>
  );
}
