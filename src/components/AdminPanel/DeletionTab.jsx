import { useCallback, useEffect, useState } from 'react';
import { adminAccountDeletion } from '../../services/gameActions';
import { errText, fmtDate } from './adminLabels';

// v62 — 🗑️ Silme (yalnızca yönetici): hesap silme talepleri.
// Oyundaki "Hesabımı Sil" talepleri buraya kendiliğinden düşer; web sayfasından
// e-postayla gelenler "E-postayla gelen talep ekle" ile eklenir. Sıra:
// Önizle → (engel yoksa) Hesabı sil  ·  ya da  Talebi iptal et.
// Silme, yerel silme betiğiyle aynı koddur (functions/accountDeletion.js).
const STATUS = { pending: 'Bekliyor', processing: 'İşleniyor', failed: 'Yarım kaldı' };

function PlanSection({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className="adm-del-section">
      <p className={`adm-del-sec-title${tone ? ` ${tone}` : ''}`}>
        {title} ({items.length})
      </p>
      <ul className="adm-del-list">
        {items.map((i, k) => (
          <li key={k}>
            <b>{i.what}</b>
            {i.count > 1 ? ` · ${i.count}` : ''}
            {i.detail ? <span className="adm-dim"> — {i.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestCard({ r, onDone }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(null);
    }
  };
  const preview = () => run('preview', async () => setPlan((await adminAccountDeletion('preview', { uid: r.uid })).plan));
  const cancel = () => run('cancel', async () => {
    await adminAccountDeletion('cancel', { uid: r.uid });
    onDone(`${r.name} için silme talebi iptal edildi; oyuncuya SMS gitti.`);
  });
  const apply = () => run('apply', async () => {
    await adminAccountDeletion('apply', { uid: r.uid, fingerprint: plan.fingerprint });
    onDone(`${r.name} hesabı silindi.`);
  });
  const blocked = plan && plan.blocker.length > 0;

  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <span className="adm-user-big">{r.name}</span>
        <span className={`adm-tag${r.status === 'failed' ? ' danger' : ''}`}>{STATUS[r.status] || r.status}</span>
        <span className="adm-tag">{r.source === 'email' ? '✉️ e-posta' : '📱 oyun içi'}</span>
      </div>
      <p className="adm-uid selectable">{r.uid}</p>
      <dl className="adm-dl">
        <dt>E-posta</dt>
        <dd>{r.email || '—'}</dd>
        <dt>Talep</dt>
        <dd>{fmtDate(r.createdAtMs)}</dd>
        {r.error && (
          <>
            <dt>Not</dt>
            <dd>{r.error}</dd>
          </>
        )}
      </dl>

      {plan && (
        <div className="adm-del-plan">
          <p className="adm-dim">
            {plan.identity.displayName || '—'} · {plan.identity.authEmail || '—'} · altın {Number(plan.identity.gold || 0).toLocaleString('tr-TR')} · son giriş {plan.identity.lastSignIn || '—'}
          </p>
          <PlanSection title="⛔ Engeller — önce çözülmeli" items={plan.blocker} tone="danger" />
          <PlanSection title="🗑️ Silinecek" items={plan.delete} />
          <PlanSection title="🕶️ Kimliksizleşecek" items={plan.anonymize} />
          <PlanSection title="🔁 Oyun içi işlemler" items={plan.flow} />
          <PlanSection title="📁 Saklanacak (yasal)" items={plan.retain} />
        </div>
      )}

      {error && <p className="adm-error">{error}</p>}

      {!confirm ? (
        <div className="adm-actions">
          <button className="adm-btn" disabled={Boolean(busy)} onClick={preview}>
            {busy === 'preview' ? '…' : plan ? '↻ Yeniden önizle' : '🔍 Önizle'}
          </button>
          <button className="adm-btn danger" disabled={Boolean(busy) || !plan || blocked} onClick={() => setConfirm(true)} title={!plan ? 'Önce önizle' : blocked ? 'Engeller çözülmeli' : ''}>
            🗑️ Hesabı sil
          </button>
          <button className="adm-btn ghost" disabled={Boolean(busy) || r.status === 'processing'} onClick={cancel}>
            {busy === 'cancel' ? '…' : 'Talebi iptal et'}
          </button>
        </div>
      ) : (
        <div className="adm-del-confirm">
          <p>
            ⚠️ <b>{r.name}</b> hesabı ve verileri <b>kalıcı olarak</b> silinecek. Geri alınamaz. Onaylamak için <b>SİL</b> yaz.
          </p>
          <input className="adm-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SİL" aria-label="Onay" />
          <div className="adm-actions">
            <button className="adm-btn danger" disabled={typed.trim().toLocaleUpperCase('tr-TR') !== 'SİL' || Boolean(busy)} onClick={apply}>
              {busy === 'apply' ? 'Siliniyor… (birkaç dakika sürebilir)' : 'Kalıcı olarak sil'}
            </button>
            <button className="adm-btn ghost" disabled={Boolean(busy)} onClick={() => { setConfirm(false); setTyped(''); }}>
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DeletionTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setRows((await adminAccountDeletion('list')).requests);
    } catch (err) {
      setError(errText(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setAdding(true);
    setError('');
    setFlash('');
    try {
      const r = await adminAccountDeletion('addByEmail', { email: email.trim() });
      setFlash(r.already ? 'Bu hesap için zaten açık bir talep var.' : 'Talep eklendi.');
      setEmail('');
      await load();
    } catch (err) {
      setError(errText(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="adm-stack">
      <p className="adm-dim">Oyundaki “Hesabımı Sil” talepleri buraya kendiliğinden düşer. Web sayfasından e-postayla gelen talebi, gönderenin e-posta adresiyle ekle.</p>
      <form className="adm-search" onSubmit={add}>
        <input className="adm-input" type="email" placeholder="E-postayla gelen talep: oyuncu@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Talep e-postası" />
        <button className="adm-btn primary" disabled={adding || !email.includes('@')}>
          Ekle
        </button>
      </form>
      {error && <p className="adm-error">{error}</p>}
      {flash && <p className="adm-ok">✓ {flash}</p>}
      {rows === null && !error && <p className="adm-dim">Yükleniyor…</p>}
      {rows && rows.length === 0 && <p className="adm-empty">Bekleyen silme talebi yok.</p>}
      {rows?.map((r) => (
        <RequestCard
          key={r.uid}
          r={r}
          onDone={(msg) => {
            setFlash(msg);
            load();
          }}
        />
      ))}
    </div>
  );
}
