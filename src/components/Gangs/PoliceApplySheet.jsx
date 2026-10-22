/* eslint-disable react-refresh/only-export-components */
// v109 — POLİSLİK BAŞVURUSU (Polis Teşkilatı; kodda "intel"). Aynı form hem
// Çeteler › Polis Teşkilatı kartından hem Karakol'dan açılır.
//   Şartlar (sunucu doğrular): başlangıç görevleri · 50 saygınlık · %0 şüphe ·
//   en az 1 silah · imam ve Mafya Babası olmamak · son 24 saatte polislikten
//   ayrılmamış olmak.
//   Form: kod adı · hangi çetedesin (aktif çeteler ya da "Hiçbir çetede
//   değilim" — o zaman rütbe sorulmaz) · çetedeki rütben · neden polis olmak
//   istiyorsun (oyuncu yazar).
//   Onay: Emniyet Genel Müdürü / Emniyet Amirleri; 12 saatte yanıt yoksa (ya da
//   ikisi de yoksa hemen) otomatik.
import { useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { useGang, useGangAction, useNow, useQueryData } from './GangContext';
import { Btn, Sheet } from './ui';
import { useMyWallet } from './shared';
import { APP_GANG_RANKS, GANG_RULES, SALARIES, fmt } from './gangConstants';
import { usePlayer } from '../../hooks/usePlayer';

const NO_GANG = GANG_RULES.APP_NO_GANG;

// Başvuru formu alanları (yeni başvuru ve sicildeki formu düzenleme ortak)
export function IntelFormFields({ form, setForm }) {
  const { path } = useGang();
  const { docs: gangs } = useQueryData(path('gangs'), () => [where('status', '==', 'active'), limit(100)], 'active_form');
  const names = [...new Set(gangs.map((g) => g.name))].sort((a, b) => a.localeCompare(b, 'tr'));
  const noGang = form.gangName === NO_GANG;
  // listede olmayan eski bir beyan (ör. çete dağıldı) seçili kalsın
  const options = form.gangName && !noGang && !names.includes(form.gangName) ? [form.gangName, ...names] : names;
  return (
    <>
      <label className="gx-field">
        Hangi çetedesin?
        <select
          className="gx-input"
          value={form.gangName || ''}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({ ...f, gangName: v, gangRank: v === NO_GANG ? 'yok' : f.gangRank === 'yok' ? '' : f.gangRank }));
          }}
        >
          <option value="" disabled>
            Seç…
          </option>
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value={NO_GANG}>{NO_GANG}</option>
        </select>
      </label>
      {form.gangName && !noGang && (
        <label className="gx-field">
          Çetendeki rütben
          <select className="gx-input" value={form.gangRank && form.gangRank !== 'yok' ? form.gangRank : ''} onChange={(e) => setForm((f) => ({ ...f, gangRank: e.target.value }))}>
            <option value="" disabled>
              Seç…
            </option>
            {APP_GANG_RANKS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="gx-field">
        Neden polis olmak istiyorsun?
        <textarea className="gx-input" rows={3} maxLength={GANG_RULES.APP_REASON_MAX} value={form.reason || ''} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        <span className="dim gx-mini">
          {String(form.reason || '').trim().length}/{GANG_RULES.APP_REASON_MAX} · en az {GANG_RULES.APP_REASON_MIN} karakter
        </span>
      </label>
    </>
  );
}
export const formValid = (f) =>
  Boolean(String(f.gangName || '').trim()) && (f.gangName === NO_GANG || (Boolean(f.gangRank) && f.gangRank !== 'yok')) && String(f.reason || '').trim().length >= GANG_RULES.APP_REASON_MIN;
// sunucuya giden form (çetesi yoksa rütbe 'yok')
export const formPayload = (f) => ({ gangName: f.gangName, gangRank: f.gangName === NO_GANG ? 'yok' : f.gangRank, reason: String(f.reason || '').trim() });

// Kalan yasak süresi (saat) — istifa / atılma sonrası 24 saat
export function cooldownHoursLeft(membership, now) {
  const until = Number(membership?.intelCooldownUntilMs || 0);
  return until > now ? Math.max(1, Math.ceil((until - now) / 3_600_000)) : 0;
}

export default function PoliceApplySheet({ onClose, onDone, membership }) {
  const { run, busy } = useGangAction();
  const { isTest } = useGang();
  const wallet = useMyWallet();
  const { player } = usePlayer();
  const now = useNow(60_000);
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ gangName: '', gangRank: '', reason: '' });
  const live = !isTest && player != null;
  const repOk = wallet.reputation == null ? null : wallet.reputation >= GANG_RULES.INTEL_MIN_REPUTATION;
  const req = [
    { label: '📋 Başlangıç görevleri', ok: live ? Boolean(player.onboardingRewardClaimed) : null },
    { label: `⭐ ${GANG_RULES.INTEL_MIN_REPUTATION} saygınlık`, ok: repOk },
    { label: '🟢 %0 şüphe', ok: live ? Number(player.suspicion || 0) === 0 : null },
    { label: '🔫 En az 1 silah', ok: null },
  ];
  const cd = cooldownHoursLeft(membership, now);
  const block = live && player.isImam ? 'İmam polis olamaz — önce imamlıktan istifa etmelisin.' : membership?.gangRank === 'baba' ? 'Mafya Babası polis olamaz.' : cd ? `Polislikten yeni ayrıldın — ${cd} saat daha başvuru yapamazsın.` : null;
  const ok = !block && req.every((r) => r.ok !== false);
  return (
    <Sheet title="Polislik başvurusu" icon="🚓" onClose={onClose}>
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
      <IntelFormFields form={form} setForm={setForm} />
      <div className="dim gx-mini">
        📝 Başvurun 12 saat içinde incelenir. Kabul edildiğin an polissin. 💼 Maaş: Polis Memuru {fmt(SALARIES.muhbir)} … Emniyet Genel Müdürü {fmt(SALARIES.baskan)} + rüşvet payı (her gece 00:00).
      </div>
      <Btn
        block
        disabled={!ok || code.trim().length < GANG_RULES.CODENAME_MIN || !formValid(form)}
        busy={busy === 'applyIntel'}
        onClick={async () => {
          const r = await run(
            'applyIntel',
            { codeName: code.trim(), ...formPayload(form) },
            {
              success: (res) => (res?.accepted ? `🚓 Polis Teşkilatına kabul edildin — artık polissin, ${res.codeName}!` : '📝 Başvurun gönderildi — 12 saat içinde incelenir.'),
              withRequestId: true,
            }
          );
          if (r) {
            onDone?.(r);
            onClose();
          }
        }}
      >
        {ok ? 'Başvur' : '🔒'}
      </Btn>
    </Sheet>
  );
}
