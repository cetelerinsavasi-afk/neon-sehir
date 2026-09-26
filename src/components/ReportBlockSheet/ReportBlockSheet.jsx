import { useState } from 'react';
import { createPortal } from 'react-dom';
import { reportContent, blockUser, unblockUser } from '../../services/gameActions';
import { useBlocks } from '../../contexts/BlocksContext';
import { IS_ANDROID_APP } from '../../lib/platform';
import './ReportBlockSheet.css';

// ReportBlockSheet — tüm UGC yüzeylerinin ortak "Bildir / Engelle" alt sayfası.
// v53: artık doğrudan görünmez — Oyuncu Kartı'nın ⋯ düğmesinden ya da mesaja
// uzun basınca açılan menüdeki "Bildir"den açılır. Sayfanın gövdesine
// (document.body) taşınır, her katmanın üstünde durur.
//
// props:
//   targetUid   — içeriğin sahibi (engelleme için). null ise engelleme gösterilmez.
//   targetName  — başlıkta görünen ad (oyuncu adı ya da İstihbarat kod adı)
//   items       — şikâyet edilebilir şeyler: [{ label, targetType, targetPath, preview? }]
//                 (targetType/targetPath: functions/moderation.js REPORT_TARGETS)
//   canBlock    — false ise engelleme seçeneği yok (ör. anonim İstihbarat sohbeti)
//   onClose()
const REASONS = [
  { id: 'hakaret', label: 'Hakaret / küfür' },
  { id: 'taciz', label: 'Taciz / zorbalık' },
  { id: 'nefret', label: 'Nefret söylemi / ayrımcılık' },
  { id: 'cinsel', label: 'Cinsel / müstehcen içerik' },
  { id: 'kisisel_bilgi', label: 'Kişisel bilgi paylaşımı' },
  { id: 'spam_dolandiricilik', label: 'Spam / dolandırıcılık' },
  { id: 'gercek_para', label: 'Gerçek parayla alım-satım' },
  { id: 'diger', label: 'Diğer' },
];

export default function ReportBlockSheet({ targetUid = null, targetName = 'Oyuncu', items = [], canBlock = true, onClose }) {
  const { isBlocked } = useBlocks();
  const blocked = isBlocked(targetUid);
  const [step, setStep] = useState(items.length === 1 && !(canBlock && targetUid) ? { name: 'reason', item: items[0] } : { name: 'menu' });
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn, doneText) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setStep({ name: 'done', text: doneText });
    } catch (err) {
      setError(err?.message || 'Bir şeyler ters gitti, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const submitReport = () =>
    run(
      () =>
        reportContent({
          targetType: step.item.targetType,
          targetPath: step.item.targetPath,
          reason,
          note: note.trim() || undefined,
          platform: IS_ANDROID_APP ? 'android' : 'web',
        }),
      'Teşekkürler, bildirimini aldık. Ekibimiz inceleyecek.'
    );

  return createPortal(
    <div className="rbs-backdrop" onClick={onClose}>
      <div className="rbs-sheet" role="dialog" aria-modal="true" aria-label="Bildir veya engelle" onClick={(e) => e.stopPropagation()}>
        <div className="rbs-grip" aria-hidden="true" />
        <p className="rbs-title">{targetName}</p>

        {step.name === 'menu' && (
          <div className="rbs-list">
            {items.map((it) => (
              <button key={it.targetPath + it.targetType} className="rbs-row" onClick={() => setStep({ name: 'reason', item: it })}>
                <span className="rbs-ico" aria-hidden="true">🚩</span>
                <span>{it.label}</span>
              </button>
            ))}
            {canBlock && targetUid && !blocked && (
              <button className="rbs-row subtle" onClick={() => setStep({ name: 'block' })}>
                <span className="rbs-ico" aria-hidden="true">🚫</span>
                <span>Engelle</span>
              </button>
            )}
            {canBlock && targetUid && blocked && (
              <button className="rbs-row" disabled={busy} onClick={() => run(() => unblockUser(targetUid), `${targetName} artık engelli değil.`)}>
                <span className="rbs-ico" aria-hidden="true">↩️</span>
                <span>Engeli kaldır</span>
              </button>
            )}
            <button className="rbs-cancel" onClick={onClose}>
              Vazgeç
            </button>
          </div>
        )}

        {step.name === 'reason' && (
          <div className="rbs-list">
            {step.item.preview && <p className="rbs-preview">“{String(step.item.preview).slice(0, 140)}”</p>}
            <p className="rbs-sub">Ne tür bir sorun var?</p>
            <div className="rbs-reasons" role="radiogroup">
              {REASONS.map((r) => (
                <button key={r.id} role="radio" aria-checked={reason === r.id} className={`rbs-chip${reason === r.id ? ' on' : ''}`} onClick={() => setReason(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
            <textarea className="rbs-note" rows={2} maxLength={200} placeholder="İstersen kısa bir not ekle (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <p className="rbs-error">{error}</p>}
            <div className="rbs-actions">
              <button className="rbs-cancel" onClick={items.length > 1 || (canBlock && targetUid) ? () => setStep({ name: 'menu' }) : onClose}>
                Geri
              </button>
              <button className="rbs-primary" disabled={!reason || busy} onClick={submitReport}>
                {busy ? '…' : 'Bildir'}
              </button>
            </div>
          </div>
        )}

        {step.name === 'block' && (
          <div className="rbs-list">
            <p className="rbs-sub">
              <strong>{targetName}</strong> engellensin mi? Mesajlarını, paylaşımlarını ve konuşma balonlarını artık görmeyeceksin; gönderilerine yorum yapamaz ve beğeni bırakamaz. Kendisine haber verilmez. Engeli istediğin zaman Profil’den kaldırabilirsin.
            </p>
            {error && <p className="rbs-error">{error}</p>}
            <div className="rbs-actions">
              <button className="rbs-cancel" onClick={() => setStep({ name: 'menu' })}>
                Geri
              </button>
              <button className="rbs-primary danger" disabled={busy} onClick={() => run(() => blockUser(targetUid), `${targetName} engellendi.`)}>
                {busy ? '…' : 'Engelle'}
              </button>
            </div>
          </div>
        )}

        {step.name === 'done' && (
          <div className="rbs-list">
            <p className="rbs-done">✓ {step.text}</p>
            <button className="rbs-primary" onClick={onClose}>
              Tamam
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Küçük "⋯" tetikleyici — satır içi kullanım için
export function MoreButton({ onClick, label = 'Seçenekler', className = '' }) {
  return (
    <button
      type="button"
      className={`rbs-more ${className}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ⋯
    </button>
  );
}
