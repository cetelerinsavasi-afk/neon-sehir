import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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
import InfoIcon from '../InfoIcon/InfoIcon';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ResultModal from '../ResultModal/ResultModal';
import './HeistPanel.css';

export const HEIST_LABELS = {
  banka: { title: 'Banka Soygunu', requiredPower: 100000, reward: 600000, suspicionCost: 50 },
  casino: { title: 'Casino Soygunu', requiredPower: 70000, reward: 300000, suspicionCost: 40 },
  araba_galerisi: {
    title: 'Galeri Soygunu',
    requiredPower: 50000,
    reward: 150000,
    suspicionCost: 30,
  },
  modifiye_garaji: {
    title: 'Garaj Soygunu',
    requiredPower: 20000,
    reward: 30000,
    suspicionCost: 20,
  },
  fabrika: { title: 'Fabrika Soygunu', requiredPower: 10000, reward: 8000, suspicionCost: 10 },
  seyyar_satici_1: { title: 'Kokoreçciye Haraç', requiredPower: 4500, reward: 2500, suspicionCost: 5 },
  seyyar_satici_2: { title: 'Simitçiye Haraç', requiredPower: 3000, reward: 2000, suspicionCost: 5 },
  seyyar_satici_3: { title: 'Dönerciye Haraç', requiredPower: 1500, reward: 1500, suspicionCost: 5 },
  seyyar_satici_4: { title: 'Köfteciye Haraç', requiredPower: 1000, reward: 1000, suspicionCost: 5 },
};

const RULES_TEXT =
  'Tek başına: yakalanma ihtimalin = mevcut şüphen. Ekip: en fazla 4 kişi, plan 24 saat açık kalır. Ekipte biri yakalanırsa ya da sızan bir polis varsa TÜM ekip yakalanır. Ceza cepten kesilmez, devlete borç yazılır — Banka\'dan istediğin zaman öde, ya da kazandığın paranın yarısı otomatik borcu kapatsın.';

function resultMessage(res) {
  if (!res.started) {
    if (res.reason === 'insufficient_power') {
      return `Güç yetersiz (gerekli: ${res.requiredPower.toLocaleString('tr-TR')}). Şüphe artmadı — aşağıdan ekip kurabilirsin.`;
    }
    return 'Soygun başlamadı.';
  }
  if (res.reward !== undefined) {
    if (res.caught) {
      return `Yakalandın! ${res.reward.toLocaleString('tr-TR')} altın devlete borç yazıldı.`;
    }
    return `Başarılı! ${res.reward.toLocaleString('tr-TR')} altın kazandın.`;
  }
  if (res.busted) {
    return 'Ekibe polis sızmıştı! Payınız borç olarak yazıldı.';
  }
  if (res.caughtBySuspicion) {
    return 'Ekipten biri yakalandı, herkesin payı borç olarak yazıldı.';
  }
  return `Ekip başarılı! ${res.totalReward.toLocaleString('tr-TR')} altın katılımcılara bölündü.`;
}

function isResultSuccess(res) {
  if (!res.started) return null; // nötr — modal açılmaz
  if (res.reward !== undefined) return !res.caught;
  if (res.busted || res.caughtBySuspicion) return false;
  return true;
}

function resultTitle(res) {
  const success = isResultSuccess(res);
  if (success === true) return 'Soygun Başarılı! 🎉';
  if (success === false) return 'Yakalandın!';
  return 'Soygun Başlamadı';
}

function suspicionClass(s) {
  if (s > 50) return 'heist-suspicion-high';
  if (s > 20) return 'heist-suspicion-mid';
  return 'heist-suspicion-low';
}

// 0-20 arası şüpheyi TAM sayı olarak göstermiyoruz — yoksa şüphesi tam 0
// olan (polis olma şartı) bir katılımcı hemen ifşa olurdu.
function suspicionLabel(s) {
  if (s <= 20) return '%0-20';
  return `%${s}`;
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
    const id = setInterval(() => {
      refreshHeistPlanParticipants(plan.id).catch(() => {});
    }, 15000);
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

  return (
    <div className="heist-plan-card">
      <p className="heist-plan-meta">
        {participants.length}/4 kişi · Toplam güç {totalPower.toLocaleString('tr-TR')} /{' '}
        {required.toLocaleString('tr-TR')}
      </p>
      <ul className="heist-plan-members">
        {participants.map((p) => (
          <li key={p.uid}>
            <span className="heist-plan-member-name">
              <AvatarSvg avatar={p.avatar} size={22} rounded />
              {p.displayName} ({(p.weaponPower || 0).toLocaleString('tr-TR')} güç)
            </span>
            <span className={`heist-suspicion-badge ${suspicionClass(p.suspicion || 0)}`}>
              şüphe {suspicionLabel(p.suspicion || 0)}
            </span>
            {isCreator && p.uid !== myUid && (
              <button
                className="heist-plan-kick"
                disabled={busy}
                onClick={() => run(() => kickFromHeistPlan(plan.id, p.uid))}
              >
                çıkar
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
              placeholder="Örn: 'Şüphen düşmeden başlatma', 'şu kişi polis olabilir dikkat et'…"
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
          <>
            {plan.note ? (
              <p className="heist-plan-note-text">
                📌 {plan.note}
                {plan.noteUpdatedBy && (
                  <span className="heist-plan-note-author"> — {plan.noteUpdatedBy}</span>
                )}
              </p>
            ) : (
              <p className="heist-plan-note-text muted">Henüz not yok.</p>
            )}
            {(isMember || isCreator) && (
              <button className="heist-plan-note-edit-btn" onClick={() => setEditingNote(true)}>
                ✏️ Not {plan.note ? 'düzenle' : 'ekle'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="heist-plan-actions">
        {!isMember && (
          <button
            className="heist-plan-btn"
            disabled={busy || participants.length >= 4}
            onClick={() => run(() => joinHeistPlan(plan.id))}
          >
            {participants.length >= 4 ? 'Dolu' : 'Katıl'}
          </button>
        )}
        {isMember && !isCreator && (
          <button className="heist-plan-btn" disabled={busy} onClick={() => run(() => leaveHeistPlan(plan.id))}>
            Ayrıl
          </button>
        )}
        {isCreator && (
          <button
            className="heist-plan-btn primary"
            disabled={busy || totalPower < required}
            onClick={() => run(() => executeHeistPlan(plan.id))}
          >
            {totalPower < required ? 'Güç yetersiz' : 'Soygunu Başlat'}
          </button>
        )}
        {isCreator && (
          <button
            className="heist-plan-btn danger"
            disabled={busy}
            onClick={() => run(() => cancelHeistPlan(plan.id))}
          >
            Planı İptal Et
          </button>
        )}
      </div>
      {error && <p className="heist-panel-error">{error}</p>}
    </div>
  );
}

export default function HeistPanel({ target }) {
  const { user } = useAuth();
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
  const myPower = weapons.reduce((max, w) => Math.max(max, w.power || 0), 0);
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

  return (
    <div className="heist-panel">
      <p className="heist-panel-title">
        {meta.title}
        <InfoIcon text={RULES_TEXT} />
      </p>
      <p className="heist-panel-risk">
        Ödül: {meta.reward.toLocaleString('tr-TR')} altın · Şüphe +{meta.suspicionCost} · Gerekli
        güç: {meta.requiredPower.toLocaleString('tr-TR')}
      </p>

      {needsTeam ? (
        !alreadyInThisTarget && (
          <button className="heist-panel-btn secondary" disabled={done || busy} onClick={handleCreatePlan}>
            Ekip Kur
          </button>
        )
      ) : (
        <button className="heist-panel-btn primary" disabled={done || busy} onClick={handleAttempt}>
          {done
            ? actions.vendorPurchases?.[target]
              ? 'Bugün buradan alışveriş yaptın'
              : 'Bugün zaten denedin'
            : busy
              ? 'Soyuluyor…'
              : 'Soygun Yap'}
        </button>
      )}

      {result && (
        <p
          className={`heist-panel-result ${
            result.started && !result.caught && !result.busted && !result.caughtBySuspicion
              ? 'success'
              : ''
          }`}
        >
          {resultMessage(result)}
        </p>
      )}
      {error && <p className="heist-panel-error">{error}</p>}

      {result && result.started && (
        <ResultModal
          title={resultTitle(result)}
          message={resultMessage(result)}
          tone={isResultSuccess(result) ? 'success' : 'fail'}
          onClose={() => setResult(null)}
        />
      )}

      {(needsTeam || showTeamForming || plans.length > 0) && (
        <div className="heist-plan-list">
          <p className="heist-plan-list-title">Ekip Soygunları ({plans.length})</p>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              myUid={user.uid}
              onChanged={(data) => data && setResult(data)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
