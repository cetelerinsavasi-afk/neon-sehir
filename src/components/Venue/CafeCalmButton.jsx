// v142 — Kafe & Bar içinde sağ üstte "-10 şüphe" butonu.
// Şüphe › Kafe & Bar kartıyla AYNI hak (shopAction op: 'cafeCalm', günde 1 kez).
// Görünme şartları (hepsi): mekân oyuncu kafesi/barı · 2.000 altınlık çubuk dolu ·
// şüphe en az 10 · bugün hak kullanılmamış. Biri bile tutmazsa buton hiç görünmez.
// Firestore: günlük hak belgesi (dailyActions) SADECE çubuk doluyken ve şüphe ≥ 10
// iken dinlenir (bu bileşen o zaman bağlanır) — diğer durumlarda ek okuma yok.
import { useState } from 'react';
import { useDailyActions } from '../../hooks/useDailyActions';
import { shopAction } from '../../services/gameActions';
import { CAFE_CALM_SUSPICION } from '../../../functions/venue.js';

export default function CafeCalmButton({ flash }) {
  const { actions, loading } = useDailyActions();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (loading || done || actions?.cafeCalm) return null;
  const press = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shopAction({ op: 'cafeCalm' });
      setDone(true);
      flash?.(`☕ Şüphen ${CAFE_CALM_SUSPICION} düştü.`);
    } catch (err) {
      flash?.(`⚠️ ${err?.message || 'İşlem başarısız.'}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hb-topbtns vn-calm-wrap">
      <button className="hb-topbtn vn-calm-btn" onClick={press} disabled={busy} title="Kafe & Bar: günde 1 kez şüpheyi düşür">
        {busy ? '…' : `−${CAFE_CALM_SUSPICION} şüphe`}
      </button>
    </div>
  );
}
