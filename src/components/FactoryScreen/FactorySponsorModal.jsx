import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listSponsorshipTeamsForFactory,
  sendFactorySponsorshipOffer,
  respondSponsorshipOffer,
  withdrawSponsorshipOffer,
  cancelSponsorship,
  raiseSponsorshipFee,
  updateSponsorshipNote,
} from '../../services/gameActions';
import FutbolCrest from '../FutbolScreen/FutbolCrest';

// FactorySponsorModal — fabrika sahibinin "Sponsor" ekranı. Önce KENDİ
// sponsor olduğu takım(lar), sonra tüm diğer takımlar listelenir (bkz.
// functions/index.js listSponsorshipTeamsForFactory — sıralama zaten
// sunucuda yapılıyor, burada olduğu gibi render ediliyor). Emoji-zengin,
// kısa/net kartlar — kullanıcı isteği: "olabildiğince emoji dolu, kısa,
// net, anlaşılır, görsel olarak güçlü ve kafa karıştırmayan".
export default function FactorySponsorModal({ onClose }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [offerDrafts, setOfferDrafts] = useState({});
  const [raiseDrafts, setRaiseDrafts] = useState({});
  const [noteEditingId, setNoteEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await listSponsorshipTeamsForFactory();
      setData(res?.data || null);
    } catch (err) {
      setError(err?.message || 'Liste yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

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

  const handleSponsorOl = (teamId) => {
    const amount = Math.max(0, Math.round(Number(offerDrafts[teamId] ?? 0)));
    runAction(`offer-${teamId}`, () => sendFactorySponsorshipOffer(teamId, amount));
  };

  const handleWithdraw = (offerId, teamId) => {
    runAction(`withdraw-${teamId}`, () => withdrawSponsorshipOffer(offerId));
  };

  const handleRespond = (offerId, teamId, accept) => {
    runAction(`respond-${teamId}`, () => respondSponsorshipOffer(offerId, accept));
  };

  const handleCancel = (teamId) => {
    runAction(`cancel-${teamId}`, () => cancelSponsorship(teamId));
  };

  const handleRaise = (teamId) => {
    const amount = Math.max(0, Math.round(Number(raiseDrafts[teamId] ?? 0)));
    runAction(`raise-${teamId}`, () => raiseSponsorshipFee(teamId, amount));
  };

  const openNoteEditor = (team) => {
    setNoteEditingId(team.id);
    setNoteDraft(team.note || '');
  };

  const handleSaveNote = (teamId) => {
    runAction(`note-${teamId}`, () => updateSponsorshipNote(user.uid, teamId, noteDraft.trim())).then(() => {
      setNoteEditingId(null);
    });
  };

  if (!data) {
    return (
      <div className="factory-modal-backdrop" onClick={onClose}>
        <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
          <div className="factory-modal-header">
            <p className="factory-modal-title">🤝 Sponsorluk</p>
            <button className="factory-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          {error ? <p className="factory-error">{error}</p> : <p className="factory-hint">Yükleniyor...</p>}
        </div>
      </div>
    );
  }

  const { teams, offerCap, dailyIncomeAvg10 } = data;
  const mySponsorships = teams.filter((t) => t.isMySponsorship);
  const otherTeams = teams.filter((t) => !t.isMySponsorship);

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">🤝 Sponsorluk</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="factory-hint small">
          💰 Son 10 günlük gelir ortalaman: <strong>{dailyIncomeAvg10.toLocaleString('tr-TR')} altın</strong> —
          en fazla teklif edebileceğin: <strong>{offerCap.toLocaleString('tr-TR')} altın/gün</strong> (%25)
        </p>
        <p className="factory-hint small">
          ⏰ Sponsorluk değişiklikleri (yeni anlaşma, fesih, yükseltme) her zaman bir sonraki gece 00:00'da
          devreye girer.
        </p>

        {error && <p className="factory-error">{error}</p>}

        {mySponsorships.length > 0 && (
          <>
            <p className="factory-step-label">⭐ Sponsoru Olduğun Takımlar ({mySponsorships.length})</p>
            <div className="factory-share-list">
              {mySponsorships.map((t) => {
                const beingReplaced = t.pendingSponsorFactoryOwnerUid && t.pendingSponsorFactoryOwnerUid !== user.uid;
                return (
                  <div key={t.id} className="factory-share-buy-card factory-sponsor-card">
                    <div className="factory-sponsor-card-head">
                      <FutbolCrest logo={t.logo} initials={t.name?.[0]} size={32} />
                      <div className="factory-share-row-info">
                        <span className="factory-share-row-title">
                          {t.name} {t.isBot && <span className="factory-sponsor-badge">🤖 Bot</span>}
                        </span>
                        <span className="factory-share-row-meta">
                          {t.tier}. Lig · 👥 {t.fans.toLocaleString('tr-TR')} · 💎{' '}
                          {t.value.toLocaleString('tr-TR')} altın
                        </span>
                      </div>
                    </div>
                    <p className="factory-hint small">
                      💸 Günlük ödediğin: <strong>{(t.sponsorDailyAmount || 0).toLocaleString('tr-TR')} altın</strong>
                    </p>
                    {beingReplaced && (
                      <p className="factory-hint small factory-sponsor-warning">
                        ⚠️ Bir sonraki 00:00'da başka bir sponsor devreye girecek, sponsorluğun sona erecek.
                      </p>
                    )}

                    <div className="factory-sponsor-note-box">
                      {noteEditingId === t.id ? (
                        <>
                          <input
                            className="factory-name-input"
                            maxLength={140}
                            placeholder="Kısa bir not bırak..."
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <div className="factory-sponsor-note-actions">
                            <button className="factory-btn small" onClick={() => setNoteEditingId(null)}>
                              Vazgeç
                            </button>
                            <button
                              className="factory-btn small primary"
                              disabled={busyKey === `note-${t.id}`}
                              onClick={() => handleSaveNote(t.id)}
                            >
                              Kaydet
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="factory-hint small">
                            💬 {t.note ? t.note : 'Henüz not yok.'}
                            {t.note && t.noteUpdatedByName && (
                              <span className="factory-sponsor-note-author"> — {t.noteUpdatedByName}</span>
                            )}
                          </p>
                          <button className="factory-btn small" onClick={() => openNoteEditor(t)}>
                            ✏️ Not {t.note ? 'düzenle' : 'ekle'}
                          </button>
                        </>
                      )}
                    </div>

                    <div className="factory-sponsor-offer-row">
                      <input
                        className="factory-name-input"
                        type="number"
                        min={t.sponsorDailyAmount || 0}
                        max={offerCap}
                        placeholder="Yeni ücret (yükselt)"
                        value={raiseDrafts[t.id] ?? ''}
                        onChange={(e) => setRaiseDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                      />
                      <button
                        className="factory-btn small"
                        disabled={busyKey === `raise-${t.id}`}
                        onClick={() => handleRaise(t.id)}
                      >
                        📈 Yükselt
                      </button>
                    </div>

                    <button
                      className="factory-fire-btn"
                      disabled={busyKey === `cancel-${t.id}`}
                      onClick={() => handleCancel(t.id)}
                    >
                      {busyKey === `cancel-${t.id}` ? '…' : '❌ Sponsorluğu Feshet'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="factory-step-label">🏟️ Tüm Kulüpler ({otherTeams.length})</p>
        <div className="factory-share-list">
          {otherTeams.map((t) => {
            const myOffer = t.myPendingOffers.find((o) => o.fromRole === 'factory');
            const clubOffer = t.myPendingOffers.find((o) => o.fromRole === 'club');
            return (
              <div key={t.id} className="factory-share-buy-card factory-sponsor-card">
                <div className="factory-sponsor-card-head">
                  <FutbolCrest logo={t.logo} initials={t.name?.[0]} size={32} />
                  <div className="factory-share-row-info">
                    <span className="factory-share-row-title">
                      {t.name} {t.isBot && <span className="factory-sponsor-badge">🤖 Bot</span>}
                    </span>
                    <span className="factory-share-row-meta">
                      {t.tier}. Lig · 👥 {t.fans.toLocaleString('tr-TR')} · 💎{' '}
                      {t.value.toLocaleString('tr-TR')} altın · 👔 {t.chairman}
                    </span>
                  </div>
                </div>

                {t.sponsorFactoryOwnerUid ? (
                  <p className="factory-hint small">
                    🤝 Şu anki sponsoru: <strong>{t.sponsorFactoryName}</strong> — 💸{' '}
                    {(t.sponsorDailyAmount || 0).toLocaleString('tr-TR')} altın/gün
                  </p>
                ) : (
                  <p className="factory-hint small">✨ Şu an sponsoru yok.</p>
                )}

                {t.note && (
                  <p className="factory-hint small">
                    💬 {t.note}
                    {t.noteUpdatedByName && <span className="factory-sponsor-note-author"> — {t.noteUpdatedByName}</span>}
                  </p>
                )}

                {clubOffer && (
                  <div className="factory-sponsor-incoming-offer">
                    <p className="factory-hint small">
                      📨 Kulübün teklifi: <strong>{clubOffer.dailyAmount.toLocaleString('tr-TR')} altın/gün</strong>
                    </p>
                    <div className="factory-sponsor-note-actions">
                      <button
                        className="factory-btn small"
                        disabled={busyKey === `respond-${t.id}`}
                        onClick={() => handleRespond(clubOffer.id, t.id, false)}
                      >
                        Reddet
                      </button>
                      <button
                        className="factory-btn small primary"
                        disabled={busyKey === `respond-${t.id}`}
                        onClick={() => handleRespond(clubOffer.id, t.id, true)}
                      >
                        Kabul Et
                      </button>
                    </div>
                  </div>
                )}

                {myOffer ? (
                  <div className="factory-sponsor-incoming-offer">
                    <p className="factory-hint small">
                      📤 Senin teklifin: <strong>{myOffer.dailyAmount.toLocaleString('tr-TR')} altın/gün</strong>{' '}
                      (bekliyor)
                    </p>
                    <button
                      className="factory-btn small"
                      disabled={busyKey === `withdraw-${t.id}`}
                      onClick={() => handleWithdraw(myOffer.id, t.id)}
                    >
                      Teklifi Geri Çek
                    </button>
                  </div>
                ) : (
                  <div className="factory-sponsor-offer-row">
                    <input
                      className="factory-name-input"
                      type="number"
                      min={0}
                      max={offerCap}
                      placeholder={`Teklif (max ${offerCap.toLocaleString('tr-TR')})`}
                      value={offerDrafts[t.id] ?? ''}
                      onChange={(e) => setOfferDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    />
                    <button
                      className="factory-btn small primary"
                      disabled={busyKey === `offer-${t.id}`}
                      onClick={() => handleSponsorOl(t.id)}
                    >
                      {busyKey === `offer-${t.id}` ? '…' : '🤝 Sponsor Ol'}
                    </button>
                  </div>
                )}

                {noteEditingId === t.id ? (
                  <div className="factory-sponsor-note-box">
                    <input
                      className="factory-name-input"
                      maxLength={140}
                      placeholder="Kısa bir not bırak..."
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <div className="factory-sponsor-note-actions">
                      <button className="factory-btn small" onClick={() => setNoteEditingId(null)}>
                        Vazgeç
                      </button>
                      <button
                        className="factory-btn small primary"
                        disabled={busyKey === `note-${t.id}`}
                        onClick={() => handleSaveNote(t.id)}
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="factory-btn small" onClick={() => openNoteEditor(t)}>
                    ✏️ Not {t.note ? 'düzenle' : 'bırak'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
