/* eslint-disable react-refresh/only-export-components */
// SAVAŞ PANELİ — savaş kartları alt alta (sağda KATIL); karta dokununca detay.
//  - Pazar ticaret yolu savaşı: "#3 · 1.000.000 güç"
//  - 1v1 (bahis): halat çubuğu — biz mavi, rakip kırmızı
//  - Tırlarımıza saldırılar (12:00'de duyurulur): en güçlü saldırgan; dokununca
//    tüm saldırganlar (ad, güç, haraç/rüşvet) + öde
//  - Saldırdığımız tırlar: saldırı gücü, savunma gücü, haraç
//  - İttifak çetenin tırı: müttefik savunmasına katıl
//  - Gelen bahis/ittifak teklifleri (Baba/Sağ Kol karar, Kıdemli/Tetikçi öneri)
//  - Oylamalar, ardından dağıtım "Al" butonları
import { useCallback, useMemo, useState } from 'react';
import { limit, orderBy } from 'firebase/firestore';
import { fmtClock, fmtCountdown, istDateKey, istHour, istMidnight, nextWindowStart, useDocData, useGang, useGangAction, useNow, slotIdOf, useQueryData } from '../GangContext';
import { AmountInput, Bar, BetPair, Btn, Card, Confirm, Deadline, Empty, Logo, Sheet, fmtTimer } from '../ui';
import DiceRoller from '../DiceRoller';
import { IntelDecisionPanel, VoteCard } from '../shared';
import { GANG_RULES, INTEL_LEADERS, INTEL_LOGO, LEADERS, fmt, productOf } from '../gangConstants';

const GANG_RULES_HARAC_HOUR = 21; // v38: son dilim (21:00) başlayana kadar
// v37: bahis tutarını sadece rütbeliler (Baba · Sağ Kol · Kıdemli) görür —
// tutar ayrı belgede, Firestore kuralı Çömez/Tetikçi'ye okutmaz.
const BET_RANKED = ['baba', 'sagkol', 'kidemli'];
export function useBetStake(war, canSee) {
  const { path } = useGang();
  const id = war?.id;
  const { data } = useDocData(canSee && id ? path(`wars/${id}/secret/stake`) : null);
  if (!canSee || !war) return { stake: null, pot: null };
  const stake = data?.stake ?? (war.stake != null ? Number(war.stake) : null);
  const pot = data?.pot ?? (stake != null ? stake * 2 : null);
  return { stake, pot };
}
function BetAmount({ war, canSee, pot = false, note = true }) {
  const v = useBetStake(war, canSee);
  const val = pot ? v.pot : v.stake;
  return (
    <span className="gx-betamt">
      {pot ? '🏆 Ödül' : '💰 Bahis'}:{' '}
      {canSee ? (
        <b className="gx-betamt-val">{val != null ? fmt(val) : '…'}</b>
      ) : (
        <>
          <b className="gx-betamt-val hidden">gizli</b>
          {note && <span className="gx-betamt-note">🔒 rütbeliler görür</span>}
        </>
      )}
    </span>
  );
}
// Canlı geri sayım (her saniye): başlamasına / cevap için
function LiveCountdown({ untilMs, label, doneLabel }) {
  const now = useNow(1000);
  const left = Number(untilMs || 0) - now;
  if (left <= 0) return <span className="gx-livecd done">{doneLabel}</span>;
  return (
    <span className={`gx-livecd${left < 30 * 60_000 ? ' hot' : ''}`}>
      <span className="gx-livecd-label">{label}</span>
      <b className="gx-livecd-time">{fmtTimer(left)}</b>
    </span>
  );
}
// Başlamamış bahis kartı: A ⚔️ B · tutar (rütbeliler) · canlı sayaç
function PendingBetCard({ war, us, rank, children }) {
  const pair = {
    gangIds: [us, war.gangIds.find((g) => g !== us)],
    names: Object.fromEntries(war.gangIds.map((g) => [g, war.sides?.[g]?.name])),
    logos: Object.fromEntries(war.gangIds.map((g) => [g, war.sides?.[g]?.logo])),
  };
  const offered = war.status === 'offered';
  const answerUntil = istMidnight(war.offeredDateKey) + 24 * 3600_000;
  return (
    <Card className={`gx-betcard${offered ? ' waiting' : ' accepted'}`}>
      <div className="gx-betcard-tag">{offered ? '🎲 Bahis teklifi' : '🎲 Bahisli savaş'}</div>
      <BetPair {...pair} />
      <div className="gx-betcard-row">
        <BetAmount war={war} canSee={BET_RANKED.includes(rank)} />
      </div>
      <div className="gx-betcard-foot">
        {offered ? (
          <LiveCountdown untilMs={answerUntil} label="⏳ Cevap için" doneLabel="⌛ Süre doldu" />
        ) : (
          <LiveCountdown untilMs={war.startsAtMs} label="⚔️ Başlamasına" doneLabel="⚔️ Başladı!" />
        )}
        {children}
      </div>
    </Card>
  );
}
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + Number(b || 0), 0);

function sidesRanked(war) {
  const disp = war.display || {};
  return Object.entries(war.sides || {})
    .map(([k, s]) => ({ key: k, ...s, power: disp[k] || 0 }))
    .sort((a, b) => b.power - a.power);
}

function useMySlot() {
  const { path, actorId } = useGang();
  const now = useNow();
  const slotId = slotIdOf(actorId, now);
  const { data } = useDocData(path(`slots/${slotId}`));
  return { used: Boolean(data), next: nextWindowStart(now), now };
}

export function warIcon(w) {
  return { trade: '⚔️', bet: '🎲', sabotage: '💣', defense: '🛡️', intelop: '🎯' }[w.type] || '⚔️';
}
export function warTitle(w) {
  const p = productOf(w.product);
  if (w.type === 'trade') return `Ticaret Yolu · ${p.emoji} ${p.label}`;
  if (w.type === 'bet') return 'Bahisli Savaş';
  if (w.type === 'sabotage') return `Sabotaj · TIR #${w.truckCode}`;
  if (w.type === 'intelop') return `Operasyon · TIR #${w.truckCode}`;
  if (w.type === 'defense') return `Savunma · TIR #${w.truckCode}`;
  return 'Savaş';
}
function warPurpose(w) {
  const p = productOf(w.product);
  if (w.type === 'trade')
    return `🎯 Kazanan ${p.emoji} ${p.label} ticaret yolunu ${GANG_RULES.ROUTE_DAYS} gün alır; günlük sipariş limiti = kullandığı gücün %1'i. İstihbarat kazanırsa yol kimseye verilmez, kasasına gücün 1/10'u girer. Herkes saldırı gücünün yarısı kadar prestij kazanır.`;
  if (w.type === 'bet') return '🎯 Kazanan tüm bahsi alır (iki çetenin bahsi toplamı).';
  if (w.type === 'sabotage') return '🎯 En güçlü saldırı savunmayı geçerse tırın yükü saldıranın deposuna gider. Tır her durumda sahibine döner.';
  if (w.type === 'intelop') return '🎯 Başarılı operasyonda yük imha edilir, İstihbarat anlık satış değerini ödül alır.';
  if (w.type === 'defense') return '🎯 Savunma gücü en güçlü saldırıdan düşük kalırsa yük kaybedilir. Müttefikler savunmaya güç ekler (saldırıda eklenmez).';
  return '';
}

function WarDetail({ war, onClose, mySideKey }) {
  const { path } = useGang();
  const { docs: rolls } = useQueryData(path(`wars/${war.id}/rolls`), () => [orderBy('contribution', 'desc'), limit(10)], war.id);
  const sides = sidesRanked(war);
  const max = sides[0]?.power || 1;
  return (
    <Sheet title={warTitle(war)} icon={warIcon(war)} onClose={onClose}>
      <div className="gx-purpose">{warPurpose(war)}</div>
      <div className="gx-section-head">
        <span>🏆 Sıralama</span>
      </div>
      {sides.length === 0 && <p className="dim">Henüz kimse katılmadı.</p>}
      {sides.map((s, i) => (
        <div key={s.key} className={`gx-rank-row${s.key === mySideKey ? ' mine' : ''}`}>
          <span className="gx-rank-pos">#{i + 1}</span>
          <Logo logo={s.orgType === 'intel' ? INTEL_LOGO : s.logo} size={26} />
          <div className="gx-rank-main">
            <div className="gx-rank-name">
              {s.name}
              {s.role === 'defender' ? ' 🛡️' : ''}
            </div>
            <Bar value={s.power} max={max} color={s.key === mySideKey ? 'var(--neon-yellow)' : 'var(--neon-cyan)'} height={6} />
          </div>
          <span className="gx-rank-power">{fmt(s.power)}</span>
        </div>
      ))}
      {rolls.length > 0 && (
        <>
          <div className="gx-section-head">
            <span>🔥 En çok katkı</span>
          </div>
          {rolls.map((r) => (
            <div key={r.id} className="gx-roll-row">
              <span>{r.name}</span>
              <span className="dim">
                🎲{r.dice?.[0]}+{r.dice?.[1]} × {fmt(r.power)}
              </span>
              <b>{fmt(r.contribution)}</b>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// Kart: solda bilgi, sağda KATIL
// "Katıldın" butonunda saniye saniye akan sayaç: bir sonraki dilimde yeni hak
function JoinedTimer({ until }) {
  const now = useNow(1000);
  return <b className="gx-join-timer">{fmtTimer(Math.max(0, until - now))}</b>;
}

function WarRow({ war, slotUsed, onJoin, onOpen, joinLabel = 'KATIL', children, disabledReason, tone }) {
  const now = useNow();
  const notStarted = now < war.startsAtMs;
  const left = (notStarted ? war.startsAtMs : war.endsAtMs) - now;
  const reason = disabledReason || (notStarted ? `${fmtClock(war.startsAtMs)}` : slotUsed ? 'Katıldın' : null);
  // v38: katıldıysan bir sonraki dilime (yeni saldırı hakkına) canlı geri sayım
  const joined = !disabledReason && !notStarted && slotUsed;
  const nextWin = nextWindowStart(now);
  const joinedUntil = nextWin < war.endsAtMs ? nextWin : null;
  return (
    <Card className={`gx-warrow gx-war-${war.type}${tone ? ` ${tone}` : ''}`} onClick={onOpen}>
      <div className="gx-warrow-main">
        <div className="gx-war-top">
          <span className="gx-war-type">
            {warIcon(war)} {warTitle(war).toLocaleUpperCase('tr-TR')}
          </span>
          <span className={`gx-timer${notStarted ? ' wait' : ''}`}>⏱ {fmtCountdown(left)}</span>
        </div>
        {children}
      </div>
      {onJoin && (
        <div className="gx-warrow-join" onClick={(e) => e.stopPropagation()}>
          <button className="gx-join-btn" onClick={onJoin} disabled={Boolean(reason)} title={reason || joinLabel}>
            {joined ? (
              <>
                <span>✅</span>
                <small>Katıldın</small>
                {joinedUntil && <JoinedTimer until={joinedUntil} />}
              </>
            ) : reason ? (
              <>
                <span>🔒</span>
                <small>{reason}</small>
              </>
            ) : (
              <>
                <span>⚔️</span>
                <small>{joinLabel}</small>
              </>
            )}
          </button>
        </div>
      )}
    </Card>
  );
}

// 1v1 halat çubuğu: biz mavi, rakip kırmızı (güç oranında)
function Tug({ us, them, usLabel, themLabel }) {
  const total = us + them;
  const pct = total > 0 ? (us / total) * 100 : 50;
  return (
    <div className="gx-tug">
      <div className="gx-tug-labels">
        <span className="us">
          {usLabel} · {fmt(us)}
        </span>
        <span className="them">
          {fmt(them)} · {themLabel}
        </span>
      </div>
      <div className="gx-tug-bar">
        <div className="gx-tug-us" style={{ width: `${pct}%` }} />
        <div className="gx-tug-them" style={{ width: `${100 - pct}%` }} />
        <span className="gx-tug-knot" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function WindowBanner({ slot }) {
  const { used, next, now } = slot;
  return (
    <div className={`gx-window${used ? ' used' : ''}`}>
      <span>{used ? '✓ Savaştın' : '⚔️ 1 savaş hakkın var'}</span>
      <span className="dim">⏱ {fmtCountdown(next - now)}</span>
    </div>
  );
}

// Bahis savaşına İstihbarat girdiyse: 3 taraf, en güçlü alır
function ThreeWay({ war, mine }) {
  const sides = sidesRanked(war);
  const max = Math.max(1, ...sides.map((s) => s.power));
  return (
    <div className="gx-three">
      {sides.map((s) => (
        <div key={s.key} className={`gx-three-row${s.key === mine ? ' mine' : ''}`}>
          <Logo logo={s.orgType === 'intel' ? INTEL_LOGO : s.logo} size={18} />
          <span className="gx-three-name">{s.name}</span>
          <div className="gx-three-bar">
            <div style={{ width: `${(s.power / max) * 100}%` }} />
          </div>
          <b>{fmt(s.power)}</b>
        </div>
      ))}
    </div>
  );
}

// Şu an katılınabilecek (başlamış, bitmemiş) savaşlar — "savaş hakkın var" yazısı ve bildirim işareti için
export function joinableWars(L, now) {
  const all = [...(L.trade || []), ...(L.bets || []), ...(L.myAttacks || []), ...(L.myDefs || []), ...(L.allyDefs || []), ...(L.ops || [])];
  return all.filter((w) => now >= (w.startsAtMs || 0) && now < (w.endsAtMs || 0));
}

// Tırımıza saldıranların listesi (dokununca açılır)
function AttackersSheet({ def, attackers, lead, onClose }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const [ask, setAsk] = useState(null);
  const open = istHour(now) < GANG_RULES_HARAC_HOUR;
  const defTotal = sum(def.display);
  const payUntil = istMidnight(istDateKey(now)) + GANG_RULES_HARAC_HOUR * 3600_000;
  return (
    <Sheet title={`TIR #${def.truckCode} saldırganları`} icon="⚠️" onClose={onClose}>
      <div className="gx-vs gx-vs-deadline">
        <span>🛡️ Savunma {fmt(defTotal)}</span>
        <span className="gx-pay-deadline">
          🤑💼 <Deadline untilMs={payUntil} />
        </span>
      </div>
      {attackers.map((a, i) => {
        const p = a.display?.attacker || 0;
        const isOp = a.type === 'intelop';
        const price = isOp ? a.bribe : a.harac;
        return (
          <div key={a.id} className={`gx-attacker-row${i === 0 ? ' top' : ''}`}>
            <span className="gx-attacker-name">
              {i === 0 ? '👑 ' : ''}
              {isOp ? '🕵️ İstihbarat' : `🏴 ${a.sides?.attacker?.name}`}
            </span>
            <span className={p > defTotal ? 'bad' : 'good'}>⚔️ {fmt(p)}</span>
            <span className="dim">{price > 0 ? `${isOp ? '💼' : '🤑'} ${fmt(price)}` : '—'}</span>
            {lead && price > 0 && open && (
              <Btn small kind="ghost" onClick={() => setAsk(a)}>
                Öde
              </Btn>
            )}
          </div>
        );
      })}
      {ask && (
        <Confirm
          icon={ask.type === 'intelop' ? '💼' : '🤑'}
          title={ask.type === 'intelop' ? `İstihbarata ${fmt(ask.bribe)} rüşvet ödensin mi?` : `${ask.sides?.attacker?.name} çetesine ${fmt(ask.harac)} haraç ödensin mi?`}
          lines={[
            `💸 ${fmt(ask.type === 'intelop' ? ask.bribe : ask.harac)} çete kasasından`,
            ask.type === 'intelop' ? '🕵️ Para İstihbarat kasasına gider' : `🏴 Para ${ask.sides?.attacker?.name || 'saldıran'} kasasına gider`,
            ask.type === 'intelop' ? '⚔️ Operasyon durur, tır güvende' : '⚔️ Bu saldırı durur, diğerleri sürer',
          ]}
          confirmLabel="Öde"
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(
              ask.type === 'intelop' ? 'payBribe' : 'payHarac',
              { warId: ask.id },
              {
                success: ask.type === 'intelop' ? '💼 Rüşvet ödendi, operasyon durdu' : '🤑 Haraç ödendi, saldırı durdu',
              },
            );
            setAsk(null);
          }}
        >
          <div className="gx-confirm-deadline">
            <Deadline untilMs={payUntil} label="içinde öde" />
          </div>
        </Confirm>
      )}
    </Sheet>
  );
}

// v41: Mafya Babasının başkanlığı devretme teklifi (Sağ Kol görür)
function HandoverOffer({ h }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  return (
    <Card className="gx-betcard waiting gx-handover-offer">
      <div className="gx-betcard-tag">👑 Başkanlık devri</div>
      <div className="gx-handover-text">
        <b>{h.fromName}</b> başkanlığı sana devretmek istiyor.
      </div>
      <div className="gx-betcard-row">
        <LiveCountdown untilMs={h.expiresAtMs} label="⏳ Cevap için" doneLabel="⌛ Süre doldu" />
      </div>
      <div className="gx-row-2">
        <Btn kind="ghost" onClick={() => setAsk('reject')}>
          ❌ Reddet
        </Btn>
        <Btn onClick={() => setAsk('accept')}>✅ Kabul</Btn>
      </div>
      {ask && (
        <Confirm
          icon={ask === 'accept' ? '👑' : '❌'}
          title={ask === 'accept' ? 'Başkanlığı kabul et?' : 'Devri reddet?'}
          lines={ask === 'accept' ? ["👑 00:00'da yeni Mafya Babası sen olursun", `🎖️ ${h.fromName} çetede kalır`] : [`👑 ${h.fromName} Mafya Babası olarak devam eder`]}
          confirmLabel={ask === 'accept' ? 'Kabul' : 'Reddet'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('respondHandover', { accept: ask === 'accept' }, { success: ask === 'accept' ? "👑 Kabul edildi — 00:00'da Mafya Babasısın" : 'Devir reddedildi' });
            setAsk(null);
          }}
        />
      )}
    </Card>
  );
}

// Gelen bahis / ittifak teklifi
function OfferCard({ kind, item, rank }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const lead = LEADERS.includes(rank);
  const canSuggest = rank === 'kidemli' || rank === 'tetikci';
  const other =
    kind === 'bet'
      ? item.sides?.[item.proposerGangId]
      : {
          name: item.names?.[item.requestedBy],
          logo: item.logos?.[item.requestedBy],
        };
  const refId = item.id;
  const canSee = kind === 'bet' && BET_RANKED.includes(rank);
  const { stake } = useBetStake(kind === 'bet' ? item : null, canSee);
  return (
    <Card className={kind === 'bet' ? 'gx-offer gx-betcard waiting' : 'gx-offer'}>
      {kind === 'bet' ? (
        <>
          <div className="gx-betcard-tag">🎲 Bahis teklifi</div>
          <BetPair
            gangIds={item.gangIds}
            names={Object.fromEntries(item.gangIds.map((g) => [g, item.sides?.[g]?.name]))}
            logos={Object.fromEntries(item.gangIds.map((g) => [g, item.sides?.[g]?.logo]))}
          />
        </>
      ) : (
        <div className="gx-offer-head">
          <Logo logo={other?.logo} size={32} />
          <div>
            <b>{other?.name}</b>
            <div className="dim gx-mini">🤝 İttifak</div>
          </div>
        </div>
      )}
      {kind === 'bet' && (
        <div className="gx-betcard-row">
          <BetAmount war={item} canSee={canSee} />
          <LiveCountdown untilMs={istMidnight(item.offeredDateKey) + 24 * 3600_000} label="⏳ Cevap için" doneLabel="⌛ Süre doldu" />
        </div>
      )}
      {lead ? (
        <div className="gx-row-2">
          <Btn kind="ghost" onClick={() => setAsk('reject')}>
            ❌ Reddet
          </Btn>
          <Btn onClick={() => setAsk('accept')}>✅ Kabul</Btn>
        </div>
      ) : canSuggest ? (
        <div className="gx-row-2">
          <Btn
            small
            kind="ghost"
            busy={busy === `sr_${refId}`}
            onClick={() => run('suggest', { kind, refId, choice: 'reject' }, { key: `sr_${refId}`, success: '💬 Önerin sohbete gönderildi' })}
          >
            💬 Reddedelim
          </Btn>
          <Btn
            small
            kind="ghost"
            busy={busy === `sa_${refId}`}
            onClick={() => run('suggest', { kind, refId, choice: 'accept' }, { key: `sa_${refId}`, success: '💬 Önerin sohbete gönderildi' })}
          >
            💬 Kabul edelim
          </Btn>
        </div>
      ) : null}
      {ask && (
        <Confirm
          icon={ask === 'accept' ? '✅' : '❌'}
          title={
            kind === 'bet'
              ? ask === 'accept'
                ? `${stake != null ? fmt(stake) : '…'} altınlık bahis kabul edilsin mi?`
                : 'Bahis reddedilsin mi?'
              : ask === 'accept'
                ? 'İttifak kabul edilsin mi?'
                : 'İttifak reddedilsin mi?'
          }
          confirmLabel={ask === 'accept' ? 'Kabul' : 'Reddet'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            if (kind === 'bet')
              await run(
                'respondBet',
                { warId: item.id, accept: ask === 'accept' },
                {
                  success: ask === 'accept' ? '⚔️ Bahis kabul edildi' : 'Reddedildi',
                },
              );
            else
              await run(
                'respondAlliance',
                { allianceId: item.id, accept: ask === 'accept' },
                {
                  success: ask === 'accept' ? '🤝 İttifak kabul edildi' : 'Reddedildi',
                },
              );
            setAsk(null);
          }}
        />
      )}
    </Card>
  );
}

// Bahis / ittifak teklif et (Baba / Sağ Kol). Bahiste: teklif gönderilince
// liste kapanır, sadece hedef çete "cevap bekleniyor" olarak görünür; geri
// çekilir ya da reddedilirse liste yeniden açılır. Hafta sonu kapalı.
function ProposeSheet({ kind, gangId, out = [], blockedIds = [], onClose }) {
  const { path, call } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow(30_000);
  const { docs: gangs } = useQueryData(path('gangs'), () => [limit(100)], 'all_gangs');
  const [target, setTarget] = useState(null);
  const [quote, setQuote] = useState(null);
  const [stake, setStake] = useState(0);
  const today = istDateKey(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const others = gangs.filter((g) => g.id !== gangId && g.status === 'active' && !blockedIds.includes(g.id));
  const pending = out.find((w) => w.status === 'offered');
  const acceptedToday = out.find((w) => w.status === 'accepted' && w.offeredDateKey === today);
  const { stake: shownStake } = useBetStake(kind === 'bet' ? pending || acceptedToday : null, true);
  const pick = async (g) => {
    if (target?.id === g.id) return setTarget(null);
    setTarget(g);
    setStake(0);
    setQuote(null);
    if (kind === 'bet')
      setQuote(
        await call('quoteBet', { targetGangId: g.id }).catch(() => ({
          maxBet: 0,
        })),
      );
  };

  if (kind === 'bet') {
    const shown = pending || acceptedToday;
    return (
      <Sheet title="Bahisli savaş" icon="🎲" onClose={onClose}>
        {!GANG_RULES.BET_OFFER_WEEKDAYS.includes(weekday) && !shown ? (
          <div className="gx-bet-closed">
            <span className="big">🚫</span>
            <b>Bugün bahis yapamazsın</b>
          </div>
        ) : shown ? (
          <div className={`gx-bet-target${pending ? ' waiting' : ' accepted'}`}>
            <Logo logo={shown.sides?.[shown.targetGangId]?.logo} size={44} />
            <div className="gx-bet-target-main">
              <b>{shown.sides?.[shown.targetGangId]?.name}</b>
              <span className="gx-bet-stake">🎲 {shownStake != null ? fmt(shownStake) : '…'}</span>
              <span className="gx-bet-status">
                {pending ? (
                  <LiveCountdown untilMs={istMidnight(pending.offeredDateKey) + 24 * 3600_000} label="⏳ Cevap için" doneLabel="⌛ Süre doldu" />
                ) : (
                  <LiveCountdown untilMs={shown.startsAtMs} label="⚔️ Başlamasına" doneLabel="⚔️ Başladı!" />
                )}
              </span>
            </div>
            {pending && (
              <Btn
                small
                kind="danger"
                busy={busy === `wd_${pending.id}`}
                onClick={() =>
                  run(
                    'withdrawBet',
                    { warId: pending.id },
                    {
                      key: `wd_${pending.id}`,
                      success: '↩️ Teklif geri çekildi',
                    },
                  )
                }
              >
                İptal
              </Btn>
            )}
          </div>
        ) : (
          <div className="gx-bet-list">
            {others.length === 0 && <Empty icon="🏴" text="Teklif edilebilecek çete yok." />}
            {others.map((g) => {
              const open = target?.id === g.id;
              const max = quote?.maxBet ?? null;
              const tooLow = open && max != null && max < GANG_RULES.BET_MIN;
              return (
                <div key={g.id} className={`gx-bet-row${open ? ' open' : ''}`}>
                  <button className="gx-bet-row-head" onClick={() => pick(g)}>
                    <Logo logo={g.logo} size={30} />
                    <span className="gx-bet-row-name">{g.name}</span>
                    <span className="gx-bet-row-go">{open ? '▾' : '🎲'}</span>
                  </button>
                  {open && (
                    <div className="gx-bet-row-body">
                      <div className="gx-bet-max">
                        MAX <b>{max == null ? '…' : fmt(max)}</b>
                      </div>
                      {tooLow ? (
                        <div className="gx-bet-max bad">🔒</div>
                      ) : (
                        <>
                          <AmountInput value={stake} onChange={setStake} max={max ?? 0} />
                          <Btn
                            block
                            busy={busy === 'offerBet'}
                            disabled={!(stake >= GANG_RULES.BET_MIN)}
                            onClick={async () => {
                              const r = await run(
                                'offerBet',
                                { targetGangId: g.id, stake },
                                {
                                  success: '🎲 Teklif gönderildi',
                                  withRequestId: true,
                                },
                              );
                              if (r) setTarget(null);
                            }}
                          >
                            🎲 {fmt(stake)} teklif et
                          </Btn>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet title="İttifak teklif et" icon="🤝" onClose={onClose}>
      <div className="gx-pick-list">
        {others.map((g) => (
          <button key={g.id} className={`gx-pick${target?.id === g.id ? ' active' : ''}`} onClick={() => pick(g)}>
            <Logo logo={g.logo} size={24} /> {g.name}
          </button>
        ))}
      </div>
      {target && (
        <Btn
          block
          busy={Boolean(busy)}
          onClick={async () => {
            const r = await run('requestAlliance', { targetGangId: target.id }, { success: '🤝 Teklif gönderildi' });
            if (r) onClose();
          }}
        >
          🤝 {target.name}
        </Btn>
      )}
    </Sheet>
  );
}

// Dağıtımdan pay alma (dağıtımlar Savaş panelinin en altında)
function ClaimList({ dists, rank, isIntel, myKey, joinedAtMs }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const eq = (r) =>
    isIntel
      ? {
          baskan: 'baba',
          sef: 'sagkol',
          uzman: 'kidemli',
          ajan: 'tetikci',
          muhbir: 'comez',
        }[r]
      : r;
  const inGroup = (g) =>
    g === 'hepsi' ||
    (g === 'rutbeli' && ['baba', 'sagkol', 'kidemli'].includes(eq(rank))) ||
    (g === 'tetikci' && eq(rank) === 'tetikci') ||
    (g === 'comez' && eq(rank) === 'comez');
  const mine = dists.filter(
    (d) =>
      d.status === 'open' &&
      now < d.expiresAtMs &&
      !d.claims?.[myKey] &&
      inGroup(d.group) &&
      (d.claimedCount || 0) < d.slots &&
      Number(joinedAtMs || 0) <= d.createdAtMs &&
      !(isIntel && (rank === 'baskan' || d.creatorKey === myKey)),
  );
  if (mine.length === 0) return null;
  return (
    <>
      <div className="gx-section-head">
        <span>💰 Dağıtımlar</span>
      </div>
      {mine.map((d) => (
        <Card key={d.id} className="gx-claim">
          <div>
            <b>{fmt(d.perPerson)}</b> altın · {d.groupLabel}
            <div className="dim gx-mini">
              {d.createdByName} · {d.claimedCount || 0}/{d.slots} alındı · ⏱ {fmtCountdown(d.expiresAtMs - now)}
            </div>
          </div>
          <Btn
            busy={busy === `cl_${d.id}`}
            onClick={() =>
              run(
                'claimDistribution',
                { distributionId: d.id },
                {
                  key: `cl_${d.id}`,
                  success: `💵 +${fmt(d.perPerson)} altın hesabına geçti`,
                },
              )
            }
          >
            Al
          </Btn>
        </Card>
      ))}
    </>
  );
}

// ----------------------------------------------------------------------------
export default function WarsTab({ org, d }) {
  const { call, path, actorId } = useGang();
  const { run, busy } = useGangAction();
  const slot = useMySlot();
  const [detail, setDetail] = useState(null);
  const [rolling, setRolling] = useState(null);
  const [attackersOf, setAttackersOf] = useState(null);
  const [propose, setPropose] = useState(null);
  const isIntel = org === 'intel';
  const gangId = d.gangId;
  const lead = isIntel ? INTEL_LEADERS.includes(d.rank) : LEADERS.includes(d.rank);
  const wars = d.wars;

  const doRoll = useCallback(() => call('rollDice', rolling.payload), [call, rolling]);
  const join = (war, payload, side) => setRolling({ war, payload: { warId: war.id, ...payload }, side });

  const nowMin = useNow(30_000);
  const L = useMemo(() => {
    const active = wars.active;
    // v35: kabul edilmiş bahis başlama dilimi gelince hemen oynanır (saat turunu beklemez)
    const liveBets = wars.all.filter((w) => w.type === 'bet' && (w.status === 'active' || (w.status === 'accepted' && nowMin >= w.startsAtMs)) && nowMin < w.endsAtMs);
    const trade = active.filter((w) => w.type === 'trade');
    const attacksOnDef = (def) =>
      wars.all
        .filter((w) => (w.type === 'sabotage' || w.type === 'intelop') && w.defenseWarId === def.id && w.status === 'active')
        .sort((a, b) => (b.display?.attacker || 0) - (a.display?.attacker || 0));
    if (isIntel)
      return {
        trade,
        ops: active.filter((w) => w.type === 'intelop'),
        bets: liveBets.filter((w) => w.sides?.intel),
        attacksOnDef,
      };
    const allyIds = new Set(
      d.alliances
        .filter((a) => ['active', 'ending'].includes(a.status))
        .flatMap((a) => a.gangIds)
        .filter((g) => g !== gangId),
    );
    return {
      trade,
      attacksOnDef,
      bets: liveBets.filter((w) => w.gangIds?.includes(gangId)),
      myAttacks: active.filter((w) => w.type === 'sabotage' && w.attackerGangId === gangId),
      myDefs: active.filter((w) => w.type === 'defense' && w.defenderGangId === gangId && w.announced),
      allyDefs: active.filter((w) => w.type === 'defense' && allyIds.has(w.defenderGangId) && w.announced),
      betOffersIn: wars.all.filter((w) => w.type === 'bet' && w.status === 'offered' && w.targetGangId === gangId),
      betOffersOut: wars.all.filter((w) => w.type === 'bet' && (w.status === 'offered' || (w.status === 'accepted' && nowMin < w.startsAtMs)) && w.proposerGangId === gangId),
      betsAccepted: wars.all.filter((w) => w.type === 'bet' && w.status === 'accepted' && nowMin < w.startsAtMs && w.targetGangId === gangId),
      allianceIn: d.alliances.filter((a) => a.status === 'requested' && a.requestedBy !== gangId),
    };
  }, [wars, isIntel, d.alliances, gangId, nowMin]);

  const sideKey = isIntel ? 'intel' : gangId;
  const tradePos = (w) => {
    const s = sidesRanked(w);
    const i = s.findIndex((x) => x.key === sideKey);
    return {
      pos: i >= 0 ? i + 1 : null,
      power: i >= 0 ? s[i].power : 0,
      n: s.length,
    };
  };

  // Teklif listesinde görünmeyecek çeteler: müttefikler ve zaten bahis olanlar
  const allyBlocked = isIntel ? [] : d.alliances.filter((a) => ['requested', 'accepted', 'active', 'ending'].includes(a.status)).flatMap((a) => a.gangIds);
  const betBlocked = isIntel
    ? []
    : [
        ...d.alliances.filter((a) => ['accepted', 'active', 'ending'].includes(a.status)).flatMap((a) => a.gangIds),
        ...wars.all.filter((w) => w.type === 'bet' && ['offered', 'accepted', 'active'].includes(w.status)).flatMap((w) => w.gangIds || []),
      ];
  const pendingOut = (L.betOffersOut || []).find((w) => w.status === 'offered');

  const hasWar = L.trade.length + (L.bets?.length || 0) + (L.myAttacks?.length || 0) + (L.myDefs?.length || 0) + (L.allyDefs?.length || 0) + (L.ops?.length || 0) > 0;

  return (
    <div className="gx-stack">
      {!isIntel && d.membership.intelDecisionGangId === gangId && d.membership.intelRosterId && d.rank === 'baba' && <IntelDecisionPanel />}
      {joinableWars(L, slot.now).length > 0 && <WindowBanner slot={slot} />}
      {!isIntel && lead && (
        <div className="gx-row-2">
          <Btn small kind="ghost" onClick={() => setPropose('bet')}>
            🎲 {pendingOut ? `⏳ ${pendingOut.sides?.[pendingOut.targetGangId]?.name || ''}` : 'Bahis teklif et'}
          </Btn>
          <Btn small kind="ghost" onClick={() => setPropose('alliance')}>
            🤝 İttifak teklif et
          </Btn>
        </div>
      )}

      {!hasWar && <Empty icon="🕊️" text="Şu an savaş yok." />}

      {L.trade.map((w) => {
        const t = tradePos(w);
        const p = productOf(w.product);
        return (
          <WarRow
            key={w.id}
            war={w}
            slotUsed={slot.used}
            onOpen={() => setDetail({ war: w, side: sideKey })}
            onJoin={() => join(w, isIntel ? { side: 'intel' } : {}, isIntel ? 'İstihbarat' : d.gang?.name)}
          >
            <div className="gx-trade-box">
              <span className="gx-trade-pos">{t.pos ? `#${t.pos}` : '#—'}</span>
              <span className="gx-trade-power">{fmt(t.power)} güç</span>
              <span className="dim">
                {p.emoji} {p.label} · {t.n} taraf
              </span>
            </div>
          </WarRow>
        );
      })}

      {(L.bets || []).map((w) => {
        const other = Object.keys(w.sides || {}).find((k) => k !== gangId && k !== 'intel');
        const mine = isIntel ? 'intel' : gangId;
        return (
          <WarRow
            key={w.id}
            war={w}
            slotUsed={slot.used}
            onOpen={() => setDetail({ war: w, side: mine })}
            onJoin={() => join(w, isIntel ? { side: 'intel' } : {}, isIntel ? 'İstihbarat' : d.gang?.name)}
          >
            {w.sides?.intel ? (
              <ThreeWay war={w} mine={mine} />
            ) : (
              <Tug us={w.display?.[gangId] || 0} them={w.display?.[other] || 0} usLabel={d.gang?.name} themLabel={w.sides?.[other]?.name} />
            )}
            <div className="gx-mini">
              <BetAmount war={w} canSee={!isIntel && BET_RANKED.includes(d.rank)} pot note={!isIntel} />
            </div>
          </WarRow>
        );
      })}

      {(L.myDefs || []).length > 0 && (
        <div className="gx-section-head">
          <span>⚠️ Tırlarımıza saldırı</span>
        </div>
      )}
      {(L.myDefs || []).map((w) => {
        const atk = L.attacksOnDef(w);
        const top = atk[0];
        const defTotal = sum(w.display);
        const topPower = top?.display?.attacker || 0;
        return (
          <WarRow key={w.id} war={w} tone="alert" slotUsed={slot.used} onOpen={() => setAttackersOf(w)} onJoin={() => join(w, { side: 'defense' }, d.gang?.name)} joinLabel="SAVUN">
            {top ? (
              <div className="gx-top-attacker">
                En güçlü: <b>{top.type === 'intelop' ? '🕵️ İstihbarat' : top.sides?.attacker?.name}</b> ⚔️ {fmt(topPower)}
                {atk.length > 1 && <span className="dim"> · +{atk.length - 1} saldırgan</span>}
              </div>
            ) : (
              <div className="gx-top-attacker good">Tüm saldırılar durdu ✓</div>
            )}
            <div className="gx-vs">
              <span>🛡️ {fmt(defTotal)}</span>
              <span className="dim">vs</span>
              <span className={defTotal < topPower ? 'bad' : 'good'}>⚔️ {fmt(topPower)}</span>
            </div>
            <div className="dim gx-mini">👆 Saldırganlar</div>
          </WarRow>
        );
      })}

      {(L.myAttacks || []).length > 0 && (
        <div className="gx-section-head">
          <span>💣 Saldırdığımız tırlar</span>
        </div>
      )}
      {(L.myAttacks || []).map((w) => {
        const def = wars.all.find((x) => x.id === w.defenseWarId);
        return (
          <WarRow key={w.id} war={w} slotUsed={slot.used} onOpen={() => setDetail({ war: w, side: 'attacker' })} onJoin={() => join(w, {}, d.gang?.name)} joinLabel="SALDIR">
            <div className="dim gx-mini">🏴 {w.sides?.defender?.name}</div>
            <div className="gx-vs">
              <span>⚔️ {fmt(w.display?.attacker)}</span>
              <span className="dim">vs</span>
              <span>🛡️ {fmt(sum(def?.display))}</span>
            </div>
            {w.harac > 0 && <div className="gx-war-purpose">🤑 {fmt(w.harac)}</div>}
          </WarRow>
        );
      })}

      {(L.allyDefs || []).length > 0 && (
        <div className="gx-section-head">
          <span>🤝 İttifak çetenin tırı</span>
        </div>
      )}
      {(L.allyDefs || []).map((w) => {
        const top = L.attacksOnDef(w)[0];
        return (
          <WarRow
            key={w.id}
            war={w}
            slotUsed={slot.used}
            onOpen={() => setDetail({ war: w, side: gangId })}
            onJoin={() => join(w, { side: 'defense' }, d.gang?.name)}
            joinLabel="SAVUN"
          >
            <div className="dim gx-mini">🏴 {w.sides?.[w.defenderGangId]?.name}</div>
            <div className="gx-vs">
              <span>🛡️ {fmt(sum(w.display))}</span>
              <span className="dim">vs</span>
              <span>⚔️ {fmt(top?.display?.attacker)}</span>
            </div>
          </WarRow>
        );
      })}

      {(L.ops || []).map((w) => {
        const def = wars.all.find((x) => x.id === w.defenseWarId);
        return (
          <WarRow key={w.id} war={w} slotUsed={slot.used} onOpen={() => setDetail({ war: w, side: 'attacker' })} onJoin={() => join(w, {}, 'İstihbarat')} joinLabel="SALDIR">
            <div className="dim gx-mini">🏴 {w.sides?.defender?.name}</div>
            <div className="gx-vs">
              <span>⚔️ {fmt(w.display?.attacker)}</span>
              <span className="dim">vs</span>
              <span>🛡️ {fmt(sum(def?.display))}</span>
            </div>
            <div className="dim gx-mini">
              💰 {w.estReward != null ? fmt(w.estReward) : '?'}
              {w.bribe > 0 ? ` · 💼 ${fmt(w.bribe)}` : ''}
            </div>
          </WarRow>
        );
      })}

      {/* v41: başkanlık devri talebi (Sağ Kola) */}
      {!isIntel && d.handover && d.handover.toId === actorId && d.handover.status === 'pending' && <HandoverOffer h={d.handover} />}
      {!isIntel && d.handover && d.handover.toId === actorId && d.handover.status === 'accepted' && (
        <Card className="gx-handover accepted">👑 Kabul ettin — 00:00'da yeni Mafya Babası sensin.</Card>
      )}

      {/* Teklifler */}
      {!isIntel && (L.betOffersIn.length > 0 || L.allianceIn.length > 0) && (
        <div className="gx-section-head">
          <span>📨 Gelen teklifler</span>
        </div>
      )}
      {!isIntel && L.betOffersIn.map((w) => <OfferCard key={w.id} kind="bet" item={w} rank={d.rank} />)}
      {!isIntel && L.allianceIn.map((a) => <OfferCard key={a.id} kind="alliance" item={a} rank={d.rank} />)}
      {!isIntel &&
        L.betOffersOut.map((w) => (
          <PendingBetCard key={w.id} war={w} us={gangId} rank={d.rank}>
            {lead && w.status === 'offered' && (
              <Btn small kind="ghost" busy={busy === `wd_${w.id}`} onClick={() => run('withdrawBet', { warId: w.id }, { key: `wd_${w.id}`, success: 'Teklif geri çekildi' })}>
                Geri çek
              </Btn>
            )}
          </PendingBetCard>
        ))}
      {!isIntel && L.betsAccepted.map((w) => <PendingBetCard key={w.id} war={w} us={gangId} rank={d.rank} />)}

      {/* Oylamalar */}
      {(d.votes.length > 0 || d.pending.length > 0) && (
        <div className="gx-section-head">
          <span>🗳️ Oylamalar</span>
        </div>
      )}
      {d.pending.map((p) => (
        <Card key={p.id} className="gx-pending">
          <span>🤫 {isIntel ? `${p.targetCode} için çıkarma` : p.type === 'kick' ? `${p.targetName} için çıkarma` : p.type === 'devirme' ? 'Devirme' : 'Ayaklanma'} · ⏱ 00:00</span>
          <Btn
            small
            kind="ghost"
            busy={busy === `c_${p.id}`}
            onClick={() => run(isIntel ? 'cancelIntelVoteRequest' : 'cancelVoteRequest', { pendingId: p.id }, { key: `c_${p.id}`, success: 'İptal edildi' })}
          >
            İptal
          </Btn>
        </Card>
      ))}
      {d.votes.map((v) =>
        isIntel ? (
          <VoteCard key={v.id} vote={v} ballotPath={path(`intel/main/votes/${v.id}/ballots/${d.rid}`)} voterKey={d.rid} action="castIntelVote" />
        ) : (
          <VoteCard key={v.id} vote={v} ballotPath={path(`gangs/${gangId}/votes/${v.id}/ballots/${actorId}`)} voterKey={actorId} action="castVote" />
        ),
      )}

      <ClaimList dists={d.dists} rank={d.rank} isIntel={isIntel} myKey={isIntel ? d.rid : actorId} joinedAtMs={isIntel ? d.me?.joinedAtMs : d.me?.joinedAtMs} />

      {detail && <WarDetail war={wars.all.find((w) => w.id === detail.war.id) || detail.war} mySideKey={detail.side} onClose={() => setDetail(null)} />}
      {attackersOf && (
        <AttackersSheet
          def={wars.all.find((w) => w.id === attackersOf.id) || attackersOf}
          attackers={L.attacksOnDef(attackersOf)}
          lead={lead}
          onClose={() => setAttackersOf(null)}
        />
      )}
      {rolling && (
        <DiceRoller title={`${warIcon(rolling.war)} ${warTitle(rolling.war)}`} subtitle={rolling.side} sideLabel={rolling.side} onRoll={doRoll} onClose={() => setRolling(null)} />
      )}
      {propose && (
        <ProposeSheet kind={propose} gangId={gangId} out={L.betOffersOut || []} blockedIds={propose === 'bet' ? betBlocked : allyBlocked} onClose={() => setPropose(null)} />
      )}
    </div>
  );
}
