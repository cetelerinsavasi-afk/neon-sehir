// SADECE önizleme (v78): Profil › Aksesuarlar
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import AccessoryShop from '../src/components/AccessoryShop/AccessoryShop';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

fakeDb.doc(`users/${PREVIEW_UID}`).set({ gold: 5_000_000, emerald: 400, avatar: { gender: 'erkek', hairStyle: 'slick', hairColor: '#2b2118', clothing: 'leather', clothColor: '#1d3d5c', hat: 'fedora' } }, { merge: true });
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AccessoryShop onBack={() => console.log('back')} />
  </AuthProvider>
);
