// v177 — Oyunun Motor Galerisi (camiinin arkasındaki binanın zemin katı): içine girilmez,
// kapıdaki listeden seçilince 4 motorun listesi açılır. Fiyat: stoğu olan en ucuz oyuncu motor
// galerisi (yoksa oyunun fiyatı) — araba galerisiyle aynı sistem (buyVehicle → gameStoreBuy).
import { usePlayer } from '../../hooks/usePlayer';
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import './MotorGalleryScreen.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

export default function MotorGalleryScreen({ onClose }) {
  const { player } = usePlayer();
  return (
    <div className="mg-root">
      <div className="mg-head">
        <b>🏍️ Neon Motor Galerisi</b>
        <span className="mg-gold">
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(player?.gold)}
        </span>
        <button className="mg-x" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="mg-body">
        <VehicleGalleryScreen shop="motogaleri" />
      </div>
    </div>
  );
}
