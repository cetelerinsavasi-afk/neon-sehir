/* eslint-disable react-refresh/only-export-components */
// v84 — BİAT arayüzü (Savaş paneli + Çeteler listesi + Pazar savaşı)
//  - Biat et (Mafya Babası, elinde ticaret yolu yoksa): çete seç → teklif
//  - Biat durumu: biat ettiğimiz çete / bize biat edenler (bozma / geri çekme)
//  - Pazar savaşı: biat edenlerin katkısı herkese görünür
// Kurallar sunucuda (functions/gang/actions/wars.js → requestBiat/respondBiat/endBiat).
import { useMemo, useState } from 'react';
import { limit } from 'firebase/firestore';
import { useGang, useGangAction, useQueryData } from './GangContext';
import { Btn, Card, Confirm, Empty, Logo, Sheet } from './ui';
import { LEADERS, fmt } from './gangConstants';

export const BIAT_SUMMARY =
  'Biat ettiğin çeteyle birbirinize saldıramazsınız ve onun tırlarını savunabilirsiniz. Pazar ticaret yolu savaşına kendi adınıza katılamazsınız: üyelerinizin tüm hasarı biat ettiğiniz çetenin gücüne eklenir. Bahisli savaşlara katkınız olmaz.';
export const BIAT_TIMING = "Karşı çetenin Mafya Babası ya da Sağ Kolu kabul ederse 00:00'da başlar; iki tarafın da Mafya Babası ya da Sağ Kolu bozabilir, bozulursa 00:00'da biter. Biat ittifaktan bağımsızdır: ittifakınız olsa da olmasa da biat edebilir, biatı bozunca ittifak sürer.";

const STATUS_LABEL = {
  requested: '⏳ Cevap bekleniyor',
  accepted: "🕛 00:00'da başlıyor",
  active: '✅ Aktif',
  ending: "💔 00:00'da bitiyor",
};

// Çetemin biat durumu (d = useGangData)
export function useBiatInfo(d) {
  return useMemo(() => {
    const list = d?.biats || [];
    const gangId = d?.gangId;
    const mine = list.find((b) => b.vassalId === gangId) || null; // biat ettiğimiz (ya da teklif ettiğimiz) çete
    const vassals = list.filter((b) => b.overlordId === gangId && b.status !== 'requested'); // bize biat edenler
    const incoming = list.filter((b) => b.overlordId === gangId && b.status === 'requested');
    const fightingFor = mine && ['active', 'ending'].includes(mine.status) && d?.gang?.biat?.gangId === mine.overlordId ? d.gang.biat : null;
    const noRoute = (d?.gang?.routeProducts || []).length === 0;
    const canBiat = d?.rank === 'baba' && noRoute && !mine && vassals.length === 0;
    return { mine, vassals, incoming, fightingFor, canBiat, noRoute };
  }, [d?.biats, d?.gangId, d?.gang?.biat, d?.gang?.routeProducts, d?.rank]);
}

// Küçük etiket: "⛓️ Biat: Beta"
export function BiatTag({ name, logo, prefix = 'Biat:' }) {
  if (!name) return null;
  return (
    <span className="gx-biat-tag" title={`${name} çetesine biat etti`}>
      <span aria-hidden="true">⛓️</span> {prefix} {logo ? <Logo logo={logo} size={14} /> : null}
      <b>{name}</b>
    </span>
  );
}

// "Biat et" — çete listesi + kısa açıklama + teklif
export function BiatSheet({ gangId, blockedIds = [], onClose }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const { docs: gangs } = useQueryData(path('gangs'), () => [limit(100)], 'all_gangs');
  const [target, setTarget] = useState(null);
  const [ask, setAsk] = useState(false);
  const list = gangs
    .filter((g) => g.id !== gangId && g.status === 'active')
    .map((g) => ({
      g,
      reason: g.biat?.gangId ? `${g.biat.name || 'başka bir çete'} çetesine biat etmiş` : blockedIds.includes(g.id) ? 'Aranızda biat süreci/bahis var' : null,
    }))
    .sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason)) || Number(b.g.lastSundayPower || 0) - Number(a.g.lastSundayPower || 0));
  return (
    <Sheet title="Biat et" icon="⛓️" onClose={onClose}>
      <div className="gx-biat-explain">
        <p>{BIAT_SUMMARY}</p>
        <p className="dim">{BIAT_TIMING}</p>
      </div>
      <div className="gx-biat-list">
        {list.length === 0 && <Empty icon="🏴" text="Biat edilebilecek çete yok." />}
        {list.map(({ g, reason }) => {
          const n = Object.keys(g.vassals || {}).length;
          return (
            <button key={g.id} className={`gx-biat-pick${target?.id === g.id ? ' active' : ''}`} disabled={Boolean(reason)} onClick={() => setTarget(target?.id === g.id ? null : g)}>
              <Logo logo={g.logo} size={30} />
              <span className="gx-biat-pick-main">
                <b>{g.name}</b>
                <span className="dim gx-mini">
                  {reason ? `🔒 ${reason}` : `⚔️ ${fmt(g.lastSundayPower)} · 👥 ${fmt(g.memberCount)}${n ? ` · ⛓️ ${n} çete biat etti` : ''}`}
                </span>
              </span>
              <span className="gx-biat-pick-go">{target?.id === g.id ? '✓' : '⛓️'}</span>
            </button>
          );
        })}
      </div>
      {target && (
        <Btn block onClick={() => setAsk(true)}>
          ⛓️ {target.name} çetesine biat teklif et
        </Btn>
      )}
      {ask && target && (
        <Confirm
          icon="⛓️"
          title={`${target.name} çetesine biat edilsin mi?`}
          lines={[
            `⚔️ Pazar savaşında ${target.name} adına savaşırsınız`,
            '🛡️ Birbirinize saldıramazsınız, tırlarını savunabilirsiniz',
            "🕛 Kabul edilirse 00:00'da başlar",
          ]}
          confirmLabel="Teklif et"
          busy={busy === 'requestBiat'}
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            const r = await run('requestBiat', { targetGangId: target.id }, { success: '⛓️ Biat teklifi gönderildi', withRequestId: true });
            setAsk(false);
            if (r) onClose();
          }}
        />
      )}
    </Sheet>
  );
}

// Savaş panelinde biat durumu: biat ettiğimiz çete + bize biat edenler
export function BiatStatus({ d, info }) {
  const { run, busy } = useGangAction();
  const [end, setEnd] = useState(null);
  const lead = LEADERS.includes(d.rank);
  const { mine, vassals } = info;
  if (!mine && vassals.length === 0) return null;
  const otherOf = (b) => (b.vassalId === d.gangId ? b.overlordId : b.vassalId);
  return (
    <>
      {mine && (
        <Card className={`gx-biat-card${mine.status === 'requested' ? ' waiting' : ''}`}>
          <div className="gx-biat-card-tag">⛓️ BİAT</div>
          <div className="gx-biat-card-row">
            <Logo logo={mine.logos?.[mine.overlordId]} size={36} />
            <div className="gx-biat-card-main">
              <b>{mine.names?.[mine.overlordId]}</b>
              <span className="gx-mini">{STATUS_LABEL[mine.status]}</span>
            </div>
            {/* v85.1: biat eden tarafta da Mafya Babası + Sağ Kol bozabilir */}
            {lead && mine.status !== 'ending' && (
              <Btn small kind="danger" onClick={() => setEnd(mine)}>
                {mine.status === 'active' ? 'Biatı boz' : 'Geri çek'}
              </Btn>
            )}
          </div>
          <div className="gx-biat-card-note">
            {['active', 'ending'].includes(mine.status)
              ? `Pazar ticaret yolu savaşında ${mine.names?.[mine.overlordId]} adına savaşıyorsunuz — hasarınız onların gücüne eklenir. Tırlarını savunabilirsiniz.`
              : mine.status === 'accepted'
                ? `Kabul edildi. 00:00'dan itibaren Pazar savaşında ${mine.names?.[mine.overlordId]} adına savaşacaksınız.`
                : 'Teklif gönderildi. Karşı çetenin Mafya Babası ya da Sağ Kolu kabul edebilir.'}
          </div>
        </Card>
      )}
      {vassals.length > 0 && (
        <Card className="gx-biat-card overlord">
          <div className="gx-biat-card-tag">⛓️ SİZE BİAT EDENLER</div>
          {vassals.map((b) => (
            <div key={b.id} className="gx-biat-card-row">
              <Logo logo={b.logos?.[b.vassalId]} size={30} />
              <div className="gx-biat-card-main">
                <b>{b.names?.[b.vassalId]}</b>
                <span className="gx-mini">{STATUS_LABEL[b.status]}</span>
              </div>
              {lead && b.status !== 'ending' && (
                <Btn small kind="ghost" onClick={() => setEnd(b)}>
                  {b.status === 'active' ? 'Biatı boz' : 'İptal'}
                </Btn>
              )}
            </div>
          ))}
          <div className="gx-biat-card-note">Pazar savaşında bu çetelerin hasarı sizin gücünüze eklenir; tırlarınızı savunabilirler.</div>
        </Card>
      )}
      {end && (
        <Confirm
          icon="💔"
          danger
          title={end.status === 'active' ? `${end.names?.[otherOf(end)]} ile biat bozulsun mu?` : 'Biat süreci iptal edilsin mi?'}
          lines={[
            end.status === 'active' ? "Biat bu gece 00:00'da sona erer." : 'Teklif / başlangıç hemen iptal edilir.',
            // v85.1: biat ve ittifak bağımsız — biatı bozmak ittifaka dokunmaz
            ...((d.alliances || []).some((a) => a.gangIds?.includes(otherOf(end)) && ['accepted', 'active', 'ending'].includes(a.status))
              ? ['🤝 Bu çeteyle ittifakınız devam eder (ittifakı ayrıca bozabilirsiniz).']
              : []),
          ]}
          confirmLabel={end.status === 'active' ? 'Boz' : 'İptal et'}
          busy={busy === 'endBiat'}
          onCancel={() => setEnd(null)}
          onConfirm={async () => {
            await run('endBiat', { biatId: end.id }, { success: end.status === 'active' ? "💔 Biat 00:00'da bitecek" : 'İptal edildi' });
            setEnd(null);
          }}
        />
      )}
    </>
  );
}

// Pazar savaşı detayında bir tarafın altına: o tarafa biat edenlerin katkısı
export function biatRowsOf(war, sideKey) {
  return Object.entries(war?.biatSides || {})
    .filter(([, s]) => s.overlordId === sideKey)
    .map(([k, s]) => ({ key: k, name: s.name, logo: s.logo, power: Number(war?.biatDisplay?.[k] || 0) }))
    .sort((a, b) => b.power - a.power);
}

export function BiatContribRows({ war, sideKey, mineKey }) {
  const rows = biatRowsOf(war, sideKey);
  if (!rows.length) return null;
  return (
    <div className="gx-biat-contrib">
      {rows.map((r) => (
        <div key={r.key} className={`gx-biat-contrib-row${r.key === mineKey ? ' mine' : ''}`}>
          <span className="gx-biat-contrib-arrow" aria-hidden="true">
            ↳
          </span>
          <Logo logo={r.logo} size={16} />
          <span className="gx-biat-contrib-name">
            ⛓️ {r.name} <em>biat</em>
          </span>
          <b>+{fmt(r.power)}</b>
        </div>
      ))}
    </div>
  );
}
