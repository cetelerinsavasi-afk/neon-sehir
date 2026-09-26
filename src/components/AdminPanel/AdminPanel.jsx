import { useEffect, useState } from 'react';
import { adminAction } from '../../services/gameActions';
import ModerationTab from './ModerationTab';
import UserManagementTab from './UserManagementTab';
import AuditLogTab from './AuditLogTab';
import StaffTab from './StaffTab';
import { ROLE_LABELS, errText } from './adminLabels';
import './AdminPanel.css';

// AdminPanel — UGC Faz D3 oyun içi Yönetim Paneli (tam ekran katman).
// Rol her açılışta SUNUCUDAN doğrulanır ('me'); istemcideki rol yalnızca
// giriş düğmesinin görünürlüğü içindir. Tüm işlemler adminAction callable'ı.
// Bu dosya React.lazy ile yüklenir — yetkisi olmayan oyuncular indirmez.
export default function AdminPanel({ onClose }) {
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('reports');
  const [focusUid, setFocusUid] = useState(null);

  useEffect(() => {
    let alive = true;
    adminAction('me')
      .then((r) => alive && setMe(r))
      .catch((err) => alive && setError(errText(err)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openUser = (uid) => {
    setFocusUid(uid);
    setTab('users');
  };

  const tabs = [
    { id: 'reports', label: '🚩 Şikâyetler' },
    { id: 'users', label: '👤 Oyuncular' },
    { id: 'logs', label: '📜 Geçmiş' },
    ...(me?.role === 'admin' ? [{ id: 'staff', label: '🎖️ Ekip' }] : []),
  ];

  return (
    <div className="adm-overlay" role="dialog" aria-modal="true" aria-label="Yönetim Paneli">
      <div className="adm-shell">
        <header className="adm-header">
          <div className="adm-title">
            <span aria-hidden="true">🛡️</span> Yönetim Paneli
            {me && <span className={`adm-role adm-role-${me.role}`}>{ROLE_LABELS[me.role]}</span>}
          </div>
          <button className="adm-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </header>

        {error && (
          <div className="adm-body">
            <p className="adm-error">{error}</p>
          </div>
        )}
        {!error && !me && (
          <div className="adm-body">
            <p className="adm-dim">Yetki doğrulanıyor…</p>
          </div>
        )}
        {me && (
          <>
            <nav className="adm-tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={`adm-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="adm-body">
              {tab === 'reports' && <ModerationTab onOpenUser={openUser} />}
              {tab === 'users' && <UserManagementTab me={me} focusUid={focusUid} onFocusUid={setFocusUid} />}
              {tab === 'logs' && <AuditLogTab onOpenUser={openUser} />}
              {tab === 'staff' && <StaffTab me={me} onOpenUser={openUser} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
