import { useAuth } from '../../contexts/AuthContext';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import Workshop from '../Workshop/Workshop';
import './GarageScreen.css';

// v77 — Modifiye Garajı (oyunun kendi dükkânı): araç tamiri ve geliştirmesi
// artık Atölye ekranında, işçilik ücretiyle (malzeme %100 + işçilik %30,
// sınırsız malzeme). Oyuncuların açtığı modifiye garajları da aynı ekranı
// kullanır (bkz. Workshop.jsx, functions/shop.js).
export default function GarageScreen() {
  const { user } = useAuth();
  if (!user) {
    return <SignInPrompt message="Araç geliştirmek için giriş yapmalısın." />;
  }
  return (
    <div className="garage-screen">
      <Workshop shop={{ kind: 'game', type: 'modifiye' }} />
    </div>
  );
}
