import { useEffect, useState } from 'react';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { WAITER_ORDER_MS, waiterSalary } from '../../../functions/venue.js';
import HeldIcon from '../HouseScreen/HeldIcon';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import '../../styles/bizui.css';
import './Venue.css';

// =============================================================================
// v92 — Garson mesleği (Cafe / Bar)
//   • Sol üstte "🧑‍🍳 Garson ol" → mekânda tek garson. Garson olunca butonda
//     "Garson: isim" yazar. Garson mekândan çıkınca görev düşer.
//   • Garson varken menüden verilen siparişler garsona gider; garsonun "Menü"
//     butonu "📋 Siparişler (n)" olur. Her sipariş için 20 sn sayaç.
//   • "Siparişi ver" → ürün müşterinin eline gelir; garson siparişin %10'unu
//     maaş alır (100 altın: 10 vergi + 10 maaş + 80 sahibe).
//   • 20 sn içinde verilmezse ürün müşteriye otomatik gelir, maaş yok, garson
//     görevden alınır (hemen tekrar başvurabilir).
// =============================================================================

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

function useNow(active, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

// Sol üst buton
export function WaiterButton({ waiter, present, isMe, busy, onJoin, onQuit }) {
  if (!waiter || !present) {
    return (
      <button className="vn-waiter-btn" disabled={busy} onClick={onJoin}>
        🧑‍🍳 {busy ? '…' : 'Garson ol'}
      </button>
    );
  }
  return (
    <button className={`vn-waiter-btn on${isMe ? ' me' : ''}`} onClick={isMe ? onQuit : undefined} title={isMe ? 'Garsonluğu bırak' : undefined}>
      🧑‍🍳 Garson: <b>{isMe ? 'Sen' : waiter.name}</b>
      {isMe && <i className="vn-waiter-x">✕</i>}
    </button>
  );
}

// Sayaç halkası (kalan süre)
function Ring({ leftMs, size = 34 }) {
  const k = Math.max(0, Math.min(1, leftMs / WAITER_ORDER_MS));
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const col = k > 0.5 ? '#39ff88' : k > 0.25 ? '#ffd23f' : '#ff4d5e';
  return (
    <span className="vn-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - k)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <em style={{ color: col }}>{Math.ceil(leftMs / 1000)}</em>
    </span>
  );
}

function OrderRow({ o, now, busy, onDeliver, noSalary }) {
  const p = HOUSE_PRODUCTS[o.product];
  const left = Number(o.deadlineMs || 0) - now;
  return (
    <div className={`vn-order${left < 5000 ? ' hurry' : ''}`}>
      <AvatarSvg avatar={o.customerAvatar} size={34} rounded />
      <div className="vn-order-main">
        <b>{o.customerName}</b>
        <span>
          <HeldIcon product={o.product} size={18} /> {p?.label || o.product} · <span className="gold-coin-icon" style={{ width: 10, height: 10 }} /> {fmt(o.price)}
        </span>
      </div>
      <Ring leftMs={left} />
      <button className="vn-deliver" disabled={busy || left <= -1500} onClick={() => onDeliver(o)}>
        {busy ? '…' : 'Siparişi ver'}
        {!noSalary && <small>+{fmt(waiterSalary(o.price))} maaş</small>}
      </button>
    </div>
  );
}

// Garsonun sipariş paneli (Menü yerine)
export function OrdersPanel({ orders, onClose, onDeliver, busyId, isOwner = false }) {
  const now = useNow(true);
  return (
    <div className="vn-panel bz" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>📋 Siparişler ({orders.length})</h3>
          <p>Her siparişi 20 sn içinde ver. Geç kalırsan ürün müşteriye kendiliğinden gider ve garsonluktan alınırsın.</p>
        </div>
        <button className="bz-x" onClick={onClose}>
          ✕
        </button>
      </div>
      {orders.length === 0 && <p className="bz-note">Şu an bekleyen sipariş yok. Biri menüden bir şey alınca burada görünür.</p>}
      <div className="vn-orders">
        {orders.map((o) => (
          <OrderRow key={o.id} o={o} now={now} busy={busyId === o.id} onDeliver={onDeliver} noSalary={isOwner} />
        ))}
      </div>
      <p className="bz-hint">
        {isOwner
          ? 'Kendi mekânında garsonsun: maaş almazsın, siparişin geliri (vergi düşülerek) zaten sana gelir.'
          : 'Maaş: zamanında verdiğin her siparişin %10’u (100 altınlık içecek → 10 vergi, 10 maaş, 80 mekâna).'}
      </p>
    </div>
  );
}

// Yeni sipariş gelince garsonun ekranında çıkan kart (ısmarlama bildirimi gibi)
export function NewOrderPop({ order, onDeliver, onOpen, busy }) {
  const now = useNow(Boolean(order));
  if (!order) return null;
  const p = HOUSE_PRODUCTS[order.product];
  const left = Number(order.deadlineMs || 0) - now;
  return (
    <div className="vn-orderpop" role="status">
      <Ring leftMs={left} size={30} />
      <div className="vn-orderpop-main" onClick={onOpen}>
        <b>Yeni sipariş</b>
        <span>
          {order.customerName}: <HeldIcon product={order.product} size={16} /> {p?.label || order.product}
        </span>
      </div>
      <button className="vn-deliver sm" disabled={busy || left <= -1500} onClick={() => onDeliver(order)}>
        {busy ? '…' : 'Siparişi ver'}
      </button>
    </div>
  );
}
