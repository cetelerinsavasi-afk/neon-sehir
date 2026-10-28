import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useSixtagramNotifications } from '../../hooks/useSixtagramNotifications';
import { useBlocks } from '../../contexts/BlocksContext';
import { markAllSixtagramNotificationsRead } from '../../services/gameActions';
import { IgIcon } from './igIcons';
import { FollowButton } from './SixProfile';
import './NotificationsPanel.css';

// v135 — Instagram (yeni) bildirimler sayfası: Bugün / Bu hafta / Daha önce,
// avatar + kalın ad + kısa zaman; takip bildiriminde "Takip et" düğmesi.
function ago(ms) {
  const m = Math.floor((Date.now() - Number(ms || 0)) / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} g`;
  return `${Math.floor(d / 7)} hf`;
}
function body(n) {
  const q = n.textPreview ? ` ${n.textPreview}` : '';
  if (n.type === 'like') return 'gönderini beğendi.';
  if (n.type === 'comment') return `yorum yaptı:${q}`;
  if (n.type === 'reply') return `yorumuna yanıt verdi:${q}`;
  if (n.type === 'follow') return 'seni takip etmeye başladı.';
  if (n.type === 'tip') return `${n.what || 'gönderine'} ${Number(n.amount || 0).toLocaleString('tr-TR')} altın destek verdi.${q}`;
  return 'bir etkileşimde bulundu.';
}
const GROUPS = [
  ['Bugün', 864e5],
  ['Bu hafta', 7 * 864e5],
  ['Daha önce', Infinity],
];

export default function NotificationsPanel({ onClose, onOpenPost, onOpenProfile }) {
  const { notifications: all } = useSixtagramNotifications();
  const { isBlocked } = useBlocks();
  const list = all.filter((n) => !isBlocked(n.fromUid)).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

  useEffect(() => {
    markAllSixtagramNotificationsRead().catch((err) => console.error('Bildirimler okundu işaretlenemedi:', err));
  }, []);

  const open = (n) => {
    if (n.type === 'follow' && n.fromUid && onOpenProfile) return onOpenProfile({ uid: n.fromUid, name: n.fromName, avatar: n.fromAvatar || null });
    if (n.postId) return onOpenPost?.(n.postId, n.type === 'like' ? null : n.commentId || null);
    return undefined;
  };
  const now = Date.now();
  let prev = 0;
  const sections = GROUPS.map(([label, lim]) => {
    const rows = list.filter((n) => {
      const age = now - Number(n.createdAtMs || 0);
      return age >= prev && age < lim;
    });
    prev = lim;
    return { label, rows };
  }).filter((g) => g.rows.length);

  // v136 — iOS'taki gibi: sol kenardan sağa çekince geri (bildirimlerden çık)
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const edge = useRef(null);
  const onDown = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    edge.current = e.clientX - r.left < 36 ? { x: e.clientX, y: e.clientY, t: Date.now(), on: false } : null;
  };
  const onMove = (e) => {
    const g = edge.current;
    if (!g) return;
    const ddx = e.clientX - g.x;
    const ddy = e.clientY - g.y;
    if (!g.on) {
      if (Math.abs(ddy) > 14 && Math.abs(ddy) > Math.abs(ddx)) {
        edge.current = null;
        return;
      }
      if (ddx > 10) {
        g.on = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* yoksay */
        }
      }
    }
    if (g.on) setDx(Math.max(0, ddx));
  };
  const onUp = (e) => {
    const g = edge.current;
    edge.current = null;
    if (!g?.on) return;
    const ddx = e.clientX - g.x;
    const fast = ddx / Math.max(1, Date.now() - g.t) > 0.5;
    if (ddx > 110 || (fast && ddx > 40)) {
      setLeaving(true);
      setDx(window.innerWidth);
      setTimeout(onClose, 180);
    } else setDx(0);
  };

  return createPortal(
    <div
      className={`ig-nt${dx ? ' drag' : ''}${leaving ? ' leaving' : ''}`}
      role="dialog"
      aria-label="Bildirimler"
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <header className="ig-nt-head">
        <button className="ig-nt-back" onClick={onClose} aria-label="Geri">
          <IgIcon n="back" size={24} />
        </button>
        <b>Bildirimler</b>
      </header>
      <div className="ig-nt-list">
        {list.length === 0 && (
          <div className="ig-nt-empty">
            <span className="ig-nt-empty-ic">
              <IgIcon n="heart" size={44} stroke={1.5} />
            </span>
            <b>Gönderilerindeki etkinlikler</b>
            <span>Biri gönderini beğendiğinde, yorum yaptığında ya da seni takip ettiğinde burada görürsün.</span>
          </div>
        )}
        {sections.map((g) => (
          <section key={g.label}>
            <h3>{g.label}</h3>
            {g.rows.map((n) => (
              <div key={n.id} className={`ig-nt-row${n.read ? '' : ' new'}`}>
                <button
                  className="ig-nt-av"
                  onClick={() => n.fromUid && onOpenProfile?.({ uid: n.fromUid, name: n.fromName, avatar: n.fromAvatar || null })}
                  aria-label={n.fromName}
                >
                  {n.fromAvatar ? <AvatarSvg avatar={n.fromAvatar} size={44} rounded /> : <span className="ig-nt-ini">{String(n.fromName || '?').slice(0, 1).toUpperCase()}</span>}
                  {n.type === 'tip' && <i className="ig-nt-badge">💛</i>}
                </button>
                <button className="ig-nt-txt" onClick={() => open(n)}>
                  <b>{n.fromName}</b> {body(n)} <span className="ig-nt-time">{ago(n.createdAtMs)}</span>
                </button>
                {n.type === 'follow' && n.fromUid && <FollowButton uid={n.fromUid} name={n.fromName} small />}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>,
    document.body
  );
}
