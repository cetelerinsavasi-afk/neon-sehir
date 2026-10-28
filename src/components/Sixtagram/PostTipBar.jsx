import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { SONG_TIP_AMOUNTS, SONG_TIP_NOTE_MAX } from '../../../functions/homeOfficeData.js';
import './SongMaker.css';

// v135 — resim ve röportajlara da şarkılardaki gibi altın bağışlanır (op 'postTip').
// Sınırlar şarkıyla ortak: gönderi başı 5.000 · bir oyuncuya günde 10.000.
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

export default function PostTipBar({ post, label = 'Destek ol' }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const isOwner = Boolean(user && post?.uid === user.uid);
  const [tips, setTips] = useState(Number(post?.tips || 0));
  useEffect(() => setTips((t) => Math.max(t, Number(post?.tips || 0))), [post?.tips]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!post?.id) return null;
  const send = async () => {
    if (!sel) return;
    if (Number(player?.gold || 0) < sel) return setMsg({ ok: false, text: 'Altının yetmiyor.' });
    setBusy(true);
    setMsg(null);
    try {
      const n = note.trim();
      await shopAction({ op: 'postTip', postId: post.id, amount: sel, ...(n ? { text: n } : {}) });
      setTips((t) => t + sel);
      setMsg({ ok: true, text: `💛 ${fmt(sel)} altın destek verdin.` });
      setSel(null);
      setNote('');
      setOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sv-card ptb">
      <div className="sv-foot">
        {tips > 0 ? <span className="sv-plays">💛 {fmt(tips)} altın destek</span> : <span className="sv-plays">💛 Henüz destek yok</span>}
        <span className="sv-sp" />
        {!isOwner && (
          <button className={`sv-btn tip${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)}>
            💛 {label}
          </button>
        )}
      </div>
      {open && !isOwner && (
        <div className="sv-tips">
          {SONG_TIP_AMOUNTS.map((a) => (
            <button key={a} className={`sv-tip${sel === a ? ' on' : ''}`} disabled={busy} onClick={() => setSel((c) => (c === a ? null : a))}>
              {fmt(a)} <span className="gold-coin-icon" style={{ width: 11, height: 11 }} />
            </button>
          ))}
          {sel !== null && (
            <>
              <input className="sv-tip-note" value={note} maxLength={SONG_TIP_NOTE_MAX} placeholder="Bir not yaz (isteğe bağlı)" onChange={(e) => setNote(e.target.value)} onClick={(e) => e.stopPropagation()} />
              <button className="sv-tip-send" disabled={busy} onClick={send}>
                {busy ? 'Gönderiliyor…' : `💛 ${fmt(sel)} altın gönder`}
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p className={`sv-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}
    </div>
  );
}
