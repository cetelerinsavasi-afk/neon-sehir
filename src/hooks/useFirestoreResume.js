import { useEffect, useRef } from 'react';
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

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        triggerReconnect();
      }
    };
    const onPageShow = (e) => {
      // e.persisted: sayfa bfcache'den (ör. iOS Safari'de geri/ileri
      // gezinme) geri geldiğinde true olur — bu durumda da bağlantı
      // durağanlaşmış olabilir.
      if (e.persisted) triggerReconnect();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onVisible);
    };
  }, [runOnMount]);
}
