import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useOpenHeistPlans } from '../../hooks/useOpenHeistPlans';
import { useHeistPlanParticipants } from '../../hooks/useHeistPlanParticipants';
import { useWeapons } from '../../hooks/useWeapons';
import { useMyActiveHeistPlans, noteMyHeistPlan } from '../../hooks/useMyActiveHeistPlan';
import {
  attemptHeist,
  createHeistPlan,
  joinHeistPlan,
  leaveHeistPlan,
  kickFromHeistPlan,
  cancelHeistPlan,
  executeHeistPlan,
  refreshHeistPlanParticipants,
  updateHeistPlanNote,
} from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ResultModal from '../ResultModal/ResultModal';
import { regionEmojis } from '../../data/regions';
import { INITIAL_LIFE_DAYS } from '../VehicleCard/VehicleCard';
import { heistCarOf, heistSceneOf, isVendorHeist } from './heistVideo';
import { holdNotifications } from '../../lib/notifHold'; // v160.7
import './HeistPanel.css';

// v154 — şehir dışında soygun videosu (şehir motorunu sadece video açılınca yükler)
const HeistVideo = lazy(() => import('../City/HeistVideo'));

// emoji: regions.js'teki TEK kaynaktan (regionEmojis) geliyor — yeni istek:
// "Soygun'daki tüm mekanları emojilerle görsel olarak daha iyi hale
// getireceğiz, her mekanın bi emojisi olsun".
export const HEIST_LABELS = {
  // v154 — yeni tablo (functions/index.js HEIST_CONFIG ile AYNI olmalı). Modifiye Garajı çıktı.
  banka: { title: 'Banka Soygunu', emoji: regionEmojis.banka, requiredPower: 100000, reward: 500000, suspicionCost: 50 },
  casino: { title: 'Casino Soygunu', emoji: regionEmojis.casino, requiredPower: 80000, reward: 250000, suspicionCost: 40 },
  araba_galerisi: { title: 'Galeri Soygunu', emoji: regionEmojis.araba_galerisi, requiredPower: 60000, reward: 125000, suspicionCost: 30 },
  silah_magazasi: { title: 'Silahçı Soygunu', emoji: regionEmojis.silah_magazasi, requiredPower: 40000, reward: 50000, suspicionCost: 20 },
  fabrika: { title: 'Fabrika Soygunu', emoji: regionEmojis.fabrika, requiredPower: 20000, reward: 25000, suspicionCost: 15 },
  internet_kafe: { title: 'İnternet Kafe Soygunu', emoji: regionEmojis.internet_kafe, requiredPower: 10000, reward: 10000, suspicionCost: 10 },
  seyyar_satici_6: { title: 'Dondurmacıya Haraç', emoji: regionEmojis.seyyar_satici_6, requiredPower: 7500, reward: 7000, suspicionCost: 5 },
  seyyar_satici_5: { title: 'Midyeciye Haraç', emoji: regionEmojis.seyyar_satici_5, requiredPower: 6000, reward: 6000, suspicionCost: 5 },
  seyyar_satici_1: { title: 'Kokoreçciye Haraç', emoji: regionEmojis.seyyar_satici_1, requiredPower: 4500, reward: 5000, suspicionCost: 5 },
  seyyar_satici_2: { title: 'Simitçiye Haraç', emoji: regionEmojis.seyyar_satici_2, requiredPower: 3000, reward: 4000, suspicionCost: 5 },
  seyyar_satici_3: { title: 'Balık Ekmekçiye Haraç', emoji: regionEmojis.seyyar_satici_3, requiredPower: 1500, reward: 3000, suspicionCost: 5 },
  seyyar_satici_4: { title: 'Köfteciye Haraç', emoji: regionEmojis.seyyar_satici_4, requiredPower: 1000, reward: 2000, suspicionCost: 5 },
};


const fmtGold = (n) => Number(n || 0).toLocaleString('tr-TR');

function resultMessage(res) {
  if (!res.started) {
    if (res.reason === 'insufficient_power') {
      return `Bu iş için gücün yetmiyor (gereken: ${fmtGold(res.requiredPower)}). Kimse seni fark etmedi — aşağıdan bir ekip kurabilirsin.`;
    }
    return 'Soygun başlamadı.';
  }
  // tek başına soygun
  if (res.reward !== undefined) {
    if (res.caught) {
      const fine = fmtGold(res.penalty ?? res.reward);
      return res.policeDoubled
        ? `🚨 Yakalandın! Rozet seni kurtarmadı, ceza 2 katı: ${fine} altın borcuna yazıldı.`
        : `🚨 Yakalandın! ${fine} altın ceza borcuna yazıldı.`;
    }
    return `💰 İş tamam! ${fmtGold(res.reward)} altın cebinde.`;
  }
  // viaPoliceTrap — bu sonucu SADECE tuzağı kuran polis görür (executeHeistPlan'ı
  // sadece plan kurucusu çağırır). policeOnly — ekibin tamamı polisti: gerçek soygun.
  if (res.policeOnly && res.caughtBySuspicion) {
    return `🚨 Yakalandınız! Rozetiniz sizi kurtarmadı, ceza 2 katı: kişi başı ${fmtGold(res.policePenalty)} altın borcunuza yazıldı.`;
  }
  if (res.busted && res.viaPoliceTrap) {
    return res.policeShare != null
      ? `🚔 Tuzak işe yaradı! Suçlular yakalandı, ${fmtGold(res.totalReward)} altın kurtarıldı. Payın: ${fmtGold(res.policeShare)} altın.`
      : `🚔 Tuzak işe yaradı! Suçlular yakalandı, ${fmtGold(res.totalReward)} altın kurtarıldı. Payın SMS ile geldi.`;
  }
  if (res.busted) {
    return '🚔 Ekipte gizli bir polis varmış! Hepiniz yakalandınız, payına düşen ceza borcuna yazıldı.';
  }
  if (res.caughtBySuspicion && res.viaPoliceTrap) {
    return 'Suçlular sen harekete geçemeden kendi dikkatsizliklerinden yakalandı. Bu sefer ödül yok.';
  }
  if (res.caughtBySuspicion) {
    return '🚨 Ekipten biri fazla dikkat çekti, polis hepinizi yakaladı. Payına düşen ceza borcuna yazıldı.';
  }
  return `💰 İş tamam! ${fmtGold(res.totalReward)} altın ekip arasında bölüşüldü.`;
}

function isResultSuccess(res) {
  if (!res.started) return null; // nötr — modal açılmaz
  if (res.reward !== undefined) return !res.caught;
  if (res.busted) return res.viaPoliceTrap ? true : false;
  if (res.caughtBySuspicion) return false;
  return true;
}

function resultTitle(res) {
  const success = isResultSuccess(res);
  if (res.busted && res.viaPoliceTrap) return 'Tuzak Başarılı! 🚔';
  if (res.caughtBySuspicion && res.viaPoliceTrap) return 'Tuzak Boşa Çıktı';
  if (success === true) return 'Soygun Başarılı! 🎉';
  if (success === false) return 'Yakalandın! 🚨';
  return 'Soygun Başlamadı';
}

function suspicionClass(s) {
  if (s > 50) return 'heist-suspicion-high';
  if (s > 20) return 'heist-suspicion-mid';
  return 'heist-suspicion-low';
}


// v154 — ekip üyeleri plan belgesinde (memberUids) → "benim ekibim" ilk görüntüde belli
const isMyPlan = (p, uid, myPlanIds) => p.creatorUid === uid || (Array.isArray(p.memberUids) && p.memberUids.includes(uid)) || myPlanIds.has(p.id);
const isVendorTarget = (t) => String(t || '').startsWith('seyyar_satici');
// sunucu captureRiskPercent ile aynı: şüphe yüzdesi, en az %1
const riskOf = (sus) => Math.max(1, Math.min(100, Math.round(Number(sus) || 0)));
const nf = (n) => Number(n || 0).toLocaleString('tr-TR');
const short = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3).toLocaleString('tr-TR')}B`;
  return nf(v);
};

// v154 — sade ekip kartı: avatarlar (güçleriyle), toplam güç çubuğu, tek satır buton
function PlanCard({ plan, myUid, onChanged, mine, runner }) {
  const { participants } = useHeistPlanParticipants(plan.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [noteDraft, setNoteDraft] = useState(plan.note || '');
  const [noteBusy, setNoteBusy] = useState(false);
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    if (!editingNote) setNoteDraft(plan.note || '');
  }, [plan.note, editingNote]);

  // Katılımcıların güç/şüphe değerleri (katılma anındaki kopya) kart görünürken tazelenir
  useEffect(() => {
    refreshHeistPlanParticipants(plan.id).catch(() => {});
    const id = setInterval(() => {
      if (!document.hidden) refreshHeistPlanParticipants(plan.id).catch(() => {});
    }, 45000);
    return () => clearInterval(id);
  }, [plan.id]);

  const totalPower = participants.reduce((sum, p) => sum + (p.weaponPower || 0), 0);
  const isMember = mine || participants.some((p) => p.uid === myUid);
  const isCreator = plan.creatorUid === myUid;
  const required = HEIST_LABELS[plan.target]?.requiredPower || 0;
  const ready = required > 0 && totalPower >= required;
  useEffect(() => {
    if (participants.some((p) => p.uid === myUid)) noteMyHeistPlan(plan.id, plan.target, true);
  }, [participants, myUid, plan.id, plan.target]);

  const run = async (fn, mineAfter) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (mineAfter !== undefined) noteMyHeistPlan(plan.id, plan.target, mineAfter);
      onChanged?.(res?.data, Boolean(res?.played));
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };
  const saveNote = async () => {
    setNoteBusy(true);
    try {
      await updateHeistPlanNote(plan.id, noteDraft.trim());
      setEditingNote(false);
    } catch (err) {
      setError(err.message || 'Not kaydedilemedi.');
    } finally {
      setNoteBusy(false);
    }
  };

  // kurucu her zaman ilk sırada
  const slots = [...participants].sort((a, b) => Number(b.uid === plan.creatorUid) - Number(a.uid === plan.creatorUid));
  while (slots.length < 4) slots.push(null);
  return (
    <div className={`hp2-team${isMember ? ' mine' : ''}${ready ? ' ready' : ''}`}>
      {isMember && <span className="hp2-team-tag">{isCreator ? '👑 Ekibin' : '🤝 Ekibin'}</span>}
      <div className="hp2-crew">
        {slots.map((p, i) =>
          p ? (
            <div key={p.uid} className={`hp2-mem${p.uid === plan.creatorUid ? ' lead' : ''}`}>
              <span className="hp2-av">
                <AvatarSvg avatar={p.avatar} size={40} rounded />
                {p.uid === plan.creatorUid && <i>👑</i>}
                {isCreator && p.uid !== myUid && (
                  <button className="hp2-kick" disabled={busy} onClick={() => run(() => kickFromHeistPlan(plan.id, p.uid))} aria-label="Çıkar">
                    ✕
                  </button>
                )}
              </span>
              <b>{p.displayName}</b>
              <small>
                ⚔️{short(p.weaponPower)} · <span className={`hp2-sus ${suspicionClass(p.suspicion || 0)}`}>🕵️{Math.round(p.suspicion || 0)}</span>
              </small>
            </div>
          ) : (
            <div key={`e${i}`} className="hp2-mem empty">
              <span className="hp2-av">+</span>
            </div>
          )
        )}
      </div>
      <div className="hp2-bar">
        <i style={{ width: `${Math.min(100, required > 0 ? (totalPower / required) * 100 : 0)}%` }} />
        <span>
          ⚔️ {nf(totalPower)} / {nf(required)}
        </span>
      </div>
      {(plan.note || editingNote) && !editingNote && (
        <p className="hp2-note" onClick={() => isMember && setEditingNote(true)}>
          📝 {plan.note}
        </p>
      )}
      {editingNote && (
        <div className="hp2-note-edit">
          <input maxLength={200} placeholder="Ekibe kısa not…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} autoFocus />
          <button disabled={noteBusy} onClick={saveNote}>
            {noteBusy ? '…' : '✓'}
          </button>
          <button
            disabled={noteBusy}
            onClick={() => {
              setNoteDraft(plan.note || '');
              setEditingNote(false);
            }}
          >
            ✕
          </button>
        </div>
      )}
      <div className="hp2-acts">
        {!isMember && (
          <button className="hp2-btn go" disabled={busy || participants.length >= 4} onClick={() => run(() => joinHeistPlan(plan.id), true)}>
            {participants.length >= 4 ? 'Dolu' : '🤝 Katıl'}
          </button>
        )}
        {isCreator && (
          <button
            className={`hp2-btn${ready ? ' go pulse' : ''}`}
            disabled={busy || !ready}
            // v154: ekibi kuran başlatır → videoyu SADECE o izler (ekip kartındaki avatarlar, kurucu önde)
            onClick={() => run(() => runner(() => executeHeistPlan(plan.id), { target: plan.target, crew: slots.filter(Boolean).map((p) => ({ name: p.displayName, avatar: p.avatar })) }), false)}
          >
            {ready ? '💰 BAŞLAT' : 'Güç yetmiyor'}
          </button>
        )}
        {isMember && !plan.note && !editingNote && (
          <button className="hp2-btn icon" onClick={() => setEditingNote(true)} aria-label="Not">
            📝
          </button>
        )}
        {isMember && !isCreator && (
          <button className="hp2-btn" disabled={busy} onClick={() => run(() => leaveHeistPlan(plan.id), false)}>
            Ayrıl
          </button>
        )}
        {isCreator && (
          <button className="hp2-btn icon danger" disabled={busy} onClick={() => run(() => cancelHeistPlan(plan.id), false)} aria-label="Planı sil">
            🗑️
          </button>
        )}
      </div>
      {error && <p className="heist-panel-error">{error}</p>}
    </div>
  );
}

// v153: onRun — şehirde haraç animasyonu için soygun çağrısını sarar (fn → sonuç)
// v154: sade panel — güç yetiyorsa ekipler hiç görünmez, tek büyük buton; yetmiyorsa
//       önce kendi ekibin (ilk görüntüde), sonra diğer ekipler. Şehirde ve Soygun sekmesinde AYNI.
export default function HeistPanel({ target, onRun = null }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const { plans, loading: plansLoading } = useOpenHeistPlans(target);
  const { weapons } = useWeapons();
  const myActivePlans = useMyActiveHeistPlans();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [videoJob, setVideoJob] = useState(null);
  const videoDone = useRef(null);

  // v154 — soygunu başlatan için video. Şehirde (onRun verilmiş) şehrin kendi motoru oynatır;
  // burada (Mekanlar › Soygun) tam ekran HeistVideo. Dönüş: { data, played }.
  // v160.7: video (ve sonuç kartı) bitene kadar üstten SMS bildirimi bekletilir — sonucu
  // önceden göstermesin, videonun Geç / ses düğmelerinin üstüne binmesin. SMS sonra gelir.
  const runner = async (fn, ctx) => {
    const release = holdNotifications();
    try {
      return await runVideo(fn, ctx);
    } finally {
      release();
    }
  };
  const runVideo = async (fn, ctx) => {
    if (onRun) {
      const r = await onRun(fn, ctx);
      return r && 'played' in r ? r : { data: r?.data, played: false };
    }
    const canVideo = isVendorHeist(ctx.target) || Boolean(heistSceneOf(ctx.target));
    if (!canVideo) {
      const r = await fn();
      return { data: r?.data, played: false };
    }
    const promise = fn(); // sonuç butona basıldığı an sunucuda belli olur
    const car = heistCarOf(user?.uid);
    return new Promise((resolve, reject) => {
      videoDone.current = ({ data, error: e, played }) => {
        setVideoJob(null);
        if (e) reject(e);
        else resolve({ data, played });
      };
      setVideoJob({ target: ctx.target, crew: ctx.crew, ...car, promise });
    });
  };

  if (!user) return null;
  const meta = HEIST_LABELS[target];
  if (!meta) return <p className="hp-note">Bu mekân artık soyulamıyor.</p>;
  const vendor = isVendorTarget(target);
  const done = Boolean(actions.heist?.[target]) || Boolean(actions.vendorPurchases?.[target]);
  const donated = Boolean(actions.vendorPurchases?.[target]) && !actions.heist?.[target];
  // ömrü bitmiş / satışa çıkmış silah sayılmaz (sunucu getMaxWeaponPower ile aynı)
  const myPower = weapons.reduce((max, w) => (!w.listed && (w.lifeDays ?? INITIAL_LIFE_DAYS) > 0 ? Math.max(max, w.power || 0) : max), 0);
  const sus = Math.round(Number(player?.suspicion || 0));
  const crimeLocked = sus >= 50; // sunucu: CRIME_SUSPICION_LOCK
  const official = Boolean(player?.belediyeSeat); // belediye görevlisi soygun yapamaz
  const canSolo = myPower >= meta.requiredPower;
  const myPlanIds = new Set(myActivePlans.filter((p) => p.target === target).map((p) => p.planId));
  const mineOf = (p) => isMyPlan(p, user.uid, myPlanIds);
  const myPlans = plans.filter(mineOf);
  const otherPlans = plans.filter((p) => !mineOf(p));
  const inTeamHere = myPlans.length > 0 || myPlanIds.size > 0;
  const pw = Math.min(100, meta.requiredPower > 0 ? (myPower / meta.requiredPower) * 100 : 0);
  const verb = vendor ? 'HARAÇ KES' : 'SOYGUNU YAP';

  const handleAttempt = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const me = [{ name: player?.displayName || 'Sen', avatar: player?.avatar || null }];
      const res = await runner(() => attemptHeist(target), { target, crew: me });
      setResult(res.data ? { ...res.data, _played: res.played } : null);
    } catch (err) {
      setError(err.message || 'Soygun başarısız.');
    } finally {
      setBusy(false);
    }
  };
  const handleCreatePlan = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createHeistPlan(target);
      if (res?.data?.planId) noteMyHeistPlan(res.data.planId, target, true);
    } catch (err) {
      setError(err.message || 'Plan oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  // durum satırı (kısa): neden yapılamıyor
  let block = null;
  if (official) block = '🏛️ Belediye görevlileri soygun yapamaz';
  else if (done) block = donated ? '✅ Bugün buraya bağış yaptın' : vendor ? '✅ Bugün haraç kestin' : '✅ Bugün burayı soydun';
  else if (crimeLocked) block = '⛔ Şüphen 50+ · önce şüpheni düşür';

  return (
    <div className={`heist-panel hp2${vendor ? ' vendor' : ''}`}>
      <div className="hp2-hero">
        <div className="hp2-em">{meta.emoji}</div>
        <div className="hp2-hero-txt">
          <h2>{meta.title}</h2>
          <div className="hp2-chips">
            <span className="hp2-chip gold">
              💰 {nf(meta.reward)} <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
            </span>
            <span className="hp2-chip sus">🕵️ +{meta.suspicionCost}</span>
            {canSolo && !block && <span className={`hp2-chip risk${riskOf(sus) >= 20 ? ' hi' : ''}`}>🚨 %{riskOf(sus)}</span>}
          </div>
        </div>
      </div>
      <div className={`hp2-power${canSolo ? ' ok' : ''}`}>
        <div className="hp2-bar">
          <i style={{ width: `${pw}%` }} />
          <span>
            ⚔️ {nf(myPower)} / {nf(meta.requiredPower)}
          </span>
        </div>
        <em>{canSolo ? 'Gücün yetiyor' : 'Ekip gerekli'}</em>
      </div>

      {block && <p className="hp2-block">{block}</p>}

      {canSolo && !block && (
        <button className={`hp2-cta${busy ? ' busy' : ''}`} disabled={busy} onClick={handleAttempt}>
          {busy ? (vendor ? 'Haraç kesiliyor…' : 'Soyuluyor…') : `💰 ${verb}`}
        </button>
      )}

      {error && <p className="heist-panel-error">{error}</p>}

      {result && result.started && !result._played && (
        <ResultModal title={resultTitle(result)} message={resultMessage(result)} tone={isResultSuccess(result) ? 'success' : 'fail'} onClose={() => setResult(null)} />
      )}
      {result && !result.started && <p className="hp2-block">{resultMessage(result)}</p>}
      {/* video oynadıysa kısa sonuç satırı (ayrıntı videonun sonunda göründü) */}
      {result && result.started && result._played && <p className={`hp2-block ${isResultSuccess(result) ? 'ok' : 'bad'}`}>{resultMessage(result)}</p>}
      {videoJob && (
        <Suspense fallback={<div className="hs-root hv-root" />}>
          <HeistVideo job={videoJob} onClose={(r) => videoDone.current?.(r)} />
        </Suspense>
      )}

      {/* güç yetmiyorsa ekipler; güç yetiyorsa sadece (varsa) bu hedefteki kendi ekibin */}
      {(!canSolo || myPlans.length > 0) && (
        <div className="hp2-teams">
          {myPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} myUid={user.uid} mine runner={runner} onChanged={(data, played) => data && setResult({ ...data, _played: played })} />
          ))}
          {!canSolo && !inTeamHere && !done && !official && (
            <button className="hp2-cta sec" disabled={busy} onClick={handleCreatePlan}>
              👥 EKİP KUR
            </button>
          )}
          {!canSolo && otherPlans.length > 0 && <p className="hp2-sub">Açık ekipler · {otherPlans.length}</p>}
          {!canSolo &&
            otherPlans.map((plan) => <PlanCard key={plan.id} plan={plan} myUid={user.uid} runner={runner} onChanged={(data, played) => data && setResult({ ...data, _played: played })} />)}
          {!canSolo && !plansLoading && plans.length === 0 && <p className="hp2-empty">Henüz ekip yok — ilk ekibi sen kur.</p>}
        </div>
      )}
    </div>
  );
}
