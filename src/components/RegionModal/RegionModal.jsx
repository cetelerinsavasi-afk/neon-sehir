import FactoryScreen from '../FactoryScreen/FactoryScreen';
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import GarageScreen from '../GarageScreen/GarageScreen';
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import BankScreen from '../BankScreen/BankScreen';
import MosqueScreen from '../MosqueScreen/MosqueScreen';
import PoliceStationScreen from '../PoliceStationScreen/PoliceStationScreen';
import VendorScreen from '../VendorScreen/VendorScreen';
import LimanScreen from '../LimanScreen/LimanScreen';
import ParkScreen from '../ParkScreen/ParkScreen';
import RaceTrackScreen from '../RaceTrackScreen/RaceTrackScreen';
import CasinoScreen from '../CasinoScreen/CasinoScreen';
import HomeScreen from '../HomeScreen/HomeScreen';
import './RegionModal.css';

// screen -> soygun hedefi eşlemesi. Soygunlar artık haritadaki her mekanın
// kendi ekranında DEĞİL, tek bir global Soygun ekranında yapılıyor —
// buradaki "Soygun" köşe butonu o ekranı ilgili hedefle açar.
function getHeistTarget(region) {
  const map = {
    banka: 'banka',
    casino: 'casino',
    'araba-galerisi': 'araba_galerisi',
    'modifiye-garaji': 'modifiye_garaji',
    fabrika: 'fabrika',
  };
  if (region.screen === 'seyyar-satici') return region.id;
  return map[region.screen] || null;
}

function ScreenContent({ region, onEnterRace, onEnterTable }) {
  const { screen } = region;

  switch (screen) {
    case 'fabrika':
      return <FactoryScreen />;
    case 'araba-galerisi':
      return <VehicleGalleryScreen />;
    case 'modifiye-garaji':
      return <GarageScreen />;
    case 'silah-magazasi':
      return <WeaponShopScreen />;
    case 'banka':
      return <BankScreen />;
    case 'ibadet':
      return <MosqueScreen />;
    case 'rüşvet':
      return <PoliceStationScreen />;
    case 'seyyar-satici':
      return <VendorScreen vendorId={region.id} vendorName={region.name} />;
    case 'liman-depo':
      return <LimanScreen />;
    case 'park':
      return <ParkScreen />;
    case 'yaris-pisti':
      return <RaceTrackScreen onEnterRace={onEnterRace} />;
    case 'casino':
      return <CasinoScreen onEnterTable={onEnterTable} />;
    case 'ev':
      return <HomeScreen />;
    default:
      return (
        <p className="region-modal-body">
          Bu mekanik henüz geliştirilmedi. Master prompttaki ilgili faz
          tamamlandığında burada gerçek içerik açılacak.
        </p>
      );
  }
}

export default function RegionModal({ region, onClose, onOpenHeist, onEnterRace, onEnterTable }) {
  if (!region) return null;

  const heistTarget = getHeistTarget(region);

  return (
    <div className="region-modal-backdrop" onClick={onClose}>
      <div className="region-modal" onClick={(e) => e.stopPropagation()}>
        <div className="region-modal-handle" />
        <div className="region-modal-header">
          <h2 className="region-modal-title">{region.name}</h2>
          {heistTarget && (
            <button
              className="region-modal-heist-btn"
              onClick={() => onOpenHeist?.(heistTarget)}
            >
              Soygun
            </button>
          )}
        </div>
        <div className="region-modal-content">
          <ScreenContent region={region} onEnterRace={onEnterRace} onEnterTable={onEnterTable} />
        </div>
        <button className="region-modal-close" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
