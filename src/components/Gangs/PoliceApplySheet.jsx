/* eslint-disable react-refresh/only-export-components */
// v123 — POLİS TEŞKİLATINA KATILIM (kodda "intel"). Aynı pencere hem
// Çeteler › Polis Teşkilatı kartından hem Karakol'dan açılır.
//   Başvuru FORMU KALDIRILDI: oyuncu sadece kod adını yazar; şartları
//   sağlıyorsa ANINDA polis olur (inceleme / onay yok).
//   Şartlar (sunucu doğrular): başlangıç görevleri · 50 saygınlık · %0 şüphe ·
//   en az 1 silah · imam ve Mafya Babası olmamak · son 24 saatte polislikten
//   ayrılmamış / atılmamış olmak.
//   Yeni katılan polis 24 saat boyunca teşkilattan atılamaz.
import { useState } from 'react';
import { useGang, useGangAction, useNow } from './GangContext';
import { Btn, Sheet } from './ui';
import { useMyWallet } from './shared';
import { GANG_RULES, fmt, gangExitHoursLeft, gangExitText } from './gangConstants';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { policeSalary } from '../../../functions/belediyeRates.js';
import { usePlayer } from '../../hooks/usePlayer';

// Kalan yasak süresi (saat) — istifa / atılma sonrası 24 saat
export function cooldownHoursLeft(membership, now) {
  const until = Number(membership?.intelCooldownUntilMs || 0);
  return until > now ? Math.max(1, Math.ceil((until - now) / 3_600_000)) : 0;
}

export default function PoliceApplySheet({ onClose, onDone, membership }) {
  const rates = useBelediyeRates(); // v127: polis maaşları Güvenlik Bakanlığı'nın
  const { run, busy } = useGangAction();
  const { isTest } = useGang();
  const wallet = useMyWallet();
  const { player } = usePlayer();
  const now = useNow(60_000);
  const [code, setCode] = useState('');
  const live = !isTest && player != null;
  const repOk = wallet.reputation == null ? null : wallet.reputation >= GANG_RULES.INTEL_MIN_REPUTATION;
  const req = [
    { label: '📋 Başlangıç görevleri', ok: live ? Boolean(player.onboardingRewardClaimed) : null },
    { label: `⭐ ${GANG_RULES.INTEL_MIN_REPUTATION} saygınlık`, ok: repOk },
    { label: '🟢 %0 şüphe', ok: live ? Number(player.suspicion || 0) === 0 : null },
    { label: '🔫 En az 1 silah', ok: null },
  ];
  const cd = cooldownHoursLeft(membership, now);
  const exitH = gangExitHoursLeft(membership, now); // v116
  const block = live && player.isImam ? 'İmam polis olamaz — önce imamlıktan istifa etmelisin.' : membership?.gangRank === 'baba' ? 'Mafya Babası polis olamaz.' : cd ? `Polislikten yeni ayrıldın — ${cd} saat daha teşkilata giremezsin.` : exitH ? gangExitText(exitH) : null;
  const ok = !block && req.every((r) => r.ok !== false);
  return (
    <Sheet title="Polis Teşkilatına katıl" icon="🚓" onClose={onClose}>
      <div className="gx-req">
        {req.map((r) => (
          <span key={r.label} className={`gx-req-item ${r.ok === false ? 'no' : r.ok ? 'yes' : ''}`}>
            {r.ok === false ? '✗' : r.ok ? '✓' : '•'} {r.label}
          </span>
        ))}
      </div>
      {block && <div className="gx-hide-warn">⛔ {block}</div>}
      <label className="gx-field">
        Kod adın
        <input className="gx-input" maxLength={GANG_RULES.CODENAME_MAX} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ör. Atmaca" />
      </label>
      <div className="gx-hide-warn">🤫 Teşkilatta herkes seni bu adla tanır — gerçek kimliğin gizli kalır.</div>
      <div className="dim gx-mini">
        ⚡ Şartları sağlıyorsan anında teşkilata katılırsın — form yok, onay beklemek yok. 🛡️ Katıldıktan sonra 24 saat boyunca teşkilattan atılamazsın. 💼 Maaş: Polis Memuru {fmt(policeSalary(rates, 'muhbir'))} … Emniyet Genel Müdürü {fmt(policeSalary(rates, 'baskan'))} + rüşvet payı (her gece 00:00).
      </div>
      <Btn
        block
        disabled={!ok || code.trim().length < GANG_RULES.CODENAME_MIN}
        busy={busy === 'applyIntel'}
        onClick={async () => {
          const r = await run(
            'applyIntel',
            { codeName: code.trim() },
            {
              success: (res) => `🚓 Polis Teşkilatına katıldın — artık polissin, ${res?.codeName || code.trim()}!`,
              withRequestId: true,
            }
          );
          if (r) {
            onDone?.(r);
            onClose();
          }
        }}
      >
        {ok ? 'Katıl' : '🔒'}
      </Btn>
    </Sheet>
  );
}
