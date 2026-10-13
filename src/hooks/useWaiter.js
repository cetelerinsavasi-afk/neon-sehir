import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { shopAction } from '../services/gameActions';

// v92 — Garson (cafe/bar) verileri ve davranışı. Arayüz: components/Venue/WaiterPanel.jsx
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

export function useVenueWaiter(houseId) {
  const [w, setW] = useState(null);
  useEffect(() => {
    if (!houseId) {
      setW(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'venueWaiters', houseId),
      (s) => setW(s.exists() ? s.data() : null),
      () => setW(null)
    );
  }, [houseId]);
  return w;
}

// Garsona gelen bekleyen siparişler (en eskisi önce)
export function useWaiterOrders(houseId, waiterUid) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!houseId || !waiterUid) {
      setRows([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'venueOrders'), where('houseId', '==', houseId), where('status', '==', 'pending')),
      (s) =>
        setRows(
          s.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((o) => o.waiterUid === waiterUid)
            .sort((a, b) => a.createdAtMs - b.createdAtMs)
        ),
      () => setRows([])
    );
  }, [houseId, waiterUid]);
  return rows;
}

// Garson mantığı: başvur / bırak / teslim / süre dolunca süpür / görevden alınma
export function useWaiterRole({ houseId, enabled, user, online, flash }) {
  const waiter = useVenueWaiter(enabled ? houseId : null);
  const present = Boolean(waiter && (online || []).some((o) => o.uid === waiter.uid));
  const isMe = Boolean(waiter && user && waiter.uid === user.uid);
  const orders = useWaiterOrders(enabled && isMe ? houseId : null, isMe ? user.uid : null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const quittingRef = useRef(false);
  const wasMeRef = useRef(false);

  // görevden alınma bildirimi
  useEffect(() => {
    if (wasMeRef.current && !isMe) {
      if (!quittingRef.current) flash?.('⏱️ Siparişi zamanında veremedin, garsonluktan alındın. İstersen hemen tekrar başvurabilirsin.');
      quittingRef.current = false;
    }
    wasMeRef.current = isMe;
  }, [isMe, flash]);

  // süresi dolan siparişleri süpür (sunucu süreyi kendisi kontrol eder)
  const nextDeadline = orders.reduce((m, o) => Math.min(m, Number(o.deadlineMs || Infinity)), Infinity);
  useEffect(() => {
    if (!enabled || !Number.isFinite(nextDeadline)) return undefined;
    const t = setTimeout(() => shopAction({ op: 'orderSweep', houseId }).catch(() => {}), Math.max(0, nextDeadline - Date.now()) + 1700);
    return () => clearTimeout(t);
  }, [enabled, houseId, nextDeadline]);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shopAction({ op: 'waiterJoin', houseId });
      flash?.('🧑‍🍳 Artık garsonsun! Siparişler sağ üstteki 📋 Siparişler’e gelecek.');
    } catch (err) {
      const m = String(err?.message || '');
      flash?.(m.startsWith('waiter-taken') ? `🧑‍🍳 Bu mekânın zaten bir garsonu var: ${m.split(':')[1] || ''}` : m === 'not-present' ? 'Garson olmak için mekânda olmalısın.' : 'Garson olunamadı.');
    } finally {
      setBusy(false);
    }
  };
  const quit = async () => {
    quittingRef.current = true;
    try {
      await shopAction({ op: 'waiterQuit', houseId });
      flash?.('🧑‍🍳 Garsonluğu bıraktın.');
    } catch {
      quittingRef.current = false;
    }
  };
  const deliver = async (o) => {
    if (busyId) return;
    setBusyId(o.id);
    try {
      const r = await shopAction({ op: 'orderDeliver', orderId: o.id });
      const d = r?.data || r;
      if (d?.served) flash?.(`✅ ${o.customerName} siparişini aldı${d.salary ? ` · +${fmt(d.salary)} maaş` : ''}`);
      else flash?.('⏱️ Geç kaldın — sipariş müşteriye kendiliğinden gitti.');
    } catch (err) {
      flash?.(String(err?.message || '') === 'order-done' ? 'Bu sipariş zaten teslim edildi.' : 'Sipariş verilemedi.');
    } finally {
      setBusyId(null);
    }
  };
  // mekândan çıkarken garsonluğu bırak (sunucu da kontrol eder)
  const leave = () => {
    if (!isMe) return;
    quittingRef.current = true;
    shopAction({ op: 'waiterQuit', houseId }).catch(() => {});
  };
  return { waiter, present, isMe, orders, busy, busyId, join, quit, deliver, leave };
}
