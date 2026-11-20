import { useState } from 'react';
import { isAdminUid } from '../../config/admin';
import { checkOnboardingProgress } from '../../services/gameActions';

// v168.1 — SADECE kurucu yönetici: kendi görevlerini ve Rıza Amca senaryosunu sıfırlar (baştan
// deneyimlemek için). Sunucu yetkiyi ayrıca denetler (checkOnboardingProgress › adminReset).
// Bu cihazdaki senaryo kayıtları da silinir, sayfa yenilenir (oyuna yeni oyuncu gibi girilir).
export default function AdminStoryReset({ uid }) {
  const [step, setStep] = useState(0); // 0 düğme · 1 onay · 2 çalışıyor
  const [err, setErr] = useState(null);
  if (!isAdminUid(uid)) return null;
  const run = async () => {
    setStep(2);
    setErr(null);
    try {
      await checkOnboardingProgress({ event: 'adminReset' });
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(`amca:${uid}:`))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* gizli sekme */
      }
      window.location.reload();
    } catch (e) {
      setErr(e?.message || 'Sıfırlanamadı.');
      setStep(0);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '8px 0' }}>
      {step === 0 && (
        <button type="button" className="adm-entry" onClick={() => setStep(1)}>
          <span aria-hidden="true">🔄</span> Görevleri sıfırla (senaryo baştan)
        </button>
      )}
      {step === 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="adm-entry" onClick={run}>
            ✅ Evet, sıfırla
          </button>
          <button type="button" className="adm-entry" onClick={() => setStep(0)}>
            Vazgeç
          </button>
        </div>
      )}
      {step === 2 && <span style={{ fontSize: 13, opacity: 0.8 }}>Sıfırlanıyor…</span>}
      {err && <span style={{ color: '#ff7a7a', fontSize: 12 }}>{err}</span>}
    </div>
  );
}
