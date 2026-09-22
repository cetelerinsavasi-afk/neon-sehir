import { useState } from 'react';
import BroadcastFrame from './BroadcastFrame';
import TalkingAvatarScene from './TalkingAvatarScene';
import { useTalkingBroadcast } from '../../hooks/useTalkingBroadcast';
import { useBroadcastAudio } from '../../hooks/useBroadcastAudio';
import { INTERVIEW_LOCATION_LABELS } from '../../lib/interviewLocations';
import './InterviewPlayer.css';

// InterviewPlayer — Sixtagram RÖPORTAJ videosu (madde 1). ORTAK
// BroadcastFrame (TV çerçevesi) + TalkingAvatarScene (gerçek mekan arka
// planı + konuşan avatar) + useTalkingBroadcast (cümle cümle altyazı) +
// useBroadcastAudio (mırıltı + mekan ambiyansı) bir araya getiriliyor.
// Hem ComposeModal'daki CANLI önizlemede HEM DE akıştaki paylaşılmış
// post'ta BİREBİR AYNI bileşen kullanılıyor.
// `extra` (camii için imam/dilenci anlık verisi, bkz. PostAttachment.jsx)
// artık burada KULLANILMIYOR — KULLANICI REVİZESİ ile arka plan artık
// oyunun içindeki NPC'leri değil, sabit bir "stüdyo arka planı" gösteriyor
// (bkz. TalkingAvatarScene.jsx). Prop yine de kabul ediliyor (sunucudan
// gelen veriyi kırmamak için), sadece görselde kullanılmıyor.
export default function InterviewPlayer({ locationId, text, avatar, displayName, extra: _extra }) {
  const [muted, setMuted] = useState(true);
  const { triggerMumble } = useBroadcastAudio(locationId, { muted });
  const { currentSentence, mouthOpen, progress, elapsedSec } = useTalkingBroadcast(text, {
    onMouthToggle: triggerMumble,
  });

  return (
    <div className="interview-player">
      <BroadcastFrame
        subtitle={currentSentence}
        kicker={`📍 ${INTERVIEW_LOCATION_LABELS[locationId] || 'Röportaj'}`}
        progress={progress}
        elapsedSec={elapsedSec}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
      >
        <TalkingAvatarScene locationId={locationId} avatar={avatar} mouthOpen={mouthOpen} />
      </BroadcastFrame>
      {displayName && <p className="interview-player-name">🎤 {displayName} ile röportaj</p>}
    </div>
  );
}
