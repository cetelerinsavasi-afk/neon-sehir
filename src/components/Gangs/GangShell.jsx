// v146: Çeteler ekranı = sadece liste (alt sekmeler kalktı); paneller karargahın
// içinde (OrgPanelSheet). Aşağıdaki eski açıklama tarihçe için:
// Çeteler ekranının iskeleti: altta 5 iç sekme.
//   Çete:        Çeteler · Sohbet · Savaş · Ticaret · Çetem
//   Polis Teşkilatı (v109; kodda "intel" — eski İstihbarat):
//                Çeteler · Sohbet · Savaş · Operasyon · Teşkilat
// Çetesi/teşkilatı olmayan sadece "Çeteler" listesini görür (diğerleri
// kilitli). Ekran her zaman "Çeteler" sekmesiyle açılır (v110); listede "Aç"a
// basınca Savaş sekmesine geçer. Çete ↔ Polis Teşkilatı geçişi
// "Çeteler" sekmesinden.
import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CityHqContext, InitialHqContext } from './cityHqNav';
import { retryImport } from '../../lib/lazyRetry';
import { useDocData, useGang } from './GangContext';
import { useGangData, useIntelData } from './data';
import { Deadline, Gold, Logo, RankBadge } from './ui';
import { INTEL_LOGO, INTEL_NAME, fmt } from './gangConstants';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { policeSalary } from '../../../functions/belediyeRates.js';
import ListTab from './tabs/ListTab';
import ChatTab from './tabs/ChatTab';
import WarsTab from './tabs/WarsTab';
import TradeTab from './tabs/TradeTab';
import CetemTab from './tabs/CetemTab';
import OpsTab from './tabs/OpsTab';
import IntelTab from './tabs/IntelTab';
import { WatchWarsButton } from './WatchWars';
import { BiatTag } from './Biat';
import { usePlayerSelect } from '../../hooks/usePlayer';

const OFFICIAL_TITLES = { bsk: 'Belediye Başkanı', yrd1: 'Belediye Başkan Yardımcısı', yrd2: 'Belediye Başkan Yardımcısı', guv: 'Teşkilat Bakanı' };

// v146: alt sekmeler OrgPanelSheet.jsx'e taşındı

// v136: Belediye Başkanı / yardımcıları / Teşkilat Bakanı — teşkilata YETKİLİ olarak girer
export function useOfficialSeat(ms) {
  const realIntel = Boolean(ms?.intelRosterId);
  const { actorId, world } = useGang();
  const { data: staff } = useDocData(!realIntel && world === 'live' && actorId ? `belediyeStaff/${actorId}` : null);
  const mySeat = usePlayerSelect((p) => p?.belediyeSeat || null); // users.belediyeSeat (yedek)
  const seat = world === 'live' ? (OFFICIAL_TITLES[staff?.seat] ? staff.seat : OFFICIAL_TITLES[mySeat] ? mySeat : null) : null;
  return useMemo(() => (!realIntel && seat ? { seat, title: OFFICIAL_TITLES[seat] } : null), [realIntel, seat]);
}

// v146 — "Çeteler" artık alt sekmeler OLMADAN sadece listeyi gösterir. Kendi
// çetende / teşkilatta "Aç" → karargaha (3D mekân) girilir; panellere oradaki
// sağ üst butondan ulaşılır. Çetesi olmayan "Devam eden savaşlar"ı listeden izler.
const GangHq = lazy(retryImport(() => import('./GangHq')));
const TeskilatHq = lazy(retryImport(() => import('../Venue3D/VenueHouseScreen'))); // eslint-disable-line no-unused-vars
// v157.4: Polis Teşkilatı mekânı kapandı — teşkilat paneli doğrudan açılır
const OrgPanelSheetLazy = lazy(retryImport(() => import('./OrgPanelSheet')));

export default function GangShell({ membership }) {
  const ms = membership || {};
  const official = useOfficialSeat(ms);
  const cityHq = useContext(CityHqContext);
  const initialHq = useContext(InitialHqContext);
  const [hq, setHq] = useState(initialHq === 'gang' || initialHq === 'intel' ? initialHq : null); // null | 'gang' | 'intel'
  // v157.4: şehrin içindeyken karargaha girmek şehirden çıkarır (App karargahı açar)
  const open = (o) => (cityHq ? cityHq.enterHq(o) : setHq(o));
  const close = useCallback(() => setHq(null), []);
  return (
    <div className="gx-shell gx-shell-list">
      <div className="gx-shell-body">
        <div className="gx-page gx-watch-row">
          <WatchWarsButton />
        </div>
        <ListTab membership={ms} official={official} onOpen={open} />
      </div>
      {hq && (
        <Suspense fallback={<div className="gx-loading gx-hq-loading">Karargaha giriliyor…</div>}>
          {hq === 'gang' ? <GangHq gangId={ms.gangId} onExit={close} /> : <OrgPanelSheetLazy org="intel" onClose={close} />}
        </Suspense>
      )}
    </div>
  );
}

function HqFail({ onDone }) {
  useEffect(() => {
    onDone?.();
  }, [onDone]);
  return null;
}

// v39: adına oylama sürerken yetkiler en alt rütbeye iner — neden butonların kapalı olduğunu göster
function UnderVoteBanner({ until, low }) {
  return (
    <div className="gx-undervote">
      <span className="gx-undervote-icon">🗳️</span>
      <span className="gx-undervote-text">
        Adına oylama var · yetkin <b>{low}</b> · oylamayı Savaş sekmesinden izleyebilirsin
      </span>
      <Deadline untilMs={until} />
    </div>
  );
}

function OrgHeader({ logo, name, rank, prestige, kasa, kasaMidnight = false, intel = false, sub, salary = null, noKasa = false }) {
  return (
    <div className={`gx-header${intel ? ' intel' : ''}`} style={{ '--gx-accent': logo?.color || '#19e8ff' }}>
      <Logo logo={logo} size={46} />
      <div className="gx-header-main">
        <div className="gx-header-name">{name}</div>
        <div className="gx-header-row">
          {rank && <RankBadge rank={rank} small />}
          {rank && <span className="gx-prestige">✦ {fmt(prestige)}</span>}
          {sub}
        </div>
      </div>
      {noKasa ? null : salary != null ? (
        // v108: Polis Teşkilatının kasası yok — maaşı devlet öder (her gece 00:00)
        <div className="gx-header-kasa">
          <span className="dim">Maaş · 00:00</span>
          <Gold value={salary} />
        </div>
      ) : (
        <div className="gx-header-kasa">
          <span className="dim">Kasa{kasaMidnight && <span className="gx-midnight-chip">🕛 00:00</span>}</span>
          <Gold value={kasa} />
        </div>
      )}
    </div>
  );
}

export function GangViews({ membership, official = null, tab, onOpen }) {
  const d = useGangData(membership);
  if (tab === 'ceteler') return <ListTab membership={membership} official={official} onOpen={onOpen} />;
  if (!d.gang) return <div className="gx-loading">Yükleniyor…</div>;
  if (d.gang.status !== 'active') return <div className="gx-loading">Bu çete dağıldı.</div>;
  return (
    <div className="gx-page">
      <OrgHeader
        logo={d.gang.logo}
        name={d.gang.name}
        rank={d.realRank}
        prestige={d.me?.prestige}
        kasa={d.kasaShown}
        kasaMidnight={!d.kasaLive}
        sub={d.gang.biat?.name ? <BiatTag name={d.gang.biat.name} logo={d.gang.biat.logo} /> : null}
      />
      {d.underVote && <UnderVoteBanner until={d.underVoteUntilMs} low="Çömez" />}
      {tab === 'sohbet' && <ChatTab org="gang" d={d} />}
      {tab === 'savas' && <WarsTab org="gang" d={d} />}
      {tab === 'ticaret' && <TradeTab d={d} />}
      {tab === 'cetem' && <CetemTab d={d} />}
    </div>
  );
}

export function IntelViews({ membership, official = null, tab, onOpen }) {
  const d = useIntelData(membership, { official });
  const rates = useBelediyeRates(); // v127: polis maaşları Teşkilat Bakanlığı'nın
  if (tab === 'ceteler') return <ListTab membership={membership} official={official} onOpen={onOpen} />;
  if (official) {
    return (
      <div className="gx-page">
        <OrgHeader intel logo={INTEL_LOGO} name={INTEL_NAME} rank={null} noKasa sub={<span className="gx-codename">🏛️ Yetkili · {official.title}</span>} />
        {tab === 'sohbet' && <ChatTab org="intel" d={d} />}
        {tab === 'savas' && <WarsTab org="intel" d={d} />}
        {tab === 'operasyon' && <OpsTab d={d} />}
        {tab === 'istihbarat' && <IntelTab d={d} />}
      </div>
    );
  }
  return (
    <div className="gx-page">
      {d.underVote && <UnderVoteBanner until={d.underVoteUntilMs} low="Polis Memuru" />}
      <OrgHeader intel logo={INTEL_LOGO} name={INTEL_NAME} rank={d.rank} prestige={d.me?.prestige} salary={policeSalary(rates, d.realRank || 'muhbir')} sub={<span className="gx-codename">🪪 {d.me?.codeName || membership.intelCodeName}</span>} />
      {tab === 'sohbet' && <ChatTab org="intel" d={d} />}
      {tab === 'savas' && <WarsTab org="intel" d={d} />}
      {tab === 'operasyon' && <OpsTab d={d} />}
      {tab === 'istihbarat' && <IntelTab d={d} />}
    </div>
  );
}
