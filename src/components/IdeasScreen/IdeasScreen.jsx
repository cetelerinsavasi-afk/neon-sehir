// "Bi fikrin mi var?" — oyuncular oyun hakkında fikir, hata ve sorularını
// yazar; yazılanlar 7 gün boyunca herkese listelenir (dokununca uzun hali).
// Yazma sunucuda (submitFeedback), okuma Firestore'dan (feedback).
import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { submitFeedback, toggleFeedbackLike } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PlayerCard from '../PlayerCard/PlayerCard';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import './IdeasScreen.css';

const KINDS = [
  { id: 'fikir', icon: '💡', label: 'Fikir' },
  { id: 'hata', icon: '🐞', label: 'Hata' },
  { id: 'soru', icon: '❓', label: 'Soru' },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const MIN = 10;
const MAX = 1000;
const WEEK = 7 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const INSTAGRAM = 'cetelerinsavasi';

function ago(ms) {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  return `${Math.floor(h / 24)} gün`;
}

export default function IdeasScreen() {
  const [kind, setKind] = useState('fikir');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('hepsi');
  const [open, setOpen] = useState(null);
  const [since] = useState(() => Date.now() - WEEK);
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [reportTarget, setReportTarget] = useState(null);
  // v67 — beğeni: sunucu cevabı gelene kadar iyimser gösterim
  const [optimistic, setOptimistic] = useState({}); // id -> true/false

  useEffect(() => {
    const q = query(collection(db, 'feedback'), where('createdAtMs', '>=', since), orderBy('createdAtMs', 'desc'), limit(100));
    return onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setList([])
    );
  }, [since]);

  // UGC D2: gizlenen ve engellenen oyuncuların önerileri gösterilmez
  const shown = useMemo(() => {
    const uid = user?.uid;
    const visible = list
      .filter((x) => !isHiddenForMe(x, x.uid, isBlocked))
      .map((x) => {
        const serverLiked = Boolean(uid && x.likes?.[uid]);
        const liked = x.id in optimistic ? optimistic[x.id] : serverLiked;
        const count = Math.max(0, Number(x.likeCount || 0) + (liked === serverLiked ? 0 : liked ? 1 : -1));
        return { ...x, liked, count };
      });
    // v67 sıralama: son 24 saatte yazılanlar en üstte (yeniden eskiye),
    // ardından diğerleri beğeni sayısına göre (eşitse yeni olan önce).
    const now = Date.now();
    visible.sort((a, b) => {
      const af = now - (a.createdAtMs || 0) < DAY;
      const bf = now - (b.createdAtMs || 0) < DAY;
      if (af !== bf) return af ? -1 : 1;
      if (af) return (b.createdAtMs || 0) - (a.createdAtMs || 0);
      return b.count - a.count || (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });
    return filter === 'hepsi' ? visible : visible.filter((x) => x.kind === filter);
  }, [list, filter, isBlocked, optimistic, user?.uid]);

  const like = async (x) => {
    if (!user || x.uid === user.uid) return;
    const next = !x.liked;
    setOptimistic((o) => ({ ...o, [x.id]: next }));
    try {
      await toggleFeedbackLike(x.id);
    } catch (e) {
      console.warn('toggleFeedbackLike', e?.message);
    } finally {
      // sunucu verisi (onSnapshot) gelince iyimser değeri bırak
      setTimeout(() => setOptimistic((o) => {
        const c = { ...o };
        delete c[x.id];
        return c;
      }), 1500);
    }
  };
  const len = text.trim().length;

  const send = async () => {
    if (busy || len < MIN) return;
    setBusy(true);
    setMsg(null);
    try {
      await submitFeedback(kind, text.trim());
      setText('');
      setMsg({ ok: true, text: '✅ Gönderildi, teşekkürler!' });
    } catch (e) {
      setMsg({ ok: false, text: e?.message && !/internal/i.test(e.message) ? e.message : 'Gönderilemedi, tekrar dene.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ideas">
      <div className="ideas-hero">
        <div className="ideas-bulb" aria-hidden="true">
          💡
        </div>
        <div className="ideas-hero-text">
          <b>Bi fikrin mi var?</b>
          <span>Şehri birlikte büyütelim.</span>
        </div>
        <a className="ideas-insta" href={`https://instagram.com/${INSTAGRAM}`} target="_blank" rel="noreferrer">
          <span className="ideas-insta-ico" aria-hidden="true" />@{INSTAGRAM}
        </a>
      </div>

      <div className="ideas-compose">
        <div className="ideas-kinds" role="group" aria-label="Tür">
          {KINDS.map((k) => (
            <button key={k.id} className={`ideas-kind k-${k.id}${kind === k.id ? ' on' : ''}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <textarea
          className="ideas-input"
          rows={4}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'hata' ? 'Ne oldu? Nerede oldu?' : kind === 'soru' ? 'Neyi anlamadın?' : 'Aklındakini yaz…'}
        />
        <div className="ideas-row">
          <span className={`ideas-count${len > 0 && len < MIN ? ' low' : ''}`}>
            {len}/{MAX}
          </span>
          <button className="ideas-send" disabled={busy || len < MIN} onClick={send}>
            {busy ? '…' : 'Gönder ➤'}
          </button>
        </div>
        {msg && <div className={`ideas-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</div>}
      </div>

      <div className="ideas-filter">
        {[{ id: 'hepsi', icon: '🗂️', label: 'Hepsi' }, ...KINDS].map((k) => (
          <button key={k.id} className={filter === k.id ? 'on' : ''} onClick={() => setFilter(k.id)}>
            {k.icon} {k.label}
          </button>
        ))}
      </div>

      <div className="ideas-list">
        {shown.length === 0 && <div className="ideas-empty">🌙 Henüz yazılan yok. İlk sen yaz!</div>}
        {shown.map((x) => {
          const k = KIND[x.kind] || KIND.fikir;
          const isOpen = open === x.id;
          return (
            <div key={x.id} className="ideas-item-wrap">
            <div className="ideas-item-box">
            <button className={`ideas-item k-${k.id}${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : x.id)}>
              <span className="ideas-avatar">
                <AvatarSvg avatar={x.avatar} size={36} rounded />
              </span>
              <span className="ideas-body">
                <span className="ideas-head">
                  <b>{x.displayName}</b>
                  <span className={`ideas-badge k-${k.id}`}>
                    {k.icon} {k.label}
                  </span>
                  <span className="ideas-time">{ago(x.createdAtMs)}</span>
                </span>
                <span className="ideas-text">{x.text}</span>
              </span>
            </button>
            <button
              className={`ideas-like${x.liked ? ' on' : ''}`}
              disabled={!user || x.uid === user?.uid}
              onClick={() => like(x)}
              aria-pressed={x.liked}
              title={x.uid === user?.uid ? 'Kendi yazdığın' : x.liked ? 'Beğeniyi geri al' : 'Beğen'}
            >
              {x.liked ? '❤️' : '🤍'} {x.count}
            </button>
            </div>
            {isOpen && user && x.uid !== user.uid && (
              <button className="ideas-report" onClick={() => setReportTarget(x)}>
                👤 {x.displayName || 'Oyuncu'} profilini gör
              </button>
            )}
            </div>
          );
        })}
      </div>
      {/* v53: olumlu giriş — Oyuncu Kartı; öneriyi bildirmek kartın ⋯ menüsünde */}
      {reportTarget && (
        <PlayerCard
          uid={reportTarget.uid}
          name={reportTarget.displayName}
          avatar={reportTarget.avatar}
          reportItems={[{ label: 'Bu öneriyi bildir', targetType: 'feedback', targetPath: `feedback/${reportTarget.id}`, preview: reportTarget.text }]}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
