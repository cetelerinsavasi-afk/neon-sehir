import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { streamAction } from '../../services/gameActions';
import { fmtDur, fmtN, publishThumb, useStreamChat, watchViewers } from './streamShared';
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

export function StreamHostPanel({ stream, pose, engineRef, onEnded, onStopRequest, stopping, statsRef }) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const streamId = stream?.id;
  const chat = useStreamChat(streamId, 30);
  const [viewers, setViewers] = useState(0);
  const [min, setMin] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState('');
  const seenRef = useRef(new Set());
  const viewersRef = useRef(0);
  const camRef = useRef(null);
  const seenFx = useRef(null);
  const alertTimers = useRef([]);
  useEffect(() => () => alertTimers.current.forEach(clearTimeout), []);
  const endedRef = useRef(false);

  // izleyiciler (anlık + toplam farklı kişi)
  useEffect(() => {
    if (!streamId) return undefined;
    return watchViewers(streamId, ({ count, uids }) => {
      setViewers(count);
      viewersRef.current = count;
      uids.forEach((u) => seenRef.current.add(u));
      if (statsRef) statsRef.current = { viewers: count, seen: seenRef.current.size };
    });
  }, [streamId, statsRef]);

  // nabız (kafe: dakika ücreti burada çekilir)
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

  // kendi görüntün (yayın kamerası) ~2 kez/sn + listedeki önizleme 30 sn'de bir
  useEffect(() => {
    if (!pose || min) return undefined;
    let lastThumb = 0;
    const iv = setInterval(() => {
      const cv = camRef.current;
      const eng = engineRef.current;
      if (!cv || !eng?.renderStreamView || document.hidden) return;
      if (!eng.renderStreamView(pose, cv)) return;
      const t = Date.now();
      if (t - lastThumb > THUMB_MS && user?.uid) {
        lastThumb = t;
        try {
          publishThumb(user.uid, cv.toDataURL('image/jpeg', 0.55));
        } catch {
          /* yoksay */
        }
      }
    }, 500);
    return () => clearInterval(iv);
  }, [pose, min, engineRef, user?.uid]);

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
    alertTimers.current.push(setTimeout(() => setAlerts((a) => a.filter((x) => !keys.includes(x.key))), 6500));
    return undefined;
  }, [stream?.fx, isBlocked]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await streamAction({ op: 'chat', streamId, text: t });
      setText('');
    } catch (e) {
      setErr(String(e?.message || 'Gönderilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => chat.filter((m) => !isBlocked(m.uid)).slice(-4), [chat, isBlocked]);
  const dur = fmtDur(now - Number(stream?.startedAtMs || now));
  const paidLeft = stream?.cafe ? Math.max(0, Math.ceil((Number(stream.paidUntilMs || 0) - now) / 1000)) : 0;

  return (
    <div className={`st-host${min ? ' min' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="st-host-bar" onClick={() => setMin((v) => !v)}>
        <span className="st-live">CANLI</span>
        <span>{dur}</span>
        <span>👁 {fmtN(viewers)}</span>
        <span className="st-host-gold">
          <span className="gold-coin-icon" style={{ width: 12, height: 12 }} /> {fmtN(stream?.donated || 0)}
        </span>
        {stream?.cafe && <span className="st-host-fee">💳 {fmtN(stream.price)}/dk</span>}
        <span className="st-host-tog">{min ? '▸' : '▾'}</span>
      </div>
      {!min && (
        <>
          <div className="st-host-body">
            <div className="st-host-cam">
              <canvas ref={camRef} width={144} height={252} />
              <small>Senin yayının</small>
            </div>
            <div className="st-host-chat">
              {shown.length === 0 && <p className="st-chat-empty">İzleyici mesajları burada görünür</p>}
              {shown.map((m) => (
                <p key={m.id} className={m.host ? 'host' : ''}>
                  <b>{m.name}</b> {m.text}
                </p>
              ))}
            </div>
          </div>
          <div className="st-host-row">
            <input className="ws-chat-input" maxLength={140} placeholder="İzleyicilere yaz…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="ws-chat-send" disabled={busy || !text.trim()} onClick={send}>
              ➤
            </button>
            <button className="st-btn stop" disabled={stopping} onClick={onStopRequest}>
              {stopping ? '…' : '⏹ Kapat'}
            </button>
          </div>
          {stream?.cafe && paidLeft <= 10 && <small className="st-host-note">💳 Yeni dakika birazdan çekilecek ({fmtN(stream.price)} altın)</small>}
          {err && <small className="st-host-note bad">{err}</small>}
        </>
      )}
      <div className="st-alerts host">
        {alerts.map((a) => (
          <div key={a.key} className={`st-alert${a.a >= 1000 ? ' big' : ''}`}>
            <b>
              🎁 {a.n} · {fmtN(a.a)} altın
            </b>
            {a.m && <span>“{a.m}”</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const REASON = { stop: '', left: 'Odadan ayrıldığın için yayın kapandı.', gold: 'Altının bittiği için yayın kapandı.', set: 'Yayın seti kaldırıldığı için yayın kapandı.', ended: '', stale: 'Bağlantı koptuğu için yayın kapandı.' };

export function StreamSummary({ summary, reason, onClose }) {
  const s = summary || {};
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
          {s.paidTotal > 0 && (
            <div>
              <span>Kafe yayın ücreti (ödendi)</span>
              <b>{fmtN(s.paidTotal)} altın</b>
            </div>
          )}
          <div className="total">
            <span>Cebine geçen</span>
            <b>+{fmtN(s.net || 0)} altın</b>
          </div>
        </div>
        <button className="st-btn gold" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}
