import { useEffect, useRef } from 'react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';
import { reconnectFirestore } from '../lib/reconnectFirestore';

// Aynı anda birden fazla bileşen bu hook'u kullanabilir (örn. App kökünde +
// Yarış/10 Numara tam ekranlarında) — hepsi aynı anda tetiklenirse gereksiz
// yere art arda disable/enable network çağrısı yapılmasın diye küçük bir
// "son ne zaman tetiklendi" korumasını modül seviyesinde paylaşıyoruz.
let lastTriggeredAt = 0;
// MIN_INTERVAL_MS — Firestore maliyet optimizasyonu: her tetiklenme TÜM aktif
// onSnapshot dinleyicilerini sıfırdan yeniden kurup (disable/enableNetwork)
// güncel sonuç kümelerini yeniden okutuyor — yani her reconnect gerçek bir
// okuma maliyeti. 2sn'lik eski pencere, sekme geçişi/pencere odak
// değişikliği gibi sık olaylarda gereksiz yere art arda tetiklenmeye çok
// açıktı. 15sn'e çıkarıldı: gerçek "arka plana alıp geri getirme" senaryosu
// (bu hook'un asıl çözmeye çalıştığı "donmuş ekran" sorunu) hâlâ ilk
// tetiklemede düzeliyor, sadece kısa aralıklı tekrar tetiklenmeler engelleniyor.
const MIN_INTERVAL_MS = 15000;
// sayfa en az bu kadar arka planda kaldıysa yeniden bağlan (kısa geçişlerde değil)
const HIDDEN_MIN_MS = 20000;
let hiddenAt = 0;
// v90.1 maliyet: uygulama/sekme bu kadar süre ARKA PLANDA kalırsa Firestore ağı
// duraklatılır. Açık bırakılıp unutulan sekmeler/telefonlar saatlerce her
// değişikliği (sohbet, savaş, SMS, sayaçlar…) boşuna okumaya devam ediyordu.
// Öne gelince ağ tekrar açılır; dinleyiciler kaldıkları yerden güncellenir
// (zaten öne gelince yapılan yeniden bağlanmanın aynısı).
const PAUSE_AFTER_HIDDEN_MS = 90_000;
let pauseTimer = null;
let paused = false;
function schedulePause() {
  if (pauseTimer || paused) return;
  pauseTimer = setTimeout(() => {
    pauseTimer = null;
    if (document.visibilityState !== 'hidden') return;
    paused = true;
    disableNetwork(db).catch(() => {
      paused = false;
    });
  }, PAUSE_AFTER_HIDDEN_MS);
}
// true dönerse ağ duraklatılmıştı ve şimdi açıldı (ayrıca yeniden bağlanmaya gerek yok)
function resumeIfPaused() {
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  if (!paused) return false;
  paused = false;
  lastTriggeredAt = Date.now();
  enableNetwork(db).catch(() => {});
  return true;
}

function triggerReconnect() {
  const now = Date.now();
  if (now - lastTriggeredAt < MIN_INTERVAL_MS) return;
  lastTriggeredAt = now;
  reconnectFirestore();
}

/**
 * useFirestoreResume — iOS/Android'de sekme veya uygulama (PWA) arka plana
 * alınıp geri geldiğinde, Firestore'un canlı dinleyicileri (onSnapshot)
 * bazen "durağanlaşmış" (stale) kalıyor: bağlantı teknik olarak duruyor
 * gibi görünse de sunucudan gelen yeni veriler ekrana yansımıyor. Bu da
 * özellikle Yarış ve 10 Numara gibi tempolu ekranlarda "donmuş" hissi
 * veriyor — bir emoji göndermek gibi network'ü zorlayan başka bir işlem
 * yapılana kadar düzelmiyor.
 *
 * Bu hook, sayfa/uygulama tekrar görünür hâle geldiği her an
 * (visibilitychange + pageshow, iOS'ta bfcache'den geri dönüşü de
 * kapsıyor) Firestore ağını bilinçli olarak kapatıp açarak TÜM aktif
 * dinleyicilerin sıfırdan yeniden kurulmasını sağlıyor.
 *
 * `runOnMount` true ise, bileşen ilk mount olduğunda da hemen bir kez
 * tetikler — bu, Yarış/10 Numara ekranına YENİ girildiğinde görülen
 * "başta lag, sonra düzeliyor" hissini engellemeyi hedefler (altta yatan
 * bağlantı zaten durağanlaşmışsa, yeni ekranın dinleyicisi kurulur
 * kurulmaz taze bir bağlantıya kavuşur).
 */
export function useFirestoreResume({ runOnMount = false } = {}) {
  const mounted = useRef(false);

  useEffect(() => {
    if (runOnMount && !mounted.current) {
      mounted.current = true;
      triggerReconnect();
    }

    // v77 performans: ağı kapat-aç TÜM dinleyicileri sıfırdan kurar (okuma +
    // uygulama genelinde yeniden çizim fırtınası). Artık sadece sayfa en az
    // HIDDEN_MIN_MS arka planda kaldıysa yapılır; kısa sekme/pencere geçişleri
    // ve masaüstündeki "focus" olayları tetiklemez.
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        schedulePause();
        return;
      }
      if (resumeIfPaused()) {
        hiddenAt = 0;
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= HIDDEN_MIN_MS) triggerReconnect();
      hiddenAt = 0;
    };
    const onPageShow = (e) => {
      // e.persisted: sayfa bfcache'den (ör. iOS Safari'de geri/ileri
      // gezinme) geri geldiğinde true olur — bu durumda da bağlantı
      // durağanlaşmış olabilir.
      if (e.persisted && !resumeIfPaused()) triggerReconnect();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [runOnMount]);
}
