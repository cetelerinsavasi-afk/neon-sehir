/* eslint-disable react-refresh/only-export-components */
// v136 — DARBE arayüzü (sunucu: functions/politicsCoup.js)
//   CoupScreen    — herkese açık darbe ekranı (anasayfa ⚡ · Belediye › Darbe · Savaş paneli)
//   CoupVoteSheet — rütbeli polislerin gizli EVET / HAYIR oylaması
//   CoupPanel     — Polis Teşkilatı › Savaş: EGM'nin başlat / iptal / açıklama / karar paneli
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../../lib/backStack';
import { usePlayer } from '../../hooks/usePlayer';
import { usePoliticsState, useLiveDoc } from '../../hooks/usePolitics';
import { Btn, Confirm, Sheet } from '../Gangs/ui';
import { Countdown, TextPreview, nf, pc, useRun } from './politicsUi';
import { POLITICS, polDayKey, polWeekday } from '../../../functions/politicsRules.js';
import '../Gangs/Gangs.css';
import './Politics.css';

const POLICE_GOV_PRESTIGE = 1_000_000; // sunucu: COUP.POLICE_GOV_PRESTIGE
// sunucu coupPowerOf: hükümeti savunan Komiser ve üstü polis 3 güç (+prestij); Polis Memuru 1
const GOV_POLICE_HINT = 'Komiser+: 3 güç · Memur: 1 güç';
const GOV_POLICE_LINE = `Komiser ve üstü: 3 güç + ${nf(POLICE_GOV_PRESTIGE)} prestij · Polis Memuru: 1 güç`;

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = (text, kind) => {
    setToast({ text, kind, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), kind === 'err' ? 4200 : 2600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = toast && (
    <div key={toast.id} className={`gx-toast gx-toast-${toast.kind}`} role="status">
      {toast.text}
    </div>
  );
  return [show, node];
}

// Açıklama düzenleyici (darbeci / hükümet)
function TextEditor({ label, text, run, busy }) {
  const [v, setV] = useState(text || '');
  const [open, setOpen] = useState(false);
  useEffect(() => setV(text || ''), [text]);
  return (
    <div className="pl-mytext">
      <button type="button" className="pl-mytext-head" onClick={() => setOpen((o) => !o)}>
        📝 {label} <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <textarea className="pl-textarea" maxLength={POLITICS.TEXT_MAX} value={v} onChange={(e) => setV(e.target.value)} rows={5} placeholder="Halka ne söylemek istersin?" />
          <div className="pl-mytext-foot">
            <small className="pl-count">
              {v.length}/{POLITICS.TEXT_MAX}
            </small>
            <Btn small disabled={v.trim() === (text || '').trim()} busy={busy === 'coupText'} onClick={() => run('coupText', { text: v }, { success: 'Açıklama güncellendi.' })}>
              Kaydet
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Herkese açık darbe ekranı
// =============================================================================
export function CoupBody({ coup, doc, run, busy, openText, isLeader = false }) {
  const { player } = usePlayer();
  const [ask, setAsk] = useState(null);
  const P = { coup: Number(doc?.power?.coup || 0), gov: Number(doc?.power?.gov || 0) };
  const tot = P.coup + P.gov;
  const cp = tot ? (P.coup / tot) * 100 : 50;
  const status = doc?.status || coup?.status;
  const active = status === 'active';
  const mine = player?.coupSide?.id === coup?.id ? player.coupSide.side : null;
  const police = player?.profession === 'polis';
  const eligible = Boolean(player?.onboardingRewardClaimed);
  const govSeat = ['bsk', 'yrd1', 'yrd2'].includes(player?.belediyeSeat);
  const verdict = !active
    ? status === 'lost'
      ? { c: 'b', t: '🏛️ Darbe bastırıldı — hükümet ayakta' }
      : { c: 'r', t: status === 'ruled' ? '⚡ Darbeci devletin başına geçti' : status === 'election' ? '🗳️ Darbe başarılı — erken seçim' : '⚡ Darbe başarılı — hükümet devrildi' }
    : P.coup > P.gov
      ? { c: 'r', t: `Darbeciler üstün: ${nf(P.coup - P.gov)} güç fark` }
      : P.gov > P.coup
        ? { c: 'b', t: `Hükümet üstün: ${nf(P.gov - P.coup)} güç fark` }
        : { c: '', t: 'Güçler dengede' };
  return (
    <div className="pl-page">
      {active && <Countdown untilMs={coup.endMs} label="Darbenin bitmesine" />}
      <div className={`cp-verdict ${verdict.c}`}>{verdict.t}</div>
      <div className="cp-card">
        <div className="cp-sides">
          <div className="cp-side r">
            <div className="cp-ic">🚨</div>
            <div className="cp-t">Darbeciler</div>
            <div className="cp-n">{nf(P.coup)}</div>
            <div className="cp-p">
              %{pc(cp)} · {nf(doc?.count?.coup)} kişi
            </div>
          </div>
          <div className="cp-side b">
            <div className="cp-ic">🏛️</div>
            <div className="cp-t">Hükümet</div>
            <div className="cp-n">{nf(P.gov)}</div>
            <div className="cp-p">
              %{pc(100 - cp)} · {nf(doc?.count?.gov)} kişi
            </div>
          </div>
        </div>
        <div className="cp-bar" role="img" aria-label={`Darbeciler %${pc(cp)}, hükümet %${pc(100 - cp)}`}>
          <div className="cp-r" style={{ width: `${cp}%` }} />
          <div className="cp-b" />
          <div className="cp-mid" style={{ left: `${cp}%` }} />
        </div>
        {active &&
          (mine ? (
            <div className="pl-status">{mine === 'gov' ? '🏛️ Hükümeti destekledin.' : '🚨 Darbeyi destekledin.'}</div>
          ) : !eligible ? (
            <p className="pl-note">🔒 Katılmak için başlangıç görevlerini tamamla.</p>
          ) : (
            <div className="cp-acts">
              <button className="cp-btn r" disabled={Boolean(busy)} onClick={() => setAsk('coup')}>
                <b>Darbeyi destekle</b>
                <small>{police ? '0 prestij · ' : ''}1 güç</small>
              </button>
              <button className="cp-btn b" disabled={Boolean(busy)} onClick={() => setAsk('gov')}>
                <b>Hükümeti destekle</b>
                <small>{police ? GOV_POLICE_HINT : '1 güç'}</small>
              </button>
            </div>
          ))}
      </div>

      <div className="cp-text r">
        <div className="cp-text-h">🚨 Darbeci · {coup?.leaderCode || doc?.leaderCode}</div>
        {doc?.leaderText ? <TextPreview text={doc.leaderText} name={`Darbeci · ${doc.leaderCode}`} onOpen={openText} /> : <small className="dim">Henüz açıklama yok.</small>}
      </div>
      <div className="cp-text b">
        <div className="cp-text-h">🏛️ Hükümet{doc?.govTextBy ? ` · ${doc.govTextBy.name} (${doc.govTextBy.title})` : ''}</div>
        {doc?.govText ? <TextPreview text={doc.govText} name="Hükümet" onOpen={openText} /> : <small className="dim">Henüz açıklama yok.</small>}
      </div>
      {isLeader && ['active', 'decision'].includes(coup?.status) && <TextEditor label="Darbeci açıklaman" text={doc?.leaderText} run={run} busy={busy} />}
      {govSeat && active && <TextEditor label="Hükümet açıklaması" text={doc?.govText} run={run} busy={busy} />}

      {ask && (
        <Confirm
          icon={ask === 'gov' ? '🏛️' : '🚨'}
          title={ask === 'gov' ? 'Hükümeti destekle' : 'Darbeyi destekle'}
          lines={[ask === 'gov' && police ? `⚔️ ${GOV_POLICE_LINE}` : '⚔️ 1 güç', '🔒 Seçimin geri alınamaz']}
          confirmLabel="Onayla"
          busy={busy === 'coupJoin'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('coupJoin', { side: ask }, { success: (d) => `${ask === 'gov' ? 'Hükümetin yanındasın' : 'Darbecilerin yanındasın'} · ${nf(d.power || 1)} güç` });
            if (r) setAsk(null);
          }}
        />
      )}
    </div>
  );
}

export function CoupScreen({ onClose, isLeader = false }) {
  useBackClose(true, onClose);
  const { state } = usePoliticsState();
  const coup = state?.coup || null;
  const id = coup?.id || null;
  const doc = useLiveDoc(id ? `politicsCoups/${id}` : null);
  const [show, toastNode] = useToast();
  const { run, busy } = useRun(show);
  const [text, setText] = useState(null);
  return createPortal(
    <div className="gx-full pl-full" role="dialog" aria-label="Darbe">
      <div className="gx-full-top">
        <span className="gx-full-title">⚡ Darbe girişimi</span>
        <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="gx-full-body">
        <div className="gx-root pl-root">
          {!coup ? <div className="pl-empty big">Şu an süren bir darbe yok.</div> : doc === undefined ? <div className="gx-loading">Yükleniyor…</div> : <CoupBody coup={coup} doc={doc} run={run} busy={busy} openText={setText} isLeader={isLeader} />}
        </div>
      </div>
      {text && (
        <div className="gx-root pl-root pl-sheet-layer">
          <Sheet title={text.name} icon="📜" onClose={() => setText(null)}>
            <p className="pl-fulltext">{text.text}</p>
          </Sheet>
        </div>
      )}
      {toastNode}
    </div>,
    document.body
  );
}

// =============================================================================
// Başarılı darbe: darbecinin kararı — SADECE Polis Teşkilatı › Savaş (CoupPanel).
// Karar verilene kadar darbeci istifa edemez / atılamaz (sunucu: coupLock)
// =============================================================================
export function CoupDecideCard({ coup, run, busy }) {
  const [ask, setAsk] = useState(null);
  const now = Date.now();
  if (!coup || coup.status !== 'decision') return null;
  return (
    <div className="gx-card cp-plan r">
      <b>⚡ Darbe başarılı — kararını ver</b>
      <small className="dim">{Math.max(1, Math.ceil((coup.decideUntilMs - now) / 3_600_000))} saat içinde vermezsen erken seçim olur · karar verene kadar istifa edemezsin</small>
      <div className="cp-acts">
        <Btn kind="danger" onClick={() => setAsk('rule')}>
          🏛️ Devletin başına geç
        </Btn>
        <Btn kind="ghost" onClick={() => setAsk('election')}>
          🚓 Polislikte kal
        </Btn>
      </div>
      {ask && (
        <Confirm
          icon={ask === 'rule' ? '🏛️' : '🚓'}
          title={ask === 'rule' ? 'Devletin başına geç' : 'Polislikte kal'}
          lines={ask === 'rule' ? ['🏛️ Belediye başkanı olursun, polislikten ayrılırsın', '🛡️ İlk 7 gün darbe yapılamaz', '🔒 Geri alınamaz'] : ['🚓 Olduğun rütbede polisliğe devam edersin', "🗳️ Erken seçim: Cuma 00:00'da adaylık başvuruları başlar", '🔒 Geri alınamaz']}
          confirmLabel="Onayla"
          busy={busy === 'coupDecide'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('coupDecide', { choice: ask }, { success: 'Kararın uygulandı.' });
            if (r) setAsk(null);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Rütbeli polis oylaması (gizli)
// =============================================================================
export function CoupVoteCard({ plan, run, busy, myVote }) {
  const [ask, setAsk] = useState(null);
  if (!plan || plan.status !== 'voting') return null;
  return (
    <div className="gx-card cp-plan">
      <b>⚡ Darbe oylaması · {plan.leaderCode}</b>
      <small className="dim">Rütbelilere özel · en az 3 evet ve çoğunluk gerekir · sonuç gece 00:00</small>
      <Countdown untilMs={plan.voteEndMs} label="Oylamanın bitmesine" />
      <div className="cp-tally">
        ✅ {nf(plan.yes)} evet · ❌ {nf(plan.no)} hayır · {nf((plan.voters || []).length)} oy hakkı
      </div>
      {myVote ? (
        <div className="pl-status">{myVote === 'yes' ? '✅ Evet dedin.' : '❌ Hayır dedin.'}</div>
      ) : (
        <div className="cp-acts">
          <Btn kind="danger" disabled={Boolean(busy)} onClick={() => setAsk('yes')}>
            Evet
          </Btn>
          <Btn kind="ghost" disabled={Boolean(busy)} onClick={() => setAsk('no')}>
            Hayır
          </Btn>
        </div>
      )}
      {ask && (
        <Confirm
          icon="⚡"
          title={ask === 'yes' ? 'Darbe başlasın: EVET' : 'Darbe başlamasın: HAYIR'}
          lines={['🔒 Oyunu geri alamazsın', '🤫 Kimin ne dediği görünmez']}
          confirmLabel="Oy ver"
          busy={busy === 'coupPoliceVote'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('coupPoliceVote', { choice: ask }, { success: 'Oyun kaydedildi.' });
            if (r) setAsk(null);
          }}
        />
      )}
    </div>
  );
}

export function CoupVoteSheet({ onClose }) {
  useBackClose(true, onClose);
  const { player } = usePlayer();
  const plan = useLiveDoc('coupPlans/current');
  const [show, toastNode] = useToast();
  const { run, busy } = useRun(show);
  const myVote = plan && player?.coupPlanVote?.id === (plan.key || plan.id) ? player.coupPlanVote.choice : null;
  return createPortal(
    <div className="gx-root pl-root pl-sheet-layer" style={{ position: 'fixed', zIndex: 80 }}>
      <Sheet title="Darbe oylaması" icon="⚡" onClose={onClose}>
        {plan === undefined ? <div className="gx-loading">Yükleniyor…</div> : plan?.status === 'voting' ? <CoupVoteCard plan={plan} run={run} busy={busy} myVote={myVote} /> : <p className="pl-note">Şu an darbe oylaması yok.</p>}
      </Sheet>
      {toastNode}
    </div>,
    document.body
  );
}

// =============================================================================
// Polis Teşkilatı › Savaş: EGM paneli + rütbeli oylaması
// =============================================================================
function startBlockOf(st, now) {
  const day = polDayKey(now);
  if (![0, 1].includes(polWeekday(day))) return 'Darbe sadece Pazar ve Pazartesi başlatılabilir.';
  if (!st?.gov?.uid) return 'Şu an devletin başında kimse yok.';
  if (st.phase && st.phase !== 'idle') return 'Seçim süreci varken darbe yapılamaz.';
  if (st.coup) return null;
  if (Number(st.coupFreeFromMs || 0) > now) return `Yeni hükümetin ilk 7 günü darbe yapılamaz (${Math.ceil((st.coupFreeFromMs - now) / 3_600_000)} saat kaldı).`;
  return null;
}

export function CoupPanel({ rank, rosterId }) {
  const { player } = usePlayer();
  const { state, now } = usePoliticsState();
  const ranked = ['baskan', 'sef', 'uzman'].includes(rank);
  const plan = useLiveDoc(ranked ? 'coupPlans/current' : null);
  const [show, toastNode] = useToast();
  const { run, busy } = useRun(show);
  const [ask, setAsk] = useState(null);
  const [screen, setScreen] = useState(false);
  const coup = state?.coup || null;
  const isLeader = Boolean(coup && rosterId && coup.leaderRid === rosterId);
  const myVote = plan && player?.coupPlanVote?.id === (plan.key || plan.id) ? player.coupPlanVote.choice : null;
  const block = useMemo(() => startBlockOf(state, now), [state, now]);
  const egm = rank === 'baskan';
  const pending = plan && ['planned', 'voting'].includes(plan.status);

  let body = null;
  if (coup) {
    body = (
      <div className="gx-card cp-plan r">
        <b>⚡ Darbe {coup.status === 'active' ? 'sürüyor' : 'başarılı'} · {coup.leaderCode}</b>
        {coup.status === 'active' && <Countdown untilMs={coup.endMs} label="Bitmesine" />}
        {coup.status === 'decision' && (isLeader || player?.coupDecide?.id === coup.id) && <CoupDecideCard coup={coup} run={run} busy={busy} />}
        <Btn small kind="ghost" onClick={() => setScreen(true)}>
          📊 Darbe ekranı{isLeader ? ' · açıklama' : ''}
        </Btn>
      </div>
    );
  } else if (pending && plan.status === 'planned') {
    body = (
      <div className="gx-card cp-plan">
        <b>⚡ Darbe planı · {plan.leaderCode}</b>
        <small className="dim">00:00'da rütbeli polislere sunulacak · o ana kadar iptal edilebilir</small>
        <Countdown untilMs={plan.voteStartMs} label="Oylamaya" />
        {egm && plan.leaderRid === rosterId && (
          <Btn small kind="ghost" busy={busy === 'coupCancel'} onClick={() => run('coupCancel', {}, { success: 'Darbe planı iptal edildi.' })}>
            İptal et
          </Btn>
        )}
      </div>
    );
  } else if (pending && plan.status === 'voting') {
    body = <CoupVoteCard plan={plan} run={run} busy={busy} myVote={myVote} />;
  } else if (egm) {
    body = (
      <div className="gx-card cp-plan">
        <Btn kind="danger" block disabled={Boolean(block)} onClick={() => setAsk('plan')}>
          ⚡ Darbe başlat
        </Btn>
        {block && <small className="dim">🔒 {block}</small>}
      </div>
    );
  }
  if (!body) return null;
  return (
    <>
      {body}
      {ask === 'plan' && (
        <Confirm
          icon="⚡"
          danger
          title="Darbe başlatılsın mı?"
          lines={['🗳️ 00:00\'da rütbeli polislere sunulur — çoğunluk EVET derse darbe başlar', '✅ En az 3 rütbeli EVET demeli', '⚠️ 00:00\'da EGM değilsen oylama başlamaz · oylamada ayrılırsan darbe başlamaz', '🔒 Darbe sürerken istifa edemez, atılamazsın · rütben düşmez', '☠️ Kaybedersen görevden atılırsın', '🏛️ Kazanırsan devletin başına geçebilir ya da polislikte kalabilirsin']}
          confirmLabel="Başlat"
          busy={busy === 'coupPlan'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('coupPlan', {}, { success: 'Darbe planı hazır. 00:00\'da rütbelilere sunulacak.' });
            if (r) setAsk(null);
          }}
        />
      )}
      {screen && <CoupScreen onClose={() => setScreen(false)} isLeader={isLeader} />}
      {toastNode}
    </>
  );
}
