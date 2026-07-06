import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * reconnectFirestore — Firestore'un canlı dinleyici (onSnapshot)
 * bağlantısı, cihaz uykuya daldığında/tarayıcı sekmesi uzun süre arka
 * planda kaldığında bazen "durağanlaşıyor" (stale) — yeni veri gelse
 * bile ekrana yansımıyor. 10 Numara ve Yarış gibi anlık tempolu
 * oyunlarda bu "donma" gibi hissettiriyor.
 *
 * Bunu düzeltmenin en güvenilir yolu: ağı bilinçli olarak kapat-aç —
 * bu, SDK'ya TÜM aktif dinleyicileri sıfırdan yeniden kurmasını
 * söyler. Kullanıcılar bunu "Yenile" butonuna basarak tetikleyebilir
 * (sayfayı yeniden yüklemeye gerek kalmadan).
 */
export async function reconnectFirestore() {
  try {
    await disableNetwork(db);
  } catch {
    // yoksay
  }
  try {
    await enableNetwork(db);
  } catch {
    // yoksay
  }
}
