import { useEffect, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { isAdminUid } from '../../config/admin';
import {
  listFutbolTransferMarket,
  buyFutbolPlayer,
  instantSellFutbolPlayer,
  listFutbolPlayerForSale,
  cancelFutbolPlayerListing,
  forceRefreshFutbolTransferMarket,
} from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import { sortFutbolPlayersByPosition } from './futbolPositionOrder';
import './FutbolTransfer.css';

const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
const PLAYER_PRICE_QUICK_AMOUNTS = [100, 1000, 10000, 100000];

export default function FutbolTransfer({ team }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const isAdmin = isAdminUid(user?.uid);
  const { players: myPlayers } = useFutbolTeamPlayers(team.id);
  const [market, setMarket] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [listingId, setListingId] = useState(null);
  const [listingPrice, setListingPrice] = useState(0);
  const [showSellPanel, setShowSellPanel] = useState(false);
  const [confirmSellId, setConfirmSellId] = useState(null);
  const [refreshingMarket, setRefreshingMarket] = useState(false);
  // boughtIds — kullanıcı revizesi: satın alınca oyuncu listeden ANINDA
  // kaybolmasın (buton "Satın Alındı" yazsın, oyuncu görünmeye devam
  // etsin). Başka bir ekrana gidip bu sekmeye geri dönünce (component
  // yeniden mount olup loadMarket tekrar çağrılınca) piyasa zaten sunucu
  // tarafında güncel geleceği için kendiliğinden kaybolacak.
  const [boughtIds, setBoughtIds] = useState(() => new Set());

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
      setBoughtIds((prev) => new Set(prev).add(playerId));
    } catch (err) {
      setError(err?.message || 'Satın alma başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  const handleInstantSell = (playerId) => {
    setConfirmSellId(playerId);
  };

  const confirmInstantSell = async () => {
    const playerId = confirmSellId;
    setConfirmSellId(null);
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

  const handleForceRefreshMarket = async () => {
    setRefreshingMarket(true);
    setError('');
    try {
      await forceRefreshFutbolTransferMarket();
      await loadMarket();
    } catch (err) {
      setError(err?.message || 'Piyasa yenilenemedi.');
    } finally {
      setRefreshingMarket(false);
    }
  };

  const marketItems = market
    ? sortFutbolPlayersByPosition(market.filter((p) => p.teamId !== team.id))
    : [];

  return (
    <div className="futbol-transfer">
      {error && <p className="futbol-admin-error">{error}</p>}

      <button className="futbol-admin-reset" onClick={() => setShowSellPanel((v) => !v)}>
        {showSellPanel ? 'Kadromu Gizle' : 'Oyuncu Sat'}
      </button>

      {showSellPanel && (
        <div className="futbol-transfer-roster">
          <p className="futbol-kadro-section-title">Kadrondaki Oyuncular</p>
          {sortFutbolPlayersByPosition(myPlayers).map((p) => {
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

      <div className="futbol-transfer-market-header">
        <p className="futbol-kadro-section-title">Transfer Piyasası — Katabileceğin Oyuncular</p>
        {/* Kullanıcı revizesi: bakiye her zaman görünür olsun. */}
        <p className="futbol-transfer-balance">💰 {(player?.gold || 0).toLocaleString('tr-TR')} altın</p>
      </div>
      {isAdmin && (
        <button
          className="futbol-admin-reset futbol-transfer-force-refresh"
          disabled={refreshingMarket}
          onClick={handleForceRefreshMarket}
          title="Firestore'dan elle bir oyuncunun gücünü düzelttiysen, piyasayı 15 dakika beklemeden anında yeniden hesaplatır. (Sadece sen görebilirsin.)"
        >
          {refreshingMarket ? 'Yenileniyor…' : '🔄 Sistem Stoğunu Şimdi Yenile (admin)'}
        </button>
      )}
      {market === null && <p className="futbol-placeholder">Yükleniyor...</p>}
      {market !== null && marketItems.length === 0 && (
        <p className="futbol-placeholder">Şu an piyasada satılık oyuncu yok.</p>
      )}

      {/* Kullanıcı revizesi: sistem/anında/manuel ayrımı KALDIRILDI —
          oyuncular için "sistem koymuş" ya da "oyuncu koymuş" farkı
          görünmesin, hepsi TEK bir listede, mevkiye göre sıralı. */}
      {marketItems.map((p) => {
        const price = p.salePrice || 0;
        const alreadyBought = boughtIds.has(p.id);
        const canAfford = (player?.gold || 0) >= price;
        return (
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
              disabled={busyId === p.id || alreadyBought || !canAfford}
              onClick={() => handleBuy(p.id)}
            >
              {alreadyBought
                ? 'Satın Alındı ✓'
                : !canAfford
                  ? 'Altın Yetersiz'
                  : `${price.toLocaleString('tr-TR')} altın`}
            </button>
          </div>
        );
      })}

      {confirmSellId && (
        <ConfirmModal
          title="Oyuncuyu Sat"
          message="Bu oyuncuyu anında satmak istediğine emin misin?"
          confirmLabel="Evet, Sat"
          onConfirm={confirmInstantSell}
          onCancel={() => setConfirmSellId(null)}
        />
      )}
    </div>
  );
}
