import { useLatestFutbolNewsEvent } from '../../hooks/useLatestFutbolNewsEvent';
import FutbolCrest from './FutbolCrest';
import './FutbolSeasonCelebration.css';

// FutbolSeasonCelebration — lig sezonu tamamlanınca başlayan 1 günlük
// kutlama gününde "Maçlar" alt sekmesinin yerini alan sezon özeti ekranı
// (kullanıcı promptu madde 15/16/32/33). Tüm veriler football_season_end
// gazete haberinden geliyor — finishFutbolSeasonPart1 tarafından, sezon
// biterken (henüz hiçbir şey sıfırlanmadan) BİR KEZ, gerçek verilerden
// hesaplanıp yazılıyor. Burada hiçbir sayı UYDURULMUYOR, sadece o olay
// gösteriliyor.
export default function FutbolSeasonCelebration() {
  const { event, loading } = useLatestFutbolNewsEvent('football_season_end');

  if (loading) return <p className="futbol-placeholder">Yükleniyor...</p>;
  if (!event) {
    return (
      <p className="futbol-placeholder">
        🎉 Sezon sona erdi, yeni sezon hazırlanıyor — kutlama günü sona erdiğinde ligler kaldığı yerden
        devam edecek.
      </p>
    );
  }

  const champion = event.topThree?.find((t) => t.rank === 1);
  const second = event.topThree?.find((t) => t.rank === 2);
  const third = event.topThree?.find((t) => t.rank === 3);

  return (
    <div className="futbol-celebration">
      <p className="futbol-celebration-kicker">🎉 SEZON SONA ERDİ — ŞAMPİYONLUK KUTLAMALARI 🎉</p>

      {champion && (
        <div className="futbol-celebration-champion">
          <p className="futbol-celebration-champion-label">🏆 1. LİG ŞAMPİYONU</p>
          <FutbolCrest logo={champion.logo} initials={champion.teamName?.[0]} size={72} />
          <p className="futbol-celebration-champion-name">{champion.teamName}</p>
        </div>
      )}

      <div className="futbol-celebration-podium">
        {second && (
          <div className="futbol-celebration-podium-item">
            <FutbolCrest logo={second.logo} initials={second.teamName?.[0]} size={40} />
            <p>🥈 {second.teamName}</p>
          </div>
        )}
        {third && (
          <div className="futbol-celebration-podium-item">
            <FutbolCrest logo={third.logo} initials={third.teamName?.[0]} size={40} />
            <p>🥉 {third.teamName}</p>
          </div>
        )}
      </div>

      {event.promotions?.length > 0 && (
        <div className="futbol-celebration-section">
          <p className="futbol-celebration-section-title">⬆️ LİG YÜKSELENLER</p>
          {event.promotions.map((p, i) => (
            <p key={i} className="futbol-celebration-row">
              {p.teamName} — {p.fromTier}. Lig → {p.toTier}. Lig
            </p>
          ))}
        </div>
      )}

      {event.relegations?.length > 0 && (
        <div className="futbol-celebration-section">
          <p className="futbol-celebration-section-title">⬇️ LİG DÜŞENLER</p>
          {event.relegations.map((p, i) => (
            <p key={i} className="futbol-celebration-row">
              {p.teamName} — {p.fromTier}. Lig → {p.toTier}. Lig
            </p>
          ))}
        </div>
      )}

      {event.cup?.championTeamName && (
        <div className="futbol-celebration-section">
          <p className="futbol-celebration-section-title">🏆 NEON KUPASI ŞAMPİYONU</p>
          <div className="futbol-celebration-row futbol-celebration-cup-row">
            <FutbolCrest logo={event.cup.championLogo} initials={event.cup.championTeamName?.[0]} size={28} />
            <span>{event.cup.championTeamName}</span>
          </div>
          {event.cup.finalistTeamName && (
            <p className="futbol-celebration-row futbol-muted">🥈 Finalist: {event.cup.finalistTeamName}</p>
          )}
        </div>
      )}

      <div className="futbol-celebration-stats">
        {event.topScorerTeam && (
          <div className="futbol-celebration-stat">
            <p className="futbol-celebration-stat-label">⚽ En Çok Gol Atan Takım</p>
            <p className="futbol-celebration-stat-value">
              {event.topScorerTeam.teamName} ({event.topScorerTeam.goals} gol)
            </p>
          </div>
        )}
        {event.bestDefenseTeam && (
          <div className="futbol-celebration-stat">
            <p className="futbol-celebration-stat-label">🛡️ En Az Gol Yiyen Takım</p>
            <p className="futbol-celebration-stat-value">
              {event.bestDefenseTeam.teamName} ({event.bestDefenseTeam.conceded} gol yedi)
            </p>
          </div>
        )}
        {event.bestPlayer && (
          <div className="futbol-celebration-stat">
            <p className="futbol-celebration-stat-label">⭐ Sezonun En İyi Oyuncusu</p>
            <p className="futbol-celebration-stat-value">
              {event.bestPlayer.playerName} — {event.bestPlayer.teamName} (Güç: {event.bestPlayer.power})
            </p>
          </div>
        )}
        {event.mostValuableTeam && (
          <div className="futbol-celebration-stat">
            <p className="futbol-celebration-stat-label">💎 En Değerli Takım</p>
            <p className="futbol-celebration-stat-value">
              {event.mostValuableTeam.teamName} ({event.mostValuableTeam.value.toLocaleString('tr-TR')} altın)
            </p>
          </div>
        )}
        {event.leastValuableTeam && (
          <div className="futbol-celebration-stat">
            <p className="futbol-celebration-stat-label">📉 En Değersiz Takım</p>
            <p className="futbol-celebration-stat-value">
              {event.leastValuableTeam.teamName} ({event.leastValuableTeam.value.toLocaleString('tr-TR')} altın)
            </p>
          </div>
        )}
      </div>

      <p className="futbol-placeholder futbol-celebration-footer">
        Puan tablosu, fikstür ve maç sonuçları bu sezonun son hali olarak görünmeye devam ediyor. Yarın
        yeni sezon başlayacak.
      </p>
    </div>
  );
}
