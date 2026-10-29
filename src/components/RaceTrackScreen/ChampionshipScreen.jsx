import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useChampionshipBoard } from '../../hooks/useChampionshipBoard';
import { createChampionshipRace } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { INITIAL_LIFE_DAYS, vehicleDisplayName } from '../VehicleCard/VehicleCard';
import InfoIcon from '../InfoIcon/InfoIcon';
import { CarStatBars, CarThumb, LevelPips, vehicleRaceLevel } from './CarStats';
import { fmtRace } from './timeAttackGame';
import {
  CHAMP_PRIZE_TIERS,
  CHAMP_BOARD_SHOW,
  championshipTierIndex,
  rankChampionshipBoard,
} from '../../../functions/championshipPrizes.js';
import './RaceTrackScreen.css';
import './ChampionshipScreen.css';

// =============================================================================
// v128 — Şampiyona (yeni sistem)
//   1) Arabalarım: her MODELDEN günde 1 giriş — aynı modelden birden fazla
//      araban varsa sadece en yüksek seviyelisi listelenir (v129). Katılan
//      model listeden kalkar.
//   2) Ödül süreye göre, yarış biter bitmez (ödül merdiveni üstte).
//   3) Günün en hızlı 10'u (00:00'da yenilenir) + tüm zamanların en iyi 10'u.
// =============================================================================
const RULES_TEXT =
  'Her araba modeliyle günde 1 kez yarışırsın; aynı modelden birden fazla araban varsa en yüksek seviyelisi yarışır. Pisti ne kadar hızlı bitirirsen o kadar altın kazanırsın; ödül yarış biter bitmez hesabına yatar. Yarıştan erken çıkarsan o arabanın bugünkü hakkı yanar.';
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const short = (n) => (n >= 1000 ? `${fmt(n / 1000)}B` : fmt(n));
const catalogName = (id) => vehicleCatalog.find((c) => c.id === Number(id))?.name || '';
const MEDAL = ['🥇', '🥈', '🥉'];

// "25 sn altı", "25–26 sn" … "55–60 sn"
function tierLabel(i) {
  const hi = Math.round(CHAMP_PRIZE_TIERS[i][0] / 1000);
  if (i === 0) return `<${hi} sn`;
  const lo = Math.round(CHAMP_PRIZE_TIERS[i - 1][0] / 1000);
  return `${lo}–${hi === 60 ? 60 : hi}`;
}

function untilMidnight() {
  const now = new Date(Date.now());
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const next = new Date(ist);
  next.setHours(24, 0, 0, 0);
  const ms = next - ist;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} sa ${String(m).padStart(2, '0')} dk`;
}
function useMidnightCountdown() {
  const [txt, setTxt] = useState(untilMidnight);
  useEffect(() => {
    const t = setInterval(() => setTxt(untilMidnight()), 30_000);
    return () => clearInterval(t);
  }, []);
  return txt;
}

// Ödül merdiveni: hızlandıkça sütun yükselir, altın büyür. Bugünkü en iyi
// sürenin kademesi parlar.
function PrizeLadder({ highlight }) {
  const ref = useRef(null);
  // en yavaş kademe solda, en hızlı sağda (soldan sağa "hızlan")
  const tiers = CHAMP_PRIZE_TIERS.map((t, i) => ({ i, prize: t[1] })).reverse();
  const maxLog = Math.log10(CHAMP_PRIZE_TIERS[0][1]);
  const minLog = Math.log10(CHAMP_PRIZE_TIERS[CHAMP_PRIZE_TIERS.length - 1][1]);
  useEffect(() => {
    // kendi kademen görünsün
    if (highlight < 0 || !ref.current) return;
    const el = ref.current.querySelector('.cl-step.me');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [highlight]);
  return (
    <div className="cl-ladder-wrap">
      <div className="cl-ladder-axis">
        <span>🐢 yavaş</span>
        <span className="cl-ladder-arrow" aria-hidden="true" />
        <span>hızlı ⚡</span>
      </div>
      <div className="cl-ladder" ref={ref}>
        {tiers.map(({ i, prize }) => {
          const h = 22 + ((Math.log10(prize) - minLog) / (maxLog - minLog)) * 78;
          return (
            <div key={i} className={`cl-step${i === highlight ? ' me' : ''}${i === 0 ? ' top' : ''}`}>
              <span className="cl-step-prize">{short(prize)}</span>
              <span className="cl-step-bar" style={{ height: `${h}%` }}>
                {i === highlight && <span className="cl-step-you">SEN</span>}
              </span>
              <span className="cl-step-time">{tierLabel(i)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardRow({ rank, e, me, showDate }) {
  return (
    <div className={`cl-row${me ? ' me' : ''}${rank <= 3 ? ` p${rank}` : ''}`}>
      <span className="cl-rank">{rank <= 3 ? MEDAL[rank - 1] : rank}</span>
      <span className="cl-who">
        <b>{me ? 'SEN' : e.name || 'Oyuncu'}</b>
        <em>
          {e.vehicleModel || catalogName(e.catalogId)}
          {showDate && e.dateKey ? ` · ${e.dateKey.split('-').reverse().slice(0, 2).join('.')}` : ''}
        </em>
      </span>
      <span className="cl-time">{fmtRace(e.timeMs)}</span>
      <span className={`cl-prize${e.prize > 0 ? '' : ' none'}`}>{e.prize > 0 ? `+${fmt(e.prize)}` : '—'}</span>
    </div>
  );
}

function Board({ icon, title, chip, rows, myUid, myRank, myEntry, empty, showDate }) {
  const top = rows.slice(0, CHAMP_BOARD_SHOW);
  const pinMe = myEntry && myRank > CHAMP_BOARD_SHOW;
  return (
    <section className="cl-board">
      <header className="cl-board-head">
        <span className="cl-board-title">
          <span aria-hidden="true">{icon}</span> {title}
        </span>
        <span className="cl-chip">{chip}</span>
      </header>
      {pinMe && (
        <>
          <BoardRow rank={myRank} e={myEntry} me />
          <div className="cl-gap" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </>
      )}
      {top.length === 0 ? (
        <div className="cl-empty">
          <span aria-hidden="true">🏁</span>
          {empty}
        </div>
      ) : (
        top.map((e, idx) => <BoardRow key={e.uid} rank={idx + 1} e={e} me={e.uid === myUid} showDate={showDate} />)
      )}
    </section>
  );
}

function CarCard({ v, busy, disabled, onJoin }) {
  const level = vehicleRaceLevel(v);
  const lifeDays = v.lifeDays ?? INITIAL_LIFE_DAYS;
  const seized = Boolean(v.seizedByBank);
  const dead = !(lifeDays > 0);
  const img = vehicleCatalog.find((c) => c.id === v.catalogId)?.image;
  const block = seized ? '🏦 Bankada' : dead ? '🔧 Tamir gerekli' : null;
  return (
    <div className={`cl-car${block ? ' blocked' : ''}`}>
      <div className="cl-car-pic">{img ? <img src={img} alt="" /> : <CarThumb catalogId={v.catalogId} />}</div>
      <div className="cl-car-body">
        <div className="cl-car-name">
          <b>{vehicleDisplayName(v) || catalogName(v.catalogId)}</b>
          <LevelPips level={level} />
        </div>
        <CarStatBars catalogId={v.catalogId} level={level} compact />
        <button type="button" className="cl-join" disabled={Boolean(block) || disabled} onClick={() => onJoin(v)}>
          {busy ? 'Hazırlanıyor…' : block || (
            <>
              <span aria-hidden="true">🏁</span> Şampiyonaya Katıl
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ChampionshipScreen({ onEnterRace }) {
  const { user } = useAuth();
  const myUid = user?.uid;
  const { vehicles, loading: vLoading } = useVehicles();
  const { todayKey, today, allTime } = useChampionshipBoard();
  const countdown = useMidnightCountdown();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  // v129: her modelden tek araba — en yüksek seviyeli (yarışabilir olan öncelikli).
  // O modelle bugün yarışıldıysa model listeden kalkar.
  const { actions } = useDailyActions();
  const owned = useMemo(() => {
    const byModel = new Map();
    const raceable = (v) => !v.seizedByBank && (v.lifeDays ?? INITIAL_LIFE_DAYS) > 0;
    for (const v of vehicles) {
      if (v.listed) continue;
      const cur = byModel.get(v.catalogId);
      const better =
        !cur ||
        Number(raceable(v)) - Number(raceable(cur)) > 0 ||
        (raceable(v) === raceable(cur) && vehicleRaceLevel(v) > vehicleRaceLevel(cur));
      if (better) byModel.set(v.catalogId, v);
    }
    return [...byModel.values()];
  }, [vehicles]);
  const raced = (v) => v.champDay === todayKey || Boolean(actions?.[`championship_${v.catalogId}`]) || vehicles.some((x) => x.catalogId === v.catalogId && x.champDay === todayKey);
  const ready = useMemo(
    () => owned.filter((v) => !raced(v)).sort((a, b) => (b.catalogId || 0) - (a.catalogId || 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owned, todayKey, actions, vehicles]
  );
  const racedCount = owned.length - ready.length;

  const todayRows = useMemo(() => rankChampionshipBoard(today?.entries), [today]);
  const myTodayIdx = todayRows.findIndex((e) => e.uid === myUid);
  const myToday = myTodayIdx >= 0 ? todayRows[myTodayIdx] : null;
  const earnedToday = Number(today?.paidBy?.[myUid] || 0);
  const allRows = useMemo(() => (Array.isArray(allTime?.top) ? allTime.top.filter((e) => e && e.uid && e.timeMs > 0) : []), [allTime]);

  const handleJoin = async (vehicle) => {
    setBusyId(vehicle.id);
    setError(null);
    try {
      const res = await createChampionshipRace(vehicle.id);
      if (res?.data?.roomId) onEnterRace(res.data.roomId, { expand: true }); // v121: yarış ekranı hemen açılır
    } catch (err) {
      setError(err.message || 'Şampiyonaya katılamadın.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="race-screen cl-screen">
      <div className="cl-hero">
        <div className="cl-hero-top">
          <span className="cl-hero-title">
            🏆 Şampiyona <InfoIcon text={RULES_TEXT} />
          </span>
          <span className={`cl-earned${earnedToday > 0 ? ' on' : ''}`} title="Bugün şampiyonadan kazandığın">
            <em>Bugün</em>
            <b>💰 {fmt(earnedToday)}</b>
          </span>
        </div>
        <PrizeLadder highlight={myToday ? championshipTierIndex(myToday.timeMs) : -1} />
      </div>

      {error && <p className="race-error">{error}</p>}

      <section className="cl-garage">
        <header className="cl-board-head">
          <span className="cl-board-title">
            <span aria-hidden="true">🚘</span> Arabaların
          </span>
          {owned.length > 0 && (
            <span className="cl-tickets" title="Bugün kalan giriş hakkı">
              {owned.map((v, i) => (
                <i key={v.id} className={i < racedCount ? 'used' : ''} />
              ))}
              <b>
                {ready.length}/{owned.length}
              </b>
            </span>
          )}
        </header>
        {vLoading ? null : owned.length === 0 ? (
          <div className="cl-empty big">
            <span aria-hidden="true">🅿️</span>
            Garajın boş — galeriden bir araba al, pist seni bekliyor.
          </div>
        ) : ready.length === 0 ? (
          <div className="cl-empty big done">
            <span aria-hidden="true">✅</span>
            Bugün bütün arabaların yarıştı
            <em>⏳ Yeni hak: {countdown}</em>
          </div>
        ) : (
          <div className="cl-cars">
            {ready.map((v) => (
              <CarCard key={v.id} v={v} busy={busyId === v.id} disabled={busyId !== null} onJoin={handleJoin} />
            ))}
          </div>
        )}
      </section>

      <Board
        icon="⚡"
        title="Günün En Hızlıları"
        chip={`🔄 ${countdown}`}
        rows={todayRows}
        myUid={myUid}
        myRank={myTodayIdx + 1}
        myEntry={myToday}
        empty="Bugün henüz kimse bitirmedi — ilk sen ol!"
      />

      <Board
        icon="👑"
        title="Tüm Zamanların En İyileri"
        chip="📌 Kalıcı"
        rows={allRows}
        myUid={myUid}
        myRank={0}
        myEntry={null}
        empty="Rekor kitabı boş — ilk rekoru sen yaz."
        showDate
      />
    </div>
  );
}
