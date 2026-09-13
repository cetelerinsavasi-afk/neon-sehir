import { useEffect, useRef } from 'react';
import FactoryScreen from '../FactoryScreen/FactoryScreen';
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import GarageScreen from '../GarageScreen/GarageScreen';
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import BankScreen from '../BankScreen/BankScreen';
import MosqueScreen from '../MosqueScreen/MosqueScreen';
import PoliceStationScreen from '../PoliceStationScreen/PoliceStationScreen';
import VendorScreen from '../VendorScreen/VendorScreen';
import LimanScreen from '../LimanScreen/LimanScreen';
import RaceTrackScreen from '../RaceTrackScreen/RaceTrackScreen';
import CasinoScreen from '../CasinoScreen/CasinoScreen';
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

function ScreenContent({ region, onEnterRace, onEnterTable, raceLobbyMode, onRaceModeChange }) {
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
    case 'yaris-pisti':
      return (
        <RaceTrackScreen
          onEnterRace={onEnterRace}
          initialSelected={raceLobbyMode}
          onModeChange={onRaceModeChange}
        />
      );
    case 'casino':
      return <CasinoScreen onEnterTable={onEnterTable} />;
    default:
      return (
        <p className="region-modal-body">
          Bu mekanik henüz geliştirilmedi. Master prompttaki ilgili faz
          tamamlandığında burada gerçek içerik açılacak.
        </p>
      );
  }
}

// GHOST_CLICK_GUARD_MS — BUG DÜZELTMESİ ("fabrika ve yarış pistine girmek
// için Android'de basılı tutmak gerekiyor, diğer mekanlara dokunur
// dokunmaz giriliyor"): haritadaki dokunma tespiti (bkz. useMapPanZoom.js)
// native `click` event'ine DEĞİL, kendi `pointerdown/up` mantığına dayanır
// — ama Android'de bu ÖZEL dokunuş bittikten SONRA tarayıcı YİNE DE
// gecikmeli bir "hayalet" (ghost) native `click` event'i üretebiliyor. Tam
// ekrana giren mekanlarda (Banka/Camii/Gazino vb.) bu hayalet tıklama
// zararsız bir yere düşüyor (o ekranlarda "her yere tıkla kapat" YOK,
// sadece bir ✕ butonu var) — ama RegionModal'ın (fabrika/yarış pisti hâlâ
// bunu kullanıyor) `region-modal-backdrop`'u TAM EKRANI kaplıyor ve HER
// tıklamada kapanıyor: parmağın kalktığı konumdaki bu hayalet tıklama,
// panel AÇILIR AÇILMAZ onu tekrar KAPATIYORDU — kullanıcıya "girmiyor"
// gibi hissettiriyordu. Kısa bir basılı tutuş bu hayalet click'i (farklı
// bir zamanlamayla) atlattığı için "basılı tutunca çalışıyor" sanılıyordu.
// Artık panel açıldıktan sonraki kısa bir pencerede backdrop tıklamaları
// yok sayılıyor — gerçek "dışarı tıkla kapat" davranışı bu pencereden
// SONRA aynen çalışmaya devam ediyor.
const GHOST_CLICK_GUARD_MS = 400;

export default function RegionModal({
  region,
  onClose,
  onOpenHeist,
  onEnterRace,
  onEnterTable,
  raceLobbyMode,
  onRaceModeChange,
}) {
  const openedAtRef = useRef(0);
  useEffect(() => {
    if (region) openedAtRef.current = Date.now();
  }, [region]);

  if (!region) return null;

  const heistTarget = getHeistTarget(region);

  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < GHOST_CLICK_GUARD_MS) return;
    onClose?.();
  };

  return (
    <div className="region-modal-backdrop" onClick={handleBackdropClick}>
      <div className="region-modal" onClick={(e) => e.stopPropagation()}>
        <div className="region-modal-handle" />
        <div className="region-modal-header">
          <h2 className="region-modal-title">{region.name}</h2>
          {heistTarget && (
            <button
              className="region-modal-heist-btn"
              onClick={() => onOpenHeist?.(heistTarget)}
            >
              {region.screen === 'seyyar-satici' ? '💰 Haraç Kes' : 'Soygun'}
            </button>
          )}
        </div>
        <div className="region-modal-content">
          <ScreenContent
            region={region}
            onEnterRace={onEnterRace}
            onEnterTable={onEnterTable}
            raceLobbyMode={raceLobbyMode}
            onRaceModeChange={onRaceModeChange}
          />
        </div>
        <button className="region-modal-close" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
