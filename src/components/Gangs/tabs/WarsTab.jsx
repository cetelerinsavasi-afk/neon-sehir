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
import { fmtClock, fmtCountdown, istDateKey, istHour, nextWindowStart, useDocData, useGang, useGangAction, useNow, useQueryData, windowSlot } from '../GangContext';
import { AmountInput, Bar, Btn, Card, Confirm, Empty, Info, Logo, Sheet } from '../ui';
import DiceRoller from '../DiceRoller';
import { IntelDecisionPanel, VoteCard } from '../shared';
import { GANG_RULES, INTEL_LEADERS, INTEL_LOGO, LEADERS, fmt, productOf } from '../gangConstants';

const GANG_RULES_HARAC_HOUR = 18;
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
  const slotId = `${actorId}_${istDateKey(now)}_${windowSlot(now)}`;
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
  if (w.type === 'trade') return `🎯 Kazanan ${p.emoji} ${p.label} ticaret yolunu ${GANG_RULES.ROUTE_DAYS} gün alır; günlük sipariş limiti = kullandığı gücün %5'i. İstihbarat kazanırsa yol kimseye verilmez, kasasına gücün 1/10'u girer. Kaybedenler katkıları kadar prestij kazanır.`;
  if (w.type === 'bet') return `🎯 Ödül: ${fmt((w.stake || 0) * 2)} altın — kazanan iki bahsi de alır.`;
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
function WarRow({ war, slotUsed, onJoin, onOpen, joinLabel = 'KATIL', children, disabledReason, tone }) {
  const now = useNow();
  const notStarted = now < war.startsAtMs;
  const left = (notStarted ? war.startsAtMs : war.endsAtMs) - now;
  const reason = disabledReason || (notStarted ? `${fmtClock(war.startsAtMs)}` : slotUsed ? 'Katıldın' : null);
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
            {reason ? (
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
      <span>{used ? '✓ Bu 6 saatlik pencerede savaştın' : '⚔️ Bu pencerede 1 savaş hakkın var'}</span>
      <span className="dim">
        {used ? 'Sonraki' : 'Pencere biter'}: {fmtClock(next)} · {fmtCountdown(next - now)}
      </span>
      <Info text="Gün 4 pencereye ayrılır: 00–06, 06–12, 12–18, 18–24. Her pencerede sadece bir saldırı yapabilirsin (günde en fazla 4). Katkın = (zar1 + zar2) × o anki gücün. 1 güç = 1 prestij. Aktiflik sadece savaşla sayılır: 30 gün hiçbir savaşa katılmayan çeteden çıkarılır." />
    </div>
  );
}

// Tırımıza saldıranların listesi (dokununca açılır)
function AttackersSheet({ def, attackers, lead, onClose }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const [ask, setAsk] = useState(null);
  const open = istHour(now) < GANG_RULES_HARAC_HOUR;
  const defTotal = sum(def.display);
  return (
    <Sheet title={`TIR #${def.truckCode} saldırganları`} icon="⚠️" onClose={onClose}>
      <p className="dim gx-mini">En güçlü saldırı savunmayla karşılaştırılır. En güçlünün haracını/rüşvetini ödersen sıradaki en güçlü esas alınır; saldırgan kalmazsa tır güvenle ulaşır. Ödeme 18:00'e kadar.</p>
      <div className="gx-vs">
        <span>🛡️ Savunma {fmt(defTotal)}</span>
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
            <span className="dim">{price > 0 ? `${isOp ? '💼 rüşvet' : '🤑 haraç'} ${fmt(price)}` : isOp ? 'rüşvet yok' : 'haraç yok'}</span>
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
          lines={['Para çete kasasından ödenir.', 'Bu saldırı hemen durur; diğer saldırılar (varsa) devam eder.']}
          confirmLabel="Öde"
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(ask.type === 'intelop' ? 'payBribe' : 'payHarac', { warId: ask.id }, { success: ask.type === 'intelop' ? '💼 Rüşvet ödendi, operasyon durdu' : '🤑 Haraç ödendi, saldırı durdu' });
            setAsk(null);
          }}
        />
      )}
    </Sheet>
  );
}

// Gelen bahis / ittifak teklifi
function OfferCard({ kind, item, rank }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const lead = LEADERS.includes(rank);
  const canSuggest = rank === 'kidemli' || rank === 'tetikci';
  const other = kind === 'bet' ? item.sides?.[item.proposerGangId] : { name: item.names?.[item.requestedBy], logo: item.logos?.[item.requestedBy] };
  const refId = item.id;
  return (
    <Card className="gx-offer">
      <div className="gx-offer-head">
        <Logo logo={other?.logo} size={32} />
        <div>
          <b>{other?.name}</b>
          <div className="dim gx-mini">{kind === 'bet' ? `🎲 ${fmt(item.stake)} altınlık bahisli savaş teklif etti` : '🤝 İttifak teklif etti'}</div>
        </div>
      </div>
      {kind === 'bet' && <div className="gx-offer-big">Ödül {fmt(item.stake * 2)} · savaş {item.dateKey} 00:00–24:00</div>}
      {lead ? (
        <div className="gx-row-2">
          <Btn kind="ghost" onClick={() => setAsk('reject')}>
            ❌ Reddet
          </Btn>
          <Btn onClick={() => setAsk('accept')}>✅ Kabul</Btn>
        </div>
      ) : canSuggest ? (
        <div className="gx-row-2">
          <Btn small kind="ghost" busy={busy === `sr_${refId}`} onClick={() => run('suggest', { kind, refId, choice: 'reject' }, { key: `sr_${refId}`, success: '💬 Önerin sohbete gönderildi' })}>
            💬 Reddedelim
          </Btn>
          <Btn small kind="ghost" busy={busy === `sa_${refId}`} onClick={() => run('suggest', { kind, refId, choice: 'accept' }, { key: `sa_${refId}`, success: '💬 Önerin sohbete gönderildi' })}>
            💬 Kabul edelim
          </Btn>
        </div>
      ) : (
        <p className="dim gx-mini">👁️ Kararı Mafya Babası ve Sağ Kol verir.</p>
      )}
      {ask && (
        <Confirm
          icon={ask === 'accept' ? '✅' : '❌'}
          title={kind === 'bet' ? (ask === 'accept' ? `${fmt(item.stake)} altınlık bahis kabul edilsin mi?` : 'Bahis reddedilsin mi?') : ask === 'accept' ? 'İttifak kabul edilsin mi?' : 'İttifak reddedilsin mi?'}
          lines={
            kind === 'bet'
              ? ask === 'accept'
                ? [`Kasadan ${fmt(item.stake)} altın havuza alınır.`, 'Savaş 00:00\'da başlar, 24 saat sürer; kazanan hepsini alır.']
                : ['Teklif edenin parası kendisine döner.']
              : ask === 'accept'
                ? ["İttifak 00:00'da başlar.", 'Aranızda bahis/sabotaj olmaz; birbirinizin tırını savunabilirsiniz.']
                : ['Teklif kapanır.']
          }
          confirmLabel={ask === 'accept' ? 'Kabul' : 'Reddet'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            if (kind === 'bet') await run('respondBet', { warId: item.id, accept: ask === 'accept' }, { success: ask === 'accept' ? '⚔️ Bahis kabul edildi' : 'Reddedildi' });
            else await run('respondAlliance', { allianceId: item.id, accept: ask === 'accept' }, { success: ask === 'accept' ? '🤝 İttifak kabul edildi' : 'Reddedildi' });
            setAsk(null);
          }}
        />
      )}
    </Card>
  );
}

// Bahis / ittifak teklif et (Baba / Sağ Kol)
function ProposeSheet({ kind, gangId, onClose }) {
  const { path, call } = useGang();
  const { run, busy } = useGangAction();
  const { docs: gangs } = useQueryData(path('gangs'), () => [limit(100)], 'all_gangs');
  const [target, setTarget] = useState(null);
  const [quote, setQuote] = useState(null);
  const [stake, setStake] = useState(0);
  const others = gangs.filter((g) => g.id !== gangId && g.status === 'active');
  const pick = async (g) => {
    setTarget(g);
    setStake(0);
    setQuote(null);
    if (kind === 'bet') setQuote(await call('quoteBet', { targetGangId: g.id }).catch(() => ({ maxBet: 0 })));
  };
  return (
    <Sheet title={kind === 'bet' ? 'Bahisli savaş teklif et' : 'İttifak teklif et'} icon={kind === 'bet' ? '🎲' : '🤝'} onClose={onClose}>
      {kind === 'bet' && <p className="dim gx-mini">Günde 1 teklif · Cumartesi/Pazar yok · en fazla iki çetenin 00:00 kasasından küçüğünün ¼'ü. Teklif ettiğin altın havuza alınır; kabul edilmezse 00:00'da geri döner.</p>}
      {kind === 'alliance' && <p className="dim gx-mini">İttifak kabul edilirse 00:00'da başlar, bitirilirse 00:00'da biter. Aranızda süren bahis/sabotaj varken kurulamaz.</p>}
      <div className="gx-pick-list">
        {others.map((g) => (
          <button key={g.id} className={`gx-pick${target?.id === g.id ? ' active' : ''}`} onClick={() => pick(g)}>
            <Logo logo={g.logo} size={24} /> {g.name}
          </button>
        ))}
      </div>
      {target && kind === 'bet' && (
        <>
          <p className="dim gx-mini">En fazla: {quote ? fmt(quote.maxBet) : '…'} altın</p>
          <AmountInput value={stake} onChange={setStake} max={quote?.maxBet} />
        </>
      )}
      {target && (
        <Btn
          block
          busy={Boolean(busy)}
          disabled={kind === 'bet' && !(stake >= GANG_RULES.BET_MIN)}
          onClick={async () => {
            const r = kind === 'bet' ? await run('offerBet', { targetGangId: target.id, stake }, { success: '🎲 Teklif gönderildi', withRequestId: true }) : await run('requestAlliance', { targetGangId: target.id }, { success: '🤝 Teklif gönderildi' });
            if (r) onClose();
          }}
        >
          {kind === 'bet' ? `${fmt(stake)} altın teklif et` : `${target.name} ile ittifak teklif et`}
        </Btn>
      )}
    </Sheet>
  );
}

// Dağıtımdan pay alma (dağıtımlar Savaş panelinin en altında)
function ClaimList({ dists, rank, isIntel, myKey, joinedAtMs }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const eq = (r) => (isIntel ? { baskan: 'baba', sef: 'sagkol', uzman: 'kidemli', ajan: 'tetikci', muhbir: 'comez' }[r] : r);
  const inGroup = (g) => g === 'hepsi' || (g === 'rutbeli' && ['baba', 'sagkol', 'kidemli'].includes(eq(rank))) || (g === 'tetikci' && eq(rank) === 'tetikci') || (g === 'comez' && eq(rank) === 'comez');
  const mine = dists.filter(
    (d) => d.status === 'open' && now < d.expiresAtMs && !d.claims?.[myKey] && inGroup(d.group) && (d.claimedCount || 0) < d.slots && Number(joinedAtMs || 0) <= d.createdAtMs && !(isIntel && (rank === 'baskan' || d.creatorKey === myKey))
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
          <Btn busy={busy === `cl_${d.id}`} onClick={() => run('claimDistribution', { distributionId: d.id }, { key: `cl_${d.id}`, success: `💵 +${fmt(d.perPerson)} altın hesabına geçti` })}>
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

  const L = useMemo(() => {
    const active = wars.active;
    const trade = active.filter((w) => w.type === 'trade');
    const attacksOnDef = (def) => wars.all.filter((w) => (w.type === 'sabotage' || w.type === 'intelop') && w.defenseWarId === def.id && w.status === 'active').sort((a, b) => (b.display?.attacker || 0) - (a.display?.attacker || 0));
    if (isIntel) return { trade, ops: active.filter((w) => w.type === 'intelop'), attacksOnDef };
    const allyIds = new Set(d.alliances.filter((a) => ['active', 'ending'].includes(a.status)).flatMap((a) => a.gangIds).filter((g) => g !== gangId));
    return {
      trade,
      attacksOnDef,
      bets: active.filter((w) => w.type === 'bet' && w.gangIds?.includes(gangId)),
      myAttacks: active.filter((w) => w.type === 'sabotage' && w.attackerGangId === gangId),
      myDefs: active.filter((w) => w.type === 'defense' && w.defenderGangId === gangId && w.announced),
      allyDefs: active.filter((w) => w.type === 'defense' && allyIds.has(w.defenderGangId) && w.announced),
      betOffersIn: wars.all.filter((w) => w.type === 'bet' && w.status === 'offered' && w.targetGangId === gangId),
      betOffersOut: wars.all.filter((w) => w.type === 'bet' && ['offered', 'accepted'].includes(w.status) && w.proposerGangId === gangId),
      betsAccepted: wars.all.filter((w) => w.type === 'bet' && w.status === 'accepted' && w.targetGangId === gangId),
      allianceIn: d.alliances.filter((a) => a.status === 'requested' && a.requestedBy !== gangId),
    };
  }, [wars, isIntel, d.alliances, gangId]);

  const sideKey = isIntel ? 'intel' : gangId;
  const tradePos = (w) => {
    const s = sidesRanked(w);
    const i = s.findIndex((x) => x.key === sideKey);
    return { pos: i >= 0 ? i + 1 : null, power: i >= 0 ? s[i].power : 0, n: s.length };
  };

  const hasWar = L.trade.length + (L.bets?.length || 0) + (L.myAttacks?.length || 0) + (L.myDefs?.length || 0) + (L.allyDefs?.length || 0) + (L.ops?.length || 0) > 0;

  return (
    <div className="gx-stack">
      {!isIntel && d.membership.intelDecisionGangId === gangId && d.membership.intelRosterId && d.rank === 'baba' && <IntelDecisionPanel />}
      <WindowBanner slot={slot} />
      {!isIntel && lead && (
        <div className="gx-row-2">
          <Btn small kind="ghost" onClick={() => setPropose('bet')}>
            🎲 Bahis teklif et
          </Btn>
          <Btn small kind="ghost" onClick={() => setPropose('alliance')}>
            🤝 İttifak teklif et
          </Btn>
        </div>
      )}

      {!hasWar && <Empty icon="🕊️" text="Şu an aktif savaş yok. Ticaret yolu savaşı her Pazar 00:00'da başlar." />}

      {L.trade.map((w) => {
        const t = tradePos(w);
        const p = productOf(w.product);
        return (
          <WarRow key={w.id} war={w} slotUsed={slot.used} onOpen={() => setDetail({ war: w, side: sideKey })} onJoin={() => join(w, isIntel ? { side: 'intel' } : {}, isIntel ? 'İstihbarat' : d.gang?.name)}>
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
        const other = Object.keys(w.sides || {}).find((k) => k !== gangId);
        return (
          <WarRow key={w.id} war={w} slotUsed={slot.used} onOpen={() => setDetail({ war: w, side: gangId })} onJoin={() => join(w, {}, d.gang?.name)}>
            <Tug us={w.display?.[gangId] || 0} them={w.display?.[other] || 0} usLabel={d.gang?.name} themLabel={w.sides?.[other]?.name} />
            <div className="dim gx-mini">🎲 Ödül {fmt(w.stake * 2)}</div>
          </WarRow>
        );
      })}

      {(L.myDefs || []).length > 0 && (
        <div className="gx-section-head">
          <span>⚠️ Tırlarımıza saldırı</span>
          <Info text="Saldırılar 12:00'de duyurulur. Savunma 12–18 ve 18–24 pencerelerinde. En güçlü saldırı savunmayla karşılaştırılır; haraç/rüşvet 18:00'e kadar ödenebilir." />
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
            <div className="dim gx-mini">👆 Tüm saldırganlar · haraç / rüşvet</div>
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
            {w.harac > 0 && <div className="gx-war-purpose">🤑 Haraç talebi: {fmt(w.harac)}</div>}
          </WarRow>
        );
      })}

      {(L.allyDefs || []).length > 0 && (
        <div className="gx-section-head">
          <span>🤝 İttifak çetenin tırı</span>
          <Info text="Müttefiklerinizin saldırı altındaki tırlarını savunabilirsiniz. Savunma güçleri birleşir (saldırıda birleşmez)." />
        </div>
      )}
      {(L.allyDefs || []).map((w) => {
        const top = L.attacksOnDef(w)[0];
        return (
          <WarRow key={w.id} war={w} slotUsed={slot.used} onOpen={() => setDetail({ war: w, side: gangId })} onJoin={() => join(w, { side: 'defense' }, d.gang?.name)} joinLabel="SAVUN">
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
              {w.estReward != null ? `💰 Ödül değeri: ${fmt(w.estReward)}` : '💰 Ödül: içerik sızdırılmadı'} · {w.bribe > 0 ? `💼 rüşvet ${fmt(w.bribe)}` : 'rüşvet yok'}
            </div>
          </WarRow>
        );
      })}

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
          <Card key={w.id} className="gx-pending">
            <span>
              🎲 {w.sides?.[w.targetGangId]?.name}: {fmt(w.stake)} · {w.status === 'offered' ? "cevap bekleniyor (00:00'a kadar)" : `kabul edildi · ${w.dateKey} 00:00'da başlar`}
            </span>
            {lead && w.status === 'offered' && (
              <Btn small kind="ghost" busy={busy === `wd_${w.id}`} onClick={() => run('withdrawBet', { warId: w.id }, { key: `wd_${w.id}`, success: 'Teklif geri çekildi' })}>
                Geri çek
              </Btn>
            )}
          </Card>
        ))}
      {!isIntel &&
        L.betsAccepted.map((w) => (
          <Card key={w.id} className="gx-pending">
            <span>
              🎲 {w.sides?.[w.proposerGangId]?.name} ile {fmt(w.stake)} altınlık bahis · {w.dateKey} 00:00'da başlar
            </span>
          </Card>
        ))}

      {/* Oylamalar */}
      {(d.votes.length > 0 || d.pending.length > 0) && (
        <div className="gx-section-head">
          <span>🗳️ Oylamalar</span>
          <Info text={isIntel ? "Oylamalar 00:00'da başlar, 24 saat sürer. Oy hakkı Başkan, Şef ve Uzmanlarındır. Başkan için %66'dan fazla, diğerleri için %51 evet gerekir. Başarısız oylamada hiçbir şey değişmez." : "Oylamalar 00:00'da başlar, 24 saat sürer. Oy hakkı başladığı andaki 7 rütbelinindir. Tetikçiler görür ama oy veremez; Çömezler görmez."} />
        </div>
      )}
      {d.pending.map((p) => (
        <Card key={p.id} className="gx-pending">
          <span>🤫 {isIntel ? `${p.targetCode} için çıkarma` : p.type === 'kick' ? `${p.targetName} için çıkarma` : p.type === 'devirme' ? 'Devirme' : 'Ayaklanma'} talebin gizli · 00:00'da başlar</span>
          <Btn small kind="ghost" busy={busy === `c_${p.id}`} onClick={() => run(isIntel ? 'cancelIntelVoteRequest' : 'cancelVoteRequest', { pendingId: p.id }, { key: `c_${p.id}`, success: 'İptal edildi' })}>
            İptal
          </Btn>
        </Card>
      ))}
      {d.votes.map((v) =>
        isIntel ? (
          <VoteCard key={v.id} vote={v} ballotPath={path(`intel/main/votes/${v.id}/ballots/${d.rid}`)} voterKey={d.rid} action="castIntelVote" />
        ) : (
          <VoteCard key={v.id} vote={v} ballotPath={path(`gangs/${gangId}/votes/${v.id}/ballots/${actorId}`)} voterKey={actorId} action="castVote" />
        )
      )}

      <ClaimList dists={d.dists} rank={d.rank} isIntel={isIntel} myKey={isIntel ? d.rid : actorId} joinedAtMs={isIntel ? d.me?.joinedAtMs : d.me?.joinedAtMs} />

      {detail && <WarDetail war={wars.all.find((w) => w.id === detail.war.id) || detail.war} mySideKey={detail.side} onClose={() => setDetail(null)} />}
      {attackersOf && <AttackersSheet def={wars.all.find((w) => w.id === attackersOf.id) || attackersOf} attackers={L.attacksOnDef(attackersOf)} lead={lead} onClose={() => setAttackersOf(null)} />}
      {rolling && <DiceRoller title={`${warIcon(rolling.war)} ${warTitle(rolling.war)}`} subtitle={rolling.side} sideLabel={rolling.side} onRoll={doRoll} onClose={() => setRolling(null)} />}
      {propose && <ProposeSheet kind={propose} gangId={gangId} onClose={() => setPropose(null)} />}
    </div>
  );
}
