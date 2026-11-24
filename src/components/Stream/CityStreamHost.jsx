// =============================================================================
// v196 — ŞEHİRDE CANLI YAYIN (oyunun internet kafesi + kişisel ev)
// -----------------------------------------------------------------------------
// HouseScreen'deki yayının şehir karşılığı: başlık → koltuğa otur → yayın; tam ekran yayıncı paneli
// (sohbet, izleyenler, bağışlar, nabız / kafe dakika ücreti, AFK), "🎮 Oyna" ile oyun salonu
// (oyun izleyicilerin ekranında büyük, yayın kamerası köşede), koltuktan kalkınca / mekândan çıkınca
// yayın kapanır, sonunda özet. Kamera görüntüsü şehir motorundan (renderStreamView, oda koordinatı).
// İzleyici sahnesi: StreamScene (stream.city → yayıncı koltukta; evde sadece yayının katı).
// =============================================================================
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { streamAction } from '../../services/gameActions';
import { StreamStartSheet, StreamHostPanel, StreamSummary } from './StreamHost';
import { streamBroadcast, clearGameFrame, closeStreamChannel, streamPose, streamSetOf, useStreamDoc } from './streamShared';
import './Stream.css';

const ArcadeHub = lazy(() => import('../Arcade/ArcadeHub'));
const LEAVE_R = 2.2; // koltuktan bu kadar uzaklaşınca yayın kapanır

export const streamErrText = (e) => {
  const m = String(e?.message || '');
  if (m === 'gold') return '💰 Altının yetmiyor.';
  if (m === 'no-set') return '🎮 Yayın için Oyuncu Koltuğu ve yanında (aynı katta) Oyuncu Bilgisayarı gerekli.';
  if (m === 'seat-busy') return '🔴 Bu koltukta zaten canlı yayın var.';
  if (m === 'not-owner') return '🔒 Sadece kendi evinde ya da internet kafede yayın açabilirsin.';
  if (m.startsWith('price-changed')) return '💲 Yayın ücreti değişti, tekrar dene.';
  return m || 'Yayın açılamadı.';
};

// eng: şehir motoru · room: 'ev' | 'netkafe' · items: odadaki eşyalar (koltuk + bilgisayar) · chairId
export default function CityStreamHost({ eng, houseId, room, items, chairId, price = 0, onClose, flash }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('ask'); // ask | live | sum
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null); // { id }
  const [sum, setSum] = useState(null);
  const [arcade, setArcade] = useState(false);
  const statsRef = useRef({ viewers: 0, seen: 0 });
  const liveRef = useRef(null);
  liveRef.current = live;
  const doc = useStreamDoc(live?.id || null);
  const set = useMemo(() => streamSetOf(items, chairId), [items, chairId]);
  const pose = useMemo(() => {
    if (!set) return null;
    const p = streamPose(items, chairId, set.pc.i);
    return p ? { ...p, room } : null;
  }, [items, chairId, set, room]);
  const engineRef = useRef(null);
  engineRef.current = {
    renderStreamView: (p, cv) => eng?.renderStreamView?.(p, cv) || false,
    say: (_uid, t) => eng?.say?.(t),
    setLiveBadge: (_uid, text) => eng?.setLiveBadge?.(text),
  };

  const endLocal = useCallback((summary, reason) => {
    clearGameFrame();
    if (streamBroadcast.uid) closeStreamChannel(streamBroadcast.uid);
    streamBroadcast.uid = null;
    streamBroadcast.streamId = null;
    document.body.classList.remove('ns-streaming');
    setArcade(false);
    setLive(null);
    if (summary) {
      setSum({ summary, reason, streamId: liveRef.current?.id || null });
      setPhase('sum');
    } else onClose?.();
  }, [onClose]);
  const stop = useCallback(async (reason = 'stop') => {
    const st = liveRef.current;
    if (!st) return;
    liveRef.current = null;
    setBusy(true);
    clearGameFrame();
    try {
      const r = await streamAction({ op: 'stop', streamId: st.id, viewers: statsRef.current.viewers, seen: statsRef.current.seen });
      endLocal(r?.data?.summary || r?.summary || null, reason);
    } catch {
      endLocal(null, reason);
    } finally {
      setBusy(false);
    }
  }, [endLocal]);

  const start = async (title) => {
    if (busy) return;
    if (!set) {
      flash?.(streamErrText({ message: 'no-set' }));
      onClose?.();
      return;
    }
    setBusy(true);
    try {
      eng?.sit?.('near'); // koltuğa otur
      const r = await streamAction({ op: 'start', houseId, chairId, title, expect: price });
      const d = r?.data || r;
      streamBroadcast.uid = user?.uid || null;
      streamBroadcast.streamId = d.streamId;
      document.body.classList.add('ns-streaming');
      setLive({ id: d.streamId });
      setPhase('live');
      flash?.(d.charged ? `🔴 Yayındasın! −${Number(d.charged).toLocaleString('tr-TR')} altın (1 dk)` : '🔴 Yayındasın!');
    } catch (e) {
      flash?.(streamErrText(e));
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  // v199: yayındayken ana ekran izleyicilerin gördüğü açıdan (yayın kamerası) — eski evdeki gibi
  useEffect(() => {
    if (phase !== 'live' || !pose || !eng?.setStreamCam) return undefined;
    eng.setStreamCam(pose);
    return () => eng.setStreamCam(null);
  }, [phase, pose, eng]);

  // koltuktan kalkınca / mekândan çıkınca yayın kapanır
  useEffect(() => {
    if (phase !== 'live' || !set) return undefined;
    const iv = setInterval(() => {
      if (arcade) return; // oyun açıkken oyuncu yerinden oynamaz
      const lp = eng?.venueLocal?.();
      const vt = eng?.venueType?.();
      if (!lp || vt !== room || Math.hypot(lp.x - set.chair.x, lp.z - set.chair.z) > LEAVE_R) stop('stood');
    }, 700);
    return () => clearInterval(iv);
  }, [phase, set, eng, room, stop, arcade]);
  // ekran kapanırsa (mekândan çıkış, sayfa) yayın kapanır
  useEffect(() => () => {
    if (liveRef.current) {
      const id = liveRef.current.id;
      liveRef.current = null;
      streamAction({ op: 'stop', streamId: id, viewers: statsRef.current.viewers, seen: statsRef.current.seen }).catch(() => {});
      clearGameFrame();
      if (streamBroadcast.uid) closeStreamChannel(streamBroadcast.uid);
      streamBroadcast.uid = null;
      streamBroadcast.streamId = null;
      document.body.classList.remove('ns-streaming');
    }
  }, []);

  if (phase === 'ask') return <StreamStartSheet cafePrice={price} busy={busy} onStart={start} onCancel={() => onClose?.()} />;
  if (phase === 'sum' && sum) return <StreamSummary summary={sum.summary} reason={sum.reason} streamId={sum.streamId} onClose={() => onClose?.()} />;
  return (
    <>
      {live && doc && (
        <StreamHostPanel
          stream={doc}
          pose={pose}
          engineRef={engineRef}
          statsRef={statsRef}
          stopping={busy}
          onStopRequest={stop}
          onEnded={endLocal}
          onPlay={() => setArcade(true)}
          compact={arcade}
        />
      )}
      {arcade && (
        <Suspense fallback={null}>
          <ArcadeHub onClose={() => setArcade(false)} />
        </Suspense>
      )}
    </>
  );
}
