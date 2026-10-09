import { useEffect, useState } from 'react';
import OnNumaraTable from '../OnNumaraScreen/OnNumaraTable';

// =============================================================================
// v82.2 — Yayında 10 Numara: yayıncı sadece masa kimliğini yollar (~1/sn);
// izleyici aynı masayı salt-izleme kipinde canlı çizer (butonsuz).
// frameRef.current: { g:'onnumara', s:'{"t":"masaId"}', at }
// =============================================================================
export default function StreamCardsView({ frameRef, hostUid }) {
  const [tableId, setTableId] = useState(null);
  useEffect(() => {
    const iv = setInterval(() => {
      const f = frameRef.current;
      if (!f || f.g !== 'onnumara') return;
      try {
        const t = JSON.parse(f.s)?.t || null;
        setTableId((cur) => (cur === t ? cur : t));
      } catch {
        /* bozuk kare */
      }
    }, 300);
    return () => clearInterval(iv);
  }, [frameRef]);
  if (!tableId) return <div className="st-game st-cards" />;
  return (
    <div className="st-game st-cards">
      <div className="st-cards-inner">
        <p className="st-cards-title">🃏 10 Numara</p>
        <OnNumaraTable tableId={tableId} myUid={null} hostUid={hostUid} spectate onLeave={() => {}} />
      </div>
    </div>
  );
}
