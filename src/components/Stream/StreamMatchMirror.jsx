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
  // v114 — izleyici sadece izler: maça/sekmeye/lige dokunamaz (yayıncı neye bakıyorsa o).
  // Olaylar yakalama aşamasında durdurulur; kaydırma (dokunup sürükleme) çalışmaya devam eder.
  const block = (e) => {
    e.stopPropagation();
  };
  const blockDown = (e) => {
    e.stopPropagation();
    if (e.type === 'mousedown') e.preventDefault(); // odak/seçim/açılır liste olmasın
  };
  const blockClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const blockFocus = (e) => {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) t.blur?.();
  };
  return (
    <div
      className="st-game st-cards st-match-mirror"
      onClickCapture={blockClick}
      onDoubleClickCapture={blockClick}
      onPointerDownCapture={block}
      onPointerUpCapture={block}
      onMouseDownCapture={blockDown}
      onTouchStartCapture={block}
      onTouchEndCapture={block}
      onKeyDownCapture={blockClick}
      onChangeCapture={block}
      onFocusCapture={blockFocus}
      onContextMenu={blockClick}
    >
      <div className="st-match-scroll">
        <div className="st-cards-inner">
          <p className="st-cards-title">⚽ Yayıncı maç izliyor · sadece izleme</p>
          {mirror && <FutbolLigler initialTab={mirror.tab} chatReadOnly mirror={mirror} />}
        </div>
      </div>
    </div>
  );
}
