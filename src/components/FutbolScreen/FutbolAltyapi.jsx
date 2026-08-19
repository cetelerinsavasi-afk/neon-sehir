import { useMemo, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { useFutbolGrowthLog } from '../../hooks/useFutbolGrowthLog';
import { addFutbolTraining, removeFutbolTraining } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolAltyapi.css';

const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
// Kullanıcı revizesi: 3 genel kutu yerine, her mevki için AYRI (ve sabit)
// 1 kutu — toplam 4. Sıra her zaman aynı: Kaleci, Defans, Orta Saha, Forvet.
const TRAINING_POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

export default function FutbolAltyapi({ team }) {
  const { players } = useFutbolTeamPlayers(team.id);
  const lineup = team.lineup || [];
  // İlk 11'de olan VE sakat oyuncular antrenman seçeneklerinde hiç
  // gözükmez — sakat oyuncu antrenmana sokulamaz (yeni istek, sunucu
  // tarafında da addFutbolTraining reddediyor, burada da UX için filtreli).
  const trainablePlayers = players.filter((p) => !lineup.includes(p.id) && !((p.injuryDaysLeft || 0) > 0));

  return (
    <div className="futbol-altyapi">
      <GrowthLogSection teamId={team.id} />
      <TrainingSection
        teamId={team.id}
        players={trainablePlayers}
        allPlayers={players}
        excludedCount={players.length - trainablePlayers.length}
        trainingPlayerIds={team.trainingPlayerIds || []}
      />
    </div>
  );
}

// dayKeyOf — bir Firestore Timestamp'ini yerel (tarayıcı saatine göre)
// gün anahtarına çevirir. Kullanıcı revizesi: "gelişimler listesinde
// hem dünün hem bugünün kayıtları var, sadece SON gelişenler gözüksün"
// — yani en yeni kaydın ait olduğu günden daha eski hiçbir satır
// gösterilmiyor.
function dayKeyOf(entry) {
  const ms = entry?.createdAt?.toMillis ? entry.createdAt.toMillis() : entry?.createdAt?.seconds
    ? entry.createdAt.seconds * 1000
    : null;
  if (!ms) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function GrowthLogSection({ teamId }) {
  const [open, setOpen] = useState(false);
  const { entries, loading } = useFutbolGrowthLog(teamId, open);

  const latestEntries = useMemo(() => {
    if (!entries.length) return entries;
    const newestDay = dayKeyOf(entries[0]);
    if (!newestDay) return entries;
    return entries.filter((e) => dayKeyOf(e) === newestDay);
  }, [entries]);

  return (
    <div className="futbol-growth-log">
      <button className="futbol-admin-reset futbol-growth-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Gelişimleri Gizle' : 'Gelişimler'}
      </button>
      {open && (
        <div className="futbol-growth-panel">
          {loading && <p className="futbol-placeholder">Yükleniyor...</p>}
          {!loading && latestEntries.length === 0 && (
            <p className="futbol-placeholder">Henüz kaydedilmiş bir gelişim yok.</p>
          )}
          {!loading &&
            latestEntries.map((e) => (
              <div key={e.id} className="futbol-growth-row">
                <span className="futbol-growth-name">{e.playerName}</span>
                <span className={`futbol-growth-type ${e.type}`}>
                  {e.type === 'mac' ? 'Maç' : 'Antrenman'}
                </span>
                <span className="futbol-growth-amount">+{e.amount.toFixed(1)} güç</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// TrainingSection — kullanıcı revizesi: 3 genel kutu yerine, her mevki
// için SABİT bir kutu (toplam 4 — Kaleci/Defans/Orta Saha/Forvet). Boş
// bir kutuya tıklayınca o mevkideki antrenmana sokulabilecek oyuncular
// listelenir; birini seçince kutuya yerleşip antrenmana başlar. Dolu bir
// kutudan "Kaldır"la çıkarıp yerine başka bir oyuncu koyabilirsin.
function TrainingSection({ teamId, players, allPlayers, excludedCount, trainingPlayerIds }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [openPosition, setOpenPosition] = useState(null);

  const occupantByPosition = useMemo(() => {
    const map = {};
    TRAINING_POSITIONS.forEach((pos) => {
      map[pos] = allPlayers.find((p) => trainingPlayerIds.includes(p.id) && p.position === pos) || null;
    });
    return map;
  }, [allPlayers, trainingPlayerIds]);

  const candidatesByPosition = useMemo(() => {
    const map = {};
    TRAINING_POSITIONS.forEach((pos) => {
      map[pos] = players.filter((p) => p.position === pos);
    });
    return map;
  }, [players]);

  const handleStart = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await addFutbolTraining(teamId, playerId);
      setOpenPosition(null);
    } catch (err) {
      setError(err?.message || 'Başlatılamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await removeFutbolTraining(teamId, playerId);
    } catch (err) {
      setError(err?.message || 'İptal edilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="futbol-training">
      <p className="futbol-kadro-section-title">
        Antrenman ({trainingPlayerIds.length}/{TRAINING_POSITIONS.length}) — her mevki için 1 oyuncu,
        18:00-19:00 arası, antrenmandaki oyuncu o günkü maça çıkamaz
      </p>
      <p className="futbol-placeholder">
        İlk 11'deki ve sakat oyuncular antrenmana gönderilemez — önce kadrodan çıkar / iyileşmesini bekle.
        {excludedCount > 0 ? ` (${excludedCount} oyuncu ilk 11'de veya sakat olduğu için listede gizlendi.)` : ''}
      </p>
      {error && <p className="futbol-admin-error">{error}</p>}

      <div className="futbol-training-slots">
        {TRAINING_POSITIONS.map((pos) => {
          const occupant = occupantByPosition[pos];
          const candidates = candidatesByPosition[pos];
          const isOpen = openPosition === pos;
          return (
            <div key={pos} className={`futbol-training-slot${occupant ? ' filled' : ''}`}>
              <p className="futbol-training-slot-label">{POSITION_LABELS[pos]}</p>
              {occupant ? (
                <div className="futbol-training-row">
                  <FutbolPlayerAvatar playerId={occupant.id} position={occupant.position} size={34} />
                  <div className="futbol-training-info">
                    <p className="futbol-transfer-name">{occupant.name}</p>
                    <p className="futbol-buy-meta">
                      {occupant.age} yaş · {occupant.power.toFixed(1)} güç · {Math.round(occupant.form)}% form
                    </p>
                  </div>
                  <button
                    className="futbol-admin-reset"
                    disabled={busyId === occupant.id}
                    onClick={() => handleCancel(occupant.id)}
                  >
                    Kaldır
                  </button>
                </div>
              ) : (
                <button
                  className="futbol-training-slot-empty"
                  onClick={() => setOpenPosition(isOpen ? null : pos)}
                >
                  {isOpen ? '▲ Kapat' : `+ ${POSITION_LABELS[pos]} Ekle`}
                </button>
              )}

              {isOpen && !occupant && (
                <div className="futbol-training-picker">
                  {candidates.length === 0 && (
                    <p className="futbol-placeholder">Bu mevkide antrenmana sokabileceğin oyuncu yok.</p>
                  )}
                  {candidates.map((p) => (
                    <div key={p.id} className="futbol-training-row">
                      <FutbolPlayerAvatar playerId={p.id} position={p.position} size={30} />
                      <div className="futbol-training-info">
                        <p className="futbol-transfer-name">{p.name}</p>
                        <p className="futbol-buy-meta">
                          {p.age} yaş · {p.power.toFixed(1)} güç · {Math.round(p.form)}% form
                        </p>
                      </div>
                      <button
                        className="futbol-admin-submit"
                        disabled={busyId === p.id}
                        onClick={() => handleStart(p.id)}
                      >
                        Seç
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
