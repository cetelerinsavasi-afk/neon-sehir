import { useCallback, useEffect, useState } from 'react';
import { adminAction } from '../../services/gameActions';
import { ACTION_LABELS, BAN_OPTIONS, MUTE_OPTIONS, ROLE_LABELS, errText, fmtDate } from './adminLabels';

// Oyuncu yönetimi — ad/uid ile arama; oyuncu kartında uyarı, susturma,
// ban (yalnızca yönetici) ve rol (yalnızca yönetici). Yetki sunucuda denetlenir;
// burada sadece anlamsız düğmeler gizlenir.
export default function UserManagementTab({ me, focusUid, onFocusUid }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResults((await adminAction('searchUsers', { q: q.trim() })).results);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  if (focusUid) return <UserDetail me={me} uid={focusUid} onBack={() => onFocusUid(null)} />;

  return (
    <div className="adm-stack">
      <form className="adm-search" onSubmit={search}>
        <input className="adm-input" placeholder="Oyuncu adı ya da UID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Oyuncu ara" />
        <button className="adm-btn primary" disabled={busy || q.trim().length < 2}>
          {busy ? '…' : 'Ara'}
        </button>
      </form>
      <p className="adm-dim">Oyun içi adın ilk harflerini ya da oyuncunun UID'sini yaz.</p>
      {error && <p className="adm-error">{error}</p>}
      {results && results.length === 0 && <p className="adm-empty">Oyuncu bulunamadı.</p>}
      {results?.map((r) => (
        <button key={r.uid} className="adm-user-row" onClick={() => onFocusUid(r.uid)}>
          <span className="adm-user-name">
            {r.name}
            {r.role && <span className={`adm-role adm-role-${r.role}`}>{ROLE_LABELS[r.role]}</span>}
          </span>
          <span className="adm-user-flags">
            {r.ban && <span className="adm-tag danger">⛔ banlı</span>}
            {r.mute && <span className="adm-tag warn">🔇 susturulmuş</span>}
          </span>
          <span className="adm-uid">{r.uid}</span>
        </button>
      ))}
    </div>
  );
}

function UserDetail({ me, uid, onBack }) {
  const [u, setU] = useState(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null); // 'warn' | 'mute' | 'ban' | 'role'
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setU(await adminAction('getUser', { uid }));
    } catch (err) {
      setError(errText(err));
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const done = (text) => {
    setPanel(null);
    setFlash(text);
    setTimeout(() => setFlash(''), 3000);
    load();
  };

  const isAdmin = me.role === 'admin';
  const self = u?.uid === me.uid;
  // Sunucu kuralıyla aynı: kendine ve yöneticilere yok; moderatöre sadece yönetici
  const canSanction = u && !self && u.role !== 'admin' && (u.role !== 'moderator' || isAdmin);

  return (
    <div className="adm-stack">
      <button className="adm-btn ghost small adm-back" onClick={onBack}>
        ← Aramaya dön
      </button>
      {error && <p className="adm-error">{error}</p>}
      {!u && !error && <p className="adm-dim">Yükleniyor…</p>}
      {u && (
        <>
          <section className="adm-card">
            <div className="adm-card-head">
              <span className="adm-user-big">{u.name}</span>
              {u.role && <span className={`adm-role adm-role-${u.role}`}>{ROLE_LABELS[u.role]}</span>}
            </div>
            <p className="adm-uid selectable">{u.uid}</p>
            <dl className="adm-dl">
              <dt>Kayıt</dt>
              <dd>{fmtDate(u.createdAtMs)}</dd>
              <dt>Şikâyetler</dt>
              <dd>
                {u.reports.total} toplam · {u.reports.open} bekleyen · {u.reports.actioned} kaldırılan
              </dd>
              <dt>Susturma</dt>
              <dd>{u.mute ? `🔇 ${fmtDate(u.mute.untilMs)} tarihine kadar — ${u.mute.reason || ''} (${u.mute.byName || '?'})` : '—'}</dd>
              <dt>Ban</dt>
              <dd>{u.ban ? `⛔ ${u.ban.permanent ? 'Kalıcı' : `${fmtDate(u.ban.untilMs)} tarihine kadar`} — ${u.ban.reason || ''} (${u.ban.byName || '?'})` : '—'}</dd>
              <dt>Giriş</dt>
              <dd>{u.authDisabled == null ? 'bilinmiyor' : u.authDisabled ? 'kapalı' : 'açık'}</dd>
            </dl>
          </section>

          {flash && <p className="adm-ok">✓ {flash}</p>}

          {canSanction && !panel && (
            <div className="adm-grid">
              <button className="adm-btn ghost" onClick={() => setPanel('warn')}>
                ⚠️ Uyarı gönder
              </button>
              {u.mute ? (
                <SimpleAction label="🔊 Susturmayı kaldır" confirm="Susturma kaldırılsın mı?" run={() => adminAction('unmuteUser', { uid })} onDone={() => done('Susturma kaldırıldı.')} />
              ) : (
                !u.ban && (
                  <button className="adm-btn warn" onClick={() => setPanel('mute')}>
                    🔇 Sustur
                  </button>
                )
              )}
              {isAdmin &&
                (u.ban ? (
                  <SimpleAction label="🟢 Banı kaldır" confirm="Ban kaldırılsın ve hesap yeniden açılsın mı?" run={() => adminAction('unbanUser', { uid })} onDone={() => done('Ban kaldırıldı.')} />
                ) : (
                  <button className="adm-btn danger" onClick={() => setPanel('ban')}>
                    ⛔ Banla
                  </button>
                ))}
              {isAdmin && !u.bootstrapAdmin && (
                <button className="adm-btn ghost" onClick={() => setPanel('role')}>
                  🎖️ Rol
                </button>
              )}
            </div>
          )}
          {!canSanction && isAdmin && !self && !u.bootstrapAdmin && !panel && (
            <div className="adm-grid">
              <button className="adm-btn ghost" onClick={() => setPanel('role')}>
                🎖️ Rol
              </button>
            </div>
          )}
          {!canSanction && !isAdmin && u.role && <p className="adm-dim">Yetkili hesaplara yalnızca yöneticiler işlem yapabilir.</p>}

          {panel === 'warn' && <WarnForm uid={uid} onCancel={() => setPanel(null)} onDone={() => done('Uyarı SMS’i gönderildi.')} />}
          {panel === 'mute' && <DurationForm kind="mute" isAdmin={isAdmin} uid={uid} onCancel={() => setPanel(null)} onDone={() => done('Oyuncu susturuldu.')} />}
          {panel === 'ban' && <DurationForm kind="ban" isAdmin={isAdmin} uid={uid} onCancel={() => setPanel(null)} onDone={(r) => done(r?.authDisabled === false ? 'Banlandı (Auth hesabı bulunamadı — yalnızca oyun içi yasak).' : 'Oyuncu banlandı, oturumları kapatıldı.')} />}
          {panel === 'role' && <RoleForm u={u} onCancel={() => setPanel(null)} onDone={() => done('Rol güncellendi.')} />}

          <section className="adm-stack">
            <p className="adm-section">Bu oyuncuyla ilgili son işlemler</p>
            {u.recentLogs.length === 0 && <p className="adm-dim">Kayıt yok.</p>}
            {u.recentLogs.map((l) => (
              <div key={l.id} className="adm-log-mini">
                <span>{ACTION_LABELS[l.action] || l.action}</span>
                <span className="adm-dim">
                  {l.actorName} · {fmtDate(l.atMs)}
                </span>
                {l.reason && <span className="adm-dim">“{l.reason}”</span>}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function SimpleAction({ label, confirm, run, onDone }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!ask)
    return (
      <button className="adm-btn ghost" onClick={() => setAsk(true)}>
        {label}
      </button>
    );
  return (
    <div className="adm-confirm span2">
      <p className="adm-confirm-text">{confirm}</p>
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-actions">
        <button className="adm-btn ghost" disabled={busy} onClick={() => setAsk(false)}>
          Vazgeç
        </button>
        <button
          className="adm-btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await run();
              onDone();
            } catch (err) {
              setError(errText(err));
              setBusy(false);
            }
          }}
        >
          {busy ? '…' : 'Onayla'}
        </button>
      </div>
    </div>
  );
}

function useSubmit(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (fn) => {
    setBusy(true);
    setError('');
    try {
      onDone(await fn());
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function WarnForm({ uid, onCancel, onDone }) {
  const [text, setText] = useState('');
  const { busy, error, submit } = useSubmit(onDone);
  return (
    <div className="adm-confirm">
      <p className="adm-confirm-text">Oyuncuya “⚠️ Uyarı:” başlıklı bir SMS gider. Boş bırakırsan standart uyarı metni kullanılır.</p>
      <textarea className="adm-input" rows={3} maxLength={300} placeholder="Uyarı metni" value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-actions">
        <button className="adm-btn ghost" disabled={busy} onClick={onCancel}>
          Vazgeç
        </button>
        <button className="adm-btn primary" disabled={busy} onClick={() => submit(() => adminAction('warnUser', { uid, text: text.trim() || undefined }))}>
          {busy ? '…' : 'Gönder'}
        </button>
      </div>
    </div>
  );
}

function DurationForm({ kind, isAdmin, uid, onCancel, onDone }) {
  const options = kind === 'mute' ? MUTE_OPTIONS.filter((o) => isAdmin || !o.adminOnly) : BAN_OPTIONS;
  const [duration, setDuration] = useState(options[kind === 'mute' ? 1 : 0].id);
  const [reason, setReason] = useState('');
  const { busy, error, submit } = useSubmit(onDone);
  const isBan = kind === 'ban';
  return (
    <div className={`adm-confirm${isBan ? ' danger' : ''}`}>
      <p className="adm-confirm-text">
        {isBan
          ? 'Oyuncunun hesabı kapatılır, açık oturumları sonlandırılır ve yazı yazamaz. Süreli banlar süre dolunca otomatik kalkar.'
          : 'Oyuncu bu süre boyunca mesaj, gönderi, yorum, isim ve not yazamaz. Kendisine SMS ile bildirilir.'}
      </p>
      <div className="adm-chips">
        {options.map((o) => (
          <button key={o.id} className={`adm-chip${duration === o.id ? ' on' : ''}`} onClick={() => setDuration(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <input className="adm-input" maxLength={200} placeholder="Sebep (zorunlu, kayıtta görünür)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-actions">
        <button className="adm-btn ghost" disabled={busy} onClick={onCancel}>
          Vazgeç
        </button>
        <button className={`adm-btn ${isBan ? 'danger' : 'warn'}`} disabled={busy || !reason.trim()} onClick={() => submit(() => adminAction(isBan ? 'banUser' : 'muteUser', { uid, duration, reason: reason.trim() }))}>
          {busy ? '…' : isBan ? 'Banla' : 'Sustur'}
        </button>
      </div>
    </div>
  );
}

function RoleForm({ u, onCancel, onDone }) {
  const [role, setRole] = useState(u.role || 'none');
  const { busy, error, submit } = useSubmit(onDone);
  const opts = [
    { id: 'none', label: 'Oyuncu' },
    { id: 'moderator', label: 'Moderatör' },
    { id: 'admin', label: 'Yönetici' },
  ];
  return (
    <div className="adm-confirm">
      <p className="adm-confirm-text">Moderatör: şikâyet kuyruğu, uyarı, 7 güne kadar susturma. Yönetici: ek olarak ban ve rol yönetimi.</p>
      <div className="adm-chips">
        {opts.map((o) => (
          <button key={o.id} className={`adm-chip${role === o.id ? ' on' : ''}`} onClick={() => setRole(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-actions">
        <button className="adm-btn ghost" disabled={busy} onClick={onCancel}>
          Vazgeç
        </button>
        <button className="adm-btn primary" disabled={busy || role === (u.role || 'none')} onClick={() => submit(() => adminAction('setRole', { uid: u.uid, role }))}>
          {busy ? '…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}
