import { useEffect, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { setFutbolLineup } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolKadro.css';

const FORMATIONS = {
  '2-2-1': { GK: 1, DEF: 2, MID: 2, FWD: 1 },
  '2-1-2': { GK: 1, DEF: 2, MID: 1, FWD: 2 },
  '3-1-1': { GK: 1, DEF: 3, MID: 1, FWD: 1 },
  '1-2-2': { GK: 1, DEF: 1, MID: 2, FWD: 2 },
  '1-3-1': { GK: 1, DEF: 1, MID: 3, FWD: 1 },
  '1-1-3': { GK: 1, DEF: 1, MID: 1, FWD: 3 },
};
const TACTICS = [
  { id: 'defansif', label: 'Defansif' },
  { id: 'dengeli', label: 'Dengeli' },
  { id: 'ofansif', label: 'Ofansif' },
];
const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
// Sahada yukarıdan aşağıya gösterim sırası (forvet rakip kaleye yakın üstte).
const ROW_ORDER = ['FWD', 'MID', 'DEF', 'GK'];

function buildSlots(formation, lineup, players) {
  const need = FORMATIONS[formation];
  const byId = {};
  players.forEach((p) => (byId[p.id] = p));
  const slots = {};
  ROW_ORDER.forEach((pos) => {
    slots[pos] = Array.from({ length: need[pos] }, () => null);
  });
  // Mevcut lineup'ı, pozisyonu tutan slotlara sırayla yerleştir.
  (lineup || []).forEach((id) => {
    const player = byId[id];
    if (!player || !slots[player.position]) return;
    const idx = slots[player.position].findIndex((s) => s === null);
    if (idx !== -1) slots[player.position][idx] = id;
  });
  return slots;
}

export default function FutbolKadro({ team }) {
  const { players } = useFutbolTeamPlayers(team.id);
  const [formation, setFormation] = useState(team.formation || '2-2-1');
  const [tactic, setTactic] = useState(team.tactic || 'dengeli');
  const [slots, setSlots] = useState({});
  const [pickerFor, setPickerFor] = useState(null); // { position, slotIndex }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setFormation(team.formation || '2-2-1');
    setTactic(team.tactic || 'dengeli');
  }, [team.id]);

  useEffect(() => {
    if (players.length > 0) {
      setSlots(buildSlots(formation, team.lineup, players));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length, team.id]);

  const changeFormation = (f) => {
    const flatCurrent = Object.values(slots).flat().filter(Boolean);
    setFormation(f);
    setSlots(buildSlots(f, flatCurrent, players));
  };

  const usedPlayerIds = new Set(Object.values(slots).flat().filter(Boolean));

  const assignPlayer = (position, slotIndex, playerId) => {
    setMessage('');
    setSlots((prev) => {
      const next = { ...prev, [position]: [...prev[position]] };
      next[position][slotIndex] = playerId;
      return next;
    });
    setPickerFor(null);
  };

  const clearSlot = (position, slotIndex) => {
    setSlots((prev) => {
      const next = { ...prev, [position]: [...prev[position]] };
      next[position][slotIndex] = null;
      return next;
    });
  };

  const flatLineup = Object.values(slots).flat().filter(Boolean);
  const totalNeeded = Object.values(FORMATIONS[formation]).reduce((a, b) => a + b, 0);
  const isComplete = flatLineup.length === totalNeeded;

  const handleSave = async () => {
    setBusy(true);
    setMessage('');
    try {
      await setFutbolLineup(team.id, formation, tactic, flatLineup);
      setMessage('Kaydedildi ✓');
    } catch (err) {
      setMessage(err?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const playersById = {};
  players.forEach((p) => (playersById[p.id] = p));

  return (
    <div className="futbol-kadro">
      <p className="futbol-kadro-section-title">Dizilim</p>
      <div className="futbol-kadro-chip-row">
        {Object.keys(FORMATIONS).map((f) => (
          <button
            key={f}
            className={`futbol-kadro-chip ${formation === f ? 'active' : ''}`}
            onClick={() => changeFormation(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <p className="futbol-kadro-section-title">Taktik</p>
      <div className="futbol-kadro-chip-row">
        {TACTICS.map((t) => (
          <button
            key={t.id}
            className={`futbol-kadro-chip ${tactic === t.id ? 'active' : ''}`}
            onClick={() => setTactic(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="futbol-pitch-big">
        {ROW_ORDER.map((pos) => (
          <div key={pos} className="futbol-pitch-row">
            {(slots[pos] || []).map((playerId, idx) => {
              const player = playerId ? playersById[playerId] : null;
              return (
                <button
                  key={idx}
                  className="futbol-pitch-slot"
                  onClick={() => setPickerFor({ position: pos, slotIndex: idx })}
                >
                  <FutbolPlayerAvatar playerId={playerId || `${pos}-${idx}-empty`} position={pos} size={46} />
                  {player ? (
                    <span className="futbol-pitch-slot-info">
                      <strong>{player.name.split(' ')[0]}</strong>
                      {player.age}y · {player.power.toFixed(0)}g · {Math.round(player.form)}f
                    </span>
                  ) : (
                    <span className="futbol-pitch-slot-info futbol-pitch-slot-empty">
                      {POSITION_LABELS[pos]} seç
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!isComplete && (
        <p className="futbol-admin-error">
          {flatLineup.length}/{totalNeeded} oyuncu seçildi — kaydetmeden önce tüm slotları doldur.
        </p>
      )}
      {message && <p className="futbol-placeholder">{message}</p>}
      <button className="futbol-admin-submit" disabled={busy || !isComplete} onClick={handleSave}>
        {busy ? '...' : 'Kadroyu Kaydet'}
      </button>
      <p className="futbol-placeholder futbol-kadro-note">
        Not: seçtiğin oyunculardan biri formu %50&apos;nin altına düşerse, o
        maç için otomatik olarak 2-2-1 / dengeli / en formda kadroya geri
        dönülür. Antrenmandaki oyuncular ilk 11&apos;e seçilemez.
      </p>

      {pickerFor && (
        <PlayerPicker
          position={pickerFor.position}
          players={players.filter(
            (p) => p.position === pickerFor.position && !(team.trainingPlayerIds || []).includes(p.id)
          )}
          usedPlayerIds={usedPlayerIds}
          currentId={slots[pickerFor.position]?.[pickerFor.slotIndex]}
          onPick={(playerId) => assignPlayer(pickerFor.position, pickerFor.slotIndex, playerId)}
          onClear={() => {
            clearSlot(pickerFor.position, pickerFor.slotIndex);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

function PlayerPicker({ position, players, usedPlayerIds, currentId, onPick, onClear, onClose }) {
  return (
    <div className="futbol-picker-backdrop" onClick={onClose}>
      <div className="futbol-picker" onClick={(e) => e.stopPropagation()}>
        <p className="futbol-kadro-section-title">{POSITION_LABELS[position]} seç</p>
        <div className="futbol-picker-list">
          {players.map((p) => {
            const isCurrent = currentId === p.id;
            const usedElsewhere = !isCurrent && usedPlayerIds.has(p.id);
            return (
              <button
                key={p.id}
                className={`futbol-picker-row ${isCurrent ? 'selected' : ''} ${usedElsewhere ? 'used-elsewhere' : ''}`}
                disabled={usedElsewhere}
                onClick={() => onPick(p.id)}
              >
                <FutbolPlayerAvatar playerId={p.id} position={p.position} size={38} />
                <span className="futbol-picker-info">
                  <strong>{p.name}</strong>
                  <span>
                    {p.age} yaş · {p.power.toFixed(1)} güç · {Math.round(p.form)}% form
                  </span>
                </span>
                {isCurrent && <span className="futbol-picker-badge current">Bu slotta</span>}
                {usedElsewhere && <span className="futbol-picker-badge">Kadroda</span>}
              </button>
            );
          })}
          {players.length === 0 && <p className="futbol-placeholder">Bu mevkide oyuncun yok.</p>}
        </div>
        {currentId && (
          <button className="futbol-admin-reset" onClick={onClear}>
            Slotu Boşalt
          </button>
        )}
      </div>
    </div>
  );
}
