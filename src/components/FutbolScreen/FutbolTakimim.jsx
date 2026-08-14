import { useEffect, useState } from 'react';
import { useMyFutbolTeam } from '../../hooks/useMyFutbolTeam';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import {
  listFutbolBuyableTeams,
  getMyFutbolTeamFinance,
  buyFutbolTeam,
  sellFutbolTeam,
  listFutbolTeamForSale,
  cancelFutbolTeamListing,
} from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import FutbolKadro from './FutbolKadro';
import FutbolTransfer from './FutbolTransfer';
import FutbolLogoEditor from './FutbolLogoEditor';
import FutbolAltyapi from './FutbolAltyapi';
import FutbolStadyum from './FutbolStadyum';
import { groupFutbolPlayersByPositionOrdered } from './futbolPositionOrder';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import './FutbolTakimim.css';

const CLUB_PRICE_QUICK_AMOUNTS = [100, 1000, 10000, 100000, { value: 1000000, label: '1M' }];

function initialsFromName(name) {
  return (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('');
}

const MY_TEAM_TABS = [
  { id: 'takimin', label: 'Takımın' },
  { id: 'kadro', label: 'Kadro' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'altyapi', label: 'Antrenman' },
  { id: 'forma', label: 'Forma' },
  { id: 'stadyum', label: 'Stadyum' },
];

export default function FutbolTakimim() {
  const { team, loading: teamLoading } = useMyFutbolTeam();
  const [tab, setTab] = useState('takimin');

  if (teamLoading) return <p className="futbol-placeholder">Yükleniyor...</p>;
  if (!team) return <BuyTeamPanel />;

  return (
    <div className="futbol-my-team-wrap">
      <div className="futbol-subtabs futbol-subtabs-inner">
        {MY_TEAM_TABS.map((t) => (
          <button
            key={t.id}
            className={`futbol-subtab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'takimin' && <MyTeamOverview team={team} />}
      {tab === 'kadro' && <FutbolKadro team={team} />}
      {tab === 'transfer' && <FutbolTransfer team={team} />}
      {tab === 'altyapi' && <FutbolAltyapi team={team} />}
      {tab === 'forma' && <FutbolLogoEditor team={team} />}
      {tab === 'stadyum' && <FutbolStadyum team={team} />}
    </div>
  );
}

function BuyTeamPanel() {
  const [teams, setTeams] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await listFutbolBuyableTeams();
      setTeams(res?.data?.teams || []);
    } catch (err) {
      setError('Liste yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleBuy = async (teamId) => {
    setBusyId(teamId);
    setError('');
    try {
      await buyFutbolTeam(teamId);
      await load();
    } catch (err) {
      setError(err?.message || 'Satın alma başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  if (teams === null) return <p className="futbol-placeholder">Yükleniyor...</p>;

  return (
    <div className="futbol-buy-list">
      <p className="futbol-placeholder">
        Henüz bir takımın yok. Aşağıdaki kulüplerden birini satın alabilirsin
        — botlara ait olanlar piyasa değerinden, oyuncuların kendi
        ilan ettikleri ise kendi belirledikleri fiyattan.
      </p>
      {error && <p className="futbol-admin-error">{error}</p>}
      {teams.length === 0 && <p className="futbol-placeholder">Satılık takım kalmadı.</p>}
      {teams.map((t) => (
        <div key={t.id} className="futbol-buy-row">
          <FutbolCrest logo={t.logo} initials={initialsFromName(t.name)} size={40} />
          <div className="futbol-buy-info">
            <p className="futbol-buy-name">
              {t.name} {t.listedByPlayer && <span className="futbol-buy-badge">Oyuncu İlanı</span>}
            </p>
            <p className="futbol-buy-meta">
              {t.tier}. Lig · {t.fans.toLocaleString('tr-TR')} taraftar
            </p>
          </div>
          <div className="futbol-buy-action">
            <p className="futbol-buy-price">{t.price.toLocaleString('tr-TR')} altın</p>
            {t.listedByPlayer && (
              <p className="futbol-buy-meta">Değeri: {t.value.toLocaleString('tr-TR')} altın</p>
            )}
            <button
              className="futbol-admin-submit"
              disabled={busyId === t.id}
              onClick={() => handleBuy(t.id)}
            >
              {busyId === t.id ? '...' : 'Satın Al'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MyTeamOverview({ team }) {
  const { teams: leagueTeams } = useFutbolTeams(team.leagueId);
  const { players } = useFutbolTeamPlayers(team.id);
  const [finance, setFinance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSellPanel, setShowSellPanel] = useState(false);
  const [listPrice, setListPrice] = useState(0);
  const [confirmInstantSell, setConfirmInstantSell] = useState(false);

  const rank = leagueTeams.findIndex((t) => t.id === team.id) + 1;

  const loadFinance = () => {
    getMyFutbolTeamFinance()
      .then((res) => setFinance(res?.data?.team || null))
      .catch(() => {});
  };

  useEffect(() => {
    loadFinance();
  }, [team.id]);

  const handleInstantSell = () => {
    setConfirmInstantSell(true);
  };

  const runInstantSell = async () => {
    setConfirmInstantSell(false);
    setBusy(true);
    setError('');
    try {
      await sellFutbolTeam(team.id);
    } catch (err) {
      setError(err?.message || 'Satış başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const handleList = async () => {
    setBusy(true);
    setError('');
    try {
      await listFutbolTeamForSale(team.id, listPrice);
      setShowSellPanel(false);
    } catch (err) {
      setError(err?.message || 'İlan verilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelListing = async () => {
    setBusy(true);
    setError('');
    try {
      await cancelFutbolTeamListing(team.id);
    } catch (err) {
      setError(err?.message || 'İptal edilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-my-team">
      <div className="futbol-my-team-header">
        <FutbolCrest logo={team.logo} initials={initialsFromName(team.name)} size={56} />
        <div>
          <p className="futbol-my-team-name">{team.name}</p>
          <p className="futbol-buy-meta">
            {team.tier}. Lig · {(team.fans || 0).toLocaleString('tr-TR')} taraftar ·{' '}
            {(team.stadiumCapacity || 2500).toLocaleString('tr-TR')} kapasiteli stadyum
          </p>
        </div>
      </div>

      <div className="futbol-my-team-rank">
        {rank > 0 ? `Ligde ${rank}. sıradasın` : 'Sıralama hesaplanıyor...'}
      </div>
      <div className="futbol-my-team-rank">
        Takım Değeri: {finance ? `${finance.value.toLocaleString('tr-TR')} altın` : '…'}
      </div>

      {error && <p className="futbol-admin-error">{error}</p>}

      {team.forSale ? (
        <div className="futbol-my-team-finance">
          <p>İlan fiyatın: {(team.salePrice || 0).toLocaleString('tr-TR')} altın</p>
          <button className="futbol-admin-reset" disabled={busy} onClick={handleCancelListing}>
            İlanı İptal Et
          </button>
        </div>
      ) : !showSellPanel ? (
        <button className="futbol-admin-reset" onClick={() => setShowSellPanel(true)}>
          Takımı Sat
        </button>
      ) : (
        <div className="futbol-my-team-finance">
          {finance && (
            <p className="futbol-buy-meta">
              Değer: {finance.value.toLocaleString('tr-TR')} · Anında satış:{' '}
              {finance.instantSellPrice.toLocaleString('tr-TR')} · Azami ilan:{' '}
              {finance.maxListPrice.toLocaleString('tr-TR')}
            </p>
          )}
          <QuantityStepper
            value={listPrice}
            onChange={setListPrice}
            max={finance?.maxListPrice}
            quickAmounts={CLUB_PRICE_QUICK_AMOUNTS}
          />
          <button className="futbol-admin-submit" disabled={busy || listPrice <= 0} onClick={handleList}>
            Listeye Koy
          </button>
          {finance && (
            <button className="futbol-admin-reset" disabled={busy} onClick={handleInstantSell}>
              Anında Sat ({finance.instantSellPrice.toLocaleString('tr-TR')})
            </button>
          )}
          <button className="futbol-placeholder futbol-my-team-cancel-link" onClick={() => setShowSellPanel(false)}>
            Vazgeç
          </button>
        </div>
      )}

      <p className="futbol-kadro-section-title">Kadromuz ({players.length})</p>
      <p className="futbol-placeholder">
        🟢 Kadroda = ilk 11'de, satılamaz · 🟡 Antrenmanda = o gün maça çıkamaz, satılamaz · ⚪
        Boşta = satabilirsin
      </p>
      <div className="futbol-roster-list">
        {groupFutbolPlayersByPositionOrdered(players).map((group) => (
          <div key={group.position} className="futbol-transfer-position-group">
            <p className="futbol-transfer-group-header">{group.label}</p>
            {group.players.map((p) => {
              const lineup = team.lineup || [];
              const trainingIds = team.trainingPlayerIds || [];
              const inLineup = lineup.includes(p.id);
              const inTraining = trainingIds.includes(p.id);
              const status = inLineup
                ? { label: '🟢 Kadroda', cls: 'lineup' }
                : inTraining
                  ? { label: '🟡 Antrenmanda', cls: 'training' }
                  : { label: '⚪ Boşta', cls: 'idle' };
              return (
                <div key={p.id} className="futbol-roster-row">
                  <FutbolPlayerAvatar playerId={p.id} position={p.position} size={38} />
                  <div className="futbol-roster-info">
                    <p className="futbol-transfer-name">{p.name}</p>
                    <p className="futbol-buy-meta">
                      {p.age} yaş · {p.power.toFixed(1)} güç · {Math.round(p.form)}% form
                    </p>
                  </div>
                  <span className={`futbol-roster-status ${status.cls}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {confirmInstantSell && (
        <ConfirmModal
          title="Takımı Sat"
          message={`${team.name} takımını anında satmak istediğine emin misin?`}
          confirmLabel="Evet, Sat"
          onConfirm={runInstantSell}
          onCancel={() => setConfirmInstantSell(false)}
        />
      )}
    </div>
  );
}
