import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFutbolCup } from '../../hooks/useFutbolCup';
import { useMyFutbolCupBets } from '../../hooks/useMyFutbolCupBets';
import FutbolCrest from './FutbolCrest';
import FutbolMatchDetail from './FutbolMatchDetail';
import FutbolCupBetting, { ROUND_ORDER, ROUND_LABELS, CupMatchRow } from './FutbolCupBetting';
import './FutbolLigler.css';
import './FutbolIddaa.css';

// FutbolKupa — Futbol > Ligler > Kupa sekmesi. KULLANICI İSTEĞİ: kupa
// sekmesi artık ASIL OLARAK kupa eşleşme ağacını (hangi tur, kim kiminle
// eşleşti, kim bir üst tura çıktı) ve şampiyonu gösteriyor — kupa iddaası
// (çoklu maç kuponu) ortak FutbolCupBetting bileşeninde, aynısı İddaa Bayii
// sekmesinde de (bkz. FutbolLigler.jsx) gösteriliyor, artık bu sekmeye özel
// değil.
export default function FutbolKupa({ season }) {
  const { cup, matches, loading } = useFutbolCup(season);
  const { bets: myBets } = useMyFutbolCupBets(season);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedMatchHomeSponsor, setSelectedMatchHomeSponsor] = useState(null);

  const matchesByRound = useMemo(() => {
    const map = {};
    matches.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.slot || 0) - (b.slot || 0)));
    return map;
  }, [matches]);

  const championInfo = useMemo(() => {
    if (!cup || cup.status !== 'DONE') return null;
    const finalMatch = matchesByRound.FINAL?.[0];
    if (!finalMatch) return null;
    const isHomeChampion = finalMatch.homeTeamId === cup.championTeamId;
    return {
      name: isHomeChampion ? finalMatch.homeTeamName : finalMatch.awayTeamName,
      logo: isHomeChampion ? finalMatch.homeLogo : finalMatch.awayLogo,
      finalMatch,
    };
  }, [cup, matchesByRound]);

  // Kupa maçı dokümanları sponsor bilgisini kendi üstünde taşımıyor (bu
  // bilgi futbolTeams/{id} dokümanında yaşıyor, bkz. useFutbolCup.js) —
  // maç detayı açıldığında ev sahibi takımın güncel sponsorunu tek
  // seferlik (getDoc) çekiyoruz, canlı dinlemeye gerek yok.
  useEffect(() => {
    if (!selectedMatch?.homeTeamId) {
      setSelectedMatchHomeSponsor(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'futbolTeams', selectedMatch.homeTeamId))
      .then((snap) => {
        if (!cancelled) setSelectedMatchHomeSponsor(snap.exists() ? snap.data().sponsorFactoryName || null : null);
      })
      .catch(() => {
        if (!cancelled) setSelectedMatchHomeSponsor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMatch?.homeTeamId]);

  if (loading) return <p className="futbol-placeholder">Yükleniyor...</p>;

  if (!cup) {
    return (
      <p className="futbol-placeholder">
        Bu sezon için Neon Kupası henüz oluşturulmadı — kupa, bir sonraki sezon başlangıcından itibaren
        devreye girecek.
      </p>
    );
  }

  return (
    <div className="futbol-kupa">
      {cup.status === 'DONE' ? (
        <div className="futbol-cup-champion-banner">
          <p className="futbol-cup-champion-title">🏆 NEON KUPASI ŞAMPİYONU</p>
          {championInfo && (
            <div className="futbol-cup-champion-team">
              <FutbolCrest logo={championInfo.logo} initials={championInfo.name?.[0]} size={48} />
              <span>{championInfo.name}</span>
            </div>
          )}
          {championInfo?.finalMatch && (
            <p className="futbol-placeholder futbol-cup-final-score">
              Final: {championInfo.finalMatch.homeTeamName} {championInfo.finalMatch.homeScore} -{' '}
              {championInfo.finalMatch.awayScore} {championInfo.finalMatch.awayTeamName}
              {championInfo.finalMatch.penalty && (
                <> (Penaltılar: {championInfo.finalMatch.penalty.homeScore}-{championInfo.finalMatch.penalty.awayScore})</>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="futbol-placeholder">
          🏆 Neon Kupası — güncel aşama: <strong>{ROUND_LABELS[cup.status] || cup.status}</strong>
        </p>
      )}

      <FutbolCupBetting cup={cup} matches={matches} myBets={myBets} />

      <p className="futbol-kadro-section-title">🌳 Kupa Eşleşmeleri</p>
      <div className="futbol-cup-bracket">
        {ROUND_ORDER.map((round) => {
          const roundMatches = matchesByRound[round] || [];
          if (roundMatches.length === 0) return null;
          return (
            <div key={round} className="futbol-match-round">
              <p className="futbol-match-round-title">{ROUND_LABELS[round]}</p>
              {roundMatches.map((m) => (
                <CupMatchRow key={m.id} match={m} onSelect={setSelectedMatch} />
              ))}
            </div>
          );
        })}
      </div>

      {selectedMatch && (
        <FutbolMatchDetail
          match={selectedMatch}
          homeName={selectedMatch.homeTeamName}
          awayName={selectedMatch.awayTeamName}
          homeLogo={selectedMatch.homeLogo}
          awayLogo={selectedMatch.awayLogo}
          homeSponsorName={selectedMatchHomeSponsor}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}
