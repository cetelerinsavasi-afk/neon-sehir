import { useEffect, useState } from 'react';
import {
  listSponsorshipFactoriesForTeam,
  sendClubSponsorshipOffer,
  respondSponsorshipOffer,
  withdrawSponsorshipOffer,
  cancelSponsorship,
  updateSponsorshipNote,
} from '../../services/gameActions';
import FactoryBadge from '../FactoryScreen/FactoryBadge';
import './FutbolTakimim.css';

// FutbolSponsor — kulüp sahibinin Futbol > Takımım > Sponsor sekmesi.
// Önce KENDİ sponsorumuz olan fabrika, sonra tüm diğer fabrikalar
// listelenir (bkz. functions/index.js listSponsorshipFactoriesForTeam —
// sıralama zaten sunucuda yapılıyor). Emoji-zengin, kısa/net kartlar.
export default function FutbolSponsor({ team }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [offerDrafts, setOfferDrafts] = useState({});
  const [noteEditingId, setNoteEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await listSponsorshipFactoriesForTeam();
      setData(res?.data || null);
    } catch (err) {
      setError(err?.message || 'Liste yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, [team.id]);

  const runAction = async (key, fn) => {
    setBusyKey(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err?.message || 'İşlem başarısız.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleOffer = (factoryOwnerUid) => {
    const amount = Math.max(0, Math.round(Number(offerDrafts[factoryOwnerUid] ?? 0)));
    runAction(`offer-${factoryOwnerUid}`, () => sendClubSponsorshipOffer(factoryOwnerUid, amount));
  };

  const handleWithdraw = (offerId, factoryOwnerUid) => {
    runAction(`withdraw-${factoryOwnerUid}`, () => withdrawSponsorshipOffer(offerId));
  };

  const handleRespond = (offerId, factoryOwnerUid, accept) => {
    runAction(`respond-${factoryOwnerUid}`, () => respondSponsorshipOffer(offerId, accept));
  };

  const handleCancel = () => {
    runAction('cancel', () => cancelSponsorship(team.id));
  };

  const openNoteEditor = (factory) => {
    setNoteEditingId(factory.ownerId);
    setNoteDraft(factory.note || '');
  };

  const handleSaveNote = (factoryOwnerUid) => {
    runAction(`note-${factoryOwnerUid}`, () => updateSponsorshipNote(factoryOwnerUid, team.id, noteDraft.trim())).then(
      () => setNoteEditingId(null)
    );
  };

  if (!data) {
    return error ? <p className="futbol-admin-error">{error}</p> : <p className="futbol-placeholder">Yükleniyor...</p>;
  }

  const { team: teamInfo, factories } = data;
  const mySponsor = factories.find((f) => f.isMySponsor);
  const otherFactories = factories.filter((f) => !f.isMySponsor);

  return (
    <div className="futbol-sponsor">
      <p className="futbol-placeholder">
        🤝 Fabrikalar sana günlük ücret karşılığında sponsor olabilir; sen de bir fabrikadan sponsorluk
        isteyebilirsin. Anlaşmalar her zaman bir sonraki gece 00:00'da devreye girer.
      </p>
      {error && <p className="futbol-admin-error">{error}</p>}

      <p className="futbol-kadro-section-title">⭐ Sponsorumuz</p>
      {mySponsor ? (
        <div className="futbol-buy-row futbol-sponsor-card">
          <FactoryBadge logo={mySponsor.logo} name={mySponsor.name} size={36} />
          <div className="futbol-buy-info">
            <p className="futbol-buy-name">{mySponsor.name}</p>
            <p className="futbol-buy-meta">
              💸 Günlük ödediği: <strong>{(teamInfo.sponsorDailyAmount || 0).toLocaleString('tr-TR')} altın</strong>
            </p>
            {mySponsor.note && (
              <p className="futbol-buy-meta">
                💬 {mySponsor.note}
                {mySponsor.noteUpdatedByName && <span> — {mySponsor.noteUpdatedByName}</span>}
              </p>
            )}
          </div>
          <div className="futbol-buy-action">
            <button className="futbol-admin-reset" disabled={busyKey === 'cancel'} onClick={handleCancel}>
              {busyKey === 'cancel' ? '…' : '❌ Feshet'}
            </button>
          </div>
        </div>
      ) : (
        <p className="futbol-placeholder">✨ Şu an bir sponsorumuz yok.</p>
      )}

      <p className="futbol-kadro-section-title">🏭 Tüm Fabrikalar ({otherFactories.length})</p>
      <div className="futbol-buy-list">
        {otherFactories.map((f) => {
          const myOffer = f.theirPendingOffers.find((o) => o.fromRole === 'club');
          const factoryOffer = f.theirPendingOffers.find((o) => o.fromRole === 'factory');
          return (
            <div key={f.ownerId} className="futbol-buy-row futbol-sponsor-card">
              <FactoryBadge logo={f.logo} name={f.name} size={36} />
              <div className="futbol-buy-info">
                <p className="futbol-buy-name">{f.name}</p>
                <p className="futbol-buy-meta">
                  📊 Son 10 günlük gelir ortalaması: {f.dailyIncomeAvg10.toLocaleString('tr-TR')} altın
                </p>
                {f.note && (
                  <p className="futbol-buy-meta">
                    💬 {f.note}
                    {f.noteUpdatedByName && <span> — {f.noteUpdatedByName}</span>}
                  </p>
                )}

                {factoryOffer && (
                  <div className="futbol-sponsor-incoming-offer">
                    <p className="futbol-buy-meta">
                      📨 Fabrikanın teklifi: <strong>{factoryOffer.dailyAmount.toLocaleString('tr-TR')} altın/gün</strong>
                    </p>
                    <div className="futbol-sponsor-note-actions">
                      <button
                        className="futbol-admin-reset"
                        disabled={busyKey === `respond-${f.ownerId}`}
                        onClick={() => handleRespond(factoryOffer.id, f.ownerId, false)}
                      >
                        Reddet
                      </button>
                      <button
                        className="futbol-admin-submit"
                        disabled={busyKey === `respond-${f.ownerId}`}
                        onClick={() => handleRespond(factoryOffer.id, f.ownerId, true)}
                      >
                        Kabul Et
                      </button>
                    </div>
                  </div>
                )}

                {myOffer ? (
                  <div className="futbol-sponsor-incoming-offer">
                    <p className="futbol-buy-meta">
                      📤 Senin teklifin: <strong>{myOffer.dailyAmount.toLocaleString('tr-TR')} altın/gün</strong>{' '}
                      (bekliyor)
                    </p>
                    <button
                      className="futbol-admin-reset"
                      disabled={busyKey === `withdraw-${f.ownerId}`}
                      onClick={() => handleWithdraw(myOffer.id, f.ownerId)}
                    >
                      Teklifi Geri Çek
                    </button>
                  </div>
                ) : (
                  <div className="futbol-sponsor-offer-row">
                    <input
                      className="futbol-sponsor-input"
                      type="number"
                      min={0}
                      placeholder="İstenen ücret"
                      value={offerDrafts[f.ownerId] ?? ''}
                      onChange={(e) => setOfferDrafts((d) => ({ ...d, [f.ownerId]: e.target.value }))}
                    />
                    <button
                      className="futbol-admin-submit"
                      disabled={busyKey === `offer-${f.ownerId}`}
                      onClick={() => handleOffer(f.ownerId)}
                    >
                      {busyKey === `offer-${f.ownerId}` ? '…' : '🤝 Teklif Gönder'}
                    </button>
                  </div>
                )}

                {noteEditingId === f.ownerId ? (
                  <div className="futbol-sponsor-note-box">
                    <input
                      className="futbol-sponsor-input"
                      maxLength={140}
                      placeholder="Kısa bir not bırak..."
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <div className="futbol-sponsor-note-actions">
                      <button className="futbol-admin-reset" onClick={() => setNoteEditingId(null)}>
                        Vazgeç
                      </button>
                      <button
                        className="futbol-admin-submit"
                        disabled={busyKey === `note-${f.ownerId}`}
                        onClick={() => handleSaveNote(f.ownerId)}
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="futbol-admin-reset futbol-sponsor-note-btn" onClick={() => openNoteEditor(f)}>
                    ✏️ Not {f.note ? 'düzenle' : 'bırak'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
