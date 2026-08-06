import { useEffect, useState } from 'react';
import { useMyFutbolTeam } from '../../hooks/useMyFutbolTeam';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import {
  listFutbolBuyableTeams,
  getMyFutbolTeamFinance,
  buyFutbolTeam,
  sellFutbolTeam,
  listFutbolTeamForSale,
  cancelFutbolTeamListing,
} from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import FutbolKadro from './FutbolKadro';
import FutbolTransfer from './FutbolTransfer';
import FutbolLogoEditor from './FutbolLogoEditor';
import FutbolAltyapi from './FutbolAltyapi';
import './FutbolTakimim.css';

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
  { id: 'altyapi', label: 'Altyapı' },
  { id: 'forma', label: 'Forma' },
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
            <p className="futbol-buy-price">{t.value.toLocaleString('tr-TR')} altın</p>
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
  const [finance, setFinance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSellPanel, setShowSellPanel] = useState(false);
  const [listPrice, setListPrice] = useState('');

  const rank = leagueTeams.findIndex((t) => t.id === team.id) + 1;

  const loadFinance = () => {
    getMyFutbolTeamFinance()
      .then((res) => setFinance(res?.data?.team || null))
      .catch(() => {});
  };

  useEffect(() => {
    loadFinance();
  }, [team.id]);

  const handleInstantSell = async () => {
    if (!window.confirm(`${team.name} takımını anında satmak istediğine emin misin?`)) return;
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
      await listFutbolTeamForSale(team.id, Number(listPrice));
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
            {team.tier}. Lig · {(team.fans || 0).toLocaleString('tr-TR')} taraftar
          </p>
        </div>
      </div>

      <div className="futbol-my-team-rank">
        {rank > 0 ? `Ligde ${rank}. sıradasın` : 'Sıralama hesaplanıyor...'}
      </div>

      <p className="futbol-placeholder">
        Dizilim: <strong>{team.formation || '2-2-1'}</strong> · Taktik:{' '}
        <strong>{team.tactic || 'dengeli'}</strong> — değiştirmek için Kadro sekmesine git.
      </p>

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
          <div className="futbol-transfer-listing-form">
            <input
              type="number"
              className="futbol-admin-input"
              placeholder="Fiyat biç"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
            />
            <button className="futbol-admin-submit" disabled={busy} onClick={handleList}>
              Listeye Koy
            </button>
          </div>
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
    </div>
  );
}
