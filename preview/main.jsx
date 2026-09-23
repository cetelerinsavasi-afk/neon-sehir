// Çeteler önizlemesi: alt çubuktaki "Çeteler" tam ekranı, sahte Firebase ile.
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import PreviewGangs from './PreviewGangs';
import PhoneScreen from '../src/components/Phone/PhoneScreen';
import '../src/index.css';
import '../src/styles/theme.css';

function App() {
  return (
    <AuthProvider>
      {location.hash.startsWith('#phone') ? <PhoneScreen onClose={() => {}} initialApp={location.hash.split(':')[1] || null} /> : <PreviewGangs />}
    </AuthProvider>
  );
}
createRoot(document.getElementById('root')).render(<App />);
