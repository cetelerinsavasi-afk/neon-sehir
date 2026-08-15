import { useParkPresence } from '../../hooks/useParkPresence';
import { useInteriorPresence } from '../../hooks/useInteriorPresence';
import { regionEmojis, regionLabels } from '../../data/regions';
import GuestOverlay from '../GuestOverlay/GuestOverlay';
import './VisitTab.css';

// VisitTab (Ziyaret) — yeni istek: "burada ziyaret edebileceğimiz mekanlar
// ve içinde anlık olarak kaç oyuncu bulunduğu yazacak, direkt oradan
// mekanları ziyaret edebileceğiz ve oradan girdiysek mekandan çıktığımızda
// yine o ekran açık şekilde bizi bekleyecek." Sadece canlı-oyuncu takibi
// olan (walk edilebilir + canlı sohbet/kamera) 8 mekan burada listeleniyor
// — Fabrika/Liman gibi anlık oyuncu sayısı takip edilmeyen "yönetim"
// ekranları kapsam dışı (zaten "ziyaret" kavramına uymuyorlar). Sıralama:
// içindeki oyuncu sayısı en çok olan en üstte.
export default function VisitTab({ onVisitVenue }) {
  const park = useParkPresence();
  const banka = useInteriorPresence('banka');
  const karakol = useInteriorPresence('karakol');
  const camii = useInteriorPresence('camii');
  const gazino = useInteriorPresence('gazino');
  const arabaGalerisi = useInteriorPresence('araba_galerisi');
  const silahMagazasi = useInteriorPresence('silah_magazasi');
  const modifiyeGaraji = useInteriorPresence('modifiye_garaji');

  const items = [
    { key: 'park', name: regionLabels.park, emoji: regionEmojis.park, count: park.others.length, openKey: 'park' },
    { key: 'banka', name: regionLabels.banka, emoji: regionEmojis.banka, count: banka.others.length, openKey: 'banka' },
    { key: 'karakol', name: regionLabels.karakol, emoji: regionEmojis.karakol, count: karakol.others.length, openKey: 'karakol' },
    { key: 'camii', name: regionLabels.camii, emoji: regionEmojis.camii, count: camii.others.length, openKey: 'mosque' },
    { key: 'casino', name: regionLabels.casino, emoji: regionEmojis.casino, count: gazino.others.length, openKey: 'casino' },
    {
      key: 'araba_galerisi',
      name: regionLabels.araba_galerisi,
      emoji: regionEmojis.araba_galerisi,
      count: arabaGalerisi.others.length,
      openKey: 'dealership',
    },
    {
      key: 'silah_magazasi',
      name: regionLabels.silah_magazasi,
      emoji: regionEmojis.silah_magazasi,
      count: silahMagazasi.others.length,
      openKey: 'weaponShop',
    },
    {
      key: 'modifiye_garaji',
      name: regionLabels.modifiye_garaji,
      emoji: regionEmojis.modifiye_garaji,
      count: modifiyeGaraji.others.length,
      openKey: 'tuningGarage',
    },
  ].sort((a, b) => b.count - a.count);

  return (
    <div className="visit-tab">
      <p className="visit-hint">Bir mekana tıklayarak doğrudan içine gir — çıkınca yine bu ekrana dönersin.</p>
      <GuestOverlay>
        <div className="visit-list">
          {items.map((item) => (
            <button key={item.key} className="visit-card" onClick={() => onVisitVenue?.(item.openKey)}>
              <span className="visit-card-emoji">{item.emoji}</span>
              <span className="visit-card-name">{item.name}</span>
              <span className={`visit-card-count ${item.count > 0 ? 'active' : ''}`}>
                👤 {item.count}
              </span>
            </button>
          ))}
        </div>
      </GuestOverlay>
    </div>
  );
}
