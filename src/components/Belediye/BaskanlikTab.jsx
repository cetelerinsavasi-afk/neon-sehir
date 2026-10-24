// v127 — BAŞKANLIK: kadro şeması (başkan → 2 yardımcı → 4 bakan). Kutuya
// dokununca: boşsa arkadaş daveti · davet bekliyorsa geri çekme · doluysa
// yetkiler (yardımcı, sadece başkan) / görevden alma / istifa. Kadro maaşları
// (sadece başkan) ve son hareketler.
import { useState } from 'react';
import { Btn, Confirm, Sheet } from '../Gangs/ui';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useSocial } from '../../contexts/SocialContext';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { seatSalary } from '../../../functions/belediyeRates.js';
import { BELEDIYE, SEATS, SEAT_IDS, YRD_PERMS, canFireSeat, canInviteSeat, inviteActive } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';
import { Kpis, RateEditor, hoursLeft, nf, useTick } from './belediyeUi';
import Defter from './Defter';

const PERM_LABEL = { sanayi: 'Sanayi Bakanlığı', ticaret: 'Ticaret Bakanlığı', guvenlik: 'Teşkilat Bakanlığı', kultur: 'Kültür ve Spor Bakanlığı', fire: 'Bakanları görevden alma', invite: 'Bakan davet etme' };
const SHORT = { bsk: 'Başkan', yrd1: 'Başkan Yrd.', yrd2: 'Başkan Yrd.', san: 'Sanayi', tic: 'Ticaret', guv: 'Teşkilat', kul: 'Kültür ve Spor' };

function Slot({ id, holder, inv, onOpen, size }) {
  const cls = `bd-slot${id === 'bsk' ? ' big' : ''}${!holder && !inv ? ' empty' : ''}${inv && !holder ? ' pend' : ''}`;
  const permN = holder?.perms ? YRD_PERMS.filter((p) => holder.perms[p]).length : null;
  return (
    <button className={cls} onClick={() => onOpen(id)}>
      {holder ? (
        <AvatarSvg avatar={holder.avatar} size={size} rounded />
      ) : inv ? (
        <span className="bd-slot-pend">
          <AvatarSvg avatar={inv.avatar} size={size} rounded />
        </span>
      ) : (
        <span className="bd-plus" style={{ width: size, height: size }}>
          +
        </span>
      )}
      <b>{holder?.name || inv?.name || 'Boş'}</b>
      <small>{SHORT[id]}</small>
      {inv && !holder && <span className="bd-badge">Davet bekliyor</span>}
      {holder && permN != null && <span className="bd-badge">{permN} yetki</span>}
    </button>
  );
}

function SeatSheet({ id, onClose }) {
  const { uid, main, seat: mySeat, isAdmin, run, busy, showToast } = useBelediye();
  const rates = useBelediyeRates();
  const { friends } = useSocial();
  const now = useTick(60_000);
  const [ask, setAsk] = useState(null); // 'fire' | 'resign'
  const [why, setWhy] = useState('');
  const [perms, setPerms] = useState(null);
  const holder = main.seats?.[id];
  const inv = inviteActive(main.invites?.[id], now) ? main.invites[id] : null;
  const title = SEATS[id].title;
  const salary = seatSalary(rates, id);
  const guarded = holder && Number(holder.guardUntilMs || 0) > now;

  const taken = new Set([...SEAT_IDS.map((s) => main.seats?.[s]?.uid), ...Object.values(main.invites || {}).filter((x) => inviteActive(x, now)).map((x) => x.uid)].filter(Boolean));
  const cands = friends.filter((f) => !taken.has(f.uid));

  const done = (r) => r && onClose();
  const curPerms = perms || holder?.perms || {};
  const togglePerm = async (p) => {
    const next = { ...curPerms, [p]: !curPerms[p] };
    setPerms(next);
    const r = await run('setPerms', { seat: id, perms: next }, { key: `perm_${p}` });
    if (!r) setPerms(null);
  };

  let body = null;
  if (holder?.uid) {
    const isMe = holder.uid === uid;
    body = (
      <>
        <div className="bd-sheet-who">
          <AvatarSvg avatar={holder.avatar} size={56} rounded />
          <div>
            <b>{holder.name}</b>
            <small className="dim">
              {title} · {nf(salary)} 🪙 / gün
            </small>
            {guarded && <small className="dim">🛡️ {hoursLeft(holder.guardUntilMs, now)} saat görevden alınamaz</small>}
          </div>
        </div>
        {SEATS[id].kind === 'yrd' && (
          <div className="bd-perms">
            {YRD_PERMS.map((p) => (
              <label key={p} className="bd-perm">
                <input type="checkbox" checked={Boolean(curPerms[p])} disabled={mySeat !== 'bsk' || Boolean(busy)} onChange={() => togglePerm(p)} />
                <span>{PERM_LABEL[p]}</span>
              </label>
            ))}
          </div>
        )}
        {isMe ? (
          <Btn kind="danger" block onClick={() => setAsk('resign')}>
            İstifa et
          </Btn>
        ) : (
          canFireSeat(main, mySeat, id) && (
            <Btn kind="danger" block disabled={guarded} onClick={() => setAsk('fire')}>
              Görevden al
            </Btn>
          )
        )}
      </>
    );
  } else if (id === 'bsk') {
    body = isAdmin && !mySeat ? (
      <Btn block busy={busy === 'claimMayor'} onClick={async () => done(await run('claimMayor', {}, { success: '👑 Belediye başkanı oldun.' }))}>
        Başkanlığı devral
      </Btn>
    ) : (
      <p className="dim bd-note">Başkanlık boş.</p>
    );
  } else if (inv) {
    const canCancel = inv.byUid === uid || canInviteSeat(main, mySeat, id);
    body = (
      <>
        <div className="bd-sheet-who">
          <AvatarSvg avatar={inv.avatar} size={56} rounded />
          <div>
            <b>{inv.name}</b>
            <small className="dim">Davet bekliyor · {hoursLeft(inv.expiresAtMs, now)} saat</small>
          </div>
        </div>
        {canCancel && (
          <Btn kind="ghost" block busy={busy === 'cancelInvite'} onClick={async () => done(await run('cancelInvite', { seat: id }, { success: 'Davet geri çekildi.' }))}>
            Daveti geri çek
          </Btn>
        )}
      </>
    );
  } else if (canInviteSeat(main, mySeat, id)) {
    body = (
      <>
        <p className="dim bd-note">
          Maaş {nf(salary)} 🪙 / gün · davet 24 saat geçerli
        </p>
        {cands.length === 0 ? (
          <p className="dim bd-note">Davet edilebilecek arkadaşın yok.</p>
        ) : (
          <div className="bd-cands">
            {cands.map((f) => (
              <div key={f.uid} className="bd-cand">
                <AvatarSvg avatar={f.avatar} size={36} rounded />
                <span>{f.name}</span>
                <Btn small busy={busy === `inv_${f.uid}`} disabled={Boolean(busy)} onClick={async () => done(await run('invite', { seat: id, targetUid: f.uid }, { key: `inv_${f.uid}`, success: `✉️ ${f.name} davet edildi.` }))}>
                  Davet et
                </Btn>
              </div>
            ))}
          </div>
        )}
      </>
    );
  } else {
    body = <p className="dim bd-note">Bu görev boş.</p>;
  }

  return (
    <Sheet title={title} icon="🏛️" onClose={onClose}>
      {body}
      {ask === 'fire' && (
        <Confirm
          icon="⛔"
          danger
          title={`${holder?.name} görevden alınsın mı?`}
          confirmLabel="Görevden al"
          busy={busy === 'fire'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            if (why.trim().length < BELEDIYE.REASON_MIN) return showToast('Görevden alma nedenini yaz.', 'err');
            done(await run('fire', { seat: id, reason: why.trim() }, { success: 'Görevden alındı.' }));
          }}
        >
          <textarea className="gx-input" rows={3} maxLength={BELEDIYE.REASON_MAX} placeholder="Neden? (zorunlu)" value={why} onChange={(e) => setWhy(e.target.value)} />
        </Confirm>
      )}
      {ask === 'resign' && (
        <Confirm icon="🚪" danger title={`${title} görevinden istifa edilsin mi?`} confirmLabel="İstifa et" busy={busy === 'resign'} onCancel={() => setAsk(null)} onConfirm={async () => done(await run('resign', {}, { success: 'İstifa ettin.' }))} />
      )}
    </Sheet>
  );
}

export default function BaskanlikTab() {
  const { main } = useBelediye();
  const rates = useBelediyeRates();
  const now = useTick(60_000);
  const [open, setOpen] = useState(null);
  const seats = main.seats || {};
  const invOf = (id) => (inviteActive(main.invites?.[id], now) ? main.invites[id] : null);
  const filled = SEAT_IDS.filter((s) => seats[s]?.uid);
  const bill = filled.reduce((a, s) => a + seatSalary(rates, s), 0);
  const slot = (id, size) => <Slot key={id} id={id} holder={seats[id]?.uid ? seats[id] : null} inv={invOf(id)} onOpen={setOpen} size={size} />;
  return (
    <div className="gx-page">
      <Kpis
        items={[
          { label: 'Dolu kadro', value: `${filled.length} / ${SEAT_IDS.length}` },
          { label: 'Günlük maaş', value: `${nf(bill)} 🪙` },
        ]}
      />
      <div className="bd-org">
        <div className="bd-orow one">{slot('bsk', 64)}</div>
        <div className="bd-vl" />
        <div className="bd-orow two">
          {slot('yrd1', 50)}
          {slot('yrd2', 50)}
        </div>
        <div className="bd-vl" />
        <div className="bd-orow four">{['san', 'tic', 'guv', 'kul'].map((id) => slot(id, 38))}</div>
      </div>
      <div className="gx-section-head">
        <span>💰 Kadro maaşları</span>
      </div>
      <RateEditor m="yonetim" />
      <div className="gx-section-head">
        <span>📒 Ayrıntılı defter</span>
      </div>
      <Defter />
      {main.log?.length > 0 && (
        <>
          <div className="gx-section-head">
            <span>🕘 Son hareketler</span>
          </div>
          <div className="gx-card bd-log">
            {main.log.slice(0, 12).map((l, i) => (
              <p key={i} className="bd-logline">
                <small className="dim">{new Date(l.atMs + 3 * 3600_000).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2.$1')}</small> {l.text}
              </p>
            ))}
          </div>
        </>
      )}
      {open && <SeatSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
