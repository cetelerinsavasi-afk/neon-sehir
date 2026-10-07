import { useEffect, useMemo, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { useFutbolGrowthLog } from '../../hooks/useFutbolGrowthLog';
import { addFutbolTraining, removeFutbolTraining, payFutbolTrainingSlot, shopAction } from '../../services/gameActions';
import { useBusinessList } from '../../hooks/useBusinessList';
import HoldButton from '../HoldButton/HoldButton';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import { gymPriceOf } from '../../../functions/gym.js';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import InfoTooltip from '../InfoTooltip/InfoTooltip';
import './FutbolAltyapi.css';

const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
// Kullanıcı revizesi: 3 genel kutu yerine, her mevki için AYRI (ve sabit)
// 1 kutu — toplam 4. Sıra her zaman aynı: Kaleci, Defans, Orta Saha, Forvet.
const TRAINING_POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

export default function FutbolAltyapi({ team, role }) {
  const { players } = useFutbolTeamPlayers(team.id);
  const lineup = team.lineup || [];
  // İlk 11'de olan VE sakat oyuncular antrenman seçeneklerinde hiç
  // gözükmez — sakat oyuncu antrenmana sokulamaz (yeni istek, sunucu
  // tarafında da addFutbolTraining reddediyor, burada da UX için filtreli).
  const trainablePlayers = players.filter((p) => !lineup.includes(p.id) && !((p.injuryDaysLeft || 0) > 0));
  // KULLANICI İSTEĞİ: menajer varken başkan inceleyebilir ama işlem
  // yapamaz — gelişim günlüğü (salt görüntüleme) bundan MUAF, sadece
  // antrenman ATAMA/KALDIRMA kilitleniyor.
  const readOnly = role === 'owner' && Boolean(team.managerUid);

  return (
    <div className="futbol-altyapi">
      <GrowthLogSection teamId={team.id} />
      <TrainingSection
        teamId={team.id}
        players={trainablePlayers}
        allPlayers={players}
        trainingPlayerIds={team.trainingPlayerIds || []}
        trainingSlots={team.trainingSlots || {}}
        readOnly={readOnly}
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
// v77 Faz 4 — salon seçme paneli: salonların adı + günlük fiyatı (oyunun salonu
// 2.000 ile dahil). Seçili salonun fiyatı kilitli kutuların üstünde; basınca
// (basılı tut) ödenir ve kutu açılır. Fiyat o gün için kilitlenir.
function GymPicker({ gyms, selected, onSelect }) {
  const today = futbolDayKey(Date.now());
  return (
    <div className="futbol-gym-picker">
      {gyms.map((g) => (
        <button key={g.id} className={`futbol-gym-chip${selected === g.id ? ' on' : ''}`} onClick={() => onSelect(g.id)}>
          <span className="futbol-gym-name">
            {g.bizGame ? '★ ' : '🏋️ '}
            {g.name}
          </span>
          {!g.bizGame && g.gymBonusDay === today && <em className="futbol-gym-bonus">🔥 +%10</em>}
          <b>
            <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {gymPriceOf(g).toLocaleString('tr-TR')}
          </b>
        </button>
      ))}
    </div>
  );
}

function TrainingSection({ teamId, players, allPlayers, trainingPlayerIds, trainingSlots, readOnly }) {
  const [busyId, setBusyId] = useState(null);
  const { list: gymRows } = useBusinessList('spor', { includeGame: true });
  useEffect(() => {
    shopAction({ op: 'gymEnsureGame' }).catch(() => {});
  }, []);
  const gyms = useMemo(() => [...gymRows].sort((a, b) => gymPriceOf(a) - gymPriceOf(b) || Number(Boolean(a.bizGame)) - Number(Boolean(b.bizGame))), [gymRows]);
  const [gymId, setGymId] = useState(null);
  const gymSel = gyms.find((g) => g.id === gymId) || gyms[0] || null;
  const today = futbolDayKey(Date.now());
  const slotPaid = (pos) => trainingSlots?.[pos]?.dayKey === today;
  const paySlot = async (pos) => {
    if (!gymSel) return;
    setBusyId(`pay_${pos}`);
    setError('');
    try {
      await payFutbolTrainingSlot(teamId, pos, gymSel.id, gymPriceOf(gymSel));
    } catch (err) {
      const m = String(err?.message || '');
      setError(m === 'treasury' ? '💰 Kasa ✕' : m === 'gold' ? '💰 ✕' : m.startsWith('price-changed') ? '💲 ↻' : m || 'Ödenemedi.');
    } finally {
      setBusyId(null);
    }
  };
  const [autoFilling, setAutoFilling] = useState(false);
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

  // handleAutoFill — Bölüm 15 "Otomatik Doldur" butonu: boş kalan mevki
  // kutularını, o mevkideki adaylar arasından form (yüksek öncelik),
  // eşitlikte güç (yüksek), yine eşitlikte en genç oyuncu sırasıyla
  // otomatik seçip doldurur.
  const emptyPositions = TRAINING_POSITIONS.filter((pos) => !occupantByPosition[pos] && slotPaid(pos));
  const handleAutoFill = async () => {
    setAutoFilling(true);
    setError('');
    try {
      for (const pos of emptyPositions) {
        const best = [...(candidatesByPosition[pos] || [])].sort((a, b) => {
          if (b.form !== a.form) return b.form - a.form;
          if (b.power !== a.power) return b.power - a.power;
          return a.age - b.age;
        })[0];
        if (best) {
          await addFutbolTraining(teamId, best.id);
        }
      }
    } catch (err) {
      setError(err?.message || 'Otomatik doldurma başarısız.');
    } finally {
      setAutoFilling(false);
    }
  };

  return (
    <fieldset className="futbol-training" disabled={readOnly}>
      <div className="futbol-training-header-row">
        <p className="futbol-kadro-section-title">
          Antrenman ({trainingPlayerIds.length}/{TRAINING_POSITIONS.length})
          <InfoTooltip text="Her mevki için önce bir spor salonu seçip ücretini öde (🔒 menajerli takımda kasadan, değilse başkanın altınından), sonra 1 oyuncu yerleştir (18:00-19:00 arası). Ücret 19:00'a kadar geçerli; transfer desteğinden ödenemez. 🔥 işaretli salonda gelişim %10 fazla. Antrenmandaki oyuncu o günkü maça çıkamaz. İlk 11'deki ve sakat oyuncular antrenmana gönderilemez." />
        </p>
        {emptyPositions.length > 0 && (
          <button className="futbol-admin-submit" disabled={autoFilling} onClick={handleAutoFill}>
            {autoFilling ? 'Dolduruluyor...' : 'Otomatik Doldur'}
          </button>
        )}
      </div>
      {error && <p className="futbol-admin-error">{error}</p>}

      <GymPicker gyms={gyms} selected={gymSel?.id} onSelect={setGymId} />

      <div className="futbol-training-slots">
        {TRAINING_POSITIONS.map((pos) => {
          const occupant = occupantByPosition[pos];
          const candidates = candidatesByPosition[pos];
          const isOpen = openPosition === pos;
          return (
            <div key={pos} className={`futbol-training-slot${occupant ? ' filled' : ''}${!slotPaid(pos) ? ' locked' : ''}`}>
              <p className="futbol-training-slot-label">
                {POSITION_LABELS[pos]}
                {slotPaid(pos) && (
                  <span className="futbol-slot-gym">
                    🏋️ {trainingSlots[pos].gymName}
                    {trainingSlots[pos].bonus && <em className="futbol-gym-bonus">🔥</em>}
                  </span>
                )}
              </p>
              {!slotPaid(pos) ? (
                <HoldButton className="futbol-slot-pay" disabled={!gymSel || busyId === `pay_${pos}`} onDone={() => paySlot(pos)}>
                  🔒 <span className="gold-coin-icon" style={{ width: 12, height: 12 }} /> {gymSel ? gymPriceOf(gymSel).toLocaleString('tr-TR') : '—'}
                </HoldButton>
              ) : occupant ? (
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
    </fieldset>
  );
}
