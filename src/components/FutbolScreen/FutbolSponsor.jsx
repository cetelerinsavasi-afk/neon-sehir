import { useEffect, useState } from 'react';
import {
  listSponsorshipFactoriesForTeam,
  sendClubSponsorshipOffer,
  respondSponsorshipOffer,
  withdrawSponsorshipOffer,
  cancelSponsorship,
  withdrawSponsorshipCancellation,
  requestSponsorshipFeeRaise,
  updateSponsorshipNote,
} from '../../services/gameActions';
import FactoryBadge from '../FactoryScreen/FactoryBadge';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import { nextSponsorshipSettleLabel } from '../../lib/istanbulTime';
import './FutbolTakimim.css';

// SPONSOR_QUICK_AMOUNTS — bkz. FactorySponsorModal.jsx'teki AYNI liste:
// boş "sayı yaz" kutusu yerine buton tabanlı miktar seçici.
const SPONSOR_QUICK_AMOUNTS = [10, 100, 1000, 10000, 100000, { value: 1000000, label: '1M' }];

const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR');

// FactoryHead — GÖRSEL CİLA (madde 4): FactorySponsorModal.jsx'teki
// TeamHead ile BİREBİR AYNI kart başlığı deseni — rozet + isim + tek
// satırlık özet meta, sağda öne çıkan bir rakam (aside). Eskiden bu
// ekranda başlık düz metin satırlarıydı, artık fabrika tarafındaki
// kalitede tek bir başlık bileşeni kullanılıyor.
// KULLANICI REVİZESİ: "son 10 günlük ortalama gelir" bilgisi kaldırıldı —
// sadece max teklif oranı gösteriliyor.
function FactoryHead({ factory, badge, aside }) {
  return (
    <div className="futbol-sp-head">
      <FactoryBadge logo={factory.logo} name={factory.name} size={34} />
      <div className="futbol-sp-head-info">
        <span className="futbol-sp-name">
          {factory.name}
          {badge && <span className="futbol-sp-badge">{badge}</span>}
        </span>
        <span className="futbol-sp-meta">💰 Max teklif: {fmt(factory.offerCap)} altın/gün</span>
      </div>
      {aside && <div className="futbol-sp-aside">{aside}</div>}
    </div>
  );
}

// FutbolSponsor — kulüp sahibinin Futbol > Takımım > Sponsor sekmesi.
// Önce KENDİ sponsorumuz olan fabrika, sonra tüm diğer fabrikalar
// listelenir (bkz. functions/index.js listSponsorshipFactoriesForTeam —
// sıralama zaten sunucuda yapılıyor). Emoji-zengin, kısa/net kartlar.
//
// GÖRSEL CİLA (kullanıcı isteği): fabrika tarafındaki FactorySponsorModal.jsx
// ile aynı kalitede — üstte özet/bilgi kartı, kart başlıklarında rozet +
// isim + tek satır meta + öne çıkan rakam, tutarlı renkli uyarı kutuları,
// ve büyüyebilecek fabrika listesi için bir arama kutusu.
export default function FutbolSponsor({ team, role }) {
  // KULLANICI İSTEĞİ: menajer varken başkan inceleyebilir ama işlem
  // yapamaz (Forma ve Menajer sekmeleri hariç).
  const readOnly = role === 'owner' && Boolean(team.managerUid);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [offerDrafts, setOfferDrafts] = useState({});
  // expandedOfferId — kullanıcı isteği: boş kutuya sayı yazmak yerine,
  // "Teklif Gönder" butonuna basınca o kartta tutar seçici açılsın.
  const [expandedOfferId, setExpandedOfferId] = useState(null);
  const [noteEditingId, setNoteEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  // raiseRequestOpen/raiseRequestDraft — KULLANICI İSTEĞİ: "takımlar da
  // ücreti yükseltme talebi gönderebilsin" (bkz. FactorySponsorModal.jsx
  // içindeki AYNI buton-tabanlı tutar seçici deseni).
  const [raiseRequestOpen, setRaiseRequestOpen] = useState(false);
  const [raiseRequestDraft, setRaiseRequestDraft] = useState(0);
  // search — GÖRSEL CİLA: fabrika sayısı arttıkça liste uzuyor,
  // FactorySponsorModal.jsx'teki arama kutusuyla AYNI çözüm.
  const [search, setSearch] = useState('');

  // settle — "bugün 19:00" / "yarın 19:00": sponsorluk işlemleri (yeni anlaşma,
  // fesih, ödeme) 00:00'da değil her gün 19:00'da işleniyor (bkz.
  // istanbulTime.js nextSponsorshipSettleLabel).
  const settle = nextSponsorshipSettleLabel();

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

  // handleWithdrawCancel — bkz. FactorySponsorModal.jsx içindeki AYNI
  // düzeltme: yanlışlıkla/vazgeçilen bir feshi sponsorluk saati (19:00) gelmeden geri alma.
  const handleWithdrawCancel = () => {
    runAction('withdraw-cancel', () => withdrawSponsorshipCancellation(team.id));
  };

  const handleRequestRaise = () => {
    const amount = Math.max(0, Math.round(Number(raiseRequestDraft || 0)));
    runAction('request-raise', () => requestSponsorshipFeeRaise(team.id, amount)).then(() => {
      setRaiseRequestOpen(false);
    });
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
  // otherFactories — kullanıcı isteği: max teklif tutarı 0 (ya da daha az)
  // olan fabrikalar listelenmesin (henüz gelir geçmişi olmayan/gelirsiz
  // fabrikalara zaten anlamlı bir teklif yapılamıyor). Kendi fabrikamızı
  // (isSelfSponsor — ücret her zaman 0 olduğu için cap'ten bağımsız) ve
  // aramızda bekleyen bir teklif varsa (theirPendingOffers) YİNE DE
  // gösteriyoruz — aksi halde gelen bir teklife cevap veremezdik.
  const otherFactories = factories.filter((f) => {
    if (f.isMySponsor) return false;
    if (f.isSelfSponsor) return true;
    if (f.theirPendingOffers.length > 0) return true;
    return f.offerCap > 0;
  });
  // visibleFactories — YENİ İSTEK'e bakan basit bir filtre; `data` yüklenene
  // kadar yukarıda erken bir `return` olduğu için burada useMemo KULLANILMIYOR
  // (React Hooks kuralı: bir hook koşullu/erken dönüşten SONRA çağrılamaz).
  const searchQuery = search.trim().toLocaleLowerCase('tr-TR');
  const visibleFactories = !searchQuery
    ? otherFactories
    : otherFactories.filter((f) =>
        [f.name, f.note].filter(Boolean).some((v) => String(v).toLocaleLowerCase('tr-TR').includes(searchQuery))
      );

  return (
    <fieldset className="futbol-sponsor" disabled={readOnly}>
      {error && <p className="futbol-admin-error">{error}</p>}

      {/* Özet kartı — GÖRSEL CİLA: FactorySponsorModal.jsx'teki
          factory-sp-summary ile AYNI muamele, tek bakışta anlaşmaların
          ne zaman devreye gireceğini gösteriyor. */}
      <div className="futbol-sp-summary">
        {mySponsor ? (
          <div className="futbol-sp-summary-main">
            <span className="futbol-sp-summary-label">Sponsorun günlük ödediği</span>
            <span className="futbol-sp-summary-value">
              {fmt(teamInfo.sponsorDailyAmount)} <small>altın/gün</small>
            </span>
          </div>
        ) : (
          <div className="futbol-sp-summary-main">
            <span className="futbol-sp-summary-label">Sponsor durumu</span>
            <span className="futbol-sp-summary-value futbol-sp-summary-value-muted">Sponsorumuz yok</span>
          </div>
        )}
        <p className="futbol-sp-summary-time">
          ⏰ Yeni anlaşma, fesih ve ücret değişiklikleri her gün <strong>19:00</strong>'da devreye girer — sıradaki:{' '}
          <strong>{settle}</strong>
        </p>
      </div>

      <p className="futbol-kadro-section-title">⭐ Sponsorumuz</p>
      {mySponsor ? (
        <div className="futbol-buy-row futbol-sp-card">
          <FactoryHead
            factory={mySponsor}
            aside={
              <>
                <span className="futbol-sp-amount">{fmt(teamInfo.sponsorDailyAmount)}</span>
                <span className="futbol-sp-amount-unit">altın/gün</span>
              </>
            }
          />

          {mySponsor.note && (
            <p className="futbol-sp-note">
              💬 {mySponsor.note}
              {mySponsor.noteUpdatedByName && <span className="futbol-sp-note-author"> — {mySponsor.noteUpdatedByName}</span>}
            </p>
          )}

          {teamInfo.pendingSponsorFactoryOwnerUid && teamInfo.pendingSponsorFactoryOwnerUid !== mySponsor.ownerId && (
            <p className="futbol-sp-alert warn">
              ⚠️ {teamInfo.pendingSponsorFactoryName || 'Başka bir fabrika'} daha yüksek teklif verdi (
              {fmt(teamInfo.pendingSponsorDailyAmount)} altın/gün) — {settle}'da sponsor değişecek.
            </p>
          )}

          {teamInfo.sponsorCancelPending && (
            <p className="futbol-sp-alert warn">⚠️ Bu sponsorluğun feshi bekliyor — {settle}'da sona erecek.</p>
          )}

          {teamInfo.feeRaiseRequest ? (
            <p className="futbol-sp-alert ask">
              📤 Ücret artışı istedin: <strong>{fmt(teamInfo.feeRaiseRequest.requestedAmount)} altın/gün</strong> —
              sponsorun cevabı bekleniyor.
            </p>
          ) : !mySponsor.isSelfSponsor && !teamInfo.sponsorCancelPending ? (
            raiseRequestOpen ? (
              <div className="futbol-sponsor-offer-box">
                <QuantityStepper
                  value={raiseRequestDraft || (teamInfo.sponsorDailyAmount || 0) + 1}
                  onChange={setRaiseRequestDraft}
                  max={mySponsor.offerCap}
                  step={1}
                  quickAmounts={SPONSOR_QUICK_AMOUNTS}
                />
                <p className="futbol-sp-muted">
                  Mevcut ücretten ({fmt(teamInfo.sponsorDailyAmount)} altın) yüksek olmalı, en fazla{' '}
                  {fmt(mySponsor.offerCap)} altın/gün istenebilir.
                </p>
                <div className="futbol-sponsor-note-actions">
                  <button className="futbol-admin-reset" onClick={() => setRaiseRequestOpen(false)}>
                    Vazgeç
                  </button>
                  <button
                    className="futbol-admin-submit"
                    disabled={busyKey === 'request-raise' || (raiseRequestDraft || 0) <= (teamInfo.sponsorDailyAmount || 0)}
                    onClick={handleRequestRaise}
                  >
                    {busyKey === 'request-raise' ? '…' : 'Gönder'}
                  </button>
                </div>
              </div>
            ) : null
          ) : null}

          <div className="futbol-sp-actions">
            {!teamInfo.feeRaiseRequest && !mySponsor.isSelfSponsor && !teamInfo.sponsorCancelPending && !raiseRequestOpen && (
              <button
                className="futbol-admin-submit"
                onClick={() => {
                  setRaiseRequestOpen(true);
                  setRaiseRequestDraft((teamInfo.sponsorDailyAmount || 0) + 1);
                }}
              >
                📈 Ücret Artışı İste
              </button>
            )}
            {teamInfo.sponsorCancelPending ? (
              // KULLANICI REVİZESİ: "biz kendimiz feshettiysek geri
              // alabiliriz ama biz başka oyuncunun feshini geri alamayız" —
              // buton sadece feshi BAŞLATAN tarafa gösteriliyor (bkz.
              // FactorySponsorModal.jsx'teki AYNI kural).
              teamInfo.sponsorCancelInitiatedByMe ? (
                <button className="futbol-admin-submit" disabled={busyKey === 'withdraw-cancel'} onClick={handleWithdrawCancel}>
                  {busyKey === 'withdraw-cancel' ? '…' : '↩️ Feshi Geri Al'}
                </button>
              ) : (
                <span className="futbol-sp-muted">Feshi sadece başlatan taraf geri alabilir.</span>
              )
            ) : (
              <button className="futbol-admin-reset" disabled={busyKey === 'cancel'} onClick={handleCancel}>
                {busyKey === 'cancel' ? '…' : '❌ Feshet'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="futbol-placeholder">✨ Şu an bir sponsorumuz yok.</p>
      )}

      <p className="futbol-kadro-section-title">🏭 Tüm Fabrikalar ({otherFactories.length})</p>
      <input
        className="futbol-sponsor-input futbol-sp-search"
        type="search"
        placeholder="🔎 Fabrika ara..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="futbol-buy-list">
        {visibleFactories.length === 0 && <p className="futbol-placeholder">Eşleşen fabrika bulunamadı.</p>}
        {visibleFactories.map((f) => {
          const myOffer = f.theirPendingOffers.find((o) => o.fromRole === 'club');
          const factoryOffer = f.theirPendingOffers.find((o) => o.fromRole === 'factory');
          const offerOpen = expandedOfferId === f.ownerId;
          // pendingIsThis — bu fabrikanın teklifini kabul ettik (ya da bu
          // fabrika bizim teklifimizi kabul etti) ama henüz aktif değil,
          // bir sonraki 00:00'da devreye girecek — bkz. FactorySponsorModal.jsx
          // içindeki AYNI düzeltme.
          const pendingIsThis = teamInfo.pendingSponsorFactoryOwnerUid === f.ownerId;
          return (
            <div key={f.ownerId} className="futbol-buy-row futbol-sp-card">
              <FactoryHead
                factory={f}
                badge={f.isSelfSponsor ? '⭐ Senin Fabrikan' : null}
              />

              {f.note && (
                <p className="futbol-sp-note">
                  💬 {f.note}
                  {f.noteUpdatedByName && <span className="futbol-sp-note-author"> — {f.noteUpdatedByName}</span>}
                </p>
              )}

              {factoryOffer && (
                <div className="futbol-sp-alert ask">
                  <span>
                    📨 Fabrikanın teklifi: <strong>{fmt(factoryOffer.dailyAmount)} altın/gün</strong>
                  </span>
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

              {pendingIsThis ? (
                <p className="futbol-sp-alert ok">✅ Anlaşma sağlandı — {settle}'da sponsorumuz olacak.</p>
              ) : myOffer ? (
                <div className="futbol-sp-alert ask">
                  <span>
                    📤 Senin teklifin: <strong>{fmt(myOffer.dailyAmount)} altın/gün</strong> (bekliyor)
                  </span>
                  <button
                    className="futbol-admin-reset"
                    disabled={busyKey === `withdraw-${f.ownerId}`}
                    onClick={() => handleWithdraw(myOffer.id, f.ownerId)}
                  >
                    Teklifi Geri Çek
                  </button>
                </div>
              ) : offerOpen ? (
                <div className="futbol-sponsor-offer-box">
                  <QuantityStepper
                    value={offerDrafts[f.ownerId] ?? 0}
                    onChange={(v) => setOfferDrafts((d) => ({ ...d, [f.ownerId]: v }))}
                    max={f.offerCap}
                    step={1}
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
              ) : null}

              {!pendingIsThis && !myOffer && !offerOpen && (
                <div className="futbol-sp-actions">
                  {f.isSelfSponsor ? (
                    <button
                      className="futbol-admin-submit"
                      disabled={busyKey === `offer-${f.ownerId}`}
                      onClick={() => handleOffer(f.ownerId, true)}
                    >
                      {busyKey === `offer-${f.ownerId}` ? '…' : '🤝 Teklif Gönder (0 altın)'}
                    </button>
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
          );
        })}
      </div>
    </fieldset>
  );
}
