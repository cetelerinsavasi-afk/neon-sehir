import { useCallback, useEffect, useRef, useState } from 'react';
import { publishMatchFrame, clearGameFrame } from './streamShared';
import { streamAction } from '../../services/gameActions';
import FutbolLigler from '../FutbolScreen/FutbolLigler';
import '../FutbolScreen/FutbolFullScreen.css';
import '../../styles/worldScreenChrome.css';
import './Stream.css';

// =============================================================================
// v92 — Yayındayken maç izleme (18:00–19:00, şampiyonluk kutlaması günü hariç)
// Yayıncı ekranı köşede küçülür (StreamHostPanel compact), Stadyum › Maçlar
// açılır. Altta yayın sohbetine yazılır (avatarın üstünde balon ÇIKMAZ);
// maç sohbeti salt okunur (yayıncı maç sohbetine yazamaz).
// =============================================================================
export default function StreamMatchView({ streamId, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // v92: izlenen maç yayına yansısın — görünüm ~1 sn'de bir izleyicilere gider
  const viewRef = useRef(null);
  const onView = useCallback((v) => {
    viewRef.current = v;
    publishMatchFrame(v);
  }, []);
  useEffect(() => {
    const iv = setInterval(() => viewRef.current && publishMatchFrame(viewRef.current), 1000);
    return () => {
      clearInterval(iv);
      clearGameFrame();
    };
  }, []);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr('');
    try {
      await streamAction({ op: 'chat', streamId, text: t, noBubble: true });
      setText('');
    } catch (e) {
      setErr(String(e?.message || 'Gönderilemedi.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="futbol-fullscreen st-matchview" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {/* sağ üstte yayın penceresi durduğu için dönüş butonu solda */}
      <div className="futbol-fullscreen-header st-mv-head">
        <button className="st-btn ghost st-mv-back" onClick={onClose}>
          ← Yayına dön
        </button>
        <span className="futbol-fullscreen-title">
          ⚽ Maçlar <i className="st-live small">CANLI</i>
        </span>
      </div>
      <div className="futbol-fullscreen-body">
        <FutbolLigler initialTab="maclar" chatReadOnly onView={onView} />
      </div>
      <div className="st-matchview-input">
        <small>🔴 Yayın sohbetine yaz (izleyiciler görür)</small>
        <div className="ws-chat-row st-input">
          <input className="ws-chat-input" maxLength={140} placeholder="Maçı yorumla…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="ws-chat-send" disabled={busy || !text.trim()} onClick={send}>
            Gönder
          </button>
        </div>
        {err && <small className="st-host-note bad">{err}</small>}
      </div>
    </div>
  );
}
