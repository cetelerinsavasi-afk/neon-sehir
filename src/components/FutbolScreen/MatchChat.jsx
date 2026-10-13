import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { useMatchChat } from '../../hooks/useMatchChat';
import { streamAction } from '../../services/gameActions';
import { MATCH_CHAT_MAX } from '../../../functions/stream.js';
import './MatchChat.css';

// =============================================================================
// v92 — Maç sohbeti (Stadyum › Maçlar). Günün maçları 00:00'da gelince açılır,
// ertesi 00:00'a kadar sürer: maçtan önce, maç sırasında ve sonrasında maç
// hakkındaki konuşmalar genel sohbete karışmadan burada.
// Yayınlardaki sohbet gibi: dokununca büyür (geçmiş), tekrar dokununca küçülür.
// readOnly: yayıncı maçları yayında izlerken (yazdıkları yayın sohbetine gider).
// =============================================================================
export default function MatchChat({ readOnly = false }) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const { list } = useMatchChat(80);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);
  const visible = useMemo(() => list.filter((m) => !isBlocked?.(m.uid)), [list, isBlocked]);
  const shown = open ? visible : visible.slice(-3);
  useEffect(() => {
    // sayfayı değil yalnızca listeyi kaydır
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, visible.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy || !user) return;
    setBusy(true);
    setErr('');
    try {
      await streamAction({ op: 'matchChat', text: t });
      setText('');
    } catch (e) {
      setErr(String(e?.message || 'Gönderilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`mc-wrap${open ? ' open' : ''}`}>
      <div className="mc-list" ref={listRef} onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open}>
        <div className="mc-head">
          <b>💬 Maç Sohbeti</b>
          <span>{open ? '▾ küçült' : visible.length > 3 ? `▴ tümü (${visible.length})` : 'bugünün maçları'}</span>
        </div>
        {shown.length === 0 && <p className="mc-empty">Bugünün maçları hakkında ilk yorumu sen yaz ⚽</p>}
        {shown.map((m) => (
          <p key={m.id} className={m.uid === user?.uid ? 'me' : ''}>
            <b>{m.uid === user?.uid ? 'Sen' : m.name}</b> {m.text}
          </p>
        ))}
      </div>
      {readOnly ? (
        <p className="mc-ro">Yayındayken buraya yazamazsın; yazdıkların yayın sohbetine gider.</p>
      ) : user ? (
        <div className="mc-input">
          <input maxLength={MATCH_CHAT_MAX} placeholder="Maç hakkında yaz…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button disabled={busy || !text.trim()} onClick={send}>
            Gönder
          </button>
        </div>
      ) : null}
      {err && <p className="mc-err">{err}</p>}
    </div>
  );
}
