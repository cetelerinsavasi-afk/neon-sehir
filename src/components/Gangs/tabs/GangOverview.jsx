// Çete > genel bakış: not, özet, hareket akışı, ayarlar, ayrılma,
// (İstihbarat üyesi Baba olduysa) gizli karar paneli.
import { useState } from 'react';
import { limit, orderBy } from 'firebase/firestore';
import { fmtDateTime, useGang, useGangAction, useNow, useQueryData, nextMidnight, fmtCountdown } from '../GangContext';
import { Btn, Card, Confirm, Info, Sheet, Stat } from '../ui';
import { LogoPicker } from '../NoGangView';
import { GANG_RULES, productOf } from '../gangConstants';

function IntelDecisionPanel() {
  const { run, busy } = useGangAction();
  const now = useNow();
  const [ask, setAsk] = useState(null);
  return (
    <div className="gx-decision">
      <div className="gx-decision-title">🕵️ İstihbarat mı, Mafya Babalığı mı?</div>
      <p className="dim">Çetenin başına geçtin. İkisi birden olmaz. Karar vermezsen 00:00'da İstihbarattan çıkarsın.</p>
      <div className="gx-decision-timer">⏱ {fmtCountdown(nextMidnight(now) - now)}</div>
      <div className="gx-decision-actions">
        <button className="gx-decision-btn intel" onClick={() => setAsk('disband')}>
          <span className="big">💥</span>
          <b>Çeteyi dağıt</b>
          <span className="dim">İstihbarata sadık kal · +çökertme prestiji</span>
        </button>
        <button className="gx-decision-btn baba" onClick={() => setAsk('stay')}>
          <span className="big">👑</span>
          <b>Baba olarak kal</b>
          <span className="dim">İstihbarattan sessizce ayrıl</span>
        </button>
      </div>
      {ask && (
        <Confirm
          icon={ask === 'disband' ? '💥' : '👑'}
          danger={ask === 'disband'}
          title={ask === 'disband' ? 'Çete dağıtılsın mı?' : 'İstihbarattan ayrıl?'}
          lines={
            ask === 'disband'
              ? ['Tüm üyeler çeteden atılır, çete yok edilir.', 'Üyeler "İstihbarat tarafından ele geçirildi" mesajı alır.', 'Kasadaki para yok olur.', 'Sen İstihbaratta kalırsın.']
              : ['İstihbarattan çıkarsın, İstihbarat prestijin silinir.', 'Kimseye bildirim gitmez.', 'Mafya Babası olarak devam edersin.']
          }
          confirmLabel={ask === 'disband' ? 'Dağıt' : 'Baba kal'}
          busy={busy === 'intelDecision'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('intelDecision', { choice: ask }, { success: ask === 'disband' ? '💥 Çete çökertildi.' : '👑 Artık sadece Mafya Babasısın.' });
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}

function EditProfileSheet({ gang, rank, onClose }) {
  const { run, busy } = useGangAction();
  const [name, setName] = useState(gang.name);
  const [logo, setLogo] = useState(gang.logo);
  const [note, setNote] = useState(gang.note || '');
  const isBaba = rank === 'baba';
  const save = async () => {
    const payload = { note };
    if (isBaba) Object.assign(payload, { name, logo });
    const r = await run('updateGangProfile', payload, { success: '✏️ Güncellendi' });
    if (r) onClose();
  };
  return (
    <Sheet title={isBaba ? 'Çete kimliği' : 'Çete notu'} icon="✏️" onClose={onClose}>
      {isBaba && <LogoPicker value={logo} onChange={setLogo} />}
      {isBaba && (
        <label className="gx-field">
          Çete adı
          <input className="gx-input" maxLength={GANG_RULES.NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="gx-field">
        Not <span className="dim">(herkes görür · {note.length}/{GANG_RULES.NOTE_MAX})</span>
        <textarea className="gx-input" rows={3} maxLength={GANG_RULES.NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Btn block onClick={save} busy={busy === 'updateGangProfile'}>
        Kaydet
      </Btn>
    </Sheet>
  );
}

export default function GangOverview({ gang, rank, me, membership, alliances }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const { docs: log } = useQueryData(path(`gangs/${gang.id}/log`), () => [orderBy('atMs', 'desc'), limit(25)], gang.id);
  const [edit, setEdit] = useState(false);
  const [leave, setLeave] = useState(false);
  const canNote = rank === 'baba' || rank === 'sagkol';
  const activeAllies = alliances.filter((a) => ['active', 'ending'].includes(a.status));
  return (
    <div className="gx-stack">
      {membership.intelDecisionGangId === gang.id && membership.intelRosterId && <IntelDecisionPanel />}
      <Card>
        <div className="gx-note-row">
          <span className="gx-note-quote">“{gang.note || '…'}”</span>
          {canNote && (
            <button className="gx-link" onClick={() => setEdit(true)}>
              ✏️
            </button>
          )}
        </div>
        <div className="gx-stats">
          <Stat icon="👥" label="Üye">
            {gang.memberCount}
          </Stat>
          <Stat icon="👑" label="Baba">
            {gang.babaName}
          </Stat>
          <Stat icon="🛣️" label="Yol">
            {(gang.routeProducts || []).length ? (gang.routeProducts || []).map((p) => productOf(p).emoji).join(' ') : '—'}
          </Stat>
          <Stat icon="🤝" label="Müttefik">
            {activeAllies.length || '—'}
          </Stat>
        </div>
      </Card>
      {me?.inactiveWarn && <div className="gx-warn">💤 Uzun süredir aktif değilsin — bir savaşa katıl, oy ver ya da sohbete yaz.</div>}
      <div className="gx-section-head">
        <span>📜 Son olaylar</span>
        <Info text="Çetende olan önemli olaylar: katılımlar, savaşlar, tırlar, dağıtımlar. Rütbe hesabı her gece 00:00'da prestije göre yapılır." />
      </div>
      <div className="gx-feed">
        {log.length === 0 && <p className="dim">Henüz olay yok.</p>}
        {log.map((l) => (
          <div key={l.id} className="gx-feed-item">
            <span className="gx-feed-icon">{l.icon}</span>
            <span className="gx-feed-text">{l.text}</span>
            <span className="gx-feed-time">{fmtDateTime(l.atMs)}</span>
          </div>
        ))}
      </div>
      <div className="gx-row-end">
        {rank === 'baba' && (
          <Btn small kind="ghost" onClick={() => setEdit(true)}>
            🎨 Ad & logo
          </Btn>
        )}
        <Btn small kind="danger" onClick={() => setLeave(true)}>
          🚪 Çeteden ayrıl
        </Btn>
      </div>
      {edit && <EditProfileSheet gang={gang} rank={rank} onClose={() => setEdit(false)} />}
      {leave && (
        <Confirm
          icon="🚪"
          danger
          title="Çeteden ayrılmak istediğine emin misin?"
          lines={[
            '✦ Bu çetedeki prestijin KALICI olarak silinir.',
            'Geri dönersen 0 prestijle Çömez olarak başlarsın.',
            ...(rank === 'baba' ? ['👑 Babalık en yüksek prestijli üyeye geçer. Kimse kalmazsa çete dağılır.'] : []),
          ]}
          confirmLabel="Ayrıl"
          busy={busy === 'leaveGang'}
          onCancel={() => setLeave(false)}
          onConfirm={async () => {
            await run('leaveGang', {}, { success: '🚪 Çeteden ayrıldın.' });
            setLeave(false);
          }}
        />
      )}
    </div>
  );
}
