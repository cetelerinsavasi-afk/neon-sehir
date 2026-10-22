import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { enterInterior, enterPark, recordVenueVisit } from '../../services/gameActions';
import { venueTo2d } from '../../../functions/venueLayouts.js';
import { CamiiPart, BankaPart, GazinoPart, KarakolPart, GaleriPart, SilahPart, ModifiyePart, ParkPart, BelediyePart } from './venueParts';
import '../../styles/worldScreenChrome.css';
import './Venue3D.css';

// =============================================================================
// v92 Faz 8 — Oyunun 3D mekânları (Camii, Banka, Gazino, Karakol, Galeri,
// Silahçı, Modifiye, Park). HouseScreen'in üstünde çalışan katman:
//   • eski 2D mekânın konum kaydını (interiorPresence / parkPresence) taze
//     tutar → sunucudaki "mekânda mı" kontrolleri, ısmarlama, ziyaret ve
//     "kaç kişi var" sayaçları aynen çalışır;
//   • NPC'leri (veznedar, barmen, memur…) motora verir, sırayla konuşturur;
//   • istasyon butonlarından (Mihrap → İbadet, Vezne → Banka…) ve NPC'ye
//     dokunmaktan mekânın kendi panellerini açar (eski 2D mekândaki
//     panellerin aynısı).
// =============================================================================

const PARTS = {
  camii: CamiiPart,
  banka: BankaPart,
  gazino: GazinoPart,
  karakol: KarakolPart,
  araba_galerisi: GaleriPart,
  silah_magazasi: SilahPart,
  modifiye_garaji: ModifiyePart,
  park: ParkPart,
  belediye: BelediyePart,
};

const npcToOther = (n) => ({
  uid: n.id,
  displayName: n.name,
  avatar: n.av,
  x: n.x,
  z: n.z,
  left: !!n.left,
  seat: n.seat || null,
  holdingVisible: null,
});

export default function VenueLayer({ venue, engineRef, interact, mode, onNpcs, apiRef, onOpenHeist, flash }) {
  const { user } = useAuth();
  const [panel, setPanel] = useState(null);
  const [dynNpcs, setDynNpcs] = useState([]); // imam, dilenciler (gerçek oyuncular NPC olarak)
  const pendingRef = useRef(null); // NPC'ye dokunulunca: varınca açılacak istasyon
  const sayHookRef = useRef(null); // parçanın konuşma satırı ezmesi (ör. banka sıra çağrısı)
  const Part = PARTS[venue.key];

  const npcs = useMemo(() => [...(venue.npcs || []), ...dynNpcs], [venue.npcs, dynNpcs]);
  const npcsRef = useRef(npcs);
  useEffect(() => {
    npcsRef.current = npcs;
    onNpcs?.(npcs.map(npcToOther));
  }, [npcs, onNpcs]);

  // --- eski konum kaydı (sunucu kontrolleri için) — giriş + 30 sn nabız + çıkışta sil
  useEffect(() => {
    if (!user) return undefined;
    const coll = venue.loc === 'park' ? 'parkPresence' : 'interiorPresence';
    let alive = true;
    let ready = false;
    const beat = () => {
      if (!alive || !ready || document.hidden) return;
      const st = engineRef.current?.getSelfState?.();
      const p = venueTo2d(Number(st?.x ?? 5), Number(st?.z ?? 3.8));
      setDoc(doc(db, coll, user.uid), { x: p.x, y: p.y, facing: 'down', pose: 'idle', seat: null, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    };
    (venue.loc === 'park' ? enterPark() : enterInterior(venue.loc))
      .then(() => {
        ready = true;
        beat();
      })
      .catch(() => {});
    recordVenueVisit(venue.loc).catch(() => {});
    const iv = setInterval(beat, 30_000);
    const onVis = () => !document.hidden && beat();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      deleteDoc(doc(db, coll, user.uid)).catch(() => {});
    };
  }, [user, venue.loc, engineRef]);

  // --- NPC'ler sırayla konuşur (her 6 sn'de bir kişi)
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (document.hidden) return;
      const list = npcsRef.current.filter((n) => n.lines?.length);
      if (!list.length) return;
      const n = list[i % list.length];
      i += 1;
      const over = sayHookRef.current?.(n);
      const line = over || n.lines[Math.floor(Math.random() * n.lines.length)];
      engineRef.current?.say(n.id, line);
    }, 6000);
    return () => clearInterval(iv);
  }, [engineRef]);

  // --- NPC'ye dokununca istasyonuna yürü, varınca paneli aç
  const firstAct = useCallback((stationId) => venue.stations?.[stationId]?.[0]?.act || null, [venue.stations]);
  useEffect(() => {
    const p = pendingRef.current;
    if (!p || !interact || interact.id !== p.station) return;
    pendingRef.current = null;
    setPanel(p.act);
  }, [interact]);
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      open: (act) => setPanel(act),
      npcTap: (uid) => {
        const n = npcsRef.current.find((x) => x.id === uid);
        if (!n) return false;
        if (mode !== 'walk') return true;
        const act = n.act || firstAct(n.station);
        if (n.station && act) {
          if (interact?.id === n.station) setPanel(act);
          else if (engineRef.current?.approach(n.station)) pendingRef.current = { station: n.station, act };
          else setPanel(act);
        } else if (n.lines?.length) {
          engineRef.current?.say(n.id, n.lines[Math.floor(Math.random() * n.lines.length)]);
        }
        return true;
      },
    };
    if (import.meta.env?.DEV) window.__venueApi = apiRef.current; // sadece önizleme/test
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, engineRef, firstAct, interact, mode]);

  if (!Part) return null;
  return (
    <Part
      venue={venue}
      panel={panel}
      setPanel={setPanel}
      setDynNpcs={setDynNpcs}
      sayHookRef={sayHookRef}
      engineRef={engineRef}
      onOpenHeist={onOpenHeist}
      flash={flash}
      walk={mode === 'walk'}
    />
  );
}
