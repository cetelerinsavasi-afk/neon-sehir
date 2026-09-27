import { useState } from 'react';
import { adminAction } from '../../services/gameActions';
import { errText } from './adminLabels';

// v59 — Mağaza (yalnızca yönetici): eksik yüklenen Altın Mağazası (Shopier)
// siparişini tamamlar. Sipariş numarası = Shopier panelindeki sipariş no =
// Firestore shopierOrders belge adı. Sunucu kuralı: yüklenen paketlerin
// toplamı ödenen tutarı aşamaz, yani aynı eksik paket iki kez yüklenemez.
const PACKAGE_LABELS = { paket1: 'Başlangıç Paketi', paket2: '100.000 Altın + Özel Paket' };

export default function ShopTab({ onOpenUser }) {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [confirmPkg, setConfirmPkg] = useState(null);

  const lookup = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setFlash('');
    setConfirmPkg(null);
    try {
      const r = await adminAction('getShopOrder', { orderId: orderId.trim() });
      setOrder(r.order);
    } catch (err) {
      setOrder(null);
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const credit = async (pkg) => {
    setBusy(true);
    setError('');
    try {
      const r = await adminAction('creditShopOrder', { orderId: order.orderId, packageId: pkg.id });
      setOrder(r.order);
      setFlash(`${pkg.name}, ${r.order.playerName || 'oyuncunun'} hesabına yüklendi.`);
      setConfirmPkg(null);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-stack">
      <form className="adm-search" onSubmit={lookup}>
        <input
          className="adm-input"
          placeholder="Shopier sipariş no"
          inputMode="numeric"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          aria-label="Shopier sipariş numarası"
        />
        <button className="adm-btn primary" disabled={busy || orderId.trim().length < 3}>
          Getir
        </button>
      </form>
      <p className="adm-dim">
        Oyuncuya eksik yüklenen paketi buradan tamamlarsın. Yüklenen paketlerin toplamı ödenen tutarı aşamaz.
      </p>
      {error && <p className="adm-error">{error}</p>}
      {flash && <p className="adm-ok">✓ {flash}</p>}
      {order && (
        <section className="adm-card">
          <div className="adm-card-head">
            <span className="adm-user-big">Sipariş {order.orderId}</span>
          </div>
          <dl className="adm-dl">
            <dt>Oyuncu</dt>
            <dd>
              {order.uid ? (
                <button className="adm-btn ghost small" onClick={() => onOpenUser(order.uid)}>
                  {order.playerName || 'Oyuncu'}
                </button>
              ) : (
                '—'
              )}
            </dd>
            <dt>Ödenen</dt>
            <dd>{order.paidTRY != null ? `${order.paidTRY} TL` : '—'}</dd>
            <dt>Yüklenen</dt>
            <dd>
              {order.creditedPackages.length ? order.creditedPackages.map((id) => PACKAGE_LABELS[id] || id).join(' + ') : '—'} (
              {order.creditedTRY} TL)
            </dd>
            <dt>Kalan</dt>
            <dd>{order.remainingTRY != null ? `${order.remainingTRY} TL` : '—'}</dd>
          </dl>
          {order.creditable.length === 0 ? (
            <p className="adm-dim">Bu siparişte yüklenecek eksik paket yok.</p>
          ) : (
            <div className="adm-actions">
              {order.creditable.map((p) =>
                confirmPkg?.id === p.id ? (
                  <button key={p.id} className="adm-btn warn" disabled={busy} onClick={() => credit(p)}>
                    {busy ? '…' : `Onayla: ${p.name} yükle`}
                  </button>
                ) : (
                  <button key={p.id} className="adm-btn primary" disabled={busy} onClick={() => setConfirmPkg(p)}>
                    {p.name} yükle ({p.priceTRY} TL)
                  </button>
                )
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
