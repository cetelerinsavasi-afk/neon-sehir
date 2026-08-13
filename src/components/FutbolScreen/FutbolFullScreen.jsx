import { useAuth } from '../../contexts/AuthContext';
import GuestOverlay from '../GuestOverlay/GuestOverlay';
import FutbolShell from './FutbolShell';
import './FutbolFullScreen.css';

/**
 * FutbolFullScreen — Futbol modülünün giriş noktası. Oyun genelinden
 * bağımsız çalışır (mevcut haritayı/HUD'u etkilemez). Giriş yapmamış
 * (misafir) oyuncular da modülü salt-okunur gezebilir (ligler, puan
 * tablosu, kadrolar vb.) — GuestOverlay tüm gerçek aksiyonları (transfer,
 * antrenman, iddaa vb.) şeffaf bir katmanla engelleyip "Google ile Giriş
 * Yap" kartı gösterir.
 *
 * FutbolShell'in kendi kapatma (✕) butonu da bu katmanın altında kaldığı
 * için, misafir oyuncunun ekranda sıkışıp kalmaması adına ayrı, her zaman
 * tıklanabilir bir kapatma butonu GuestOverlay'in ÜZERİNDE (daha yüksek
 * z-index'te) ayrıca render edilir; görsel olarak aynı köşede oturur.
 */
export default function FutbolFullScreen({ onClose }) {
  const { user } = useAuth();

  return (
    <>
      <GuestOverlay>
        <FutbolShell onClose={onClose} />
      </GuestOverlay>
      {!user && (
        <button
          type="button"
          className="futbol-fullscreen-close futbol-guest-escape-close"
          onClick={onClose}
          aria-label="Kapat"
        >
          ✕
        </button>
      )}
    </>
  );
}
