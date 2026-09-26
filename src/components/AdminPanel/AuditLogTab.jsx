import { useCallback, useEffect, useState } from 'react';
import { adminAction } from '../../services/gameActions';
import { ACTION_LABELS, ROLE_LABELS, TYPE_LABELS, effectLabel, errText, fmtDate } from './adminLabels';

// Geçmiş İşlemler — admin_logs, yeniden eskiye, 50'şer sayfa.
export default function AuditLogTab({ onOpenUser }) {
  const [logs, setLogs] = useState([]);
  const [next, setNext] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (beforeMs) => {
    setLoading(true);
    setError('');
    try {
      const r = await adminAction('listLogs', beforeMs ? { beforeMs } : {});
      setLogs((cur) => (beforeMs ? [...cur, ...r.logs] : r.logs));
      setNext(r.nextBeforeMs);
    } catch (err) {
      setError(errText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="adm-stack">
      <div className="adm-row">
        <p className="adm-section">Son yapılan işlemler</p>
        <button className="adm-btn ghost small" onClick={() => load()} disabled={loading}>
          {loading ? '…' : '↻ Yenile'}
        </button>
      </div>
      {error && <p className="adm-error">{error}</p>}
      {!loading && logs.length === 0 && !error && <p className="adm-empty">Henüz işlem yok.</p>}
      {logs.map((l) => (
        <article key={l.id} className="adm-log">
          <div className="adm-log-head">
            <span className="adm-log-action">{ACTION_LABELS[l.action] || l.action}</span>
            <span className="adm-dim">{fmtDate(l.atMs)}</span>
          </div>
          <div className="adm-log-line">
            <span className="adm-dim">Yapan:</span> {l.actorName}
            {l.actorRole && <span className="adm-dim"> ({ROLE_LABELS[l.actorRole] || l.actorRole})</span>}
          </div>
          {(l.targetUid || l.targetType) && (
            <div className="adm-log-line">
              <span className="adm-dim">Hedef:</span>{' '}
              {l.targetUid ? (
                <button className="adm-link" onClick={() => onOpenUser(l.targetUid)}>
                  {l.targetName || l.targetUid}
                </button>
              ) : (
                '—'
              )}
              {l.targetType && <span className="adm-dim"> · {TYPE_LABELS[l.targetType] || l.targetType}</span>}
            </div>
          )}
          <LogDetails l={l} />
          {l.reason && <div className="adm-log-line">📝 {l.reason}</div>}
        </article>
      ))}
      {next && (
        <button className="adm-btn ghost" disabled={loading} onClick={() => load(next)}>
          {loading ? '…' : 'Daha eski kayıtlar'}
        </button>
      )}
    </div>
  );
}

function LogDetails({ l }) {
  const d = l.details || {};
  const parts = [];
  if (d.duration) parts.push(`süre: ${d.duration === 'permanent' ? 'kalıcı' : d.duration}`);
  if (d.untilMs) parts.push(`bitiş: ${fmtDate(d.untilMs)}`);
  if (d.effect && d.effect !== 'none') parts.push(effectLabel(d.effect));
  if (d.reportCount) parts.push(`${d.reportCount} şikâyet kapandı`);
  if (d.warned) parts.push('uyarı gönderildi');
  if (l.action === 'set_role') parts.push(`${ROLE_LABELS[d.from] || 'Oyuncu'} → ${ROLE_LABELS[d.to] || 'Oyuncu'}`);
  if (d.authDisabled === false || d.authEnabled === false) parts.push('⚠️ Auth güncellenemedi');
  return (
    <>
      {parts.length > 0 && <div className="adm-log-line adm-dim">{parts.join(' · ')}</div>}
      {(d.before || d.text) && <blockquote className="adm-quote small">{d.before || d.text}</blockquote>}
    </>
  );
}
