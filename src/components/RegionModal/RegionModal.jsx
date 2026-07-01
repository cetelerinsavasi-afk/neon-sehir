import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import FactoryScreen from '../FactoryScreen/FactoryScreen';
import ProfessionPicker from '../ProfessionPicker/ProfessionPicker';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './RegionModal.css';

// Faz 2 kapsamında gerçek içeriği hazır olan ekranlar. Diğerleri hâlâ
// "yakında" placeholder'ı gösteriyor — ilgili faz tamamlandıkça buraya
// yeni case'ler eklenecek.
function ScreenContent({ screen }) {
  const { user } = useAuth();
  const { player } = usePlayer();

  switch (screen) {
    case 'fabrika':
      return <FactoryScreen />;
    case 'ev':
      if (!user) {
        return <SignInPrompt message="Meslek seçmek için giriş yapmalısın." />;
      }
      return <ProfessionPicker currentProfession={player?.profession} />;
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
        <p className="region-modal-screen">
          Ekran: <code>{region.screen}</code>
        </p>
        <div className="region-modal-content">
          <ScreenContent screen={region.screen} />
        </div>
        <button className="region-modal-close" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
