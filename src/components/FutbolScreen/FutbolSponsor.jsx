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
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolTakimim.css';

// SPONSOR_QUICK_AMOUNTS — bkz. FactorySponsorModal.jsx'teki AYNI liste:
// boş "sayı yaz" kutusu yerine buton tabanlı miktar seçici.
const SPONSOR_QUICK_AMOUNTS = [10, 100, 1000, 10000, 100000, { value: 1000000, label: '1M' }];

// FutbolSponsor — kulüp sahibinin Futbol > Takımım > Sponsor sekmesi.
// Önce KENDİ sponsorumuz olan fabrika, sonra tüm diğer fabrikalar
// listelenir (bkz. functions/index.js listSponsorshipFactoriesForTeam —
// sıralama zaten sunucuda yapılıyor). Emoji-zengin, kısa/net kartlar.
export default function FutbolSponsor({ team }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [offerDrafts, setOfferDrafts] = useState({});
  // expandedOfferId — kullanıcı isteği: boş kutuya sayı yazmak yerine,
  // "Teklif Gönder" butonuna basınca o kartta tutar seçici açılsın.
  const [expandedOfferId, setExpandedOfferId] = useState(null);
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

  // handleOffer — kendi fabrikamıza (isSelfSponsor) teklif her zaman 0
  // altınla ANINDA gönderilir, tutar seçici hiç açılmaz.
  const handleOffer = (factoryOwnerUid, isSelfSponsor) => {
    const amount = isSelfSponsor ? 0 : Math.max(0, Math.round(Number(offerDrafts[factoryOwnerUid] ?? 0)));
    runAction(`offer-${factoryOwnerUid}`, () => sendClubSponsorshipOffer(factoryOwnerUid, amount)).then(() => {
      setExpandedOfferId(null);
      setOfferDrafts((d) => ({ ...d, [factoryOwnerUid]: 0 }));
    });
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
          const offerOpen = expandedOfferId === f.ownerId;
          return (
            <div key={f.ownerId} className="futbol-buy-row futbol-sponsor-card">
              <FactoryBadge logo={f.logo} name={f.name} size={36} />
              <div className="futbol-buy-info">
                <p className="futbol-buy-name">
                  {f.name} {f.isSelfSponsor && <span className="futbol-buy-badge">⭐ Senin Fabrikan</span>}
                </p>
                <p className="futbol-buy-meta">
                  💰 Max teklif: <strong>{f.offerCap.toLocaleString('tr-TR')} altın/gün</strong>
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
                ) : f.isSelfSponsor ? (
                  <button
                    className="futbol-admin-submit"
                    disabled={busyKey === `offer-${f.ownerId}`}
                    onClick={() => handleOffer(f.ownerId, true)}
                  >
                    {busyKey === `offer-${f.ownerId}` ? '…' : '🤝 Teklif Gönder (0 altın)'}
                  </button>
                ) : offerOpen ? (
                  <div className="futbol-sponsor-offer-box">
                    <QuantityStepper
                      value={offerDrafts[f.ownerId] ?? 0}
                      onChange={(v) => setOfferDrafts((d) => ({ ...d, [f.ownerId]: v }))}
                      max={f.offerCap}
                      step={10}
                      quickAmounts={SPONSOR_QUICK_AMOUNTS}
                    />
                    <div className="futbol-sponsor-note-actions">
                      <button className="futbol-admin-reset" onClick={() => setExpandedOfferId(null)}>
                        Vazgeç
                      </button>
                      <button
                        className="futbol-admin-submit"
                        disabled={busyKey === `offer-${f.ownerId}`}
                        onClick={() => handleOffer(f.ownerId, false)}
                      >
                        {busyKey === `offer-${f.ownerId}` ? '…' : 'Gönder'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="futbol-admin-submit"
                    onClick={() => {
                      setExpandedOfferId(f.ownerId);
                      setOfferDrafts((d) => ({ ...d, [f.ownerId]: d[f.ownerId] ?? 0 }));
                    }}
                  >
                    🤝 Teklif Gönder
                  </button>
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
