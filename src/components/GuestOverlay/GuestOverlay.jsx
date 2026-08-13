import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './GuestOverlay.css';

/**
 * GuestOverlay — bir bölümü (Futbol, Soygun vb.) misafir (giriş yapmamış)
 * oyunculara SALT-OKUNUR gezdirmek için kullanılan genel-amaçlı sarmalayıcı.
 *
 * - Giriş yapmış (ya da auth durumu hâlâ yükleniyor olan) kullanıcılar için
 *   tamamen şeffaftır: children hiçbir sarmalama/katman eklenmeden, birebir
 *   aynı şekilde döner. Görsel/davranışsal HİÇBİR fark yoktur.
 * - Giriş yapmamış oyuncular için children YİNE normal şekilde render edilir
 *   (misafir gerçek içeriği görür — lig verisi, hedef listesi vb. gizlenmez),
 *   ama üzerine tüm ekranı kaplayan, görünmez (soldurmayan) bir "kalkan"
 *   eklenir. Bu kalkana yapılan HER tıklama altındaki gerçek aksiyona
 *   ulaşmadan durdurulur; yerine küçük, kapatılabilir bir "Google ile Giriş
 *   Yap" kartı gösterilir. Kartı kapatan oyuncu gezmeye devam edebilir.
 *
 * Tek tek her onClick'i (transfer, antrenman, iddaa, soygun planlama, ...)
 * denetlemek yerine, TÜM etkileşimi tek bir katmanda engelleyen kasıtlı
 * olarak kaba (blunt) bir çözümdür.
 */
export default function GuestOverlay({ children }) {
  const { user, loading } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);

  if (loading || user) {
    return children;
  }

  return (
    <>
      {children}
      <div className="guest-overlay-shield" onClick={() => setShowPrompt(true)}>
        {showPrompt && (
          <div
            className="guest-overlay-backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setShowPrompt(false);
            }}
          >
            <div className="guest-overlay-card" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="guest-overlay-card-close"
                onClick={() => setShowPrompt(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
              <SignInPrompt message="Misafir modundasın — bunu yapmak için giriş yapmalısın." />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
