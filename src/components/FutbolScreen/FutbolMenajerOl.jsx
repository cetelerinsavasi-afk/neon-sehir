import { useEffect, useState } from 'react';
import {
  listFutbolManagerOpportunities,
  applyFutbolManager,
  requestFutbolManagerHandover,
} from '../../services/gameActions';
import { usePlayer } from '../../hooks/usePlayer';
import FutbolCrest from './FutbolCrest';
import FutbolLevelBar from './FutbolLevelBar';
import ManagerBooklet from '../ManagerBooklet/ManagerBooklet';
import './FutbolTakimim.css';

const FUTBOL_MANAGER_REPUTATION_REQUIRED = 50;

function levelThreshold(level) {
  return 10 * Math.pow(2, Math.abs(level || 0));
}

// FutbolMenajerOl — Bölüm 3/8/15: "Menajer Ol" sekmesi. Menajeri OLMAYAN
// takımlar (bot/oto-bot → anında kabul; aktif başkanlı+gönüllü ilanlı →
// başvuru kuyruğu) burada listelenir.
export default function FutbolMenajerOl() {
  const { player } = usePlayer();
  const [opportunities, setOpportunities] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showBooklet, setShowBooklet] = useState(false);
  const [appliedIds, setAppliedIds] = useState(() => new Set());

  const reputation = player?.reputation || 0;
  const eligible = reputation >= FUTBOL_MANAGER_REPUTATION_REQUIRED;

  const load = async () => {
    setError('');
    try {
      const res = await listFutbolManagerOpportunities();
      setOpportunities(res?.data?.opportunities || []);
    } catch (err) {
      setError('Liste yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApply = async (o) => {
    setBusyId(o.id);
    setError('');
    setMessage('');
    try {
      if (o.isHandoverTarget) {
        const res = await requestFutbolManagerHandover(o.id);
        setMessage(
          res?.data?.autoApproved
            ? "Devralman onaylandı — yarın 19:00'da göreve başlayacaksın ✓"
            : 'Devralma talebin başkana iletildi, onayını bekliyor.'
        );
      } else {
        const res = await applyFutbolManager(o.id);
        setMessage(
          res?.data?.startedNow
            ? 'Başvurun kabul edildi — göreve hemen başladın, ilk maaşını bu akşam 19:00da alacaksın ✓'
            : res?.data?.instant
              ? "Başvurun kabul edildi — yarın 19:00'da göreve başlayacaksın ✓"
              : 'Başvurun başkana iletildi, onayını bekliyor.'
        );
      }
      setAppliedIds((prev) => new Set(prev).add(o.id));
    } catch (err) {
      setError(err?.message || 'İşlem başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  const myLevel = player?.futbolManagerLevel || 0;
  const myStreak = player?.futbolManagerLevelStreak || 0;

  return (
    <div className="futbol-buy-list">
      <div className="futbol-training-header-row">
        <FutbolLevelBar level={myLevel} streak={myStreak} threshold={levelThreshold(myLevel)} />
        <button className="futbol-admin-reset" onClick={() => setShowBooklet(true)}>
          📖 Menajerlik Kitapçığı
        </button>
      </div>

      {!eligible && (
        <p className="futbol-admin-error">
          Menajer olmak için en az {FUTBOL_MANAGER_REPUTATION_REQUIRED} saygınlığın olmalı (şu an{' '}
          {reputation.toLocaleString('tr-TR')}).
        </p>
      )}
      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}
      {opportunities === null && <p className="futbol-placeholder">Yükleniyor...</p>}
      {opportunities !== null && opportunities.length === 0 && (
        <p className="futbol-placeholder">Şu an menajer arayan bir takım yok.</p>
      )}
      {opportunities?.map((o) => (
        <div key={o.id} className="futbol-buy-row">
          <FutbolCrest logo={o.logo} initials={o.name?.[0]} size={40} />
          <div className="futbol-buy-info">
            <p className="futbol-buy-name">{o.name}</p>
            <p className="futbol-buy-meta">
              {o.tier}. Lig ·{' '}
              {o.isHandoverTarget
                ? `Menajer seviye ${o.managerLevel}`
                : o.isVoluntaryListing
                  ? 'Başkan onayı gerekir'
                  : 'Anında kabul'}
            </p>
          </div>
          <button
            className="futbol-admin-submit"
            disabled={!eligible || busyId === o.id || appliedIds.has(o.id)}
            onClick={() => handleApply(o)}
          >
            {appliedIds.has(o.id)
              ? 'Gönderildi ✓'
              : busyId === o.id
                ? '...'
                : o.isHandoverTarget
                  ? 'Devral'
                  : 'Başvur'}
          </button>
        </div>
      ))}

      {showBooklet && <ManagerBooklet onClose={() => setShowBooklet(false)} />}
    </div>
  );
}
