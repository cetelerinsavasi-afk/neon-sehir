import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shopAction, createSixtagramPost } from '../../services/gameActions';
import { useNetCredits } from '../../hooks/useVenueData';
import { usePlayer } from '../../hooks/usePlayer';
import { INTERVIEW_MAX_TEXT } from '../../../functions/homeOfficeData.js';
import InterviewPlayer from '../Broadcast/InterviewPlayer';
import DrawingPad from '../Sixtagram/DrawingPad';
import { invalidateSixtagramFeed } from '../../hooks/useSixtagramFeed';
import './HomeOffice.css';

// =============================================================================
// v135 — Haber Stüdyosu (röportaj) ve Tuval (resim çiz) panelleri.
// Mikser konsolu gibi dakika ücretli: süre bitmek üzereyken yeni dakika çekilir
// (netTick); panel kapanınca mobilyadan kalkılır (netLeave). Sahip ücretsiz.
// Paylaşım Sixtagram'a gider (sunucu bu mekânda yakın zamanda oturum arar).
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const STOP_TEXT = {
  gold: '💰 Altının bitti — süre doldu.',
  limit: '🏢 Bugün burada harcama sınırına (10.000) ulaştın.',
  closed: '🔒 Sahip bu mobilyayı kapattı.',
  left: '🚪 Mekândan çıktın.',
};

function useMinuteTick(houseId, onStop, flash, icon) {
  const credits = useNetCredits();
  const creditRef = useRef(0);
  creditRef.current = Number(credits.find((r) => r.houseId === houseId)?.creditUntilMs || 0);
  const stopRef = useRef(onStop);
  stopRef.current = onStop;
  useEffect(() => {
    let busy = false;
    let last = Date.now();
    let dead = false;
    const iv = setInterval(async () => {
      if (busy || dead) return;
      const t = Date.now();
      if (creditRef.current - t > 4000 && t - last < 20_000) return;
      busy = true;
      last = t;
      try {
        const r = await shopAction({ op: 'netTick', houseId });
        if (r.stopped && r.stopped !== 'none') {
          dead = true;
          stopRef.current?.(STOP_TEXT[r.stopped] || '⏱️ Süre bitti.');
        } else if (r.charged) flash?.(`${icon} Yeni dakika: −${fmt(r.charged)} altın`);
      } catch {
        /* bir sonraki nabızda */
      } finally {
        busy = false;
      }
    }, 2000);
    return () => {
      dead = true;
      clearInterval(iv);
    };
  }, [houseId, flash, icon]);
  useEffect(() => () => void shopAction({ op: 'netLeave', houseId }).catch(() => {}), [houseId]);
}

const halt = (e) => e.stopPropagation();

// ---- HABER STÜDYOSU ------------------------------------------------------------------
export function InterviewStudio({ houseId, houseDoc, price, isOwner, onClose, flash }) {
  const { player } = usePlayer();
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [phase, setPhase] = useState('write'); // write | preview | done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [stopped, setStopped] = useState('');
  useMinuteTick(houseId, setStopped, flash, '📺');
  const channel = houseDoc?.name || 'Haber';
  const share = async () => {
    const clean = text.trim();
    if (!clean) return setErr('Röportajda ne söylemek istediğini yaz.');
    setBusy(true);
    setErr('');
    try {
      await createSixtagramPost(caption.trim(), { type: 'interview', houseId, text: clean });
      invalidateSixtagramFeed();
      setPhase('done');
    } catch (e) {
      setErr(e?.message || 'Paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="ho-studio" role="dialog" aria-label="Haber stüdyosu" onClick={halt} onPointerDown={halt}>
      <div className="ho-studio-top">
        <button className="ho-x" onClick={() => onClose()} aria-label="Kapat">
          ✕
        </button>
        <div className="ho-studio-title">
          <b>📺 {channel}</b>
          {!isOwner && <small>{fmt(price)} / dk</small>}
        </div>
      </div>
      <div className="ho-studio-body">
        {phase === 'done' ? (
          <div className="ho-done">
            <p className="ho-done-big">🎉</p>
            <p>Röportajın Sixtagram'da yayında!</p>
            <button className="ho-btn gold" onClick={() => onClose()}>
              Tamam
            </button>
          </div>
        ) : phase === 'preview' ? (
          <>
            <InterviewPlayer locationId="haber" text={text.trim()} avatar={player?.avatar} displayName={player?.displayName} channel={channel} channelEmoji={houseDoc?.office?.emoji} />
            <input className="ho-input" maxLength={280} placeholder="Gönderi açıklaması (isteğe bağlı)" value={caption} onChange={(e) => setCaption(e.target.value)} />
            {err && <p className="ho-err">{err}</p>}
            <div className="ho-row">
              <button className="ho-btn ghost" disabled={busy} onClick={() => setPhase('write')}>
                ✏️ Düzenle
              </button>
              <button className="ho-btn gold" disabled={busy || Boolean(stopped)} onClick={share}>
                {busy ? 'Paylaşılıyor…' : "📤 Sixtagram'da yayınla"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ho-sec">🎙️ Röportajda ne söylemek istiyorsun?</p>
            <textarea className="ho-input ho-interview-text" rows={7} maxLength={INTERVIEW_MAX_TEXT} placeholder="Kameraya söylemek istediklerini yaz…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <p className="ho-dim ho-count">
              {text.length}/{INTERVIEW_MAX_TEXT}
            </p>
            <button className="ho-btn gold" disabled={!text.trim()} onClick={() => setPhase('preview')}>
              🎬 Çekime başla
            </button>
          </>
        )}
        {stopped && phase !== 'done' && <p className="ho-err">{stopped}</p>}
      </div>
    </div>,
    document.body
  );
}

// ---- TUVAL (RESİM ÇİZ) -----------------------------------------------------------------
export function PaintStudio({ houseId, houseDoc, price, isOwner, onClose, flash }) {
  const [drawing, setDrawing] = useState(null); // bitince paylaşım
  const [draft, setDraft] = useState({}); // paylaşımdan çizime dönünce kaldığı yer
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [stopped, setStopped] = useState('');
  const onStop = useCallback((m) => setStopped(m), []);
  useMinuteTick(houseId, onStop, flash, '🎨');
  const share = async () => {
    setBusy(true);
    setErr('');
    try {
      await createSixtagramPost(caption.trim(), { ...drawing, houseId });
      invalidateSixtagramFeed();
      setDone(true);
    } catch (e) {
      setErr(e?.message || 'Paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  };
  if (!drawing) {
    return (
      <>
        <DrawingPad
          initial={draft}
          title={`🎨 ${houseDoc?.name || 'Atölye'}`}
          subtitle={isOwner ? null : `${fmt(price)} / dk`}
          onCancel={() => onClose()}
          onDone={(d) => {
            setDraft(d);
            setDrawing(d);
          }}
        />
        {stopped &&
          createPortal(
            <div className="ho-modal-bg" onPointerDown={halt}>
              <div className="ho-modal" onClick={halt}>
                <h3>⏱️ {stopped}</h3>
                <button className="ho-btn gold" onClick={() => onClose()}>
                  Tamam
                </button>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }
  return createPortal(
    <div className="ho-modal-bg" onClick={() => !busy && setDrawing(null)} onPointerDown={halt}>
      <div className="ho-modal" onClick={halt}>
        {done ? (
          <>
            <h3>🎉 Resmin Sixtagram'da!</h3>
            <button className="ho-btn gold" onClick={() => onClose()}>
              Tamam
            </button>
          </>
        ) : (
          <>
            <h3>📤 Sixtagram'da paylaş</h3>
            <input className="ho-input" maxLength={280} placeholder="Bir şeyler yaz (isteğe bağlı)" value={caption} onChange={(e) => setCaption(e.target.value)} />
            {err && <p className="ho-err">{err}</p>}
            {stopped && <p className="ho-err">{stopped}</p>}
            <div className="ho-row">
              <button className="ho-btn ghost" disabled={busy} onClick={() => setDrawing(null)}>
                ✏️ Çizime dön
              </button>
              <button className="ho-btn gold" disabled={busy} onClick={share}>
                {busy ? 'Paylaşılıyor…' : 'Paylaş'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
