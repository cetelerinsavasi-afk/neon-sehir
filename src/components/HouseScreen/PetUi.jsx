import { useEffect, useRef, useState } from 'react';
import { houseAction } from '../../services/gameActions';
import { drawPet } from '../../lib/cosmeticsArt';
import { ANIMAL_BY_KEY, PET_LINES, PET_LINE_MAX, PET_MOVES, PET_NAME_MAX, PET_POSES, cleanPetConfig, petTintOf } from '../../../functions/animalData.js';
import './BotUi.css';

// =============================================================================
// v137 — Ev hayvanı düzenleyici (Tasarla › hayvan seçili › ✏️ Düzenle): ad,
// 3 konuşma balonu, hareket. Renk: eşyanın renk seçenekleri (alttaki renkler).
// =============================================================================

// Hayvanın canlı çizimi (canvas; yürüme animasyonu)
export function PetCanvas({ art, tint, size = 120, moving = false, still = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size * 1.8;
    const H = size * 1.75;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const c = cv.getContext('2d');
    let raf = 0;
    const draw = (t) => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      drawPet(c, art, W / 2, H - size * 0.22, t, { moving, size, tint });
      if (!still) raf = requestAnimationFrame(draw);
    };
    if (still) draw(0);
    else raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [art, tint?.c, tint?.c2, size, moving, still]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className={className} style={{ width: size * 1.8, height: size * 1.75 }} />;
}

export function PetEditor({ houseId, item, cfg: initial, onClose, flash }) {
  const a = ANIMAL_BY_KEY[item.k];
  const [c, setC] = useState(() => {
    const base = cleanPetConfig(initial);
    if (!initial) return { ...base, n: a?.name || '', l: [...(a?.lines || [])] };
    return { ...base, l: [...base.l] };
  });
  const [tab, setTab] = useState('talk');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setC((x) => ({ ...x, ...patch }));
  const lines = Array.from({ length: PET_LINES }, (_, i) => c.l[i] || '');
  const tint = petTintOf(item.k, item.c);
  const save = async () => {
    setBusy(true);
    try {
      await houseAction({ op: 'petSet', houseId, i: item.i, cfg: { ...c, l: lines } });
      flash?.(`🐾 ${c.n || a?.name} hazır.`);
      onClose();
    } catch (err) {
      const m = String(err?.message || '');
      flash?.(m === 'pet-unsaved' ? 'Hayvan henüz kaydedilmedi, birazdan tekrar dene.' : m === 'pet-trial' ? 'Önce hayvanı satın al.' : m || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };
  if (!a) return null;
  return (
    <div className="bz-modal-bg" onClick={() => !busy && onClose()}>
      <div className="bz-modal bz bt-ed" onClick={(e) => e.stopPropagation()}>
        <div className="bt-ed-stage pt-stage" style={{ '--jc': '#ffb347' }}>
          <div className="pt-ed-pet">
            <PetCanvas art={a.art} tint={tint} size={86} moving={c.mv !== 'sabit'} />
          </div>
          <div className="bt-ed-plate">
            {a.icon} {c.n || a.name}
          </div>
          <button className="bz-x bt-ed-x" disabled={busy} onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="bt-tabs">
          {[
            ['talk', '💬 Ad & Sözler'],
            ['move', '🐾 Hareket'],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="bt-pane">
          {tab === 'talk' && (
            <>
              <input className="bt-input" maxLength={PET_NAME_MAX} value={c.n} placeholder={a.name} onChange={(e) => set({ n: e.target.value })} aria-label="Ad" />
              {lines.map((v, i) => (
                <input
                  key={i}
                  className="bt-input"
                  maxLength={PET_LINE_MAX}
                  value={v}
                  placeholder={`💬 ${i + 1}`}
                  onChange={(e) => {
                    const l = [...lines];
                    l[i] = e.target.value;
                    set({ l });
                  }}
                />
              ))}
            </>
          )}
          {tab === 'move' && (
            <>
              <div className="bt-moves">
                {PET_MOVES.map((m) => (
                  <button key={m.id} className={c.mv === m.id ? 'on' : ''} onClick={() => set({ mv: m.id })}>
                    <span>{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>
              {c.mv === 'sabit' && (
                <div className="bt-row pt-poses">
                  {PET_POSES.map((m) => (
                    <button key={m.id} className={c.ps === m.id ? 'on' : ''} onClick={() => set({ ps: m.id })}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="pt-hint">🎨 Rengi: Tasarla'da hayvanı seçip alttaki renklerden</p>
        </div>
        <button className="bz-btn gold wide" disabled={busy} onClick={save}>
          {busy ? '…' : '💾 Kaydet'}
        </button>
      </div>
    </div>
  );
}
