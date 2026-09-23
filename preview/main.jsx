// Çeteler önizlemesi: alt çubuktaki "Çeteler" tam ekranı, sahte Firebase ile.
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import GangsFullScreen from '../src/components/Gangs/GangsFullScreen';
import '../src/index.css';
import '../src/styles/theme.css';

function App() {
  return (
    <AuthProvider>
      <GangsFullScreen onClose={() => {}} />
    </AuthProvider>
  );
}
createRoot(document.getElementById('root')).render(<App />);
