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
import { groupFutbolPlayersByPositionOrdered } from './futbolPositionOrder';
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
  // insufficientId — kullanıcı revizesi: fiyatın yerine SÜREKLİ "Altın
  // Yetersiz" yazması saçma buldu. Artık buton normalde HER ZAMAN
  // fiyatı gösterir; sadece TIKLANINCA (ve gerçekten yetersizse) 2
  // saniyeliğine "Altın Yetersiz" yazar, sonra kendiliğinden fiyata
  // geri döner.
  const [insufficientId, setInsufficientId] = useState(null);

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

  const handleBuy = async (playerId, canAfford) => {
    if (!canAfford) {
      // Sunucuya hiç gitmeden, yerel olarak 2 saniyeliğine uyarı göster
      // ve sonra otomatik olarak fiyata geri dön.
      setInsufficientId(playerId);
      setTimeout(() => {
        setInsufficientId((cur) => (cur === playerId ? null : cur));
      }, 2000);
      return;
    }
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

  const marketGroups = market
    ? groupFutbolPlayersByPositionOrdered(market.filter((p) => p.teamId !== team.id))
    : [];
  const marketItemsCount = marketGroups.reduce((sum, g) => sum + g.players.length, 0);

  return (
    <div className="futbol-transfer">
      {error && <p className="futbol-admin-error">{error}</p>}

      <button className="futbol-admin-reset" onClick={() => setShowSellPanel((v) => !v)}>
        {showSellPanel ? 'Kadromu Gizle' : 'Oyuncu Sat'}
      </button>

      {showSellPanel && (
        <div className="futbol-transfer-roster">
          <p className="futbol-kadro-section-title">Kadrondaki Oyuncular</p>
          {groupFutbolPlayersByPositionOrdered(myPlayers).map((group) => (
            <div key={group.position} className="futbol-transfer-position-group">
              <p className="futbol-transfer-group-header">{group.label}</p>
              {group.players.map((p) => {
                const instantPrice = Math.round((p.value * 2) / 3);
                const maxPrice = Math.round((p.value * 4) / 3);
                return (
                  <div key={p.id} className="futbol-transfer-row">
                    <FutbolPlayerAvatar playerId={p.id} position={p.position} size={40} />
                    <div className="futbol-transfer-info">
                      <p className="futbol-transfer-name">{p.name}</p>
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
            </div>
          ))}
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
      {market !== null && marketItemsCount === 0 && (
        <p className="futbol-placeholder">Şu an piyasada satılık oyuncu yok.</p>
      )}

      {/* Kullanıcı revizesi: sistem/anında/manuel ayrımı KALDIRILDI —
          oyuncular için "sistem koymuş" ya da "oyuncu koymuş" farkı
          görünmesin, hepsi mevkiye göre başlıklı gruplar hâlinde. */}
      {marketGroups.map((group) => (
        <div key={group.position} className="futbol-transfer-position-group">
          <p className="futbol-transfer-group-header">{group.label}</p>
          {group.players.map((p) => {
            const price = p.salePrice || 0;
            const alreadyBought = boughtIds.has(p.id);
            const canAfford = (player?.gold || 0) >= price;
            const showingInsufficient = insufficientId === p.id;
            return (
              <div key={p.id} className="futbol-transfer-row">
                <FutbolPlayerAvatar playerId={p.id} position={p.position} size={40} />
                <div className="futbol-transfer-info">
                  <p className="futbol-transfer-name">{p.name}</p>
                  <p className="futbol-buy-meta">
                    {p.age} yaş · {p.power.toFixed(1)} güç
                    {typeof p.value === 'number' && (
                      <> · Piyasa değeri: {p.value.toLocaleString('tr-TR')} altın</>
                    )}
                  </p>
                </div>
                <button
                  className={`futbol-admin-submit${showingInsufficient ? ' futbol-buy-insufficient' : ''}`}
                  disabled={busyId === p.id || alreadyBought}
                  onClick={() => handleBuy(p.id, canAfford)}
                >
                  {alreadyBought
                    ? 'Satın Alındı ✓'
                    : showingInsufficient
                      ? 'Altın Yetersiz'
                      : `${price.toLocaleString('tr-TR')} altın`}
                </button>
              </div>
            );
          })}
        </div>
      ))}

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
