import { useEffect, useMemo, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { useOfficeDaily } from '../../hooks/useVenueData';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import {
  OFFICE_FURN,
  OFFICE_BANDS,
  OFFICE_EMOJIS,
  ownedOfficeKeys,
  activeOfficeKeys,
  officeProductsOf,
  productBand,
  officeMinuteOf,
  minuteBandOf,
  houseKind,
} from '../../../functions/officeData.js';
import './HomeOffice.css';

// =============================================================================
// v100 — Ücretli Ürünler (eski "Home Ofisler"): odadaki para kazandırabilen
// mobilyalar. Hepsi varsayılan ücretsiz; sahip ücretli yapıp fiyat belirler.
// Herhangi biri ücretliyse ev OFİS olur (Evler › Ofisler'de listelenir).
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const KIND_LABEL = { urun: '🛍️ Ürün satışı', bagis: '🤲 Bağış', dakika: '⏱️ Dakika ücreti (mikser · haber · tuval)' };

// v102 — ofiste ⚙️ Ayarlar doğrudan bu paneli açar: ad + simge, fiyatlar, rapor,
// en altta İşletmeler (ofisi işletmeye dönüştürmek için).
export default function OfficePanel({ houseId, houseDoc, onClose, flash, onRename, onOpenBiz }) {
  const [tab, setTab] = useState('items');
  const [open, setOpen] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const owned = ownedOfficeKeys(houseDoc);
  const active = activeOfficeKeys(houseDoc);
  const kind = houseKind(houseDoc);
  const isBiz = Boolean(houseDoc?.biz?.type);
  const keys = Object.keys(OFFICE_FURN).filter((k) => owned.includes(k));
  const emoji = houseDoc?.office?.emoji || '🏢';
  const { today, yesterday } = useOfficeDaily(houseId, tab === 'report');
  const halt = (e) => e.stopPropagation();
  const [name, setName] = useState(houseDoc?.name || '');
  const [nameBusy, setNameBusy] = useState(false);
  const nameDirty = name.trim() && name.trim() !== (houseDoc?.name || '');
  const saveName = async () => {
    if (!onRename || !nameDirty) return;
    setNameBusy(true);
    try {
      await onRename(name.trim());
    } finally {
      setNameBusy(false);
    }
  };

  const setEmoji = async (e) => {
    try {
      await shopAction({ op: 'officeSet', houseId, emoji: e });
      setEmojiOpen(false);
      flash?.(`${e} Ofis simgesi değişti.`);
    } catch (err) {
      flash?.(bizErrText(err));
    }
  };

  return (
    <div className="hs-modal-bg" onClick={onClose} onPointerDown={halt}>
      <div className="hs-modal of-panel" onClick={halt}>
        <div className="hs-modal-head">
          <b>{kind === 'ofis' && !isBiz ? `${emoji} Ofis Ayarları` : '💰 Ücretli Ürünler'}</b>
          <button className="hs-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="of-status">
          {isBiz ? (
            <span>Kazanç işletme kasasından ayrı tutulur.</span>
          ) : kind === 'ofis' ? (
            <>
              <button className="of-emoji-btn" onClick={() => setEmojiOpen(true)} title="Ofis simgesini değiştir">
                {emoji}
              </button>
              <input className="of-name-input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ofisin adı" aria-label="Ofisin adı" />
              {onRename && (
                <button className="of-name-save" disabled={!nameDirty || nameBusy} onClick={saveName}>
                  {nameBusy ? '…' : '💾'}
                </button>
              )}
            </>
          ) : (
            <span>Bir mobilyayı ücretli yapınca burası ofis olur.</span>
          )}
        </div>
        <div className="of-tabs">
          <button className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>
            🏷️ Fiyatlar
          </button>
          <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>
            📊 Rapor
          </button>
        </div>
        {tab === 'items' && (
          <div className="of-list">
            {keys.map((k) => (
              <OfficeRow key={k} k={k} houseId={houseId} houseDoc={houseDoc} on={active.includes(k)} open={open === k} onToggle={() => setOpen((o) => (o === k ? null : k))} flash={flash} />
            ))}
          </div>
        )}
        {tab === 'report' && (
          <div className="of-list">
            <ReportCard label="Bugün" d={today} />
            <ReportCard label="Dün" d={yesterday} />
          </div>
        )}
        {!isBiz && onOpenBiz && (
          <button className="hs-btn ghost wide hb-open-list of-biz-btn" onClick={onOpenBiz}>
            🏪 İşletmeler
          </button>
        )}
        {emojiOpen && (
          <div className="of-emoji-bg" onClick={() => setEmojiOpen(false)}>
            <div className="of-emoji" onClick={halt}>
              <div className="of-emoji-head">
                <b>Ofis simgesi</b>
                <button className="hs-x" onClick={() => setEmojiOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="of-emoji-grid">
                {OFFICE_EMOJIS.map((e) => (
                  <button key={e} className={e === emoji ? 'on' : ''} onClick={() => setEmoji(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusOf(k, on, houseDoc) {
  const f = OFFICE_FURN[k];
  if (f.kind === 'donate') return on ? { t: 'Açık', c: 'paid' } : { t: 'Kapalı', c: 'off' };
  if (f.kind === 'minute') return on ? { t: `${fmt(officeMinuteOf(houseDoc, k))} / dk`, c: 'paid' } : { t: 'Sadece sen', c: 'off' };
  return on ? { t: 'Ücretli', c: 'paid' } : { t: 'Ücretsiz', c: 'free' };
}

function OfficeRow({ k, houseId, houseDoc, on, open, onToggle, flash }) {
  const f = OFFICE_FURN[k];
  const products = officeProductsOf(k);
  const st = statusOf(k, on, houseDoc);
  const savedPrices = houseDoc?.office?.prices || {};
  const [draftOn, setDraftOn] = useState(on);
  const [prices, setPrices] = useState(() => Object.fromEntries(products.map((p) => [p, Number(savedPrices[p]) || productBand(p).def])));
  const mb = minuteBandOf(k);
  const [minute, setMinute] = useState(officeMinuteOf(houseDoc, k));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // satır her açılışta kayıtlı ayardan başlar
  useEffect(() => {
    if (!open) return;
    setDraftOn(on);
    setPrices(Object.fromEntries(products.map((p) => [p, Number(houseDoc?.office?.prices?.[p]) || productBand(p).def])));
    setMinute(officeMinuteOf(houseDoc, k));
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // aynı ürünü odadaki başka hangi ücretli-yapılabilir mobilyalar veriyor (kural 2)
  const shared = useMemo(() => {
    const owned = ownedOfficeKeys(houseDoc).filter((x) => x !== k);
    const out = {};
    products.forEach((p) => {
      const other = owned.filter((x) => officeProductsOf(x).includes(p));
      if (other.length) out[p] = other.map((x) => OFFICE_FURN[x].name).join(', ');
    });
    return out;
  }, [houseDoc, k, products]);

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const payload = { op: 'officeSet', houseId, keys: { [k]: draftOn } };
      if (f.kind === 'product' && draftOn) payload.prices = prices;
      if (f.kind === 'minute' && draftOn) {
        if (k === 'mixer') payload.minute = minute;
        else payload.minutes = { [k]: minute };
      }
      const r = await shopAction(payload);
      flash?.(draftOn ? `${f.icon} ${f.name} ${f.kind === 'donate' ? 'açıldı' : 'ücretli'}${r.kind === 'ofis' ? ' · burası artık ofis' : ''}` : `${f.icon} ${f.name} ${f.kind === 'product' ? 'ücretsiz' : 'kapalı'}`);
      onToggle();
    } catch (e) {
      setErr(bizErrText(e));
    } finally {
      setBusy(false);
    }
  };
  const step = (p, d) => {
    const b = productBand(p);
    setPrices((x) => ({ ...x, [p]: Math.min(b.max, Math.max(b.min, (Number(x[p]) || b.def) + d)) }));
  };

  return (
    <div className={`of-row${open ? ' open' : ''}`}>
      <button className="of-row-head" onClick={onToggle}>
        <span className="of-row-ico">{f.icon}</span>
        <span className="of-row-name">{f.name}</span>
        <span className={`of-chip ${st.c}`}>{st.t}</span>
        <span className="of-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="of-row-body">
          <label className="of-switch">
            <input type="checkbox" checked={draftOn} onChange={(e) => setDraftOn(e.target.checked)} />
            <span>{f.kind === 'donate' ? 'Bağış kutusu açık' : 'Ücretli yap'}</span>
          </label>
          {f.kind === 'product' && draftOn && (
            <div className="of-prices">
              {products.map((p) => {
                const b = productBand(p);
                const st2 = b === OFFICE_BANDS.bar ? 50 : 10;
                return (
                  <div className="of-price" key={p}>
                    <span className="of-price-name">
                      {HOUSE_PRODUCTS[p]?.emoji} {HOUSE_PRODUCTS[p]?.label}
                      {shared[p] && <em>aynı fiyat: {shared[p]}</em>}
                    </span>
                    <span className="of-stepper">
                      <button onClick={() => step(p, -st2)} disabled={prices[p] <= b.min} aria-label="Azalt">
                        −
                      </button>
                      <b>{fmt(prices[p])}</b>
                      <button onClick={() => step(p, st2)} disabled={prices[p] >= b.max} aria-label="Artır">
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {f.kind === 'minute' && draftOn && (
            <div className="of-prices">
              <div className="of-price">
                <span className="of-price-name">{f.icon} Dakika ücreti</span>
                <span className="of-stepper">
                  <button onClick={() => setMinute((m) => Math.max(mb.min, m - 50))} disabled={minute <= mb.min} aria-label="Azalt">
                    −
                  </button>
                  <b>{fmt(minute)}</b>
                  <button onClick={() => setMinute((m) => Math.min(mb.max, m + 50))} disabled={minute >= mb.max} aria-label="Artır">
                    +
                  </button>
                </span>
              </div>
            </div>
          )}
          {err && <p className="ho-err">{err}</p>}
          <button className="ho-btn gold of-save" disabled={busy} onClick={save}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      )}
    </div>
  );
}

function ReportCard({ label, d }) {
  const revenue = Number(d?.revenue || 0);
  const tax = Number(d?.tax || 0);
  const customers = Object.keys(d?.cust || {}).length;
  const products = Object.entries(d?.products || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="of-report">
      <div className="of-report-head">
        <b>{label}</b>
        <span>{customers} müşteri</span>
      </div>
      {!d ? (
        <p className="of-hint">Henüz kazanç yok.</p>
      ) : (
        <>
          <div className="of-line">
            <span>Toplam</span>
            <b>{fmt(revenue)}</b>
          </div>
          <div className="of-line">
            <span>Vergi</span>
            <b>−{fmt(tax)}</b>
          </div>
          <div className="of-line strong">
            <span>Net kazanç</span>
            <b>{fmt(revenue - tax)}</b>
          </div>
          {Object.entries(d.byKind || {}).map(([k, v]) => (
            <div className="of-line dim" key={k}>
              <span>{KIND_LABEL[k] || k}</span>
              <b>{fmt(v)}</b>
            </div>
          ))}
          {products.length > 0 && (
            <div className="of-products">
              {products.slice(0, 8).map(([p, n]) => (
                <span key={p}>
                  {HOUSE_PRODUCTS[p]?.emoji} {HOUSE_PRODUCTS[p]?.label} ×{n}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
