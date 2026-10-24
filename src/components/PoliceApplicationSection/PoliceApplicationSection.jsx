import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { resignFromPolice } from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import PoliceBooklet from '../PoliceBooklet/PoliceBooklet';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { GangProvider, useDocData, useGang, useGangAction, useNow } from '../Gangs/GangContext';
import PoliceApplySheet, { cooldownHoursLeft } from '../Gangs/PoliceApplySheet';
import { gangExitHoursLeft, gangExitText } from '../Gangs/gangConstants';
import { Confirm } from '../Gangs/ui';
import { RANK_LABELS, fmt } from '../Gangs/gangConstants';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { policeSalary } from '../../../functions/belediyeRates.js';
import '../Gangs/Gangs.css';
import './PoliceApplicationSection.css';

// Karakol › Komiser Ofisi — POLİSLİK BAŞVURUSU (v109).
// İstihbarat ile Polis birleşti: polis olmak = Polis Teşkilatına girmek.
// v123: başvuru formu yok — kod adını yazan ve şartları sağlayan oyuncu anında
// teşkilata girer (Gangs/PoliceApplySheet; Çeteler › Polis Teşkilatı ile aynı).
// Yeni katılan 24 saat atılamaz.
// İstifa anında (24 saat yeniden başvurulamaz). Teşkilat çete sisteminin canlı
// dünyasında yaşadığı için bu bölüm o dünyanın bağlamını (GangProvider) kurar.
export default function PoliceApplicationSection() {
  const { user } = useAuth();
  const { data: config, loading } = useDocData(user ? 'gangSystem/config' : null);
  const [showBooklet, setShowBooklet] = useState(false);
  const worldId = config?.liveOpen ? config.liveWorldId : null;
  const mode = useMemo(() => ({ world: 'live', worldId, actorId: user?.uid }), [worldId, user?.uid]);

  if (!user) {
    return <SignInPrompt message="Polis Teşkilatına katılmak için giriş yapmalısın." />;
  }

  return (
    <div className="police-app-section">
      <div className="police-app-header">
        <p className="police-app-title">
          Polis Teşkilatına Katıl
          <InfoIcon text="Polis olmak için kod adını yazman yeterli — form ya da onay yok. Şartlar: başlangıç görevleri, 50 saygınlık, %0 şüphe ve en az 1 silah; imam ve Mafya Babası olamaz. Şartları sağlıyorsan anında teşkilata girersin ve ilk 24 saat atılamazsın. İstifa edersen ya da atılırsan 24 saat tekrar giremezsin." />
        </p>
        <button className="police-app-booklet-btn" onClick={() => setShowBooklet(true)}>
          📖 Kitapçık
        </button>
      </div>
      {loading ? (
        <p className="police-app-hint">Yükleniyor…</p>
      ) : worldId ? (
        <GangProvider mode={mode}>
          <PoliceStatus />
        </GangProvider>
      ) : (
        <p className="police-app-hint">🚧 Polis Teşkilatı şu an bakımda — biraz sonra tekrar dene.</p>
      )}
      {showBooklet && <PoliceBooklet onClose={() => setShowBooklet(false)} />}
    </div>
  );
}

function PoliceStatus() {
  const rates = useBelediyeRates(); // v127: polis maaşları Teşkilat Bakanlığı'nın
  const { path, actorId } = useGang();
  const { player } = usePlayer();
  const { data: membership, loading } = useDocData(path(`memberships/${actorId}`));
  const { data: me } = useDocData(membership?.intelRosterId ? path(`intelRoster/${membership.intelRosterId}`) : null);
  const { run, busy } = useGangAction();
  const now = useNow(60_000);
  const [applying, setApplying] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [cancelApp, setCancelApp] = useState(false);
  const [resignBusy, setResignBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  if (loading) return <p className="police-app-hint">Yükleniyor…</p>;
  const ms = membership || {};
  const isPolice = Boolean(ms.intelRosterId) || player?.profession === 'polis';
  const rank = me?.rank || ms.intelRank || 'muhbir';
  const codeName = me?.codeName || ms.intelCodeName;
  const pendingApp = !isPolice && ms.intelAppId;
  const cd = cooldownHoursLeft(ms, now);
  const exitH = gangExitHoursLeft(ms, now); // v116: çeteden ayrılan / atılan 24 saat

  const resign = async () => {
    setResignBusy(true);
    setError(null);
    try {
      await resignFromPolice();
      setConfirmResign(false);
      setDone('🚪 Polislikten istifa ettin.');
    } catch (err) {
      setError(err?.message || 'İşlem başarısız.');
    } finally {
      setResignBusy(false);
    }
  };

  return (
    <>
      <p className="police-app-hint">
        Şu an:{' '}
        <strong>
          {isPolice
            ? `Polissin${codeName ? ` · ${codeName}` : ''}${ms.intelRosterId ? ` · ${RANK_LABELS[rank] || 'Polis Memuru'}` : ''}`
            : pendingApp
              ? `Eski başvurun sonuçlanıyor (${ms.intelAppCode || 'kod adın'})`
              : 'Sivilsin'}
        </strong>
      </p>

      {isPolice && (
        <div className="police-salary-box">
          <span className="police-salary-emoji">💰</span>
          <div className="police-salary-info">
            <span className="police-salary-title">Maaş + Rüşvet Payı · {fmt(policeSalary(rates, rank || 'muhbir'))} altın</span>
            <span className="police-salary-share">Her gece 00:00'da maaşın ve dün Karakol'a bırakılan rüşvetlerden payın birlikte hesabına yatar. Teşkilat: Çeteler › Polis Teşkilatı.</span>
          </div>
        </div>
      )}
      {pendingApp && <p className="police-app-hint">⏳ Eski başvurun birkaç dakika içinde otomatik sonuçlanır.</p>}
      {!isPolice && !pendingApp && cd > 0 && <p className="police-app-hint">⏳ Polislikten yeni ayrıldın — {cd} saat sonra tekrar teşkilata girebilirsin.</p>}
      {!isPolice && !pendingApp && !cd && exitH > 0 && <p className="police-app-hint">{gangExitText(exitH)}</p>}
      {done && <p className="police-salary-success">{done}</p>}
      {error && <p className="police-app-error">{error}</p>}

      <div className="police-app-controls">
        {!isPolice && !pendingApp && (
          <button className="police-app-btn primary" disabled={cd > 0 || exitH > 0} onClick={() => setApplying(true)}>
            Polis Teşkilatına Katıl
          </button>
        )}
        {pendingApp && (
          <button className="police-app-btn" disabled={busy === 'cancelIntelApplication'} onClick={() => setCancelApp(true)}>
            Başvuruyu Geri Çek
          </button>
        )}
        {isPolice && (
          <button className="police-app-btn" disabled={resignBusy} onClick={() => setConfirmResign(true)}>
            İstifa Et
          </button>
        )}
      </div>

      {applying &&
        createPortal(
          <div className="gx-root gx-portal">
            <PoliceApplySheet membership={ms} onClose={() => setApplying(false)} onDone={() => setDone('🚓 Polis Teşkilatına katıldın — artık polissin!')} />
          </div>,
          document.body
        )}
      {confirmResign &&
        createPortal(
          <div className="gx-root gx-portal">
            <Confirm
              icon="🚪"
              danger
              title="Polislikten istifa etmek istediğine emin misin?"
              lines={['Polis Teşkilatından çıkarsın; prestijin, rütben ve sicilin silinir.', 'Bu gece maaş almazsın.', '24 saat tekrar teşkilata giremezsin.']}
              confirmLabel="İstifa et"
              busy={resignBusy}
              onCancel={() => setConfirmResign(false)}
              onConfirm={resign}
            />
          </div>,
          document.body
        )}
      {cancelApp &&
        createPortal(
          <div className="gx-root gx-portal">
            <Confirm
              icon="🚓"
              danger
              title="Başvurunu geri çekmek istiyor musun?"
              lines={['Kod adın serbest kalır.', 'İstediğin zaman yeniden başvurabilirsin.']}
              confirmLabel="Geri çek"
              busy={busy === 'cancelIntelApplication'}
              onCancel={() => setCancelApp(false)}
              onConfirm={async () => {
                await run('cancelIntelApplication', {}, { success: 'Başvuru geri çekildi' });
                setCancelApp(false);
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
