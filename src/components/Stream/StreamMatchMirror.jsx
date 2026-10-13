import { useEffect, useState } from 'react';
import FutbolLigler from '../FutbolScreen/FutbolLigler';
import '../FutbolScreen/FutbolFullScreen.css';

// =============================================================================
// v92 — İzleyici: yayıncı maç izliyorsa (Stadyum › Maçlar) aynı lig/sekme/maç
// ve aynı anda başlayan maç özeti burada gösterilir. Yayıncı sadece görünümü
// yollar (~1/sn); veriler (maçlar, skorlar) izleyicinin kendi okumasıdır.
// frameRef.current: { g:'match', s:'{"lg","tab","m","cm","rs"}', at }
// =============================================================================
export default function StreamMatchMirror({ frameRef }) {
  const [mirror, setMirror] = useState(null);
  useEffect(() => {
    let lastKey = '';
    let localStart = null;
    let hostStart = null;
    const iv = setInterval(() => {
      const f = frameRef.current;
      if (!f || f.g !== 'match') return;
      let v;
      try {
        v = JSON.parse(f.s) || {};
      } catch {
        return;
      }
      // özet başlangıcı yayıncının saatiyle gelir → bu cihazın saatine çevrilir
      if (v.rs) {
        if (v.rs !== hostStart) {
          hostStart = v.rs;
          localStart = Date.now() - Math.max(0, Number(f.at || 0) - v.rs);
        }
      } else {
        hostStart = null;
        localStart = null;
      }
      const next = { lg: v.lg || null, tab: v.tab || 'maclar', m: v.m || null, cm: v.cm || null, rs: localStart };
      const key = JSON.stringify(next);
      if (key !== lastKey) {
        lastKey = key;
        setMirror(next);
      }
    }, 300);
    return () => clearInterval(iv);
  }, [frameRef]);
  return (
    <div className="st-game st-cards st-match-mirror">
      <div className="st-cards-inner">
        <p className="st-cards-title">⚽ Yayıncı maç izliyor</p>
        {mirror && <FutbolLigler initialTab={mirror.tab} chatReadOnly mirror={mirror} />}
      </div>
    </div>
  );
}
