import { recordVenueVisit } from '../services/gameActions';
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, deleteDoc, limit, onSnapshot, query, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useBlocks } from '../contexts/BlocksContext';
import { createPresenceWriter, useLiveMerge, useLiveRoomCleanup } from '../lib/livePresence';
import { liveRemove } from '../lib/liveNet';

// Bir presence kaydı ne kadar süre güncellenmezse "hayalet" (terk
// edilmiş sekme/çökme) sayılıp listeden düşürülür. Sunucu tarafında da
// expireParkPresence bunları birkaç dakika içinde tamamen siliyor — bu
// sadece ekranda anında doğru görünmesi için istemci tarafı filtre.
//
// NOT: Bu değer BİLEREK oldukça toleranslı (nabız aralığının çok
// üzerinde). Mobil tarayıcılar ekran kararınca/arka plana alınca
// requestAnimationFrame'i yavaşlatıyor ya da tamamen duraklatıyor —
// bu da nabız yazımının birkaç saniye gecikmesine yol açabiliyor. Eşik
// çok sıkı tutulursa (ör. nabız aralığına çok yakın), sadece ekranı
// kararan/hafifçe geciken bir arkadaş bile anlık olarak "kayboluyor"
// gibi görünüyordu.
const STALE_MS = 45_000;

// Aynı anda parkta çok fazla kişi olsa bile (viral bir an, bot saldırısı
// vb.) her istemcinin dinleyeceği doküman sayısını üst sınırlıyoruz —
// Firestore okuma maliyeti dinlenen doküman sayısıyla doğru orantılı,
// bu basit sınır kötü senaryoda faturayı öngörülebilir tutar.
const MAX_PRESENCE_DOCS = 40;

/**
 * useParkPresence — parkPresence koleksiyonunu canlı dinler ve KENDİ
 * dışındaki, yakın zamanda güncellenmiş oyuncuları döner. Konum
 * güncellemesi için `updatePresence` (throttle edilmiş, doğrudan
 * Firestore yazımı — bkz. ParkWorldScreen) ve ekrandan çıkarken
 * `clearPresence` sağlar.
 */
export function useParkPresence() {
  const { user } = useAuth();
  const [others, setOthers] = useState([]);

  // v77: ziyaret sayacı (Ziyaret › Popüler; günde hesap başına 1)
  useEffect(() => {
    if (!user) return;
    recordVenueVisit('park').catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setOthers([]);
      return undefined;
    }
    const ref = query(collection(db, 'parkPresence'), limit(MAX_PRESENCE_DOCS));
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const now = Date.now();
        const list = [];
        snap.forEach((d) => {
          if (d.id === user.uid) return;
          const data = d.data();
          const ms = data.updatedAt?.toMillis?.() ?? 0;
          if (!ms || now - ms > STALE_MS) return;
          list.push({ uid: d.id, ...data });
        });
        setOthers(list);
      },
      (err) => {
        console.error('useParkPresence dinleme hatası:', err);
      }
    );
    return unsubscribe;
  }, [user]);

  // v79 maliyet: yürürken konum RTDB'den akar, Firestore seyrek yenilenir (bkz. lib/livePresence.js)
  const liveRoom = 'park/park';
  const api = useMemo(
    () => {
      const write = createPresenceWriter(liveRoom, async (uid, patch) => {
        try {
          await setDoc(doc(db, 'parkPresence', uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
        } catch (err) {
          console.error('Park konum güncelleme hatası:', err);
        }
      });
      return {
        updatePresence: (uid, patch) => write(uid, patch),
        clearPresence: async (uid) => {
          liveRemove(liveRoom, uid);
          try {
            await deleteDoc(doc(db, 'parkPresence', uid));
          } catch {
            // Sekme zaten kapanıyor olabilir — sunucu tarafı süpürme zaten temizler.
          }
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveRoom]
  );
  useLiveRoomCleanup(liveRoom, user?.uid);
  const liveOthers = useLiveMerge(liveRoom, others, Boolean(user));

  // UGC D2: engellediğin oyuncunun konuşma balonu gösterilmez (avatarı görünür kalır).
  // Tüm dünya ekranları "others"ı buradan aldığı için tek noktada uygulanır.
  const { isBlocked } = useBlocks();
  const visibleOthers = useMemo(
    () => liveOthers.map((o) => (isBlocked(o.uid) ? { ...o, chatText: null, chatTs: null, blockedByMe: true } : o)),
    [liveOthers, isBlocked]
  );

  return { others: visibleOthers, ...api };
}
