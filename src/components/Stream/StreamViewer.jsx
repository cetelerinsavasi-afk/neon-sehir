import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBlocks } from '../../contexts/BlocksContext';
import { useBackClose } from '../../lib/backStack';
import { streamAction } from '../../services/gameActions';
import StreamScene from './StreamScene';
import StreamGameView from './StreamGameView';
import StreamRaceView from './StreamRaceView';
import { ALERT_MS } from './StreamHost';
import { DONATION_AMOUNTS, DONATION_DAILY_CAP, STREAM_STALE_MS, fmtDur, fmtN, joinViewers, useStreamChat, useStreamDoc, watchGameFrames, watchViewers } from './streamShared';
import '../../styles/worldScreenChrome.css';
import './Stream.css';

// =============================================================================
// v80 — İZLEYİCİ EKRANI (TikTok/Instagram canlı yayını gibi): üstte yayın
// (kamera görüntüsü; oyun oynanıyorsa oyun büyük, kamera köşede), altta sohbet
// (son birkaç mesaj görünür, dokununca hepsi), 🎁 bağış (10 / 100 / 1000 + kısa not).
// =============================================================================
const errText = (e) => {
  const m = String(e?.message || '');
  if (m === 'gold') return 'Altının yetmiyor.';
  if (m.startsWith('cap:')) return `Bu yayıncıya bugün en fazla ${fmtN(m.split(':')[1])} altın daha atabilirsin.`;
  if (m === 'ended') return 'Yayın sona erdi.';
  if (m === 'self') return 'Kendine bağış atamazsın.';
  return m || 'Olmadı, tekrar dene.';
};

export default function StreamViewer({ streamId, onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { isBlocked } = useBlocks();
  const s = useStreamDoc(streamId);
  const chat = useStreamChat(streamId, 40);
  const [viewers, setViewers] = useState(0);
  const [openChat, setOpenChat] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [donOpen, setDonOpen] = useState(false);
  const [donAmt, setDonAmt] = useState(null);
  const [donNote, setDonNote] = useState('');
  const [toast, setToast] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [gameOn, setGameOn] = useState(false);
  const [gameKind, setGameKind] = useState('arcade'); // arcade | race
  const [bubble, setBubble] = useState(null); // yayıncının mesajı → avatarının üstünde konuşma balonu
  const seenHostMsg = useRef(null);
  const frameRef = useRef(null);
  const seenFx = useRef(null);
  const alertTimers = useRef([]);
  const toastTimer = useRef(0);
  useEffect(() => () => alertTimers.current.forEach(clearTimeout), []);
  const chatEndRef = useRef(null);
  useBackClose(true, () => (donOpen ? setDonOpen(false) : openChat ? setOpenChat(false) : onClose()));

  const live = s && s.status === 'live' && Date.now() - Number(s.lastBeatMs || 0) < STREAM_STALE_MS + 30_000;
  const isHost = s?.uid === user?.uid;

  // izleyici olarak katıl + sayıyı dinle
  useEffect(() => {
    if (!streamId || !user || isHost) return undefined;
    return joinViewers(streamId, user.uid);
  }, [streamId, user, isHost]);
  useEffect(() => (streamId ? watchViewers(streamId, ({ count }) => setViewers(count)) : undefined), [streamId]);

  // yayında oyun var mı (oyun salonu ya da yarış)
  // v81: tazelik artık karenin GELİŞ anına göre ölçülür — eskiden yayıncının
  // saatiyle (f.at) karşılaştırılıyordu; iki cihazın saati birkaç saniye farklıysa
  // oyun izleyicide hiç görünmüyordu.
  useEffect(() => {
    if (!s?.uid) return undefined;
    let timer = 0;
    let first = true;
    const off = watchGameFrames(s.uid, (f) => {
      frameRef.current = f;
      // ilk okumada (yayına sonradan girildi) kabaca bayatlık kontrolü, sonra her yeni kare canlıdır
      const fresh = Boolean(f && (!first || Math.abs(Date.now() - Number(f.at || 0)) < 60_000));
      first = false;
      setGameOn(fresh);
      if (f) setGameKind(f.g === 'race' ? 'race' : 'arcade');
      clearTimeout(timer);
      if (fresh) timer = setTimeout(() => setGameOn(false), 4000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [s?.uid]);

  // gelen bağışlar: ekranda birkaç saniye
  useEffect(() => {
    const fx = Array.isArray(s?.fx) ? s.fx : [];
    if (seenFx.current === null) {
      seenFx.current = new Set(fx.map((e) => `${e.at}|${e.u}`));
      return;
    }
    const fresh = fx.filter((e) => !seenFx.current.has(`${e.at}|${e.u}`));
    fresh.forEach((e) => seenFx.current.add(`${e.at}|${e.u}`));
    if (!fresh.length) return;
    setAlerts((a) => [...a, ...fresh.filter((e) => !isBlocked(e.u)).map((e) => ({ ...e, key: `${e.at}|${e.u}` }))].slice(-3));
    // zamanlayıcı efekt temizliğine bağlı DEĞİL (belge her nabızda yenilenir)
    const keys = fresh.map((e) => `${e.at}|${e.u}`);
    alertTimers.current.push(setTimeout(() => setAlerts((a) => a.filter((x) => !keys.includes(x.key))), ALERT_MS));
    return undefined;
  }, [s?.fx, isBlocked]);

  // v81: yayıncının yazdıkları sahnede avatarının üstünde konuşma balonu olur
  useEffect(() => {
    const hostMsgs = chat.filter((m) => m.host);
    if (seenHostMsg.current === null) {
      if (chat.length || s) seenHostMsg.current = new Set(hostMsgs.map((m) => m.id));
      return;
    }
    const fresh = hostMsgs.filter((m) => !seenHostMsg.current.has(m.id));
    fresh.forEach((m) => seenHostMsg.current.add(m.id));
    const last = fresh[fresh.length - 1];
    if (last) setBubble({ uid: last.uid, text: last.text, key: last.id });
  }, [chat, s]);

  useEffect(() => {
    if (openChat) chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, openChat]);

  const flash = (t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await streamAction({ op: 'chat', streamId, text: t });
      setText('');
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const donate = async () => {
    if (!donAmt || busy) return;
    setBusy(true);
    try {
      const r = await streamAction({ op: 'donate', streamId, amount: donAmt, note: donNote.trim() });
      flash(`🎁 ${fmtN(donAmt)} altın gönderildi! (bugün kalan: ${fmtN(r.left)})`);
      setDonOpen(false);
      setDonAmt(null);
      setDonNote('');
    } catch (e) {
      flash(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const visibleChat = useMemo(() => chat.filter((m) => !isBlocked(m.uid)), [chat, isBlocked]);
  const shownChat = openChat ? visibleChat : visibleChat.slice(-3);
  const gold = Number(player?.gold || 0);

  return (
    <div className="st-root" onClick={(e) => e.stopPropagation()}>
      <div className={`st-stage${gameOn ? ' gaming' : ''}`}>
        {s && s.houseId && live && <StreamScene houseId={s.houseId} chairId={s.chairId} pcId={s.pcId} bubble={bubble} className={gameOn ? 'pip' : ''} />}
        {gameOn && live && (gameKind === 'race' ? <StreamRaceView frameRef={frameRef} /> : <StreamGameView frameRef={frameRef} />)}
        <div className="st-top">
          <div className="st-who">
            <span className="st-ava">{String(s?.name || '?').slice(0, 1).toUpperCase()}</span>
            <span className="st-who-txt">
              <b>{s?.name || 'Yayın'}</b>
              <small>{s?.title || ''}</small>
            </span>
          </div>
          {live && <span className="st-live">CANLI</span>}
          <span className="st-eye">👁 {fmtN(viewers)}</span>
          <button className="st-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        {live && s?.houseName && (
          <div className="st-place">
            📍 {s.houseName}
            {s.startedAtMs ? ` · ${fmtDur(Date.now() - s.startedAtMs)}` : ''}
          </div>
        )}
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
        {!live && s && (
          <div className="st-ended">
            <p>📴 Yayın sona erdi</p>
            {s.summary && (
              <small>
                {fmtDur(s.summary.durationMs)} sürdü · {fmtN(s.summary.seen)} kişi izledi
              </small>
            )}
            <button className="st-btn" onClick={onClose}>
              Kapat
            </button>
          </div>
        )}
        {!s && <div className="st-ended">Yükleniyor…</div>}
      </div>

      <div className={`st-chat${openChat ? ' open' : ''}`} onClick={() => !openChat && setOpenChat(true)}>
        {openChat && (
          <div className="st-chat-head">
            <b>💬 Sohbet</b>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenChat(false);
              }}
            >
              ▾
            </button>
          </div>
        )}
        <div className="st-chat-list">
          {shownChat.length === 0 && <p className="st-chat-empty">İlk mesajı sen yaz 👋</p>}
          {shownChat.map((m) => (
            <p key={m.id} className={m.host ? 'host' : ''}>
              <b>{m.host ? `🎥 ${m.name}` : m.name}</b> {m.text}
            </p>
          ))}
          <span ref={chatEndRef} />
        </div>
        {!openChat && visibleChat.length > 3 && <small className="st-chat-more">Tümünü görmek için dokun</small>}
      </div>

      {donOpen && live && !isHost && (
        <div className="st-don">
          <p className="st-don-title">🎁 Bağış gönder</p>
          <div className="st-don-amts">
            {DONATION_AMOUNTS.map((a) => (
              <button key={a} className={donAmt === a ? 'on' : ''} disabled={gold < a} onClick={() => setDonAmt(a)}>
                <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmtN(a)}
              </button>
            ))}
          </div>
          {donAmt && (
            <>
              <input className="ws-chat-input" maxLength={80} placeholder="Kısa bir not yaz (isteğe bağlı)" value={donNote} onChange={(e) => setDonNote(e.target.value)} />
              <button className="st-btn gold" disabled={busy} onClick={donate}>
                {busy ? 'Gönderiliyor…' : `${fmtN(donAmt)} altın gönder`}
              </button>
            </>
          )}
          <small>Bir yayıncıya günde en fazla {fmtN(DONATION_DAILY_CAP)} altın. Cebinde {fmtN(gold)} altın var.</small>
        </div>
      )}

      {live && (
        <div className="ws-chat-row st-input">
          <input className="ws-chat-input" maxLength={140} placeholder="Yayına yaz…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="ws-chat-send" disabled={busy || !text.trim()} onClick={send}>
            Gönder
          </button>
          {!isHost && (
            <button className={`st-gift${donOpen ? ' on' : ''}`} onClick={() => setDonOpen((v) => !v)} aria-label="Bağış">
              🎁
            </button>
          )}
        </div>
      )}
      {toast && <div className="st-toast">{toast}</div>}
    </div>
  );
}
