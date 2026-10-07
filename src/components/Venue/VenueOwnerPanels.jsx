import { useEffect, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import { PriceSlider } from '../Shop/ShopOwnerPanels';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { menuOf, menuPriceOf, MENU_PRICE, NET_MINUTE, NET_DEVICE_CAP, netPriceOf } from '../../../functions/venue.js';
import { BIZ_ITEM_LABELS } from '../../../functions/businessCatalogData.js';
import '../Shop/Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// Cafe / Bar fiyat listesi: mekândaki dolapların verdiği her ürün
export function MenuPriceSection({ houseId, houseDoc }) {
  const products = Object.keys(menuOf(houseDoc?.items));
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(Object.fromEntries(products.map((k) => [k, menuPriceOf(houseDoc, k)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs, products.join(',')]);
  const dirty = products.some((k) => draft[k] !== undefined && draft[k] !== menuPriceOf(houseDoc, k));
  if (!products.length) {
    return (
      <div className="hb-empty">
        <span>🍽️</span>
        <b>0</b>
      </div>
    );
  }
  return (
    <div className="sh-section">
      {products.map((k) => (
        <div key={k} className="sh-mat-price">
          <div className="sh-mat-title">
            {HOUSE_PRODUCTS[k].emoji} <b>{HOUSE_PRODUCTS[k].label}</b>
          </div>
          <PriceSlider icon="🏷️" min={MENU_PRICE.min} max={MENU_PRICE.max} npc={MENU_PRICE.def} value={draft[k] ?? MENU_PRICE.def} onChange={(v) => setDraft((d) => ({ ...d, [k]: Math.round(v / 10) * 10 || MENU_PRICE.min }))} />
        </div>
      ))}
      <button
        className={`hs-btn gold wide${dirty ? ' cue-pulse' : ''}`}
        disabled={busy || !dirty}
        onClick={async () => {
          setBusy(true);
          try {
            await shopAction({ op: 'menuPrices', houseId, prices: draft });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '…' : '💾'}
      </button>
    </div>
  );
}

// Menüyü oluşturan dolaplar (envanter sekmesi)
export function MenuInvSection({ houseDoc }) {
  const byFurniture = {};
  Object.entries(menuOf(houseDoc?.items)).forEach(([prod, keys]) => keys.forEach((k) => ((byFurniture[k] = byFurniture[k] || new Set()).add(prod))));
  const rows = Object.entries(byFurniture);
  if (!rows.length) {
    return (
      <div className="hb-empty">
        <span>🧊</span>
        <b>0</b>
      </div>
    );
  }
  return (
    <div className="sh-section">
      {rows.map(([k, prods]) => (
        <div key={k} className="hb-inv-row">
          <span>{BIZ_ITEM_LABELS[k]?.icon || '🧊'}</span>
          <span>{BIZ_ITEM_LABELS[k]?.name || k}</span>
          <b>{[...prods].map((p) => HOUSE_PRODUCTS[p].emoji).join(' ')}</b>
        </div>
      ))}
    </div>
  );
}

// İnternet kafe: tüm cihazlar için tek dakika ücreti
export function NetPriceSection({ houseId, houseDoc }) {
  const cur = netPriceOf(houseDoc);
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(cur), [cur]);
  return (
    <div className="sh-section">
      <div className="sh-mat-price">
        <div className="sh-mat-title">
          🖥️ <b>1 dk</b>
          <span className="sh-unit">1 sa = {fmt(v * 60)}</span>
        </div>
        <PriceSlider icon="⏱️" min={NET_MINUTE.min} max={NET_MINUTE.max} npc={NET_MINUTE.def} value={v} onChange={(x) => setV(Math.round(x / 10) * 10 || NET_MINUTE.min)} />
      </div>
      <button
        className={`hs-btn gold wide${v !== cur ? ' cue-pulse' : ''}`}
        disabled={busy || v === cur}
        onClick={async () => {
          setBusy(true);
          try {
            await shopAction({ op: 'netPrice', houseId, price: v });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '…' : '💾'}
      </button>
    </div>
  );
}

// Cihazlar ve kapasiteleri
export function NetInvSection({ houseDoc }) {
  const devices = (houseDoc?.items || []).filter((it) => it.p === 1 && NET_DEVICE_CAP[it.k]);
  return (
    <div className="sh-section">
      {devices.map((it) => (
        <div key={it.i} className="hb-inv-row">
          <span>{BIZ_ITEM_LABELS[it.k]?.icon || '🖥️'}</span>
          <span>{BIZ_ITEM_LABELS[it.k]?.name || it.k}</span>
          <b>{'👤'.repeat(NET_DEVICE_CAP[it.k])}</b>
        </div>
      ))}
    </div>
  );
}
