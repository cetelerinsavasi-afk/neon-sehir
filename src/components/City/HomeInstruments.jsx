import { lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { claimPiano, releasePiano, watchPiano } from '../Piano/pianoNet';
import { drumKey } from '../Piano/DrumPanel';
import { playPianoKey } from '../Piano/pianoSynth';
import { hitDrum } from '../../lib/songEngine';
import { getVolume } from '../HouseScreen/houseAudio';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import '../Piano/Piano.css';

// =============================================================================
// v198 — ŞEHİRDEKİ EVİN ÇALGILARI VE STÜDYOSU
// v196'da evler şehre taşınınca eski ev ekranındaki (HouseScreen) piyano / davul / mikser
// eylemleri şehre gelmemişti. Burada aynı altyapı kullanılır:
//   • piyano / davul: tabureye oturunca "Çal" — aynı anda tek kişi çalar, evdeki herkes duyar
//     (Realtime Database `piano/{evKimliği}`; Firestore okuması / yazması YOK)
//   • mikser konsolu (müzik yap) / tuval (resim): sadece ev sahibine, ücretsiz (sunucu: venue.js mixStart)
// apiRef.open(zone) — CityScreen'in etkileşim düğmesinden
// =============================================================================
const PianoPanel = lazy(() => import('../Piano/PianoPanel'));
const DrumPanel = lazy(() => import('../Piano/DrumPanel'));
const StudioScreen = lazy(() => import('../HomeOffice/StudioScreen'));
const PaintStudio = lazy(() => import('../HomeOffice/MinuteStudios').then((m) => ({ default: m.PaintStudio })));

const vol = () => 0.5 * (Number(getVolume?.()) || 0.6);

export default function HomeInstruments({ apiRef, homeId, items, user, name, flash, inside }) {
  const [open, setOpen] = useState(null); // { kind: 'piano'|'drums'|'mixer'|'easel', local }
  const [player, setPlayer] = useState(null); // { name, kind } başkası çalıyorsa
  const busyRef = useRef(false);
  const me = user ? { uid: user.uid, name } : null;
  const hasPiano = inside && (items || []).some((it) => it.k === 'piano' && it.p === 1);
  const hasDrums = inside && (items || []).some((it) => it.k === 'drums' && it.p === 1);

  // başkasının çaldığı notalar (sadece evin içindeyken ve evde çalgı varsa dinlenir)
  useEffect(() => {
    if (!hasPiano || !homeId || !user) return undefined;
    return watchPiano(homeId, ({ player: pl, note }) => {
      setPlayer(pl && pl.uid !== user.uid ? { name: pl.name, kind: 'piano' } : (p) => (p?.kind === 'piano' ? null : p));
      if (note && note.uid !== user.uid) playPianoKey(Number(note.k), vol());
    });
  }, [hasPiano, homeId, user]);
  useEffect(() => {
    if (!hasDrums || !homeId || !user) return undefined;
    return watchPiano(drumKey(homeId), ({ player: pl, note }) => {
      setPlayer(pl && pl.uid !== user.uid ? { name: pl.name, kind: 'drums' } : (p) => (p?.kind === 'drums' ? null : p));
      if (note && note.uid !== user.uid) hitDrum(Number(note.k), vol());
    });
  }, [hasDrums, homeId, user]);

  // evden çıkınca / panel kapanınca çalma hakkı bırakılır
  const close = () => {
    if (open && user && homeId) {
      if (open.kind === 'piano') releasePiano(homeId, user.uid).catch(() => {});
      if (open.kind === 'drums') releasePiano(drumKey(homeId), user.uid).catch(() => {});
      // mikser / tuval: kendi bileşenleri kapanırken netLeave gönderir
    }
    setOpen(null);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!inside && open) closeRef.current();
  }, [inside, open]);
  useEffect(() => () => closeRef.current(), []);

  useImperativeHandle(
    apiRef,
    () => ({
      async open(z) {
        if (!user || !homeId || busyRef.current) return;
        busyRef.current = true;
        try {
          if (z.kind === 'homeInstr') {
            const key = z.instr === 'drums' ? drumKey(homeId) : homeId;
            const c = await claimPiano(key, me);
            if (!c.ok) {
              flash?.(`${z.instr === 'drums' ? '🥁 Davul' : '🎹 Piyano'} dolu — şu an ${c.holder?.name || 'başka biri'} çalıyor.`);
              return;
            }
            setOpen({ kind: z.instr, local: Boolean(c.local) });
          } else if (z.kind === 'homeStudio') {
            await shopAction({ op: 'netStart', houseId: homeId, itemId: z.itemId, expect: 0 });
            setOpen({ kind: z.studio });
          }
        } catch (err) {
          const m = String(err?.message || '');
          flash?.(m === 'device-full' ? 'Dolu, biraz sonra tekrar dene.' : bizErrText(err));
        } finally {
          busyRef.current = false;
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, homeId, name, flash]
  );

  return (
    <>
      {player && !open && inside && (
        <div className="pn-listen">
          <span className="pn-notes">{player.kind === 'drums' ? '🥁' : '🎹'} ♪</span>
          <b>
            {player.name} {player.kind === 'drums' ? 'davul' : 'piyano'} çalıyor
          </b>
        </div>
      )}
      <Suspense fallback={null}>
        {open?.kind === 'piano' && me && <PianoPanel houseId={homeId} local={open.local} me={me} onClose={close} />}
        {open?.kind === 'drums' && me && <DrumPanel houseId={homeId} local={open.local} me={me} onClose={close} />}
        {open?.kind === 'mixer' && <StudioScreen houseId={homeId} price={0} isOwner flash={flash} onClose={close} />}
        {open?.kind === 'easel' && <PaintStudio houseId={homeId} price={0} isOwner flash={flash} onClose={close} />}
      </Suspense>
    </>
  );
}
