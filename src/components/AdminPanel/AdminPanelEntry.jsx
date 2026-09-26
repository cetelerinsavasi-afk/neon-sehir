import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAdminUid } from '../../config/admin';
import { STAFF_ROLES } from './adminLabels';
import './AdminPanelEntry.css';

// Yönetim Paneli girişi — yalnızca yetkililere (users/{uid}.role admin |
// moderator ya da kurucu admin) görünür. Gerçek yetki sunucuda denetlenir.
// Panel kodu React.lazy ile ayrı dosyada: oyuncular indirmez.
const AdminPanel = lazy(() => import('./AdminPanel'));

export default function AdminPanelEntry({ uid, player }) {
  const [open, setOpen] = useState(false);
  const staff = STAFF_ROLES.includes(player?.role) || isAdminUid(uid);
  if (!staff) return null;
  return (
    <>
      <button className="adm-entry" onClick={() => setOpen(true)}>
        <span aria-hidden="true">🛡️</span> Yönetim Paneli
      </button>
      {/* body'ye taşınır: Ev ekranının katmanından (stacking context) bağımsız, her şeyin üstünde */}
      {open &&
        createPortal(
          <Suspense fallback={null}>
            <AdminPanel onClose={() => setOpen(false)} />
          </Suspense>,
          document.body
        )}
    </>
  );
}
