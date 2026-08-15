import SoygunTab from './SoygunTab';
import SuspicionTab from './SuspicionTab';
import VisitTab from './VisitTab';
import './MekanlarScreen.css';

// MekanlarScreen — eskiden "Soygun" tek başına alt-bar sekmesiydi (bkz.
// HeistScreen.jsx). Yeni istek: "Soygun sekmesinin adını Mekanlar
// yapacağız. Mekanlar 3 ana sekmeye ayrılacak: Soygun - Şüphe - Ziyaret."
// Bu bileşen dış çerçeveyi (backdrop/başlık/kapatma/sekme çubuğu) taşır;
// her sekmenin gerçek içeriği kendi bileşeninde (SoygunTab/SuspicionTab/
// VisitTab). Soygun sekmesi davranışça eskisiyle BİREBİR aynı (bkz.
// SoygunTab.jsx) — sadece artık bir üst sekme çubuğunun altında.
const TABS = [
  { key: 'soygun', label: '💰 Soygun' },
  { key: 'suphe', label: '🕵️ Şüphe' },
  { key: 'ziyaret', label: '🚶 Ziyaret' },
];

export default function MekanlarScreen({ tab, onTabChange, initialHeistTarget, onClose, onVisitVenue }) {
  return (
    <div className="mekanlar-screen-backdrop" onClick={onClose}>
      <div className="mekanlar-screen" onClick={(e) => e.stopPropagation()}>
        <div className="mekanlar-screen-header">
          <p className="mekanlar-screen-title">Mekanlar</p>
          <button className="mekanlar-screen-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mekanlar-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`mekanlar-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => onTabChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'soygun' && <SoygunTab initialTarget={initialHeistTarget} />}
        {tab === 'suphe' && <SuspicionTab />}
        {tab === 'ziyaret' && <VisitTab onVisitVenue={onVisitVenue} />}
      </div>
    </div>
  );
}
