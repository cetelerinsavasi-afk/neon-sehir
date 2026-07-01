import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useOpenHeistPlans } from '../../hooks/useOpenHeistPlans';
import { useHeistPlanParticipants } from '../../hooks/useHeistPlanParticipants';
import {
  attemptHeist,
  createHeistPlan,
  joinHeistPlan,
  leaveHeistPlan,
  kickFromHeistPlan,
  executeHeistPlan,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import './HeistPanel.css';

const LABELS = {
  banka: { title: 'Banka Soygunu', requiredPower: 100000, reward: 500000, suspicionCost: 50 },
  casino: { title: 'Casino Soygunu', requiredPower: 70000, reward: 200000, suspicionCost: 25 },
  araba_galerisi: {
    title: 'Galeri Soygunu',
    requiredPower: 50000,
    reward: 100000,
    suspicionCost: 25,
  },
  modifiye_garaji: {
    title: 'Garaj Soygunu',
    requiredPower: 20000,
    reward: 20000,
    suspicionCost: 25,
  },
  fabrika: { title: 'Fabrika Soygunu', requiredPower: 10000, reward: 4000, suspicionCost: 25 },
  seyyar_satici_1: { title: 'Kokoreçciye Haraç', requiredPower: 4500, reward: 1000, suspicionCost: 5 },
  seyyar_satici_2: { title: 'Simitçiye Haraç', requiredPower: 3000, reward: 500, suspicionCost: 5 },
  seyyar_satici_3: { title: 'Dönerciye Haraç', requiredPower: 1500, reward: 200, suspicionCost: 5 },
  seyyar_satici_4: { title: 'Köfteciye Haraç', requiredPower: 1000, reward: 100, suspicionCost: 5 },
};

function resultMessage(res) {
  if (!res.started) {
    if (res.reason === 'insufficient_power') {
      return `Güç yetersiz (gerekli: ${res.requiredPower.toLocaleString('tr-TR')}). Soygun başlamadı, şüphe artmadı.`;
    }
    return 'Soygun başlamadı.';
  }
  // Solo soygun: { success, caught, reward }
  if (res.reward !== undefined) {
    if (res.caught) {
      return `Yakalandın! ${res.reward.toLocaleString('tr-TR')} altın devlete borç yazıldı.`;
    }
    return `Başarılı! ${res.reward.toLocaleString('tr-TR')} altın kazandın.`;
  }
  // Ekip soygunu: { busted, caughtBySuspicion, totalReward }
  if (res.busted) {
    return 'Ekibe polis sızmıştı! Payınız borç olarak yazıldı.';
  }
  if (res.caughtBySuspicion) {
    return 'Ekipten biri yakalandı, herkesin payı borç olarak yazıldı.';
  }
  return `Ekip başarılı! ${res.totalReward.toLocaleString('tr-TR')} altın katılımcılara bölündü.`;
}

function PlanCard({ plan, myUid, onChanged }) {
  const { participants } = useHeistPlanParticipants(plan.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const totalPower = participants.reduce((sum, p) => sum + (p.weaponPower || 0), 0);
  const isMember = participants.some((p) => p.uid === myUid);
  const isCreator = plan.creatorUid === myUid;
  const required = LABELS[plan.target]?.requiredPower || 0;

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
            {p.displayName} ({(p.weaponPower || 0).toLocaleString('tr-TR')})
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
      </div>
      {error && <p className="heist-panel-error">{error}</p>}
    </div>
  );
}

export default function HeistPanel({ target }) {
  const { user } = useAuth();
  const { actions } = useDailyActions();
  const { plans } = useOpenHeistPlans(target);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!user) return null;

  const meta = LABELS[target];
  const done = Boolean(actions.heist?.[target]);

  const handleSoloAttempt = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await attemptHeist(target);
      setResult(res.data);
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
        <InfoIcon
          text={
            'Tek başına: yakalanma ihtimalin = mevcut şüphen. Ekip: en fazla 4 kişi, plan 24 saat açık kalır. Ekipte biri yakalanırsa ya da sızan bir polis varsa TÜM ekip yakalanır. Ceza cepten kesilmez, devlete borç yazılır — Banka\'dan istediğin zaman öde, ya da kazandığın paranın yarısı otomatik borcu kapatsın.'
          }
        />
      </p>
      <p className="heist-panel-risk">
        Ödül: {meta.reward.toLocaleString('tr-TR')} altın · Şüphe +{meta.suspicionCost} · Gerekli
        güç: {meta.requiredPower.toLocaleString('tr-TR')}
      </p>

      <div className="heist-panel-solo-row">
        <button className="heist-panel-btn" disabled={done || busy} onClick={handleSoloAttempt}>
          {done ? 'Bugün zaten denedin' : busy ? 'Soyuluyor…' : 'Tek Başına Dene'}
        </button>
        <button className="heist-panel-btn secondary" disabled={done || busy} onClick={handleCreatePlan}>
          Ekip Kur
        </button>
      </div>

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

      {plans.length > 0 && (
        <div className="heist-plan-list">
          <p className="heist-plan-list-title">Açık Ekip Planları</p>
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
