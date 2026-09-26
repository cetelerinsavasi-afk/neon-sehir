import { useCallback, useEffect, useState } from 'react';
import { adminAction } from '../../services/gameActions';
import { REASON_LABELS, TYPE_LABELS, effectLabel, errText, fmtDate } from './adminLabels';

// Şikâyet kuyruğu — içerik başına gruplanmış şikâyetler.
// Açık: Reddet (şikâyet yersiz) · İçeriği kaldır (+ isteğe bağlı uyarı SMS'i)
// Kapanmış: sonuç + (gizlenebilir türde) Geri aç
const STATUS_TABS = [
  { id: 'open', label: 'Bekleyen' },
  { id: 'actioned', label: 'Kaldırılan' },
  { id: 'dismissed', label: 'Reddedilen' },
];

export default function ModerationTab({ onOpenUser }) {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await adminAction('listReports', { status }));
    } catch (err) {
      setError(errText(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const done = (text) => {
    setFlash(text);
    setTimeout(() => setFlash(''), 3000);
    load();
  };

  return (
    <div className="adm-stack">
      <div className="adm-row">
        <div className="adm-chips">
          {STATUS_TABS.map((s) => (
            <button key={s.id} className={`adm-chip${status === s.id ? ' on' : ''}`} onClick={() => setStatus(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <button className="adm-btn ghost small" onClick={load} disabled={loading}>
          {loading ? '…' : '↻ Yenile'}
        </button>
      </div>
      {flash && <p className="adm-ok">✓ {flash}</p>}
      {error && <p className="adm-error">{error}</p>}
      {data && data.groups.length === 0 && <p className="adm-empty">{status === 'open' ? '🎉 Bekleyen şikâyet yok.' : 'Kayıt yok.'}</p>}
      {data?.groups.map((g) => (
        <ReportCard key={g.targetPath} g={g} status={status} onOpenUser={onOpenUser} onDone={done} />
      ))}
      {data && data.total > data.groups.length && <p className="adm-dim">İlk {data.groups.length} içerik gösteriliyor (toplam {data.total}).</p>}
    </div>
  );
}

function ReportCard({ g, status, onOpenUser, onDone }) {
  const [mode, setMode] = useState(null); // null | 'remove' | 'dismiss'
  const [warn, setWarn] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn, text) => {
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      onDone(typeof text === 'function' ? text(r) : text);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  const resolve = () =>
    run(
      () => adminAction('resolveReport', { targetPath: g.targetPath, decision: mode, warn: mode === 'remove' && warn, note: note.trim() || undefined }),
      (r) => (mode === 'remove' ? `İçerik ${effectLabel(r.effect)}${r.notified ? `, oyuncu bilgilendirildi${r.warned ? ' (uyarı)' : ''}` : ''}.` : `Şikâyet reddedildi${r.effect === 'unhidden' ? ', içerik yeniden görünür' : ''}.`)
    );

  return (
    <article className="adm-card">
      <div className="adm-card-head">
        <span className="adm-type">{TYPE_LABELS[g.targetType] || g.targetType}</span>
        <span className="adm-count" title={`${g.eligibleCount} şikâyetçinin hesabı 3 günden eski`}>
          🚩 {g.reporterCount}
        </span>
      </div>
      <div className="adm-meta">
        {g.targetUid ? (
          <button className="adm-link" onClick={() => onOpenUser(g.targetUid)}>
            👤 {g.targetName || 'Oyuncu'}
          </button>
        ) : (
          <span className="adm-dim">Yazar bilinmiyor</span>
        )}
        <span className="adm-dim">
          {fmtDate(g.firstAtMs)}
          {g.lastAtMs !== g.firstAtMs ? ` → ${fmtDate(g.lastAtMs)}` : ''}
        </span>
      </div>
      <blockquote className="adm-quote">{g.textSnapshot || <em className="adm-dim">(metin yok)</em>}</blockquote>
      <div className="adm-tags">
        {Object.entries(g.reasons).map(([k, n]) => (
          <span key={k} className="adm-tag">
            {REASON_LABELS[k] || k}
            {n > 1 ? ` ×${n}` : ''}
          </span>
        ))}
        {!g.exists && <span className="adm-tag warn">içerik silinmiş</span>}
        {g.exists && g.hidden && <span className="adm-tag warn">{g.hiddenBy === 'moderator' ? 'moderatör gizledi' : 'otomatik gizlendi'}</span>}
      </div>
      {g.notes.length > 0 && (
        <ul className="adm-notes">
          {g.notes.map((n, i) => (
            <li key={i}>“{n}”</li>
          ))}
        </ul>
      )}
      <p className="adm-path" title="Firestore yolu">
        {g.targetPath}
      </p>

      {status !== 'open' && (
        <div className="adm-resolved">
          <span className="adm-dim">
            {g.resolvedByName || '—'} · {fmtDate(g.resolvedAtMs)}
          </span>
          {g.hideable && g.exists && g.hidden && (
            <button className="adm-btn ghost small" disabled={busy} onClick={() => run(() => adminAction('restoreContent', { targetPath: g.targetPath, targetType: g.targetType }), 'İçerik geri açıldı.')}>
              ↩️ Geri aç
            </button>
          )}
        </div>
      )}

      {status === 'open' && !mode && (
        <div className="adm-actions">
          <button className="adm-btn ghost" onClick={() => setMode('dismiss')}>
            ✅ Reddet
          </button>
          <button className="adm-btn danger" onClick={() => setMode('remove')}>
            🧹 İçeriği kaldır
          </button>
        </div>
      )}
      {status === 'open' && mode && (
        <div className="adm-confirm">
          <p className="adm-confirm-text">
            {mode === 'remove'
              ? g.hideable
                ? 'İçerik oyunculardan kalıcı olarak gizlenecek (silinmez, geri açılabilir).'
                : 'Metin varsayılana sıfırlanacak (geri alınamaz).'
              : g.hidden && g.hiddenBy === 'auto_reports'
                ? 'Şikâyetler kapanacak ve otomatik gizlenen içerik yeniden görünecek.'
                : 'Şikâyetler kapanacak, içerik olduğu gibi kalacak.'}
          </p>
          {mode === 'remove' && g.targetUid && (
            <>
              <p className="adm-confirm-text">📩 Oyuncuya sebebiyle birlikte bilgilendirme SMS'i gider.</p>
              <label className="adm-check">
                <input type="checkbox" checked={warn} onChange={(e) => setWarn(e.target.checked)} /> Resmi uyarı olarak işaretle
              </label>
            </>
          )}
          <input
            className="adm-input"
            maxLength={200}
            placeholder={mode === 'remove' ? 'Sebep (boşsa en çok seçilen bildirim sebebi yazılır)' : 'Not (isteğe bağlı, kayıtta görünür)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="adm-error">{error}</p>}
          <div className="adm-actions">
            <button className="adm-btn ghost" disabled={busy} onClick={() => setMode(null)}>
              Vazgeç
            </button>
            <button className={`adm-btn ${mode === 'remove' ? 'danger' : 'primary'}`} disabled={busy} onClick={resolve}>
              {busy ? '…' : mode === 'remove' ? 'Kaldır' : 'Reddet'}
            </button>
          </div>
        </div>
      )}
      {status !== 'open' && error && <p className="adm-error">{error}</p>}
    </article>
  );
}
