/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { shopAction } from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import PriceField from '../Shop/PriceField';
import ConfirmButton from '../ConfirmButton/ConfirmButton';
import { DEPO_BUY, DEPO_SELL, DEPO_STEP, GAME_DEPO_ID, GAME_DEPO_PRICES, depoPricesOf } from '../../../functions/depo.js';
import '../../styles/bizui.css';
import './Depo.css';

// =============================================================================
// v124 — DEPO ekranları (functions/depo.js)
//   DepoTradeSheet  : müşteri — "Yasaklı madde satın al" → Al / Sat sekmeleri
//   DepoPriceSection: sahip — alış (1.500–1.750) / satış (2.000–2.250), ±50
//   DepoInvSection  : sahip — depodaki altın + yasaklı madde, ekle / çek (vergisiz)
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

function Gold({ v }) {
  return (
    <span className="bz-gold">
      <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
      {fmt(v)}
    </span>
  );
}

export function depoErrText(err) {
  const m = String(err?.message || err || '');
  if (m === 'gold') return 'Altının yetmiyor.';
  if (m === 'own-short') return 'Envanterinde o kadar yasaklı madde yok.';
  if (m === 'depo-short') return 'Depoda o kadar yok.';
  if (m.startsWith('depo-stock:')) return `Depoda yeterli yasaklı madde yok (kalan: ${fmt(m.split(':')[1])}).`;
  if (m.startsWith('depo-gold:')) return `Deponun kasası yetmiyor: en fazla ${fmt(m.split(':')[1])} adet alabilir.`;
  if (m.startsWith('price-changed')) return `Fiyat az önce değişti (yeni adet fiyatı: ${fmt(m.split(':')[1])}). Kontrol edip tekrar dene.`;
  if (m === 'biz-closed') return 'Bu depo kapandı.';
  return m || 'İşlem yapılamadı.';
}

// Herkese açık depo görünümü (fiyat, stok, alabileceği adet). Oyunun deposu sınırsız.
function useDepotView(depotId, isGame) {
  const [view, setView] = useState(null);
  useEffect(() => {
    if (isGame || !depotId) return undefined;
    return onSnapshot(
      doc(db, 'depotView', depotId),
      (s) => setView(s.exists() ? s.data() : { stock: 0, cap: 0 }),
      () => setView({ stock: 0, cap: 0 })
    );
  }, [depotId, isGame]);
  return view;
}

export function DepoTradeSheet({ depotId, houseDoc, onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const isGame = depotId === GAME_DEPO_ID || Boolean(houseDoc?.bizGame);
  const view = useDepotView(depotId, isGame);
  const prices = isGame ? GAME_DEPO_PRICES : { ...depoPricesOf(houseDoc), ...(view?.buy ? { buy: view.buy, sell: view.sell } : {}) };
  const [tab, setTab] = useState('buy');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const isOwner = !isGame && houseDoc?.ownerUid === user?.uid;
  const gold = Math.max(0, Number(player?.gold || 0));
  const mine = Math.max(0, Number(inventory?.yasakliMadde || 0));
  const unit = tab === 'buy' ? prices.sell : prices.buy;
  // en fazla: al → (stok, cebindeki altın) · sat → (envanter, deponun kasası)
  const max =
    tab === 'buy'
      ? Math.min(isGame ? Infinity : Number(view?.stock || 0), Math.floor(gold / unit))
      : Math.min(mine, isGame ? Infinity : Number(view?.cap || 0));
  const safeMax = Number.isFinite(max) ? Math.max(0, max) : 0;
  useEffect(() => {
    setQty((q) => Math.max(safeMax > 0 ? 1 : 0, Math.min(q, safeMax)));
  }, [safeMax, tab]);
  useEffect(() => setMsg(null), [tab]);
  const total = unit * qty;

  let reason = null;
  if (isOwner) reason = 'Kendi deponla ticaret yapamazsın — malı / altını Ayarlar › İşletme › Envanter’den ekle ya da çek.';
  else if (tab === 'buy' && !isGame && Number(view?.stock || 0) <= 0) reason = 'Bu depoda şu an yasaklı madde yok.';
  else if (tab === 'buy' && gold < unit) reason = `Altının yetmiyor: 1 adet ${fmt(unit)} altın.`;
  else if (tab === 'sell' && mine <= 0) reason = 'Envanterinde satacak yasaklı madde yok.';
  else if (tab === 'sell' && !isGame && Number(view?.cap || 0) <= 0) reason = 'Deponun kasasında şu an alım yapacak kadar altın yok.';

  const go = async () => {
    if (!qty || reason || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await shopAction({ op: 'depoTrade', depotId, side: tab, qty, expect: unit });
      setMsg({ ok: true, text: tab === 'buy' ? `✓ ${fmt(r.qty)} yasaklı madde aldın (−${fmt(r.total)} altın).` : `✓ ${fmt(r.qty)} yasaklı madde sattın (+${fmt(r.total)} altın).` });
    } catch (err) {
      setMsg({ ok: false, text: depoErrText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bz dp-root" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>💊 Yasaklı madde</h3>
          <p>{isGame ? 'Neon Liman Deposu · sınırsız stok' : houseDoc?.name || 'Depo'}</p>
        </div>
        {onClose && (
          <button className="bz-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        )}
      </div>
      <div className="bz-tabs">
        <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>
          🛒 Al · {fmt(prices.sell)}
        </button>
        <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>
          💰 Sat · {fmt(prices.buy)}
        </button>
      </div>
      <div className="bz-wallet">
        <span>{tab === 'buy' ? 'Cebindeki altın' : 'Envanterindeki yasaklı madde'}</span>
        <b>{tab === 'buy' ? <Gold v={gold} /> : `${fmt(mine)} adet`}</b>
      </div>
      {!isGame && (
        <div className="bz-row">
          <span>{tab === 'buy' ? 'Depodaki yasaklı madde' : 'Deponun alabileceği'}</span>
          <b>{view ? `${fmt(tab === 'buy' ? view.stock : view.cap)} adet` : '…'}</b>
        </div>
      )}
      <div className="bz-row">
        <span>Adet fiyatı</span>
        <b>
          <Gold v={unit} />
        </b>
      </div>
      {!reason && safeMax > 0 && <QuantityStepper value={qty} onChange={setQty} min={1} max={safeMax} />}
      <div className="bz-row total">
        <span>{tab === 'buy' ? 'Ödeyeceğin' : 'Alacağın'}</span>
        <b>
          <Gold v={total} />
        </b>
      </div>
      {reason && <p className="bz-warn">{reason}</p>}
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      <button className="bz-btn gold wide" disabled={Boolean(reason) || !qty || busy} onClick={go}>
        {busy ? 'İşleniyor…' : tab === 'buy' ? `🛒 ${fmt(qty)} adet al · ${fmt(total)} altın` : `💰 ${fmt(qty)} adet sat · ${fmt(total)} altın`}
      </button>
    </div>
  );
}

// ---- sahip: fiyatlar -----------------------------------------------------------
export function DepoPriceSection({ houseId, houseDoc }) {
  const saved = depoPricesOf(houseDoc);
  const [buy, setBuy] = useState(saved.buy);
  const [sell, setSell] = useState(saved.sell);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    setBuy(saved.buy);
    setSell(saved.sell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs]);
  const dirty = buy !== saved.buy || sell !== saved.sell;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({ op: 'depoPrice', depotId: houseId, buy, sell });
      setMsg({ ok: true, text: '✓ Fiyatlar kaydedildi.' });
    } catch (err) {
      setMsg({ ok: false, text: depoErrText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">💊 Yasaklı madde fiyatları</p>
      <PriceField
        label="Satış fiyatın (oyuncuya satarken)"
        value={sell}
        min={DEPO_SELL.min}
        max={DEPO_SELL.max}
        step={DEPO_STEP}
        onChange={setSell}
        refPrice={GAME_DEPO_PRICES.sell}
        saved={saved.sell}
      />
      <PriceField
        label="Alış fiyatın (oyuncudan alırken)"
        value={buy}
        min={DEPO_BUY.min}
        max={DEPO_BUY.max}
        step={DEPO_STEP}
        onChange={setBuy}
        refPrice={GAME_DEPO_PRICES.buy}
        saved={saved.buy}
      />
      <p className="bz-hint">Oyuncular deponda en fazla stoğundaki kadar alabilir; sana en fazla kasandaki altının yettiği kadar satabilir.</p>
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      <button className="bz-btn gold wide" disabled={!dirty || busy} onClick={save}>
        {busy ? 'Kaydediliyor…' : 'Fiyatları kaydet'}
      </button>
    </div>
  );
}

// ---- sahip: envanter (altın + yasaklı madde) -------------------------------------
export function DepoInvSection({ houseId }) {
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const [inv, setInv] = useState(null);
  const [asset, setAsset] = useState('yasakliMadde');
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!houseId) return undefined;
    return onSnapshot(doc(db, 'depots', houseId), (s) => setInv(s.exists() ? s.data() : { gold: 0, yasakliMadde: 0 }), () => setInv({ gold: 0, yasakliMadde: 0 }));
  }, [houseId]);
  useEffect(() => {
    setQty(0);
    setMsg(null);
  }, [asset]);
  const inDepot = Math.max(0, Number(inv?.[asset] || 0));
  const mine = asset === 'gold' ? Math.max(0, Number(player?.gold || 0)) : Math.max(0, Number(inventory?.yasakliMadde || 0));
  const unitTxt = asset === 'gold' ? 'altın' : 'adet';
  const run = async (sign) => {
    if (!qty) return;
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({ op: 'depoStock', depotId: houseId, asset, qty: sign * qty });
      setMsg({ ok: true, text: sign > 0 ? `✓ Depoya ${fmt(qty)} ${unitTxt} eklendi.` : `✓ Depodan ${fmt(qty)} ${unitTxt} çekildi.` });
      setQty(0);
    } catch (err) {
      setMsg({ ok: false, text: depoErrText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">📦 Depo envanteri</p>
      <div className="bz-row">
        <span>💊 Yasaklı madde</span>
        <b>{inv ? `${fmt(inv.yasakliMadde)} adet` : '…'}</b>
      </div>
      <div className="bz-row">
        <span>🪙 Kasa (altın)</span>
        <b>{inv ? <Gold v={inv.gold} /> : '…'}</b>
      </div>
      <p className="bz-hint">Ekleme ve çekmede vergi yok. Müşteri aldıkça kasa dolar, sattıkça (sen ondan aldıkça) kasa boşalır.</p>
      <div className="bz-tabs">
        <button className={asset === 'yasakliMadde' ? 'on' : ''} onClick={() => setAsset('yasakliMadde')}>
          💊 Yasaklı madde
        </button>
        <button className={asset === 'gold' ? 'on' : ''} onClick={() => setAsset('gold')}>
          🪙 Altın
        </button>
      </div>
      <div className="bz-row">
        <span>{asset === 'gold' ? 'Cebindeki altın' : 'Envanterindeki yasaklı madde'}</span>
        <b>
          {fmt(mine)} {unitTxt}
        </b>
      </div>
      <QuantityStepper value={qty} onChange={setQty} min={0} max={Math.max(mine, inDepot)} step={asset === 'gold' ? 100 : 1} />
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      <div className="bz-btns">
        <button className="bz-btn ghost" disabled={busy || !qty || qty > inDepot} onClick={() => run(-1)}>
          ⬇️ Depodan çek
        </button>
        <ConfirmButton className="bz-btn gold" disabled={busy || !qty || qty > mine} title={`Depoya ${fmt(qty)} ${unitTxt} eklensin mi?`} confirmLabel="Ekle" onConfirm={() => run(1)}>
          ⬆️ Depoya ekle
        </ConfirmButton>
      </div>
    </div>
  );
}
