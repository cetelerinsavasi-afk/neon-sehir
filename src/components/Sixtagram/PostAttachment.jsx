import AvatarSvg from '../AvatarSvg/AvatarSvg';
import FutbolCrest from '../FutbolScreen/FutbolCrest';
import PriceChart from '../PriceChart/PriceChart';
import '../PriceChart/PriceChart.css';
import { vehicleImage } from '../VehicleCard/VehicleCard';
import './PostAttachment.css';

// PostAttachment — Sixtagram gönderisine eklenen "görsel"i render eder.
// Hepsi oyunun kendi verisinden (sunucuda doğrulanmış) üretiliyor — dosya
// yükleme YOK, bu yüzden her zaman anında ve tutarlı görünür.
export default function PostAttachment({ attachment }) {
  if (!attachment) return null;

  if (attachment.type === 'avatar') {
    return (
      <div className="post-att post-att-avatar">
        <div className="post-att-avatar-frame">
          <div className="post-att-avatar-inner">
            <AvatarSvg avatar={attachment.avatar} />
          </div>
        </div>
      </div>
    );
  }

  if (attachment.type === 'vehicle') {
    const img = vehicleImage(attachment.catalogId);
    return (
      <div className="post-att post-att-vehicle">
        {img && <img src={img} alt={attachment.model} className="post-att-vehicle-img" />}
        <div className="post-att-vehicle-caption">
          <p className="post-att-vehicle-name">{attachment.model}</p>
          <p className="post-att-vehicle-sub">
            Vites {attachment.gearLevel}
            {attachment.gearUpgraded ? ' (geliştirilmiş)' : ''}
            {attachment.tankUpgraded ? ' · Depo geliştirilmiş' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (attachment.type === 'iddaa') {
    const pickLabel = { home: 'Ev Sahibi', draw: 'Beraberlik', away: 'Deplasman' };
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">🎟️ İddaa Kuponu</p>
        <p className="post-att-card-line">
          {attachment.leagueName || 'Lig'} · {attachment.round}. Hafta ·{' '}
          {attachment.stake.toLocaleString('tr-TR')} altın
        </p>
        <div className="post-att-predictions">
          {(attachment.predictions || []).map((p, i) => (
            <div
              key={i}
              className={`post-att-prediction-row ${
                p.correct === true ? 'correct' : p.correct === false ? 'wrong' : ''
              }`}
            >
              <span className="post-att-prediction-teams">
                {p.homeName} - {p.awayName}
                {p.homeScore != null && p.awayScore != null && (
                  <span className="post-att-prediction-score">
                    {' '}
                    ({p.homeScore}-{p.awayScore})
                  </span>
                )}
              </span>
              <span className="post-att-prediction-pick">
                {pickLabel[p.pick] || p.pick}
                {p.correct === true && ' ✅'}
                {p.correct === false && ' ❌'}
              </span>
            </div>
          ))}
        </div>
        <p
          className={`post-att-card-status post-att-status-${attachment.status}`}
        >
          {attachment.status === 'pending' && '⏳ Sonuç bekleniyor'}
          {attachment.status === 'won' &&
            `✅ Kazandı! ${attachment.payout.toLocaleString('tr-TR')} altın`}
          {attachment.status === 'lost' && '❌ Tutmadı'}
        </p>
      </div>
    );
  }

  if (attachment.type === 'lastMatches') {
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">⚽ Son Oynanan Maçlar</p>
        {attachment.leagueName && <p className="post-att-card-line">{attachment.leagueName}</p>}
        <div className="post-att-matches">
          {attachment.matches.map((m, i) => (
            <div key={i} className="post-att-match-row">
              <FutbolCrest logo={m.homeLogo} initials={m.homeName?.[0]} size={22} />
              <span className="post-att-match-team">{m.homeName}</span>
              <span className="post-att-match-score">
                {m.homeScore} - {m.awayScore}
              </span>
              <span className="post-att-match-team">{m.awayName}</span>
              <FutbolCrest logo={m.awayLogo} initials={m.awayName?.[0]} size={22} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (attachment.type === 'upcomingMatches') {
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">🔜 Sıradaki Maçlar</p>
        <p className="post-att-card-line">
          {attachment.leagueName || 'Lig'} · {attachment.round}. Hafta
        </p>
        <div className="post-att-matches">
          {attachment.matches.map((m, i) => (
            <div key={i} className="post-att-match-row">
              <FutbolCrest logo={m.homeLogo} initials={m.homeName?.[0]} size={22} />
              <span className="post-att-match-team">{m.homeName}</span>
              <span className="post-att-match-vs">vs</span>
              <span className="post-att-match-team">{m.awayName}</span>
              <FutbolCrest logo={m.awayLogo} initials={m.awayName?.[0]} size={22} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (attachment.type === 'investment') {
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">📈 {attachment.assetLabel}</p>
        <p className="post-att-card-line">
          Güncel: {attachment.current.toLocaleString('tr-TR')} altın
        </p>
        <PriceChart points={attachment.points} color="#19e8ff" />
      </div>
    );
  }

  if (attachment.type === 'fine') {
    return (
      <div className="post-att post-att-card post-att-fine">
        <p className="post-att-card-title">🚨 Cezam</p>
        <p className="post-att-fine-amount">
          {attachment.totalAmount.toLocaleString('tr-TR')} altın
        </p>
        <p className="post-att-card-line">
          {attachment.count > 1 ? `${attachment.count} kez yakalandım` : 'Yakalandım'}
        </p>
      </div>
    );
  }

  if (attachment.type === 'debt') {
    return (
      <div className="post-att post-att-card post-att-fine">
        <p className="post-att-card-title">💸 Devlete Borcum</p>
        <p className="post-att-fine-amount">{attachment.amount.toLocaleString('tr-TR')} altın</p>
      </div>
    );
  }

  if (attachment.type === 'parkPhoto') {
    const people = attachment.participants || [];
    return (
      <div className="post-att post-att-parkphoto">
        <div className="post-att-parkphoto-frame">
          <div className="post-att-parkphoto-row">
            {people.map((p, i) => (
              <div key={i} className="post-att-parkphoto-person">
                <div className="post-att-parkphoto-avatar">
                  <AvatarSvg avatar={p.avatar} variant="full" />
                </div>
                <span className="post-att-parkphoto-name">{p.displayName}</span>
              </div>
            ))}
          </div>
          <span className="post-att-parkphoto-badge">📷 {attachment.scene}</span>
        </div>
      </div>
    );
  }

  return null;
}
