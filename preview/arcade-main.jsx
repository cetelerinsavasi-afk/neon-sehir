// SADECE önizleme: Oyun Salonu (v75)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import ArcadeHub from '../src/components/Arcade/ArcadeHub';
import '../src/index.css';
import '../src/styles/theme.css';

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ArcadeHub onClose={() => {}} />
  </AuthProvider>
);
