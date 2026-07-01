import { useState } from 'react';
import { chooseProfession } from '../../services/gameActions';
import './ProfessionPicker.css';

const PROFESSIONS = [
  { id: 'isci', label: 'İşçi', desc: 'Fabrikada günde 1 kez çalış, 100 altın kazan.' },
  { id: 'uretici', label: 'Üretici', desc: 'Üretim makineleri satın al, günlük malzeme üret.' },
  { id: 'polis', label: 'Polis', desc: 'Günlük 500 altın maaş. Silah sahibi olmak ve şüphe %0 gerekir.' },
];

export default function ProfessionPicker({ currentProfession }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const handlePick = async (professionId) => {
    setPending(professionId);
    setError(null);
    try {
      await chooseProfession(professionId);
    } catch (err) {
      setError(err.message || 'Meslek değiştirilemedi.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="profession-picker">
      <p className="profession-picker-current">
        Mevcut meslek:{' '}
        <strong>
          {PROFESSIONS.find((p) => p.id === currentProfession)?.label || 'Yok'}
        </strong>
      </p>
      {PROFESSIONS.map((p) => (
        <button
          key={p.id}
          className={`profession-card${currentProfession === p.id ? ' active' : ''}`}
          onClick={() => handlePick(p.id)}
          disabled={pending !== null || currentProfession === p.id}
        >
          <span className="profession-card-label">{p.label}</span>
          <span className="profession-card-desc">{p.desc}</span>
          {pending === p.id && <span className="profession-card-loading">…</span>}
        </button>
      ))}
      {error && <p className="profession-picker-error">{error}</p>}
    </div>
  );
}
