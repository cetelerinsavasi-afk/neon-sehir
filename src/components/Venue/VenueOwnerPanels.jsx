import { useEffect, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import PriceField from '../Shop/PriceField';
import HeldIcon from '../HouseScreen/HeldIcon';
import { bizErrText } from '../../lib/bizErrors';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { menuOf, menuPriceOf, MENU_PRICE, NET_MINUTE, NET_DEVICE_CAP, netPriceOf } from '../../../functions/venue.js';
import { BIZ_ITEM_LABELS } from '../../../functions/businessCatalogData.js';
import '../../styles/bizui.css';
import '../Shop/Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

function SaveBtn({ busy, dirty, onClick, label = 'Fiyatları kaydet' }) {
  return (
    <button className="bz-btn gold wide" disabled={busy || !dirty} onClick={onClick}>
      {busy ? 'Kaydediliyor…' : dirty ? `💾 ${label}` : '✓ Kayıtlı'}
    </button>
  );
}

// ---- Cafe / Bar: menü fiyatları ---------------------------------------------------
export function MenuPriceSection({ houseId, houseDoc }) {
  const products = Object.keys(menuOf(houseDoc?.items));
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    setDraft(Object.fromEntries(products.map((k) => [k, menuPriceOf(houseDoc, k)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs, products.join(',')]);
  const dirty = products.some((k) => draft[k] !== undefined && draft[k] !== menuPriceOf(houseDoc, k));
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🍽️ Menü fiyatları</p>
      {!products.length && <p className="bz-note">Menüde ürün yok.</p>}
      {products.map((k) => (
        <PriceField
          key={k}
          label={
            <>
              <HeldIcon product={k} size={20} /> {HOUSE_PRODUCTS[k].label}
            </>
          }
          min={MENU_PRICE.min}
          max={MENU_PRICE.max}
          step={10}
          value={draft[k] ?? MENU_PRICE.def}
          refPrice={MENU_PRICE.def}
          refLabel="Varsayılan"
          saved={menuPriceOf(houseDoc, k)}
          onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
        />
      ))}
      {products.length > 0 && (
        <SaveBtn
          busy={busy}
          dirty={dirty}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await shopAction({ op: 'menuPrices', houseId, prices: draft });
              setMsg({ ok: true, text: '✓ Menü fiyatların kaydedildi.' });
            } catch (e) {
              setMsg({ ok: false, text: bizErrText(e) });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// Menüyü oluşturan dolaplar (envanter sekmesi)
export function MenuInvSection({ houseDoc }) {
  const byFurniture = {};
  Object.entries(menuOf(houseDoc?.items)).forEach(([prod, keys]) => keys.forEach((k) => ((byFurniture[k] = byFurniture[k] || new Set()).add(prod))));
  const rows = Object.entries(byFurniture);
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🧊 Menü mobilyaları</p>
      {!rows.length && <p className="bz-note">Menü veren mobilya yok.</p>}
      {rows.map(([k, prods]) => (
        <div key={k} className="bz-row">
          <span>
            {BIZ_ITEM_LABELS[k]?.icon || '🧊'} {BIZ_ITEM_LABELS[k]?.name || k}
          </span>
          <b>
            {[...prods].map((p) => (
              <span key={p} style={{ marginLeft: 6, whiteSpace: 'nowrap' }}>
                <HeldIcon product={p} size={16} /> {HOUSE_PRODUCTS[p].label}
              </span>
            ))}
          </b>
        </div>
      ))}
    </div>
  );
}

// ---- İnternet kafe: dakika ücreti ---------------------------------------------------
export function NetPriceSection({ houseId, houseDoc }) {
  const cur = netPriceOf(houseDoc);
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => setV(cur), [cur]);
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🖥️ Dakika ücreti</p>
      <PriceField
        label="Dakika ücreti"
        min={NET_MINUTE.min}
        max={NET_MINUTE.max}
        step={10}
        value={v}
        refPrice={NET_MINUTE.def}
        refLabel="Varsayılan"
        saved={cur}
        onChange={setV}
      />
      <SaveBtn
        busy={busy}
        dirty={v !== cur}
        label="Ücreti kaydet"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await shopAction({ op: 'netPrice', houseId, price: v });
            setMsg({ ok: true, text: `✓ Dakika ücreti ${fmt(v)} altın olarak kaydedildi.` });
          } catch (e) {
            setMsg({ ok: false, text: bizErrText(e) });
          } finally {
            setBusy(false);
          }
        }}
      />
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// Cihazlar ve kapasiteleri
export function NetInvSection({ houseDoc }) {
  const devices = (houseDoc?.items || []).filter((it) => it.p === 1 && NET_DEVICE_CAP[it.k]);
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🎮 Cihazlar</p>
      {!devices.length && <p className="bz-note">Cihaz yok.</p>}
      {devices.map((it) => (
        <div key={it.i} className="bz-row">
          <span>
            {BIZ_ITEM_LABELS[it.k]?.icon || '🖥️'} {BIZ_ITEM_LABELS[it.k]?.name || it.k}
          </span>
          <b>aynı anda {NET_DEVICE_CAP[it.k]} kişi</b>
        </div>
      ))}
    </div>
  );
}
