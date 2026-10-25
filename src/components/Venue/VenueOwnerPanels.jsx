import { useEffect, useState } from 'react';
import { shopAction, streamAction } from '../../services/gameActions';
import { STREAM_PRICE, streamPriceOf, streamSetOf } from '../../../functions/stream.js';
import PriceField from '../Shop/PriceField';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { bizRateFrac } from '../../../functions/belediyeRates.js';
import HeldIcon from '../HouseScreen/HeldIcon';
import ItemThumb from '../HouseScreen/ItemThumb';
import { CATALOG_MAP } from '../HouseScreen/houseCatalog';
import { bizErrText } from '../../lib/bizErrors';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { menuOf, menuPriceOf, menuBand, minuteBand, NET_DEVICE_CAP, netPriceOf } from '../../../functions/venue.js';
import { BIZ_ITEM_LABELS } from '../../../functions/businessCatalogData.js';
import '../../styles/bizui.css';
import '../Shop/Shop.css';


function SaveBtn({ busy, dirty, onClick, label = 'Kaydet' }) {
  return (
    <button className="bz-btn gold wide" disabled={busy || !dirty} onClick={onClick}>
      {busy ? '…' : dirty ? `💾 ${label}` : '✓ Kayıtlı'}
    </button>
  );
}

// ---- Cafe / Bar: menü fiyatları ---------------------------------------------------
export function MenuPriceSection({ houseId, houseDoc }) {
  const taxRate = bizRateFrac(useBelediyeRates(), houseDoc?.biz?.type); // v127: türüne göre (Ticaret Bakanlığı)
  const products = Object.keys(menuOf(houseDoc?.items));
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    setDraft(Object.fromEntries(products.map((k) => [k, menuPriceOf(houseDoc, k)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs, products.join(',')]);
  const dirty = products.some((k) => draft[k] !== undefined && draft[k] !== menuPriceOf(houseDoc, k));
  const MENU_PRICE = menuBand(houseDoc?.biz?.type); // v93: sinema 100–1.000
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">{houseDoc?.biz?.type === 'sinema' ? '🍿 Büfe fiyatları' : '🍽️ Menü fiyatları'}</p>
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
          taxRate={taxRate}
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
              setMsg({ ok: true, text: '✓ Kaydedildi' });
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
  const taxRate = bizRateFrac(useBelediyeRates(), houseDoc?.biz?.type);
  const cur = netPriceOf(houseDoc);
  const studio = houseDoc?.biz?.type === 'studyo'; // v93: müzik stüdyosu (mikser konsolu) 100–400
  const NET_MINUTE = minuteBand(houseDoc?.biz?.type);
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => setV(cur), [cur]);
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">{studio ? '🎛️ Mikser konsolu dakika ücreti' : '🖥️ Dakika ücreti'}</p>
      <PriceField
        label="Dakika ücreti"
        min={NET_MINUTE.min}
        max={NET_MINUTE.max}
        step={10}
        value={v}
        refPrice={NET_MINUTE.def}
        refLabel="Varsayılan"
        taxRate={taxRate}
        saved={cur}
        onChange={setV}
      />
      <SaveBtn
        busy={busy}
        dirty={v !== cur}
        label="Kaydet"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await shopAction({ op: 'netPrice', houseId, price: v });
            setMsg({ ok: true, text: '✓ Kaydedildi' });
          } catch (e) {
            setMsg({ ok: false, text: bizErrText(e) });
          } finally {
            setBusy(false);
          }
        }}
      />
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      {!studio && <StreamSetPriceSection houseId={houseId} houseDoc={houseDoc} />}
    </div>
  );
}

// v80 Yayıncılık — internet kafe "yayın seti" (oyuncu koltuğu + oyuncu bilgisayarı)
// dakika ücreti. Ücret yayın süresince dakika başı çekilir. (v130: oda adı ayarı kaldırıldı)
function StreamSetPriceSection({ houseId, houseDoc }) {
  const taxRate = bizRateFrac(useBelediyeRates(), houseDoc?.biz?.type || 'studyo');
  const cur = streamPriceOf(houseDoc);
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => setV(cur), [cur]);
  const items = houseDoc?.items || [];
  const sets = items.filter((it) => it.p === 1 && streamSetOf(items, it.i)).length;
  return (
    <div style={{ marginTop: 14 }}>
      <p className="bz-sec-title">🔴 Yayın seti</p>
      {/* v130: yazı yerine görsel — oyuncu koltuğu + oyuncu bilgisayarı = yayın seti */}
      <div className="vo-set">
        <span className="vo-set-item">
          <span className="bz-thumb">
            <ItemThumb k="gamer" icon={CATALOG_MAP.gamer?.icon || '🪑'} />
          </span>
          <small>{CATALOG_MAP.gamer?.name || 'Oyuncu Koltuğu'}</small>
        </span>
        <b className="vo-set-op">+</b>
        <span className="vo-set-item">
          <span className="bz-thumb">
            <ItemThumb k="pc" icon={CATALOG_MAP.pc?.icon || '🖥️'} />
          </span>
          <small>{CATALOG_MAP.pc?.name || 'Oyuncu Bilgisayarı'}</small>
        </span>
        <span className={`bz-tag ${sets > 0 ? 'ok' : 'warn'} vo-set-n`}>🔴 {sets}</span>
      </div>
      <PriceField
        label="Yayın seti dakikası"
        min={STREAM_PRICE.min}
        max={STREAM_PRICE.max}
        step={10}
        value={v}
        refPrice={STREAM_PRICE.def}
        refLabel="Varsayılan"
        taxRate={taxRate}
        saved={cur}
        onChange={setV}
      />
      <SaveBtn
        busy={busy}
        dirty={v !== cur}
        label="Kaydet"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            // v130: yayın odası adı ayarı kaldırıldı — kayıtlı ad olduğu gibi kalır
            await streamAction({ op: 'price', houseId, price: v });
            setMsg({ ok: true, text: '✓ Kaydedildi' });
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
          <b>👤 {NET_DEVICE_CAP[it.k]}</b>
        </div>
      ))}
    </div>
  );
}
