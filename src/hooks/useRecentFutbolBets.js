import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const RECENT_LIMIT = 10;

/**
 * useRecentFutbolBets — kullanıcının TÜM liglerdeki en son iddaa
 * kuponları (Sixtagram > "İddaa Kuponu" eki seçici için). leagueId
 * filtresi YOK (useMyFutbolBets'in aksine) — composite index gerekmesin
 * diye orderBy de yok, sıralama istemcide yapılıyor.
 *
 * KULLANICI İSTEĞİ: "kupa için yaptığımız iddaa kuponunu sixtagramda
 * paylaşamıyoruz ... kupa maçıyla alakalı her şeyi neden lig maçlarından
 * farklı yapmak zorunda hissediyorsun" — kupa kuponları (futbolCupBets)
 * oyuncunun gözünde SIRADAN bir iddaa kuponu, sadece ayrı bir Firestore
 * koleksiyonunda yaşıyor (bkz. placeFutbolCupBet). Bu yüzden burada da
 * lig kuponlarıyla AYNI şekilde, tek bir birleşik listede dinleniyorlar —
 * her kupona `isCup` bayrağı eklenip ComposeModal.jsx'te ayırt ediliyor.
 */
export function useRecentFutbolBets() {
  const { user } = useAuth();
  const [leagueBets, setLeagueBets] = useState([]);
  const [cupBets, setCupBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLeagueBets([]);
      setCupBets([]);
      setLoading(false);
      return undefined;
    }
    let leagueLoaded = false;
    let cupLoaded = false;
    const maybeStopLoading = () => {
      if (leagueLoaded && cupLoaded) setLoading(false);
    };

    const leagueQ = query(collection(db, 'futbolBets'), where('uid', '==', user.uid));
    const unsubLeague = onSnapshot(
      leagueQ,
      (snap) => {
        setLeagueBets(snap.docs.map((d) => ({ id: d.id, isCup: false, ...d.data() })));
        leagueLoaded = true;
        maybeStopLoading();
      },
      (err) => {
        console.error('useRecentFutbolBets (lig) dinleme hatası:', err);
        leagueLoaded = true;
        maybeStopLoading();
      }
    );

    const cupQ = query(collection(db, 'futbolCupBets'), where('uid', '==', user.uid));
    const unsubCup = onSnapshot(
      cupQ,
      (snap) => {
        setCupBets(snap.docs.map((d) => ({ id: d.id, isCup: true, ...d.data() })));
        cupLoaded = true;
        maybeStopLoading();
      },
      (err) => {
        console.error('useRecentFutbolBets (kupa) dinleme hatası:', err);
        cupLoaded = true;
        maybeStopLoading();
      }
    );

    return () => {
      unsubLeague();
      unsubCup();
    };
  }, [user]);

  const bets = [...leagueBets, ...cupBets]
    .sort((a, b) => (b.placedAt?.toMillis?.() || 0) - (a.placedAt?.toMillis?.() || 0))
    .slice(0, RECENT_LIMIT);

  return { bets, loading };
}
