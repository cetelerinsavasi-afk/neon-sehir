import { useEffect, useMemo, useState } from 'react';
import { upgradeFutbolStadium, setFutbolTicketPrice } from '../../services/gameActions';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import './FutbolStadyum.css';

const DEFAULT_CAPACITY = 2500;
const DEFAULT_TICKET_PRICE = 10;
const MIN_TICKET_PRICE = 1;
const MAX_TICKET_PRICE = 20;

// Kapasite yükseltme merdiveni — SADECE bir sonraki seviyeyi göstermek
// için burada tutuluyor (istemci tüm merdiveni oyuncuya GÖSTERMEZ, bkz.
// bu ekranın JSX'i: her zaman sadece "mevcut" ve "bir sonraki" seviye
// render edilir). Gerçek yükseltme sunucuda (upgradeFutbolStadium)
// KENDİ merdiveniyle doğrulanır — buradaki liste sadece bir önizleme.
// Yeni istek: "stadyum kapasite yükseltme fiyatlarını yarı yarıya
// düşürelim" — tüm maliyetler (0 hariç) eskisinin YARISI, sunucudaki
// FUTBOL_STADIUM_LADDER ile AYNI (bkz. functions/index.js).
const STADIUM_LADDER = [
  { capacity: 2500, cost: 0 },
  { capacity: 5000, cost: 500000 },
  { capacity: 10000, cost: 1000000 },
  { capacity: 20000, cost: 2000000 },
  { capacity: 40000, cost: 4000000 },
  { capacity: 75000, cost: 8000000 },
  { capacity: 150000, cost: 16000000 },
  { capacity: 250000, cost: 37500000 },
  { capacity: 500000, cost: 75000000 },
];

// Bilet fiyatına göre tahmini seyirci sayısı: taraftar/bilet fiyatı,
// stadyum kapasitesiyle sınırlı — sunucudaki futbolStadiumAttendance ile
// AYNI formül (bkz. functions/index.js).
function estimateAttendance(fans, ticketPrice, capacity) {
  return Math.min(capacity, Math.floor((fans || 0) / (ticketPrice || DEFAULT_TICKET_PRICE)));
}

// Bilet fiyatının taraftar memnuniyeti üzerindeki azami etkisi — yeni
// istek: nötr band artık 9-10-11 (tek nokta değil), sınırın dışında her
// yönde doğrusal +1000/birim — sunucudaki futbolTicketPriceFanDelta ile
// AYNI formül (bkz. functions/index.js'teki tam açıklama/doğrulama).
function maxFanEffect(ticketPrice) {
  if (ticketPrice >= 9 && ticketPrice <= 11) return { type: 'none', amount: 0 };
  if (ticketPrice > 11) {
    return { type: 'loss', amount: (ticketPrice - 11) * 1000 };
  }
  return { type: 'gain', amount: (9 - ticketPrice) * 1000 };
}

export default function FutbolStadyum({ team }) {
  const capacity = team.stadiumCapacity || DEFAULT_CAPACITY;
  const fans = team.fans || 0;

  const currentIdx = STADIUM_LADDER.findIndex((step) => step.capacity === capacity);
  const nextStep = currentIdx >= 0 ? STADIUM_LADDER[currentIdx + 1] : null;
  const tierProgress = currentIdx >= 0 ? ((currentIdx + 1) / STADIUM_LADDER.length) * 100 : 0;

  const [ticketPrice, setTicketPrice] = useState(team.ticketPrice || DEFAULT_TICKET_PRICE);
  const [savedTicketPrice, setSavedTicketPrice] = useState(team.ticketPrice || DEFAULT_TICKET_PRICE);
  const [busySave, setBusySave] = useState(false);
  const [busyUpgrade, setBusyUpgrade] = useState(false);
  const [error, setError] = useState('');
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);

  useEffect(() => {
    setTicketPrice(team.ticketPrice || DEFAULT_TICKET_PRICE);
    setSavedTicketPrice(team.ticketPrice || DEFAULT_TICKET_PRICE);
  }, [team.ticketPrice]);

  const attendance = useMemo(() => estimateAttendance(fans, ticketPrice, capacity), [fans, ticketPrice, capacity]);
  const revenue = attendance * ticketPrice;
  const fanEffect = useMemo(() => maxFanEffect(ticketPrice), [ticketPrice]);

  const handleUpgrade = () => setConfirmUpgrade(true);

  const runUpgrade = async () => {
    setConfirmUpgrade(false);
    setBusyUpgrade(true);
    setError('');
    try {
      await upgradeFutbolStadium(team.id);
    } catch (err) {
      setError(err?.message || 'Yükseltme başarısız.');
    } finally {
      setBusyUpgrade(false);
    }
  };

  const handleSaveTicketPrice = async () => {
    setBusySave(true);
    setError('');
    try {
      await setFutbolTicketPrice(team.id, ticketPrice);
      setSavedTicketPrice(ticketPrice);
    } catch (err) {
      setError(err?.message || 'Bilet fiyatı kaydedilemedi.');
    } finally {
      setBusySave(false);
    }
  };

  return (
    <div className="futbol-stadyum">
      {error && <p className="futbol-admin-error">{error}</p>}

      <div className="futbol-stadyum-card">
        <p className="futbol-kadro-section-title">🏟️ Stadyum Kapasitesi</p>
        <div className="futbol-stadyum-capacity-row">
          <span className="futbol-stadyum-capacity-icon">🏟️</span>
          <p className="futbol-stadyum-capacity">{capacity.toLocaleString('tr-TR')} kişi</p>
        </div>
        <p className="futbol-buy-meta">
          👥 Toplam taraftar sayımız: <strong>{fans.toLocaleString('tr-TR')}</strong>
        </p>

        <div className="futbol-stadyum-tier-track">
          <div className="futbol-stadyum-tier-fill" style={{ width: `${tierProgress}%` }} />
        </div>
        <p className="futbol-stadyum-tier-label">
          Seviye {currentIdx + 1} / {STADIUM_LADDER.length}
        </p>

        {nextStep ? (
          <>
            <p className="futbol-buy-meta">
              📈 Bir sonraki seviye: {nextStep.capacity.toLocaleString('tr-TR')} kişi — 💰{' '}
              {nextStep.cost.toLocaleString('tr-TR')} altın
            </p>
            <button className="futbol-admin-submit" disabled={busyUpgrade} onClick={handleUpgrade}>
              {busyUpgrade ? '...' : '🏗️ Stadyumu Büyüt'}
            </button>
          </>
        ) : (
          <p className="futbol-placeholder">🏆 Maksimum seviyedesiniz.</p>
        )}
      </div>

      <div className="futbol-stadyum-card">
        <p className="futbol-kadro-section-title">🎟️ Bilet Fiyatı</p>
        <div className="futbol-stadyum-price-stepper">
          <button
            type="button"
            className="qty-stepper-btn"
            disabled={ticketPrice <= MIN_TICKET_PRICE}
            onClick={() => setTicketPrice((p) => Math.max(MIN_TICKET_PRICE, p - 1))}
          >
            −
          </button>
          <span className="futbol-stadyum-price-value">🎫 {ticketPrice}</span>
          <button
            type="button"
            className="qty-stepper-btn"
            disabled={ticketPrice >= MAX_TICKET_PRICE}
            onClick={() => setTicketPrice((p) => Math.min(MAX_TICKET_PRICE, p + 1))}
          >
            +
          </button>
        </div>

        <div className="futbol-stadyum-estimate">
          <p className="futbol-buy-meta futbol-stadyum-estimate-row">
            <span>👥 Tahmini seyirci: {attendance.toLocaleString('tr-TR')}</span>
            <span>💰 Tahmini bilet geliri: {revenue.toLocaleString('tr-TR')} altın</span>
          </p>
          {fanEffect.type === 'loss' && (
            <p className="futbol-stadyum-warning">
              📉 Bilet fiyatın yüksek: 1-{fanEffect.amount.toLocaleString('tr-TR')} taraftar
              kaybedebilirsin.
            </p>
          )}
          {fanEffect.type === 'gain' && (
            <p className="futbol-stadyum-positive">
              📈 1-{fanEffect.amount.toLocaleString('tr-TR')} taraftar kazanabilirsin.
            </p>
          )}
        </div>

        <button
          className="futbol-admin-submit"
          disabled={busySave || ticketPrice === savedTicketPrice}
          onClick={handleSaveTicketPrice}
        >
          {busySave ? '...' : '💾 Bilet Fiyatını Kaydet'}
        </button>
      </div>

      {confirmUpgrade && nextStep && (
        <ConfirmModal
          title="Stadyumu Büyüt"
          message={`${nextStep.capacity.toLocaleString('tr-TR')} kişilik stadyuma yükseltmek için ${nextStep.cost.toLocaleString('tr-TR')} altın harcayacaksın. Onaylıyor musun?`}
          confirmLabel="Evet, Büyüt"
          onConfirm={runUpgrade}
          onCancel={() => setConfirmUpgrade(false)}
        />
      )}
    </div>
  );
}
