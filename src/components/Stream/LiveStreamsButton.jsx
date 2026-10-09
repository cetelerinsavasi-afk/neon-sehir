import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackClose } from '../../lib/backStack';
import { fmtDur, fmtN, readThumbs, readViewerCounts, useLiveStreams } from './streamShared';
import '../../styles/worldScreenChrome.css';
import './Stream.css';

// =============================================================================
// v80 — Ana sayfa: canlı yayın varsa sol altta (Görevler butonunun üstünde,
// telefon butonunun karşısında) "🔴 CANLI" butonu. Tek yayın → doğrudan izle;
// birden fazla → başlık, önizleme görüntüsü ve izleyici sayısıyla liste.
// Yayın yoksa buton hiç görünmez. Liste tek belgeden okunur (stats/streams).
// =============================================================================
export default function LiveStreamsButton({ onWatch, className = '' }) {
  const { user } = useAuth();
  const items = useLiveStreams(Boolean(user));
  const [open, setOpen] = useState(false);
  const [thumbs, setThumbs] = useState({});
  const [counts, setCounts] = useState({});
  useBackClose(open, () => setOpen(false));
  const list = items.filter((x) => x && x.id);

  useEffect(() => {
    if (!open || !list.length) return undefined;
    let alive = true;
    const load = () => {
      readThumbs(list.map((x) => x.uid)).then((t) => alive && setThumbs(t));
      readViewerCounts(list.map((x) => x.id)).then((c) => alive && setCounts(c));
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list.map((x) => x.id).join(',')]);

  if (!user || !list.length) return null;
  const click = () => {
    if (list.length === 1) onWatch(list[0].id);
    else setOpen(true);
  };
  return (
    <>
      <button className={`st-live-btn ${className}`} onClick={click} aria-label="Canlı yayınlar">
        <span className="st-live-dot" />
        CANLI
        {list.length > 1 && <b>{list.length}</b>}
      </button>
      {open && (
        <div className="st-sheet-bg" onClick={() => setOpen(false)}>
          <div className="st-sheet st-list" onClick={(e) => e.stopPropagation()}>
            <p className="st-sheet-title">🔴 Canlı yayınlar</p>
            {list.map((x) => (
              <div key={x.id} className="st-item">
                <div className="st-thumb">
                  {thumbs[x.uid] ? <img src={thumbs[x.uid]} alt="" /> : <span>📺</span>}
                  <i className="st-live small">CANLI</i>
                </div>
                <div className="st-item-main">
                  <b>{x.title}</b>
                  <small>
                    {x.name} · 📍 {x.houseName}
                  </small>
                  <small>
                    👁 {fmtN(counts[x.id] || 0)} izliyor · {fmtDur(Date.now() - Number(x.startedAtMs || Date.now()))}
                  </small>
                </div>
                <button
                  className="st-btn live"
                  onClick={() => {
                    setOpen(false);
                    onWatch(x.id);
                  }}
                >
                  İzle
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
