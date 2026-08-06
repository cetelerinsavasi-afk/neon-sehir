import { useEffect, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import {
  listFutbolTransferMarket,
  buyFutbolPlayer,
  instantSellFutbolPlayer,
  listFutbolPlayerForSale,
  cancelFutbolPlayerListing,
} from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolTransfer.css';

const SOURCE_LABELS = { system: 'Sistem Stoğu', instant: 'Anında Satılanlar', manual: 'Oyuncu İlanları' };
const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
const PLAYER_PRICE_QUICK_AMOUNTS = [100, 1000, 10000, 100000];

export default function FutbolTransfer({ team }) {
  const { players: myPlayers } = useFutbolTeamPlayers(team.id);
  const [market, setMarket] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [listingId, setListingId] = useState(null);
  const [listingPrice, setListingPrice] = useState(0);
  const [showSellPanel, setShowSellPanel] = useState(false);

  const loadMarket = async () => {
    setError('');
    try {
      const res = await listFutbolTransferMarket();
      setMarket(res?.data?.players || []);
    } catch (err) {
      setError('Piyasa yüklenemedi.');
    }
  };

  useEffect(() => {
    loadMarket();
  }, []);

  const handleBuy = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await buyFutbolPlayer(playerId);
      await loadMarket();
    } catch (err) {
      setError(err?.message || 'Satın alma başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  const handleInstantSell = async (playerId) => {
    if (!window.confirm('Bu oyuncuyu anında satmak istediğine emin misin?')) return;
    setBusyId(playerId);
    setError('');
    try {
      await instantSellFutbolPlayer(playerId);
      await loadMarket();
    } catch (err) {
      setError(err?.message || 'Satış başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  const openListing = (playerId) => {
    setListingId(playerId);
    setListingPrice(0);
    setError('');
  };

  const confirmListing = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await listFutbolPlayerForSale(playerId, listingPrice);
      setListingId(null);
      await loadMarket();
    } catch (err) {
      setError(err?.message || 'İlan verilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelListing = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await cancelFutbolPlayerListing(playerId);
      await loadMarket();
    } catch (err) {
      setError(err?.message || 'İptal edilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const systemCount = market ? market.filter((p) => p.saleSource === 'system').length : null;

  return (
    <div className="futbol-transfer">
      {error && <p className="futbol-admin-error">{error}</p>}

      <button className="futbol-admin-reset" onClick={() => setShowSellPanel((v) => !v)}>
        {showSellPanel ? 'Kadromu Gizle' : 'Oyuncu Sat'}
      </button>

      {showSellPanel && (
        <div className="futbol-transfer-roster">
          <p className="futbol-kadro-section-title">Kadrondaki Oyuncular</p>
          {myPlayers.map((p) => {
            const instantPrice = Math.round((p.value * 2) / 3);
            const maxPrice = Math.round((p.value * 4) / 3);
            return (
              <div key={p.id} className="futbol-transfer-row">
                <FutbolPlayerAvatar playerId={p.id} position={p.position} size={40} />
                <div className="futbol-transfer-info">
                  <p className="futbol-transfer-name">
                    {p.name} <span className="futbol-transfer-pos">({POSITION_LABELS[p.position]})</span>
                  </p>
                  <p className="futbol-buy-meta">
                    {p.age} yaş · {p.power.toFixed(1)} güç · {p.value.toLocaleString('tr-TR')} altın değer
                  </p>
                </div>
                {p.forSale ? (
                  <button
                    className="futbol-admin-reset"
                    disabled={busyId === p.id}
                    onClick={() => handleCancelListing(p.id)}
                  >
                    İlanı İptal Et
                  </button>
                ) : listingId === p.id ? (
                  <div className="futbol-transfer-listing-form">
                    <QuantityStepper
                      value={listingPrice}
                      onChange={setListingPrice}
                      max={maxPrice}
                      quickAmounts={PLAYER_PRICE_QUICK_AMOUNTS}
                    />
                    <p className="futbol-buy-meta">
                      İzin verilen aralık: {instantPrice.toLocaleString('tr-TR')} -{' '}
                      {maxPrice.toLocaleString('tr-TR')}
                    </p>
                    <button
                      className="futbol-admin-submit"
                      disabled={busyId === p.id || listingPrice < instantPrice}
                      onClick={() => confirmListing(p.id)}
                    >
                      Onayla
                    </button>
                  </div>
                ) : (
                  <div className="futbol-transfer-actions">
                    <button
                      className="futbol-admin-reset"
                      disabled={busyId === p.id}
                      onClick={() => handleInstantSell(p.id)}
                    >
                      Anında Sat ({instantPrice.toLocaleString('tr-TR')})
                    </button>
                    <button className="futbol-admin-submit" onClick={() => openListing(p.id)}>
                      Listele
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {myPlayers.length === 0 && <p className="futbol-placeholder">Kadronda oyuncu yok.</p>}
        </div>
      )}

      <p className="futbol-kadro-section-title">Transfer Piyasası — Katabileceğin Oyuncular</p>
      {market === null && <p className="futbol-placeholder">Yükleniyor...</p>}
      {market !== null && systemCount < 12 && (
        <p className="futbol-placeholder">
          Sistem stoğu yenileniyor, birazdan tamamlanacak ({systemCount}/12 hazır).
        </p>
      )}
      {market && market.filter((p) => p.teamId !== team.id).length === 0 && (
        <p className="futbol-placeholder">Şu an piyasada satılık oyuncu yok.</p>
      )}
      {market &&
        ['system', 'instant', 'manual'].map((source) => {
          const items = market.filter((p) => p.saleSource === source && p.teamId !== team.id);
          if (items.length === 0) return null;
          return (
            <div key={source} className="futbol-transfer-group">
              <p className="futbol-transfer-group-title">{SOURCE_LABELS[source]}</p>
              {items.map((p) => (
                <div key={p.id} className="futbol-transfer-row">
                  <FutbolPlayerAvatar playerId={p.id} position={p.position} size={40} />
                  <div className="futbol-transfer-info">
                    <p className="futbol-transfer-name">
                      {p.name} <span className="futbol-transfer-pos">({POSITION_LABELS[p.position]})</span>
                    </p>
                    <p className="futbol-buy-meta">
                      {p.age} yaş · {p.power.toFixed(1)} güç
                    </p>
                  </div>
                  <button
                    className="futbol-admin-submit"
                    disabled={busyId === p.id}
                    onClick={() => handleBuy(p.id)}
                  >
                    {(p.salePrice || 0).toLocaleString('tr-TR')} altın
                  </button>
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );
}
