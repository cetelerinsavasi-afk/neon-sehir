import FactoryScreen from '../FactoryScreen/FactoryScreen';
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import GarageScreen from '../GarageScreen/GarageScreen';
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import BankScreen from '../BankScreen/BankScreen';
import MosqueScreen from '../MosqueScreen/MosqueScreen';
import PoliceStationScreen from '../PoliceStationScreen/PoliceStationScreen';
import VendorScreen from '../VendorScreen/VendorScreen';
import LimanDepoScreen from '../LimanDepoScreen/LimanDepoScreen';
import ParkScreen from '../ParkScreen/ParkScreen';
import RaceTrackScreen from '../RaceTrackScreen/RaceTrackScreen';
import CasinoScreen from '../CasinoScreen/CasinoScreen';
import HomeScreen from '../HomeScreen/HomeScreen';
import './RegionModal.css';

// Faz 2+3+4+5+6 kapsamında gerçek içeriği hazır olan ekranlar. Diğerleri
// hâlâ "yakında" placeholder'ı gösteriyor — ilgili faz tamamlandıkça buraya
// yeni case'ler eklenecek.
function ScreenContent({ region }) {
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
      return <LimanDepoScreen />;
    case 'park':
      return <ParkScreen />;
    case 'yaris-pisti':
      return <RaceTrackScreen />;
    case 'casino':
      return <CasinoScreen />;
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

export default function RegionModal({ region, onClose }) {
  if (!region) return null;

  return (
    <div className="region-modal-backdrop" onClick={onClose}>
      <div className="region-modal" onClick={(e) => e.stopPropagation()}>
        <div className="region-modal-handle" />
        <h2 className="region-modal-title">{region.name}</h2>
        <div className="region-modal-content">
          <ScreenContent region={region} />
        </div>
        <button className="region-modal-close" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
