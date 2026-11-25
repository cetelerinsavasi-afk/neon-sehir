// =============================================================================
// v202 — Şehirdeki evde MÜZİK KUTUSU (sadece bu cihazda çalar)
// -----------------------------------------------------------------------------
// Eski ev ekranındaki müzik kutusu evdeki herkese aynı şarkıyı çalıyordu (ev belgesine yazma +
// dinleme). Şehirdeki 3 katlı evde hiç çalışmıyordu. Kullanıcı kararı: Firestore'a ek okuma /
// yazma olmasın — şarkı sadece seçen oyuncunun cihazında çalar. Evden çıkınca müzik durur.
// Ses: eski evin aynı parçaları (HouseScreen/houseAudio.js, cihazda üretilen müzik).
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { TRACKS, playTrack, stopMusic, unlockAudio, currentTrack } from '../HouseScreen/houseAudio';

export default function HomeJukebox({ open, inside, onClose }) {
  const [track, setTrack] = useState(null);
  const mine = useRef(false); // müziği bu kutu mu başlattı (karargahtaki müzik kutusuna dokunma)
  // evden çıkınca (ya da şehir kapanınca) müzik durur
  useEffect(() => {
    if (inside || !mine.current) return;
    mine.current = false;
    if (currentTrack() != null) stopMusic();
    setTrack(null);
  }, [inside]);
  useEffect(
    () => () => {
      if (mine.current) stopMusic();
    },
    []
  );
  if (!open) return null;
  const pick = (i) => {
    unlockAudio();
    if (i == null) {
      stopMusic();
      mine.current = false;
      setTrack(null);
      return;
    }
    playTrack(i);
    mine.current = true;
    setTrack(i);
  };
  return (
    <div className="hs-modal-bg" onClick={onClose}>
      <div className="hs-modal juke" onClick={(e) => e.stopPropagation()}>
        <div className="hs-modal-head">
          <b>🎵 Müzik Kutusu</b>
          <button className="hs-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="hs-dim">{track != null ? `Çalıyor: ${TRACKS[track]?.title}` : 'Şu an müzik kapalı.'} Şarkı sadece senin cihazında çalar.</p>
        {TRACKS.map((t) => (
          <button key={t.index} className={`juke-pick${track === t.index ? ' on' : ''}`} style={{ '--ta': t.color }} onClick={() => pick(t.index)}>
            <b>{t.title}</b>
            <span>{t.mood}</span>
          </button>
        ))}
        <div className="hh-modal-row">
          <button className="hs-btn ghost" onClick={() => pick(null)} disabled={track == null}>
            ⏹ Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
