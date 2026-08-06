import { useEffect, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { setFutbolLineup } from '../../services/gameActions';
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

export default function FutbolKadro({ team }) {
  const { players } = useFutbolTeamPlayers(team.id);
  const [formation, setFormation] = useState(team.formation || '2-2-1');
  const [tactic, setTactic] = useState(team.tactic || 'dengeli');
  const [lineup, setLineup] = useState(team.lineup || []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setFormation(team.formation || '2-2-1');
    setTactic(team.tactic || 'dengeli');
    setLineup(team.lineup || []);
  }, [team.id]);

  const need = FORMATIONS[formation];
  const byPosition = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach((p) => byPosition[p.position]?.push(p));

  const countIn = (pos) => lineup.filter((id) => byPosition[pos].some((p) => p.id === id)).length;

  const togglePlayer = (player) => {
    setMessage('');
    const isSelected = lineup.includes(player.id);
    if (isSelected) {
      setLineup(lineup.filter((id) => id !== player.id));
      return;
    }
    if (countIn(player.position) >= need[player.position]) return; // slot dolu
    setLineup([...lineup, player.id]);
  };

  const changeFormation = (f) => {
    setFormation(f);
    // Yeni dizilimle uyuşmayan fazla seçimleri (mevki başına) temizle.
    const newNeed = FORMATIONS[f];
    const kept = [];
    const used = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    lineup.forEach((id) => {
      const player = players.find((p) => p.id === id);
      if (!player) return;
      if (used[player.position] < newNeed[player.position]) {
        used[player.position] += 1;
        kept.push(id);
      }
    });
    setLineup(kept);
  };

  const totalNeeded = Object.values(need).reduce((a, b) => a + b, 0);
  const isComplete = lineup.length === totalNeeded;

  const handleSave = async () => {
    setBusy(true);
    setMessage('');
    try {
      await setFutbolLineup(team.id, formation, tactic, lineup);
      setMessage('Kaydedildi ✓');
    } catch (err) {
      setMessage(err?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

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

      {Object.keys(need).map((pos) => (
        <div key={pos} className="futbol-kadro-position-block">
          <p className="futbol-kadro-section-title">
            {POSITION_LABELS[pos]} ({countIn(pos)}/{need[pos]})
          </p>
          <div className="futbol-kadro-player-list">
            {byPosition[pos].map((p) => {
              const selected = lineup.includes(p.id);
              const full = !selected && countIn(pos) >= need[pos];
              return (
                <button
                  key={p.id}
                  className={`futbol-kadro-player ${selected ? 'selected' : ''} ${full ? 'disabled' : ''}`}
                  onClick={() => togglePlayer(p)}
                  disabled={full}
                >
                  <span>{p.name}</span>
                  <span className="futbol-kadro-player-power">
                    {p.power.toFixed(1)} güç · {Math.round(p.form)}% form
                  </span>
                </button>
              );
            })}
            {byPosition[pos].length === 0 && (
              <p className="futbol-placeholder">Bu mevkide oyuncun yok.</p>
            )}
          </div>
        </div>
      ))}

      {!isComplete && (
        <p className="futbol-admin-error">
          {lineup.length}/{totalNeeded} oyuncu seçildi — kaydetmeden önce tamamla.
        </p>
      )}
      {message && <p className="futbol-placeholder">{message}</p>}
      <button className="futbol-admin-submit" disabled={busy || !isComplete} onClick={handleSave}>
        {busy ? '...' : 'Kadroyu Kaydet'}
      </button>
      <p className="futbol-placeholder futbol-kadro-note">
        Not: seçtiğin oyunculardan biri formu %50&apos;nin altına düşerse, o
        maç için otomatik olarak 2-2-1 / dengeli / en formda kadroya geri
        dönülür.
      </p>
    </div>
  );
}
