import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { streamAction, createSixtagramPost } from '../../services/gameActions';
import { createPortal } from 'react-dom';
import { fmtDur, fmtN, publishThumb, useStreamChat, useStreamGameHealth, watchViewers } from './streamShared';
import '../../styles/worldScreenChrome.css';
import './Stream.css';

// =============================================================================
// v80 — YAYINCI tarafı
//   StreamStartSheet  — "Yayın aç": başlık (isteğe bağlı) + kafede dakika ücreti
//   StreamHostPanel   — yayın sürerken: CANLI · süre · 👁 · 💰, kendi görüntün,
//                       sohbet, gelen bağışlar, yayını kapat (küçültülebilir)
//   StreamSummary     — yayın bitince: süre, izleyici, bağış, vergi, cebe geçen
// =============================================================================

export function StreamStartSheet({ cafePrice = 0, busy, onStart, onCancel }) {
  const [title, setTitle] = useState('');
  return (
    <div className="st-sheet-bg" onClick={() => !busy && onCancel()}>
      <div className="st-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="st-sheet-title">🔴 Canlı yayın aç</p>
        <input className="ws-chat-input" maxLength={60} placeholder="Yayın başlığı (isteğe bağlı)" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <ul className="st-sheet-notes">
          <li>📷 Kamera bilgisayarın üstünde: sen ve arkandaki oda yayında görünür.</li>
          <li>🎮 Yayındayken bilgisayardan oyun oynarsan izleyiciler oyunu da görür.</li>
          <li>🎁 Bağışlar yayın bitince %10 vergi kesilerek cebine geçer.</li>
          {cafePrice > 0 ? (
            <li className="warn">
              💳 İnternet kafe yayın seti: dakikası <b>{fmtN(cafePrice)} altın</b>. Altının bitince yayın kapanır.
            </li>
          ) : (
            <li>✅ Kendi setinde yayın ücretsiz.</li>
          )}
        </ul>
        <div className="st-sheet-btns">
          <button className="st-btn ghost" disabled={busy} onClick={onCancel}>
            Vazgeç
          </button>
          <button className="st-btn live" disabled={busy} onClick={() => onStart(title.trim())}>
            {busy ? 'Açılıyor…' : cafePrice > 0 ? `Yayını başlat · ${fmtN(cafePrice)}/dk` : 'Yayını başlat'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TICK_MS = 20_000;
const THUMB_MS = 30_000;
export const ALERT_MS = 12_000; // v81: bağış yazısı ekranda daha uzun kalsın (eskiden ~6 sn)
const AFK_MS = 5 * 60_000; // v81: bu kadar süre hiç dokunulmazsa "Hâlâ orada mısın?"
const AFK_GRACE_S = 30;
const HIDDEN_STOP_MS = 20_000; // v81: uygulama/sekme arka planda bu kadar kalırsa yayın kapanır

// =============================================================================
// v81 — YAYINCI EKRANI: yayın TÜM EKRANI kaplar (ana sahne yayın kamerasından
// çizilir — izleyicinin gördüğünün aynısı). Üstte CANLI · süre · 👁 · bağış ·
// Bitir; altta izleyici mesajları (TikTok canlı yayını gibi) ve yazma kutusu.
// Yayıncının yazdıkları avatarının üstünde KONUŞMA BALONU olarak çıkar (hem
// yayıncıda hem izleyicilerde). Sağ altta 🎮 Oyun oyna (oyun salonu / yarış).
// compact: oyun açıkken arayüz gizlenir ama nabız/izleyici takibi sürer.
// =============================================================================
export function StreamHostPanel({ stream, pose, engineRef, onEnded, onStopRequest, stopping, statsRef, onPlay, compact = false, roomChat = [] }) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const streamId = stream?.id;
  const chat = useStreamChat(streamId, 60);
  const [viewers, setViewers] = useState(0);
  const [viewErr, setViewErr] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState('');
  const [afkLeft, setAfkLeft] = useState(0);
  const [chatOpen, setChatOpen] = useState(false); // v81: mesajlara dokununca geçmiş açılır
  const [viewersOpen, setViewersOpen] = useState(false); // v82: izleyenler paneli
  const chatEndRef = useRef(null); // >0 → "Hâlâ orada mısın?" geri sayımı
  const seenRef = useRef(new Set());
  const viewersRef = useRef(0);
  const thumbRef = useRef(null);
  const seenFx = useRef(null);
  const alertTimers = useRef([]);
  const lastInputRef = useRef(Date.now());
  useEffect(() => () => alertTimers.current.forEach(clearTimeout), []);
  const endedRef = useRef(false);

  // izleyiciler (anlık + toplam farklı kişi)
  useEffect(() => {
    if (!streamId) return undefined;
    return watchViewers(streamId, ({ count, uids, error }) => {
      setViewErr(Boolean(error));
      setViewers(count);
      viewersRef.current = count;
      uids.forEach((u) => seenRef.current.add(u));
      if (statsRef) statsRef.current = { viewers: count, seen: seenRef.current.size };
    });
  }, [streamId, statsRef]);

  // nabız (kafe: dakika ücreti burada çekilir) — oyun açıkken de sürer
  useEffect(() => {
    if (!streamId) return undefined;
    let alive = true;
    const beat = async () => {
      try {
        const r = await streamAction({ op: 'tick', streamId, viewers: viewersRef.current, seen: seenRef.current.size });
        if (!alive) return;
        setErr('');
        if (r?.stopped && !endedRef.current) {
          endedRef.current = true;
          onEnded(r.summary, r.stopped);
        }
      } catch {
        if (alive) setErr('Bağlantı zayıf…');
      }
    };
    const iv = setInterval(beat, TICK_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(iv);
      clearInterval(clock);
    };
  }, [streamId, onEnded]);

  // v81 — "bilgisayardan kalkınca" yayın kapanır:
  //  • uygulama/sekme kapanırsa hemen, arka planda 20 sn kalırsa
  //  • 5 dk hiç dokunulmazsa "Hâlâ orada mısın?" → 30 sn içinde cevap yoksa
  //  (oyunda koltuktan kalkınca kapanma HouseScreen'de)
  useEffect(() => {
    if (!streamId) return undefined;
    const touch = () => {
      lastInputRef.current = Date.now();
    };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    let hiddenAt = 0;
    const vis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else {
        hiddenAt = 0;
        touch();
      }
    };
    const bye = () => onStopRequest('away');
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', bye);
    const iv = setInterval(() => {
      const t = Date.now();
      if (hiddenAt && t - hiddenAt > HIDDEN_STOP_MS) {
        hiddenAt = 0;
        onStopRequest('away');
        return;
      }
      const idle = t - lastInputRef.current;
      if (idle > AFK_MS + AFK_GRACE_S * 1000) onStopRequest('afk');
      else setAfkLeft(idle > AFK_MS ? Math.ceil((AFK_MS + AFK_GRACE_S * 1000 - idle) / 1000) : 0);
    }, 1000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', bye);
      clearInterval(iv);
    };
  }, [streamId, onStopRequest]);

  // listedeki küçük önizleme (30 sn'de bir)
  useEffect(() => {
    if (!pose) return undefined;
    const shot = () => {
      const cv = thumbRef.current;
      const eng = engineRef.current;
      if (!cv || !eng?.renderStreamView || document.hidden || !user?.uid) return;
      if (!eng.renderStreamView(pose, cv)) return;
      try {
        publishThumb(user.uid, cv.toDataURL('image/jpeg', 0.55));
      } catch {
        /* yoksay */
      }
    };
    const first = setTimeout(shot, 1500);
    const iv = setInterval(shot, THUMB_MS);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [pose, engineRef, user?.uid]);

  // başımdaki rozet
  useEffect(() => {
    engineRef.current?.setLiveBadge?.(user?.uid, `🔴 CANLI · 👁 ${viewers}`);
  }, [viewers, engineRef, user?.uid]);
  useEffect(() => () => engineRef.current?.setLiveBadge?.(user?.uid, null), [engineRef, user?.uid]);

  // gelen bağışlar
  useEffect(() => {
    const fx = Array.isArray(stream?.fx) ? stream.fx : [];
    if (seenFx.current === null) {
      seenFx.current = new Set(fx.map((e) => `${e.at}|${e.u}`));
      return undefined;
    }
    const fresh = fx.filter((e) => !seenFx.current.has(`${e.at}|${e.u}`));
    fresh.forEach((e) => seenFx.current.add(`${e.at}|${e.u}`));
    if (!fresh.length) return undefined;
    setAlerts((a) => [...a, ...fresh.filter((e) => !isBlocked(e.u)).map((e) => ({ ...e, key: `${e.at}|${e.u}` }))].slice(-3));
    // zamanlayıcı efekt temizliğine bağlı DEĞİL (belge her nabızda yenilenir)
    const keys = fresh.map((e) => `${e.at}|${e.u}`);
    alertTimers.current.push(setTimeout(() => setAlerts((a) => a.filter((x) => !keys.includes(x.key))), ALERT_MS));
    return undefined;
  }, [stream?.fx, isBlocked]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await streamAction({ op: 'chat', streamId, text: t });
      setText('');
      // konuşma balonu (izleyicilerde de aynı mesaj balon olarak çıkar)
      engineRef.current?.say?.(user?.uid, t);
    } catch (e) {
      setErr(String(e?.message || 'Gönderilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  // izleyici mesajları (kendi yazdıkların balon olarak görünür, listede değil)
  // v86: odadakilerin (ev sohbeti) yazdıkları da yayıncının listesinde — 🏠 işaretiyle
  const startedAt = Number(stream?.startedAtMs || 0);
  const visibleChat = useMemo(() => {
    const fromStream = chat.filter((m) => !isBlocked(m.uid) && !(m.host && m.uid === user?.uid));
    const fromRoom = (roomChat || [])
      .filter((m) => !m.viaStream && m.uid !== user?.uid && !isBlocked(m.uid) && Number(m.createdAtMs || 0) >= startedAt)
      .map((m) => ({ ...m, id: `room_${m.id}`, room: true }));
    if (!fromRoom.length) return fromStream;
    return [...fromStream, ...fromRoom].sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));
  }, [chat, roomChat, isBlocked, user?.uid, startedAt]);
  const shown = chatOpen ? visibleChat : visibleChat.slice(-6);
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chatOpen, visibleChat.length]);
  const dur = fmtDur(now - Number(stream?.startedAtMs || now));
  const paidLeft = stream?.cafe ? Math.max(0, Math.ceil((Number(stream.paidUntilMs || 0) - now) / 1000)) : 0;

  const thumbCanvas = <canvas ref={thumbRef} width={144} height={252} style={{ display: 'none' }} />;
  // oyun/yarış açıkken: ekranda OYUN büyük, yayın kameran köşede küçük pencere
  if (compact)
    return (
      <>
        {thumbCanvas}
        <StreamPip engineRef={engineRef} pose={pose} viewers={viewers} dur={dur} chat={visibleChat} now={now} />
      </>
    );

  return (
    <div className="st-hostfs" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {thumbCanvas}
      <div className="st-top">
        <div className="st-who">
          <span className="st-ava">{String(user?.displayName || stream?.name || '?').slice(0, 1).toUpperCase()}</span>
          <span className="st-who-txt">
            <b>{stream?.title || 'Canlı yayın'}</b>
            <small>
              {dur}
              {stream?.cafe ? ` · 💳 ${fmtN(stream.price)}/dk` : ''}
            </small>
          </span>
        </div>
        <span className="st-live">CANLI</span>
        <button className="st-eye st-eye-btn" title="İzleyenleri gör" onClick={() => setViewersOpen(true)}>
          👁 {viewErr ? '?' : fmtN(viewers)}
        </button>
        <span className="st-eye st-gold">
          <span className="gold-coin-icon" style={{ width: 12, height: 12 }} /> {fmtN(stream?.donated || 0)}
        </span>
        <button className="st-btn stop st-end" disabled={stopping} onClick={() => onStopRequest('stop')}>
          {stopping ? '…' : '⏹ Bitir'}
        </button>
      </div>

      <StreamTopDonors top={stream?.top} isBlocked={isBlocked} className="host" />
      {viewersOpen && <StreamViewersSheet streamId={streamId} isBlocked={isBlocked} onClose={() => setViewersOpen(false)} />}
      <div className="st-alerts">
        {alerts.map((a) => (
          <div key={a.key} className={`st-alert${a.a >= 1000 ? ' big' : ''}`}>
            <b>
              🎁 {a.n} · {fmtN(a.a)} altın
            </b>
            {a.m && <span>“{a.m}”</span>}
          </div>
        ))}
      </div>

      {afkLeft > 0 && (
        <div className="st-afk" onClick={() => (lastInputRef.current = Date.now())}>
          <b>Hâlâ orada mısın?</b>
          <span>{afkLeft} sn içinde dokunmazsan yayın kapanacak.</span>
          <button className="st-btn gold">Buradayım</button>
        </div>
      )}

      <div className="st-hostfs-bottom">
        <div className={`st-hostfs-chat${chatOpen ? ' open' : ''}`} onClick={() => setChatOpen((v) => !v)}>
          {chatOpen && (
            <div className="st-hostfs-chat-head">
              <b>💬 Sohbet · son {visibleChat.length} mesaj</b>
              <span>▾ küçült</span>
            </div>
          )}
          {shown.length === 0 && <p className="st-chat-empty">İzleyici ve odadakilerin (🏠) mesajları burada görünür</p>}
          {shown.map((m) => (
            <StreamChatLine key={m.id} m={m} />
          ))}
          {!chatOpen && visibleChat.length > 6 && <small className="st-chat-more">Daha fazlası için dokun</small>}
          <span ref={chatEndRef} />
        </div>
        <button className="st-play-btn" onClick={onPlay} aria-label="Oyun oyna">
          <span>🎮</span>
          <small>Oyun oyna</small>
        </button>
      </div>
      {(err || viewErr || (stream?.cafe && paidLeft <= 10)) && (
        <div className="st-hostfs-notes">
          {stream?.cafe && paidLeft <= 10 && <small className="st-host-note">💳 Yeni dakika birazdan çekilecek ({fmtN(stream.price)} altın)</small>}
          {viewErr && <small className="st-host-note bad">👁 İzleyici sayısı okunamıyor (veritabanı kuralları)</small>}
          {err && <small className="st-host-note bad">{err}</small>}
        </div>
      )}
      <div className="ws-chat-row st-input st-hostfs-input">
        <input className="ws-chat-input" maxLength={140} placeholder="İzleyicilere ve odadakilere yaz…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="ws-chat-send" disabled={busy || !text.trim()} onClick={send}>
          Gönder
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// v81 — Yayıncı oyun oynarken köşedeki küçük yayın penceresi (gerçek yayıncılar
// gibi: oyun tam ekran, kamera köşede). Sahne yayın kamerasından ~7 kare/sn
// çizilir. Dokununca köşe değiştirir (oyunun düğmelerini kapatmasın diye).
// Yarış pisti evin üstünde açıldığı için pencere body'ye taşınır (portal).
// =============================================================================
const PIP_POS = ['tr', 'rm', 'lm', 'tl', 'bl', 'br'];
const FEED_MS = 20_000; // oyun sırasında bir mesaj bu kadar süre silik görünür
function StreamPip({ engineRef, pose, viewers, dur, chat = [], now = Date.now() }) {
  const cvRef = useRef(null);
  const health = useStreamGameHealth(true);
  const [pos, setPos] = useState(() => {
    try {
      const v = localStorage.getItem('st_pip_pos');
      return PIP_POS.includes(v) ? v : 'tr';
    } catch {
      return 'tr';
    }
  });
  useEffect(() => {
    if (!pose) return undefined;
    const iv = setInterval(() => {
      const cv = cvRef.current;
      const eng = engineRef.current;
      if (!cv || !eng?.renderStreamView || document.hidden) return;
      eng.renderStreamView(pose, cv);
    }, 140);
    return () => clearInterval(iv);
  }, [pose, engineRef]);
  const cycle = (e) => {
    e.stopPropagation();
    const next = PIP_POS[(PIP_POS.indexOf(pos) + 1) % PIP_POS.length];
    setPos(next);
    try {
      localStorage.setItem('st_pip_pos', next);
    } catch {
      /* yoksay */
    }
  };
  // v81: oyun oynarken son mesajlar ve bağışlar pencerenin yanında silik görünür
  // (dokunmaları oyuna geçirir — kontrolleri engellemez)
  const recent = chat.filter((m) => now - Number(m.createdAtMs || 0) < FEED_MS).slice(-4);
  return createPortal(
    <>
      {recent.length > 0 && (
        <div className={`st-pipfeed ${pos}`}>
          {recent.map((m) => (
            <StreamChatLine key={m.id} m={m} style={{ opacity: Math.max(0.35, 1 - (now - Number(m.createdAtMs || 0)) / FEED_MS) }} />
          ))}
        </div>
      )}
    <div className={`st-pip ${pos}`} onPointerDown={(e) => e.stopPropagation()} onClick={cycle} title="Dokun: köşe değiştir">
      <canvas ref={cvRef} width={162} height={288} />
      <span className="st-pip-top">
        <i className="st-live small">CANLI</i>
        <b>👁 {fmtN(viewers)}</b>
      </span>
      <span className="st-pip-dur">{dur}</span>
      {health === 'err' && <span className="st-pip-warn">⚠ Oyun yayına gitmiyor</span>}
    </div>
    </>,
    document.body
  );
}

// v82 — Sohbet satırı: bağışlar renkli (miktar + not), yayıncının mesajı işaretli
export function StreamChatLine({ m, showHost = false, style }) {
  if (m.donation) {
    return (
      <p className={`don${m.donation >= 1000 ? ' big' : ''}`} style={style}>
        <span className="don-ico">🎁</span>
        <b>{m.name}</b>
        <i>
          <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {fmtN(m.donation)} altın
        </i>
        {m.text ? <span className="don-note">“{m.text}”</span> : null}
      </p>
    );
  }
  return (
    <p className={m.host ? 'host' : m.room ? 'room' : ''} style={style}>
      <b>{showHost && m.host ? `🎥 ${m.name}` : m.room ? `🏠 ${m.name}` : m.name}</b> {m.text}
    </p>
  );
}

// v82 — İzleyenler paneli (👁 sayısına dokununca). Liste sunucudan gelir, açıkken 10 sn'de bir tazelenir.
// v84: liste bir kez geldiyse geçici hatada eski liste korunur (uyarı çıkmaz);
// hiç gelmediyse sunucunun mesajı + "Tekrar dene" gösterilir.
function viewersErrorText(e) {
  const msg = String(e?.message || '');
  if (/Geçersiz işlem/i.test(msg)) return 'İzleyici listesi sunucuda henüz açık değil.';
  if (/internal|unavailable|deadline/i.test(String(e?.code || '')) || !msg) return 'Liste alınamadı — bağlantını kontrol edip tekrar dene.';
  return `Liste alınamadı: ${msg}`;
}
export function StreamViewersSheet({ streamId, isBlocked, onClose }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!streamId) return undefined;
    let alive = true;
    let got = false;
    const load = () =>
      streamAction({ op: 'viewers', streamId })
        .then((r) => {
          if (!alive) return;
          got = true;
          setList(Array.isArray(r?.viewers) ? r.viewers : []);
          setErr('');
        })
        .catch((e) => {
          console.error('stream viewers', e);
          if (alive && !got) setErr(viewersErrorText(e));
        });
    load();
    const iv = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [streamId, retry]);
  const shown = (list || []).filter((v) => !isBlocked?.(v.uid));
  return (
    <div className="st-sheet-bg st-top-layer" onClick={onClose}>
      <div className="st-sheet st-viewers" onClick={(e) => e.stopPropagation()}>
        <p className="st-sheet-title">👁 Şu an izleyenler{list ? ` · ${shown.length}` : ''}</p>
        {!list && !err && <p className="st-chat-empty">Yükleniyor…</p>}
        {err && (
          <>
            <p className="st-host-note bad">{err}</p>
            <button
              className="st-btn ghost"
              onClick={() => {
                setErr('');
                setRetry((n) => n + 1);
              }}
            >
              Tekrar dene
            </button>
          </>
        )}
        {list && shown.length === 0 && <p className="st-chat-empty">Şu an kimse izlemiyor.</p>}
        <div className="st-viewers-list">
          {shown.map((v) => (
            <div key={v.uid} className="st-viewer">
              <span className="st-ava">{String(v.name || '?').slice(0, 1).toUpperCase()}</span>
              <b>{v.name}</b>
            </div>
          ))}
        </div>
        <button className="st-btn ghost" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}

// v81 — En çok bağış yapan 3 kişi (yayının sol üstü; yayıncı ve izleyiciler görür)
const MEDAL = ['🥇', '🥈', '🥉'];
export function StreamTopDonors({ top, isBlocked, className = '' }) {
  const list = (Array.isArray(top) ? top : []).filter((x) => x && !isBlocked?.(x.u)).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className={`st-top3 ${className}`}>
      {list.map((x, i) => (
        <p key={x.u}>
          <span>{MEDAL[i]}</span>
          <b>{x.n}</b>
          <i>
            <span className="gold-coin-icon" style={{ width: 10, height: 10 }} /> {fmtN(x.a)}
          </i>
        </p>
      ))}
    </div>
  );
}

// v81 — "Oyun oyna": oyun salonu ya da yarış pisti (şampiyona / bahisli / antrenman)
export function StreamPlaySheet({ onArcade, onRace, onCards, onClose }) {
  return (
    <div className="st-sheet-bg st-top-layer" onClick={onClose}>
      <div className="st-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="st-sheet-title">🎮 Yayında oyna</p>
        <p className="st-sum-why" style={{ color: '#f2ecdd' }}>
          Oynadığın oyun izleyicilerin ekranında büyük görünür, sen köşede küçük pencerede kalırsın. İnternet kafede yayındayken oyun süresi için ayrıca ödeme yapmazsın.
        </p>
        <div className="st-play-opts">
          <button onClick={onArcade}>
            <span>🕹️</span>
            <b>Oyun Salonu</b>
            <small>Uzay koşusu, tank, sumo, kafa topu…</small>
          </button>
          <button onClick={onRace}>
            <span>🏁</span>
            <b>Yarış Pisti</b>
            <small>Şampiyona · Bahisli Yarış · Antrenman</small>
          </button>
          {onCards && (
            <button onClick={onCards} className="wide">
              <span>🃏</span>
              <b>10 Numara</b>
              <small>Kart masası kur ya da bir masaya otur</small>
            </button>
          )}
        </div>
        <button className="st-btn ghost" onClick={onClose}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

const REASON = { stop: '', left: 'Odadan ayrıldığın için yayın kapandı.', stood: 'Bilgisayarın başından kalktığın için yayın kapandı.', away: 'Uygulamadan çıktığın için yayın kapandı.', afk: 'Uzun süre hareketsiz kaldığın için yayın kapandı.', gold: 'Altının bittiği için yayın kapandı.', set: 'Yayın seti kaldırıldığı için yayın kapandı.', ended: '', stale: 'Bağlantı koptuğu için yayın kapandı.' };

// cost: { cafe: bool, play: internet kafede yayın sırasında oyun cihazına ödenen }
export function StreamSummary({ summary, reason, cost = null, streamId = null, onClose }) {
  const s = summary || {};
  // v82: yayın raporunu Sixtagram'da paylaş
  const [shareOpen, setShareOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareErr, setShareErr] = useState('');
  const share = async () => {
    if (!streamId || shareBusy) return;
    setShareBusy(true);
    setShareErr('');
    try {
      await createSixtagramPost(caption.trim(), { type: 'streamReport', streamId });
      setShared(true);
      setShareOpen(false);
    } catch (e) {
      setShareErr(String(e?.message || 'Paylaşılamadı.'));
    } finally {
      setShareBusy(false);
    }
  };
  const seatFee = Number(s.paidTotal || 0);
  const playFee = Number(cost?.play || 0);
  const cafeCost = seatFee + playFee;
  const showCafe = Boolean(cost?.cafe || cafeCost > 0);
  const balance = Number(s.net || 0) - cafeCost;
  return (
    <div className="st-sheet-bg" onClick={onClose}>
      <div className="st-sheet st-sum" onClick={(e) => e.stopPropagation()}>
        <p className="st-sheet-title">📴 Yayın bitti</p>
        {REASON[reason] && <p className="st-sum-why">{REASON[reason]}</p>}
        <div className="st-sum-grid">
          <div>
            <b>{fmtDur(s.durationMs || 0)}</b>
            <small>Süre</small>
          </div>
          <div>
            <b>{fmtN(s.seen || 0)}</b>
            <small>Kişi izledi</small>
          </div>
          <div>
            <b>{fmtN(s.peak || 0)}</b>
            <small>En çok aynı anda</small>
          </div>
          <div>
            <b>{fmtN(s.donationCount || 0)}</b>
            <small>Bağış</small>
          </div>
        </div>
        <div className="st-sum-money">
          <div>
            <span>Gelen bağış</span>
            <b>{fmtN(s.donated || 0)} altın</b>
          </div>
          <div>
            <span>Vergi (%10)</span>
            <b>−{fmtN(s.tax || 0)} altın</b>
          </div>
          <div className="total">
            <span>Cebine geçen (bağış)</span>
            <b>+{fmtN(s.net || 0)} altın</b>
          </div>
        </div>
        {Array.isArray(s.top) && s.top.length > 0 && (
          <div className="st-sum-money st-sum-cost">
            <p className="st-sum-sub">🏆 En çok destekleyenler</p>
            {s.top.map((x, i) => (
              <div key={x.u}>
                <span>
                  {MEDAL[i]} {x.n}
                </span>
                <b>{fmtN(x.a)} altın</b>
              </div>
            ))}
          </div>
        )}
        {showCafe && (
          <div className="st-sum-money st-sum-cost">
            <p className="st-sum-sub">🖥️ İnternet kafe masrafı</p>
            <div>
              <span>Yayın seti ({fmtDur(s.durationMs || 0)})</span>
              <b>−{fmtN(seatFee)} altın</b>
            </div>
            {playFee > 0 && (
              <div>
                <span>Oyun süresi (cihaz)</span>
                <b>−{fmtN(playFee)} altın</b>
              </div>
            )}
            <div className="total">
              <span>Toplam masraf</span>
              <b>−{fmtN(cafeCost)} altın</b>
            </div>
            <div className={`total ${balance >= 0 ? 'pos' : 'neg'}`}>
              <span>Yayın kârı / zararı</span>
              <b>
                {balance >= 0 ? '+' : '−'}
                {fmtN(Math.abs(balance))} altın
              </b>
            </div>
          </div>
        )}
        {streamId && !shared && !shareOpen && (
          <button className="st-btn live st-share-btn" onClick={() => setShareOpen(true)}>
            📸 Raporu Sixtagram'da paylaş
          </button>
        )}
        {shareOpen && (
          <div className="st-share">
            <input className="ws-chat-input" maxLength={200} placeholder="Bir şeyler yaz… (isteğe bağlı)" value={caption} onChange={(e) => setCaption(e.target.value)} autoFocus />
            <div className="st-sheet-btns">
              <button className="st-btn ghost" disabled={shareBusy} onClick={() => setShareOpen(false)}>
                Vazgeç
              </button>
              <button className="st-btn live" disabled={shareBusy} onClick={share}>
                {shareBusy ? 'Paylaşılıyor…' : '📤 Paylaş'}
              </button>
            </div>
          </div>
        )}
        {shared && <p className="st-share-ok">✓ Yayın raporun Sixtagram'da paylaşıldı!</p>}
        {shareErr && <p className="st-host-note bad">{shareErr}</p>}
        <button className="st-btn gold" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}
