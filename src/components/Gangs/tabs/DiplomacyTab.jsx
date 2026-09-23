// DİPLOMASİ — ittifaklar ve bahisli savaş teklifleri.
// İttifak: süresiz, 00:00'da başlar/biter; aktifken bahis ve sabotaj yok,
// savunmada güç birleşir. Bahis: Pzt–Per teklif, 00:00'a kadar cevap,
// savaş ertesi gün 00:00–24:00, kazanan toplamı alır.
import { useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { fmtCountdown, nextMidnight, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Btn, Card, Confirm, Empty, Info, Logo, Sheet } from '../ui';
import { GANG_RULES, fmt } from '../gangConstants';

const AL_STATUS = {
  requested: '⏳ Teklif',
  accepted: '🕛 00:00\'da başlar',
  active: '🤝 Aktif',
  ending: '💔 00:00\'da biter',
};

function NewDiplomacySheet({ gang, alliances, betOffers, onClose }) {
  const { path, call } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow(60_000);
  const { docs: gangs } = useQueryData(path('gangs'), () => [where('status', '==', 'active'), limit(60)], 'active');
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState(null);
  const [stake, setStake] = useState(0);
  const [maxBet, setMaxBet] = useState(null);
  const wd = new Date(now + 3 * 3600_000).getUTCDay();
  const betDay = [1, 2, 3, 4].includes(wd);
  const others = gangs.filter((g) => g.id !== gang.id);
  const relation = (gid) => alliances.find((a) => a.gangIds.includes(gid)) || null;
  const hasBet = (gid) => betOffers.some((b) => b.gangIds.includes(gid));
  return (
    <Sheet title="Diplomasi" icon="🤝" onClose={onClose}>
      {others.length === 0 && <p className="dim">Başka çete yok.</p>}
      {others.map((g) => {
        const rel = relation(g.id);
        return (
          <div key={g.id} className="gx-dip-row">
            <Logo logo={g.logo} size={30} />
            <span className="gx-dip-name">{g.name}</span>
            {rel ? (
              <span className="gx-pill ally">{AL_STATUS[rel.status]}</span>
            ) : (
              <span className="gx-row-2">
                <Btn small kind="ghost" onClick={() => { setTarget(g); setMode('alliance'); }}>
                  🤝
                </Btn>
                <Btn
                  small
                  kind="ghost"
                  disabled={!betDay || hasBet(g.id)}
                  title={betDay ? '' : 'Bahis teklifi Pzt–Per'}
                  onClick={async () => {
                    setTarget(g);
                    setMode('bet');
                    setStake(GANG_RULES.BET_MIN);
                    const q = await call('quoteDefense', {}).catch(() => null);
                    setMaxBet(q?.maxBet ?? 0);
                  }}
                >
                  🎲
                </Btn>
              </span>
            )}
          </div>
        );
      })}
      {!betDay && <p className="dim gx-mini">🎲 Bahisli savaş teklifleri Pazartesi–Perşembe yapılır (savaş Sal–Cum).</p>}
      {mode === 'alliance' && target && (
        <Confirm
          icon="🤝"
          title={`${target.name} çetesine ittifak teklifi`}
          lines={['Kabul edilirse 00:00\'da başlar, süresizdir.', 'İttifak varken birbirinize bahis ve sabotaj yapamazsınız.', 'Tırlarınızı birlikte savunabilirsiniz (saldırıda birleşme yok).']}
          confirmLabel="Teklif et"
          busy={busy === 'requestAlliance'}
          onCancel={() => setMode(null)}
          onConfirm={async () => {
            const r = await run('requestAlliance', { targetGangId: target.id }, { success: '🤝 Teklif gönderildi' });
            if (r) onClose();
          }}
        />
      )}
      {mode === 'bet' && target && (
        <Confirm
          icon="🎲"
          title={`${target.name} çetesine bahisli savaş`}
          lines={[`Bahis kasadan hemen ayrılır. En fazla: ${fmt(maxBet)}`, 'Karşı taraf 00:00\'a kadar kabul etmezse para geri döner.', 'Kabul edilirse savaş yarın 00:00\'da başlar, 24 saat sürer.', `Kazanan ${fmt(stake * 2)} altını alır.`]}
          confirmLabel="Teklif et"
          busy={busy === 'offerBet'}
          onCancel={() => setMode(null)}
          onConfirm={async () => {
            const r = await run('offerBet', { targetGangId: target.id, stake }, { success: '🎲 Bahis teklifi gönderildi', withRequestId: true });
            if (r) onClose();
          }}
        >
          <AmountInput value={stake} onChange={setStake} max={maxBet ?? undefined} quick={[10_000, 50_000, 100_000, 500_000]} />
        </Confirm>
      )}
    </Sheet>
  );
}

export default function DiplomacyTab({ gang, rank, alliances, betOffers }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(null);
  const isBaba = rank === 'baba';
  const other = (a) => a.gangIds.find((g) => g !== gang.id);
  const incomingBets = betOffers.filter((b) => b.status === 'offered' && b.targetGangId === gang.id);
  const outgoingBets = betOffers.filter((b) => b.status === 'offered' && b.proposerGangId === gang.id);
  const acceptedBets = betOffers.filter((b) => b.status === 'accepted');
  const empty = alliances.length === 0 && betOffers.length === 0;
  return (
    <div className="gx-stack">
      {isBaba && (
        <Btn block onClick={() => setOpen(true)}>
          ➕ Yeni teklif
        </Btn>
      )}
      {empty && <Empty icon="🕊️" text="Aktif diplomasi yok." />}
      {incomingBets.map((b) => (
        <Card key={b.id} className="gx-offer" accent="var(--neon-pink)">
          <div className="gx-offer-head">
            🎲 <b>{b.sides?.[b.proposerGangId]?.name}</b> bahisli savaş istiyor
          </div>
          <div className="gx-offer-big">{fmt(b.stake)} × 2 = {fmt(b.stake * 2)}</div>
          <div className="dim">⏱ {fmtCountdown(nextMidnight(now) - now)} içinde cevap ver, yoksa iptal</div>
          {isBaba && (
            <div className="gx-row-2">
              <Btn kind="ghost" busy={busy === `d_${b.id}`} onClick={() => run('respondBet', { warId: b.id, accept: false }, { key: `d_${b.id}`, success: 'Reddedildi' })}>
                Reddet
              </Btn>
              <Btn onClick={() => setAsk(b)}>Kabul</Btn>
            </div>
          )}
        </Card>
      ))}
      {outgoingBets.map((b) => (
        <Card key={b.id} className="gx-offer">
          <div className="gx-offer-head">
            🎲 {b.sides?.[b.targetGangId]?.name} çetesine {fmt(b.stake)} teklif ettin
          </div>
          <div className="dim">⏳ cevap bekleniyor · {fmtCountdown(nextMidnight(now) - now)}</div>
          {isBaba && (
            <Btn small kind="ghost" busy={busy === `w_${b.id}`} onClick={() => run('withdrawBet', { warId: b.id }, { key: `w_${b.id}`, success: '↩️ Geri çekildi' })}>
              Geri çek
            </Btn>
          )}
        </Card>
      ))}
      {acceptedBets.map((b) => (
        <Card key={b.id} className="gx-offer">
          <div className="gx-offer-head">⚔️ Bahisli savaş 00:00'da başlıyor · Ödül {fmt(b.stake * 2)}</div>
        </Card>
      ))}
      {alliances.length > 0 && (
        <div className="gx-section-head">
          <span>🤝 İttifaklar</span>
          <Info text="İttifak süresizdir. Taraflardan biri bitirmek isterse 00:00'da sona erer. Aktif ittifakta bahis ve sabotaj yapılamaz; müttefik tırları birlikte savunulur." />
        </div>
      )}
      {alliances.map((a) => {
        const o = other(a);
        const incoming = a.status === 'requested' && a.requestedBy !== gang.id;
        return (
          <div key={a.id} className="gx-dip-row">
            <Logo logo={a.logos?.[o]} size={30} />
            <span className="gx-dip-name">{a.names?.[o]}</span>
            <span className="gx-pill ally">{AL_STATUS[a.status]}</span>
            {isBaba && incoming && (
              <span className="gx-row-2">
                <Btn small kind="ghost" busy={busy === `ad_${a.id}`} onClick={() => run('respondAlliance', { allianceId: a.id, accept: false }, { key: `ad_${a.id}`, success: 'Reddedildi' })}>
                  ✕
                </Btn>
                <Btn small busy={busy === `aa_${a.id}`} onClick={() => run('respondAlliance', { allianceId: a.id, accept: true }, { key: `aa_${a.id}`, success: '🤝 Kabul edildi — 00:00\'da başlar' })}>
                  ✓
                </Btn>
              </span>
            )}
            {isBaba && !incoming && a.status !== 'ending' && (
              <Btn small kind="ghost" onClick={() => setAsk({ endAlliance: a })}>
                {a.status === 'active' ? 'Bitir' : 'İptal'}
              </Btn>
            )}
          </div>
        );
      })}
      {open && <NewDiplomacySheet gang={gang} alliances={alliances} betOffers={betOffers} onClose={() => setOpen(false)} />}
      {ask && !ask.endAlliance && (
        <Confirm
          icon="🎲"
          title="Bahsi kabul et?"
          lines={[`${fmt(ask.stake)} altın kasadan ayrılır.`, 'Savaş yarın 00:00\'da başlar, 24 saat sürer.', `Kazanan ${fmt(ask.stake * 2)} alır.`]}
          confirmLabel="Kabul"
          busy={busy === 'respondBet'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('respondBet', { warId: ask.id, accept: true }, { success: '⚔️ Bahis kabul edildi' });
            setAsk(null);
          }}
        />
      )}
      {ask?.endAlliance && (
        <Confirm
          icon="💔"
          danger
          title="İttifak bitirilsin mi?"
          lines={[ask.endAlliance.status === 'active' ? 'İttifak bu gece 00:00\'da sona erer.' : 'Teklif iptal edilir.']}
          confirmLabel="Bitir"
          busy={busy === 'endAlliance'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('endAlliance', { allianceId: ask.endAlliance.id }, { success: '💔 İttifak bitiyor' });
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}
