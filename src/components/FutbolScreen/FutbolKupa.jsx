import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFutbolCup } from '../../hooks/useFutbolCup';
import FutbolCrest from './FutbolCrest';
import FutbolMatchDetail from './FutbolMatchDetail';
import { useNowTick } from './futbolLiveMatch';
import { ROUND_ORDER, ROUND_LABELS, CupMatchRow } from './FutbolCupBetting';
import './FutbolLigler.css';
import './FutbolIddaa.css';

// FutbolKupa — Futbol > Ligler > Kupa sekmesi. KULLANICI İSTEĞİ: "kupa
// maçının iddaaları hala kupa sekmesinde duruyor, iddaa bayine taşıyalım"
// — bu sekme artık SADECE kupa eşleşme ağacını (hangi tur, kim kiminle
// eşleşti, kim bir üst tura çıktı) ve şampiyonu gösteriyor; kupa iddaası
// (çoklu maç kuponu, FutbolCupBetting bileşeni) buradan kaldırıldı ve
// SADECE İddaa Bayii sekmesinde gösteriliyor (bkz. FutbolLigler.jsx).
export default function FutbolKupa({ season }) {
  const { cup, matches, loading } = useFutbolCup(season);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedMatchHomeSponsor, setSelectedMatchHomeSponsor] = useState(null);
  // KULLANICI İSTEĞİ: "kupa maçlarında saat emojisi var, izlemeden sonucu
  // göremiyoruz" — MatchList (lig maçları, FutbolLigler.jsx) İLE AYNI
  // şekilde CupMatchRow'un canlı skoru hesaplayabilmesi için "şu an" burada
  // da (5 saniyede bir) tazeleniyor.
  const now = useNowTick(5000);

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

  // KULLANICI İSTEĞİ: "maç fikstürüne tıkladığımızda bugünün olduğu maçın
  // olduğu kısma otomatik bizi atıyor, kupa sekmesinde de bu özellik olsun,
  // kupanın hangi aşamasındaysak ekran o kısımda açılsın" — FutbolLigler.jsx'teki
  // "Maç Fikstürü" sekmesiyle AYNI desen (round -> ref haritası + rAF'lı
  // scrollIntoView). Kupa bittiyse (cup.status === 'DONE') zaten en üstteki
  // şampiyon banner'ı gösterilecek şekilde sayfa açılıyor, kaydırmaya gerek yok.
  const roundRefs = useRef({});
  useEffect(() => {
    if (!cup || cup.status === 'DONE') return;
    const target = roundRefs.current[cup.status];
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center' });
      });
    }
  }, [cup, cup?.status]);

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

      <p className="futbol-kadro-section-title">🌳 Kupa Eşleşmeleri</p>
      <div className="futbol-cup-bracket">
        {ROUND_ORDER.map((round) => {
          const roundMatches = matchesByRound[round] || [];
          if (roundMatches.length === 0) return null;
          return (
            <div key={round} className="futbol-match-round">
              <p className="futbol-match-round-title">{ROUND_LABELS[round]}</p>
              {roundMatches.map((m) => (
                <CupMatchRow key={m.id} match={m} onSelect={setSelectedMatch} now={now} />
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
