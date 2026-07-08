import { useState } from 'react';
import LotteryScreen from '../LotteryScreen/LotteryScreen';
import OnNumaraScreen from '../OnNumaraScreen/OnNumaraScreen';
import SlotScreen from '../SlotScreen/SlotScreen';
import './CasinoScreen.css';

const CARDS = [
  { id: 'onnumara', label: '10 Numara', emoji: '🃏', desc: 'Kurpiyere karşı 10\'a en yakın toplamı yap.' },
  { id: 'piyango', label: 'Piyango', emoji: '🎟️', desc: 'Bilet al, günün kurası seni seçsin.' },
  { id: 'slot', label: 'Slot', emoji: '🎰', desc: 'Günün ilk çevirmesi ücretsiz, 3 makarada şansını dene.' },
];

// Aktif bir masaya girildiğinde tam ekran gösterim App.jsx seviyesinde
// (OnNumaraFullScreen ile) yönetiliyor — bu bileşen sadece lobiyi/seçim
// ekranını gösterir.
export default function CasinoScreen({ onEnterTable }) {
  const [selected, setSelected] = useState(null);

  if (selected) {
    return (
      <div className="casino-detail">
        <button className="casino-back-btn" onClick={() => setSelected(null)}>
          ← Geri
        </button>
        {selected === 'onnumara' && <OnNumaraScreen onEnterTable={onEnterTable} />}
        {selected === 'piyango' && <LotteryScreen />}
        {selected === 'slot' && <SlotScreen />}
      </div>
    );
  }

  return (
    <div className="casino-picker">
      {CARDS.map((c) => (
        <button key={c.id} className="casino-picker-card" onClick={() => setSelected(c.id)}>
          <span className="casino-picker-emoji">{c.emoji}</span>
          <span className="casino-picker-title">{c.label}</span>
          <span className="casino-picker-desc">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
