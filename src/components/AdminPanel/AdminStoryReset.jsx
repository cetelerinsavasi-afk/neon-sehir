import { useState } from 'react';
import { isAdminUid } from '../../config/admin';
import { checkOnboardingProgress } from '../../services/gameActions';

// v168.1 — SADECE kurucu yönetici: kendi görevlerini ve Rıza Amca senaryosunu sıfırlar (baştan
// deneyimlemek için). Sunucu yetkiyi ayrıca denetler (checkOnboardingProgress › adminReset).
// Bu cihazdaki senaryo kayıtları da silinir, sayfa yenilenir (oyuna yeni oyuncu gibi girilir).
// v201.1 — ikinci düğme: doğrudan hurdalık çatışmasına (görev 22) atla (checkOnboardingProgress › adminJump).
// Telefon ve "3 yıl önce" sahneleri izlenmiş sayılır; Amca hurdalık görevinin başında bekler.
const clearStoryLocal = (uid) => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`amca:${uid}:`))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* gizli sekme */
  }
};

export default function AdminStoryReset({ uid }) {
  const [step, setStep] = useState(0); // 0 düğme · 1 onay (sıfırla) · 3 onay (çatışma) · 2 çalışıyor
  const [err, setErr] = useState(null);
  if (!isAdminUid(uid)) return null;
  const run = async (payload, afterClear) => {
    setStep(2);
    setErr(null);
    try {
      await checkOnboardingProgress(payload);
      clearStoryLocal(uid);
      try {
        afterClear?.();
      } catch {
        /* gizli sekme */
      }
      window.location.reload();
    } catch (e) {
      setErr(e?.message || 'Olmadı.');
      setStep(0);
    }
  };
  const reset = () => run({ event: 'adminReset' });
  const jumpFinale = () =>
    run({ event: 'adminJump', taskId: 22 }, () => {
      localStorage.setItem(`amca:${uid}:fb`, '1'); // "3 yıl önce" izlendi
      localStorage.setItem(`amca:${uid}:call`, '1'); // Nevzat'ın telefonu dinlendi
    });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '8px 0' }}>
      {step === 0 && (
        <>
          <button type="button" className="adm-entry" onClick={() => setStep(1)}>
            <span aria-hidden="true">🔄</span> Görevleri sıfırla (senaryo baştan)
          </button>
          <button type="button" className="adm-entry" onClick={() => setStep(3)}>
            <span aria-hidden="true">🔥</span> Hurdalık çatışmasını tekrar oyna
          </button>
        </>
      )}
      {(step === 1 || step === 3) && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="adm-entry" onClick={step === 1 ? reset : jumpFinale}>
            ✅ {step === 1 ? 'Evet, sıfırla' : 'Evet, çatışmaya git'}
          </button>
          <button type="button" className="adm-entry" onClick={() => setStep(0)}>
            Vazgeç
          </button>
        </div>
      )}
      {step === 2 && <span style={{ fontSize: 13, opacity: 0.8 }}>Hazırlanıyor…</span>}
      {err && <span style={{ color: '#ff7a7a', fontSize: 12 }}>{err}</span>}
    </div>
  );
}
