import { useEffect, useMemo, useState } from 'react';
import { SharedMaterials } from '../Magaza/Magaza';
import { shopAction } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { usePlayer } from '../../hooks/usePlayer';
import { useShopStock } from '../../hooks/useShopStock';
import PriceField from './PriceField';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { bizRateFrac } from '../../../functions/belediyeRates.js';
import { bizErrText } from '../../lib/bizErrors';
import { WORKSHOP_MATERIALS, workshopBand, gameWorkshopPrice, clampWorkshopPrice } from '../../../functions/itemRules.js';
import { BIZ_MATERIALS } from '../../../functions/businessCatalogData.js';
import { stockUnitCost, stockPriceBand, clampStockPrice, stockUnitPaid, stockQty } from '../../../functions/shopStockRules.js';
import '../../styles/bizui.css';
import './Shop.css';

// =============================================================================
// v77 — Silahçı / Modifiye Garajı / Araba Galerisi: SAHİP ekranları
//   Fiyatlar sekmesi : atölye fiyatları (malzeme + işçilik) · v130 stok satış fiyatları
//   Envanter sekmesi : ortak malzeme envanteri + Mağaza (v124) · v130 vitrine ekle (stok)
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const VITRIN_KIND = { silahci: 'weapon', galeri: 'vehicle' };
const KIND_TXT = { weapon: { one: 'silah', cap: 'Silah', icon: '🔫' }, vehicle: { one: 'araba', cap: 'Araba', icon: '🚗' } };

function Gold({ v }) {
  return (
    <span className="bz-gold">
      <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
      {fmt(v)}
    </span>
  );
}

// ---- Atölye fiyatları -----------------------------------------------------------
function MaterialPrices({ houseId, houseDoc, type }) {
  const bizPct = Math.round(bizRateFrac(useBelediyeRates(), type) * 100); // v127: türüne göre (Ticaret Bakanlığı)
  const mats = WORKSHOP_MATERIALS[type] || [];
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const saved = houseDoc?.bizPrices?.materials || {};
  useEffect(() => {
    setDraft(Object.fromEntries(mats.map((k) => [k, clampWorkshopPrice(k, saved[k])])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs, type]);
  const savedOf = (k) => clampWorkshopPrice(k, saved[k]);
  const dirty = mats.some((k) => draft[k] && (draft[k].mat !== savedOf(k).mat || draft[k].labor !== savedOf(k).labor));
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({ op: 'prices', houseId, materials: draft });
      setMsg({ ok: true, text: '✓ Kaydedildi' });
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🛠️ Atölye fiyatları</p>
      {mats.map((k) => {
        const b = workshopBand(k);
        const g = gameWorkshopPrice(k);
        const d = draft[k] || g;
        return (
          <div key={k} className="bz-sec sh-matbox">
            <p className="bz-sec-title">
              {BIZ_MATERIALS[k].icon} {BIZ_MATERIALS[k].name}
            </p>
            <PriceField
              label="Malzeme"
              min={b.matMin}
              max={b.matMax}
              value={d.mat}
              refPrice={g.mat}
              refLabel="Oyunun dükkânı"
              saved={savedOf(k).mat}
              onChange={(v) => setDraft((x) => ({ ...x, [k]: { ...d, mat: v } }))}
            />
            <PriceField
              label="İşçilik"
              min={b.laborMin}
              max={b.laborMax}
              value={d.labor}
              refPrice={g.labor}
              refLabel="Oyunun dükkânı"
              saved={savedOf(k).labor}
              onChange={(v) => setDraft((x) => ({ ...x, [k]: { ...d, labor: v } }))}
            />
            <div className="bz-row total">
              <span>Toplam</span>
              <b>
                <Gold v={d.mat + d.labor} /> <small className="sh-cmp">oyunda {fmt(g.mat + g.labor)}</small>
              </b>
            </div>
            <p className="bz-hint">🏛️ %{bizPct}</p>
          </div>
        );
      })}
      <button className="bz-btn gold wide" disabled={busy || !dirty} onClick={save}>
        {busy ? '…' : dirty ? '💾 Kaydet' : '✓ Kayıtlı'}
      </button>
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// ---- v130 STOK: oyunun mağazasındaki ürünler ---------------------------------------
const catalogOfKind = (kind) => (kind === 'weapon' ? weaponCatalog : vehicleCatalog);

function StockThumb({ c, kind }) {
  return <span className="bz-thumb">{c.image ? <img src={c.image} alt="" /> : KIND_TXT[kind].icon}</span>;
}

// Fiyatlar sekmesi: her ürün (stokta olmasa da) — stok, değer, satış fiyatı
function StockPrices({ houseId, kind }) {
  const stock = useShopStock(houseId);
  const catalog = catalogOfKind(kind);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const savedOf = (c) => clampStockPrice(c.price, stock?.prices?.[String(c.id)]);
  useEffect(() => {
    if (stock) setDraft(Object.fromEntries(catalog.map((c) => [c.id, savedOf(c)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock?.updatedAtMs, Boolean(stock), kind]);
  const dirty = catalog.some((c) => draft[c.id] != null && draft[c.id] !== savedOf(c));
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const prices = Object.fromEntries(catalog.filter((c) => draft[c.id] !== savedOf(c)).map((c) => [c.id, draft[c.id]]));
      await shopAction({ op: 'stockPrices', houseId, prices });
      setMsg({ ok: true, text: '✓ Kaydedildi' });
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(false);
    }
  };
  if (!stock) return null;
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">{KIND_TXT[kind].icon} Fiyatlar</p>
      {catalog.map((c) => {
        const b = stockPriceBand(c.price);
        const step = b.step; // v132: fiyata göre 10 / 100 / 1.000 / 10.000
        const v = draft[c.id] ?? savedOf(c);
        const clamp = (x) => Math.min(b.max, Math.max(b.min, Math.round(x / step) * step));
        const qty = stockQty(stock, String(c.id));
        const profit = v - stockUnitPaid(stock, String(c.id), c.price);
        return (
          <div key={c.id} className={`bz-item sk-row${qty ? '' : ' sk-off'}`}>
            <StockThumb c={c} kind={kind} />
            <div className="bz-item-main">
              <b>{c.name}</b>
              <span className="sk-meta">
                <span className="bz-tag">📦 {qty}</span>
                <span className="bz-tag">
                  Değer <Gold v={c.price} />
                </span>
                <span className={`bz-tag ${profit > 0 ? 'ok' : 'bad'}`}>Kâr +{fmt(profit)}</span>
              </span>
              <div className="sk-step">
                <button type="button" className="pf-step" disabled={v <= b.min} onClick={() => setDraft((x) => ({ ...x, [c.id]: clamp(v - step) }))} aria-label="Azalt">
                  −
                </button>
                <input type="range" min={b.min} max={b.max} step={step} value={v} onChange={(e) => setDraft((x) => ({ ...x, [c.id]: clamp(Number(e.target.value)) }))} aria-label={`${c.name} fiyatı`} />
                <button type="button" className="pf-step" disabled={v >= b.max} onClick={() => setDraft((x) => ({ ...x, [c.id]: clamp(v + step) }))} aria-label="Artır">
                  +
                </button>
                <b className="sk-step-val">
                  <Gold v={v} />
                </b>
              </div>
            </div>
          </div>
        );
      })}
      <button className="bz-btn gold wide" disabled={busy || !dirty} onClick={save}>
        {busy ? '…' : dirty ? '💾 Kaydet' : '✓ Kayıtlı'}
      </button>
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// Envanter sekmesi: "Vitrine ekle" → oyunun mağazasındaki ürünler, + ile 1 adet stok
function StockAdd({ houseId, kind }) {
  const stock = useShopStock(houseId);
  const { player } = usePlayer();
  const catalog = catalogOfKind(kind);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const gold = Number(player?.gold || 0);
  const total = catalog.reduce((a, c) => a + stockQty(stock, String(c.id)), 0);
  // v132: alış fiyatı 2. el / çete deposundaki sıfır ilanlara göre değişebilir (sunucu teklifi)
  const [quote, setQuote] = useState(null);
  const loadQuote = async () => {
    try {
      const r = await shopAction({ op: 'stockQuote', houseId });
      setQuote(r?.prices || null);
    } catch {
      setQuote(null);
    }
  };
  useEffect(() => {
    if (open) loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, houseId]);
  const costOf = (c) => Math.min(stockUnitCost(c.price), Number(quote?.[String(c.id)]) || Infinity);
  const add = async (c) => {
    setBusy(c.id);
    setMsg(null);
    try {
      await shopAction({ op: 'stockAdd', houseId, catalogId: c.id, qty: 1, expect: costOf(c) });
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(null);
      loadQuote();
    }
  };
  return (
    <div className="bz-sec">
      <button className={`bz-btn ${open ? 'ghost' : 'gold'} wide`} onClick={() => setOpen((o) => !o)}>
        ➕ Vitrine ekle <span className="bz-tag">📦 {total}</span>
      </button>
      {open && (
        <div className="bz-list">
          {catalog.map((c) => {
            const cost = costOf(c);
            return (
              <div key={c.id} className="bz-item sk-row">
                <StockThumb c={c} kind={kind} />
                <div className="bz-item-main">
                  <b>{c.name}</b>
                  <span className="sk-meta">
                    <span className="bz-tag">
                      Değer <Gold v={c.price} />
                    </span>
                    <span className="bz-tag warn">
                      Alış <Gold v={cost} />
                    </span>
                  </span>
                </div>
                <span className="sk-qty">📦 {stockQty(stock, String(c.id))}</span>
                <button className="bz-btn gold sk-plus" disabled={busy != null || gold < cost} onClick={() => add(c)} aria-label={`${c.name} stoğa ekle`}>
                  {busy === c.id ? '…' : '+'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// ---- v124: malzemeler fabrika + işletmelerin ORTAK envanterinde (taşıma yok) ----
// Atölye bu envanterden kullanır; eksik malzeme Mağaza'dan alınır.

// BizSettings sekmeleri için
export function ShopPriceSection({ houseId, houseDoc }) {
  const type = houseDoc?.biz?.type;
  return (
    <>
      {WORKSHOP_MATERIALS[type] && <MaterialPrices houseId={houseId} houseDoc={houseDoc} type={type} />}
      {VITRIN_KIND[type] && <StockPrices houseId={houseId} kind={VITRIN_KIND[type]} />}
    </>
  );
}
export function ShopInvSection({ houseId, houseDoc }) {
  const type = houseDoc?.biz?.type;
  const parts = useMemo(() => ({ mats: Boolean(WORKSHOP_MATERIALS[type]), vit: VITRIN_KIND[type] }), [type]);
  return (
    <>
      {parts.vit && <StockAdd houseId={houseId} kind={parts.vit} />}
      {parts.mats && (
        <div className="bz-sec">
          <SharedMaterials holder={type} title="📦 Malzeme envanteri" />
        </div>
      )}
    </>
  );
}
