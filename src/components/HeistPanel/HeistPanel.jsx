import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useOpenHeistPlans } from '../../hooks/useOpenHeistPlans';
import { useHeistPlanParticipants } from '../../hooks/useHeistPlanParticipants';
import { useWeapons } from '../../hooks/useWeapons';
import { useMyActiveHeistPlans } from '../../hooks/useMyActiveHeistPlan';
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
import './HeistPanel.css';

// emoji: regions.js'teki TEK kaynaktan (regionEmojis) geliyor — yeni istek:
// "Soygun'daki tüm mekanları emojilerle görsel olarak daha iyi hale
// getireceğiz, her mekanın bi emojisi olsun".
export const HEIST_LABELS = {
  banka: { title: 'Banka Soygunu', emoji: regionEmojis.banka, requiredPower: 100000, reward: 500000, suspicionCost: 50 },
  casino: { title: 'Casino Soygunu', emoji: regionEmojis.casino, requiredPower: 70000, reward: 250000, suspicionCost: 40 },
  araba_galerisi: {
    title: 'Galeri Soygunu',
    emoji: regionEmojis.araba_galerisi,
    requiredPower: 50000,
    reward: 125000,
    suspicionCost: 30,
  },
  modifiye_garaji: {
    title: 'Garaj Soygunu',
    emoji: regionEmojis.modifiye_garaji,
    requiredPower: 20000,
    reward: 25000,
    suspicionCost: 20,
  },
  fabrika: { title: 'Fabrika Soygunu', emoji: regionEmojis.fabrika, requiredPower: 10000, reward: 10000, suspicionCost: 10 },
  seyyar_satici_1: { title: 'Kokoreçciye Haraç', emoji: regionEmojis.seyyar_satici_1, requiredPower: 4500, reward: 4000, suspicionCost: 5 },
  seyyar_satici_2: { title: 'Simitçiye Haraç', emoji: regionEmojis.seyyar_satici_2, requiredPower: 3000, reward: 3000, suspicionCost: 5 },
  seyyar_satici_3: { title: 'Dönerciye Haraç', emoji: regionEmojis.seyyar_satici_3, requiredPower: 1500, reward: 2000, suspicionCost: 5 },
  seyyar_satici_4: { title: 'Köfteciye Haraç', emoji: regionEmojis.seyyar_satici_4, requiredPower: 1000, reward: 1000, suspicionCost: 5 },
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

// v79: şüphe her zaman tam değeriyle gösterilir (eskiden 0-20 arası "%0-20" yazıyordu).
function suspicionLabel(s) {
  return `%${Math.round(Number(s) || 0)}`;
}

function PlanCard({ plan, myUid, onChanged }) {
  const { participants } = useHeistPlanParticipants(plan.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [noteDraft, setNoteDraft] = useState(plan.note || '');
  const [noteBusy, setNoteBusy] = useState(false);
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    if (!editingNote) setNoteDraft(plan.note || '');
  }, [plan.note, editingNote]);

  const handleSaveNote = async () => {
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

  // Katılımcıların güç/şüphe değerleri plana KATILDIKLARI ANDA alınan
  // donmuş bir kopyaydı — güncel tutmak için, kart görünürken periyodik
  // olarak (ve açılır açılmaz bir kez) sunucudan tazeliyoruz.
  useEffect(() => {
    refreshHeistPlanParticipants(plan.id).catch(() => {});
    // v73 — maliyet: 15 sn → 45 sn (sunucu da plan başına 40 sn'de bir tazeler)
    const id = setInterval(() => {
      if (!document.hidden) refreshHeistPlanParticipants(plan.id).catch(() => {});
    }, 45000);
    return () => clearInterval(id);
  }, [plan.id]);

  const totalPower = participants.reduce((sum, p) => sum + (p.weaponPower || 0), 0);
  const isMember = participants.some((p) => p.uid === myUid);
  const isCreator = plan.creatorUid === myUid;
  const required = HEIST_LABELS[plan.target]?.requiredPower || 0;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      onChanged?.(res?.data);
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const creator = participants.find((p) => p.uid === plan.creatorUid);
  return (
    <div className={`heist-plan-card${isMember ? ' mine' : ''}`}>
      <div className="hp-plan-head">
        <b>👑 {creator?.displayName || 'Kurucu'}</b>
        <span>{participants.length}/4 kişi</span>
      </div>
      <div className="hp-plan-power">
        <div className="sg-meter">
          <i style={{ width: `${Math.min(100, required > 0 ? (totalPower / required) * 100 : 0)}%` }} />
        </div>
        <span className={totalPower >= required ? 'ok' : ''}>
          ⚔️ {totalPower.toLocaleString('tr-TR')} / {required.toLocaleString('tr-TR')}
        </span>
      </div>
      <ul className="heist-plan-members">
        {participants.map((p) => (
          <li key={p.uid}>
            <span className="heist-plan-member-name">
              <span className="hp-av">
                <AvatarSvg avatar={p.avatar} size={26} rounded />
              </span>
              <span className="hp-mem-txt">
                {p.displayName}
                <small>⚔️ {(p.weaponPower || 0).toLocaleString('tr-TR')}</small>
              </span>
            </span>
            <span className={`heist-suspicion-badge ${suspicionClass(p.suspicion || 0)}`}>🕵️ {suspicionLabel(p.suspicion || 0)}</span>
            {isCreator && p.uid !== myUid && (
              <button className="heist-plan-kick" disabled={busy} onClick={() => run(() => kickFromHeistPlan(plan.id, p.uid))} aria-label="Çıkar">
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="heist-plan-note">
        {editingNote ? (
          <>
            <textarea
              className="heist-plan-note-input"
              maxLength={200}
              placeholder="Örn: 'Şüphen düşmeden başlatma'…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="heist-plan-note-actions">
              <button
                className="heist-plan-btn"
                disabled={noteBusy}
                onClick={() => {
                  setNoteDraft(plan.note || '');
                  setEditingNote(false);
                }}
              >
                Vazgeç
              </button>
              <button className="heist-plan-btn primary" disabled={noteBusy} onClick={handleSaveNote}>
                {noteBusy ? '…' : 'Kaydet'}
              </button>
            </div>
          </>
        ) : (
          <div className="hp-note-row">
            <p className={`heist-plan-note-text${plan.note ? '' : ' muted'}`}>
              📝 {plan.note || 'Henüz not yok.'}
              {plan.note && plan.noteUpdatedBy && <span className="heist-plan-note-author"> — {plan.noteUpdatedBy}</span>}
            </p>
            {(isMember || isCreator) && (
              <button className="heist-plan-note-edit-btn" onClick={() => setEditingNote(true)} aria-label="Not">
                ✏️
              </button>
            )}
          </div>
        )}
      </div>

      <div className="heist-plan-actions">
        {!isMember && (
          <button className="heist-plan-btn primary" disabled={busy || participants.length >= 4} onClick={() => run(() => joinHeistPlan(plan.id))}>
            {participants.length >= 4 ? 'Dolu' : '🤝 Katıl'}
          </button>
        )}
        {isMember && !isCreator && (
          <button className="heist-plan-btn" disabled={busy} onClick={() => run(() => leaveHeistPlan(plan.id))}>
            Ayrıl
          </button>
        )}
        {isCreator && (
          <button className="heist-plan-btn primary" disabled={busy || totalPower < required} onClick={() => run(() => executeHeistPlan(plan.id))}>
            {totalPower < required ? 'Güç yetersiz' : '💰 Başlat'}
          </button>
        )}
        {isCreator && (
          <button className="heist-plan-btn danger" disabled={busy} onClick={() => run(() => cancelHeistPlan(plan.id))}>
            Planı sil
          </button>
        )}
      </div>
      {error && <p className="heist-panel-error">{error}</p>}
    </div>
  );
}

export default function HeistPanel({ target }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const { plans } = useOpenHeistPlans(target);
  const { weapons } = useWeapons();
  const myActivePlans = useMyActiveHeistPlans();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showTeamForming, setShowTeamForming] = useState(false);

  if (!user) return null;

  const meta = HEIST_LABELS[target];
  const done = Boolean(actions.heist?.[target]) || Boolean(actions.vendorPurchases?.[target]);
  // KULLANICI REVİZESİ (BUG DÜZELTMESİ): ömrü (lifeDays) 0 olan bir silah —
  // tamir hakkı kalmış olsa bile — güç hesabına dahil edilmemeli. Ayrıca
  // 2. el sitesinde satılmış/satışa çıkarılmış (listed: true) bir silah da
  // artık fiilen elimizde değildir, onun da gücü sayılmamalı (bkz.
  // functions/index.js getMaxWeaponPower'daki aynı düzeltme — burası
  // ekranın sunucuyla TUTARLI göstermesi için).
  const myPower = weapons.reduce(
    (max, w) => (!w.listed && (w.lifeDays ?? INITIAL_LIFE_DAYS) > 0 ? Math.max(max, w.power || 0) : max),
    0
  );
  // v123: şüphe 50+ iken suç yok (sunucu: functions/policeRules.js CRIME_SUSPICION_LOCK)
  // v124: ekip kurmak / katılmak serbest; tek başına soygun ve ekip soygununu başlatmak yasak
  const crimeLocked = Number(player?.suspicion || 0) >= 50;
  const needsTeam = myPower < meta.requiredPower;
  // Kısıtlama HEDEFE ÖZEL: bu hedefte zaten bir ekibim varsa yeni bir
  // tane kuramam, ama başka hedeflerdeki ekiplerim bunu etkilemez.
  const alreadyInThisTarget = myActivePlans.some((p) => p.target === target);

  const handleAttempt = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await attemptHeist(target);
      setResult(res.data);
      if (!res.data.started && res.data.reason === 'insufficient_power') {
        setShowTeamForming(true);
      }
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
      await createHeistPlan(target);
    } catch (err) {
      setError(err.message || 'Plan oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  // ekibinde olduğum plan en üstte
  const myPlanIds = new Set(myActivePlans.map((p) => p.planId));
  const sortedPlans = [...plans].sort((a, b) => Number(myPlanIds.has(b.id)) - Number(myPlanIds.has(a.id)));
  const pw = Math.min(100, meta.requiredPower > 0 ? (myPower / meta.requiredPower) * 100 : 0);
  return (
    <div className="heist-panel">
      <div className="hp-hero">
        <div className="hp-big">{meta.emoji}</div>
        <h2>{meta.title}</h2>
        <div className="hp-gold">
          {meta.reward.toLocaleString('tr-TR')} <span className="gold-coin-icon" style={{ width: 22, height: 22 }} />
        </div>
        <small>olası ödül</small>
      </div>
      <div className="hp-stats">
        <div className="sg-st">
          <small>Gerekli güç</small>
          <b>⚔️ {meta.requiredPower.toLocaleString('tr-TR')}</b>
        </div>
        <div className="sg-st">
          <small>Götürdüğü şüphe</small>
          <b>🕵️ +{meta.suspicionCost}</b>
        </div>
      </div>
      <div className="sg-st">
        <small>
          Gücün {myPower.toLocaleString('tr-TR')} / {meta.requiredPower.toLocaleString('tr-TR')}
        </small>
        <div className="sg-meter big">
          <i style={{ width: `${pw}%` }} />
        </div>
      </div>

      {crimeLocked && !error && <p className="hp-note bad">⛔ Şüphen 50+ iken suç işleyemezsin. Ekip kurabilir, ekibe katılabilirsin ama soygun başlatılamaz.</p>}

      {needsTeam ? (
        alreadyInThisTarget ? (
          <p className="hp-note">✅ Bu hedefte ekibin var, aşağıdan yönet.</p>
        ) : (
          <button className="hp-cta sec" disabled={done || busy} onClick={handleCreatePlan}>
            👥 EKİP KUR
          </button>
        )
      ) : (
        <button className="hp-cta" disabled={done || busy || crimeLocked} onClick={handleAttempt}>
          {done ? (actions.vendorPurchases?.[target] ? 'Bugün buradan alışveriş yaptın' : 'Bugün zaten denedin') : busy ? 'Soyuluyor…' : '💰 SOYGUN YAP'}
        </button>
      )}

      {result && (
        <p className={`heist-panel-result ${result.started && !result.caught && !result.caughtBySuspicion && (!result.busted || result.viaPoliceTrap) ? 'success' : ''}`}>
          {resultMessage(result)}
        </p>
      )}
      {error && <p className="heist-panel-error">{error}</p>}

      {result && result.started && (
        <ResultModal title={resultTitle(result)} message={resultMessage(result)} tone={isResultSuccess(result) ? 'success' : 'fail'} onClose={() => setResult(null)} />
      )}

      {(needsTeam || showTeamForming || plans.length > 0) && (
        <div className="heist-plan-list">
          <p className="heist-plan-list-title">Ekip soygunları ({plans.length})</p>
          {sortedPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} myUid={user.uid} onChanged={(data) => data && setResult(data)} />
          ))}
          {!plans.length && <p className="hp-note">Henüz açık plan yok. İlk ekibi sen kur.</p>}
        </div>
      )}
    </div>
  );
}
