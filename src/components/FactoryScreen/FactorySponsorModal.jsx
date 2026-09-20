import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listSponsorshipTeamsForFactory,
  sendFactorySponsorshipOffer,
  respondSponsorshipOffer,
  withdrawSponsorshipOffer,
  cancelSponsorship,
  withdrawSponsorshipCancellation,
  raiseSponsorshipFee,
  respondSponsorshipFeeRaiseRequest,
  updateSponsorshipNote,
} from '../../services/gameActions';
import { nextSponsorshipSettleLabel } from '../../lib/istanbulTime';
import FutbolCrest from '../FutbolScreen/FutbolCrest';
import QuantityStepper from '../QuantityStepper/QuantityStepper';

// SPONSOR_QUICK_AMOUNTS — kullanıcı isteği: "boş kutuya klavyeden sayı
// yazmak" yerine oyunun bir çok yerinde (bkz. FutbolTakimim.jsx
// CLUB_PRICE_QUICK_AMOUNTS) kullanılan buton tabanlı miktar seçici AYNI
// altın tutarlarıyla burada da kullanılıyor.
const SPONSOR_QUICK_AMOUNTS = [10, 100, 1000, 10000, 100000, { value: 1000000, label: '1M' }];

const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR');

// teamPeopleLabel — KULLANICI DÜZELTMESİ: botlara ait olup MENAJERİ olan
// takımlar bu ekranda "🤖 Bot" diye görünüyordu. Artık menajer varsa
// "Menajer: xxx" yazılıyor; gerçekten kimsenin yönetmediği takım "Bot
// yönetimi", başkanı olan takım "Başkan: xxx" olarak gösteriliyor.
function teamPeopleLabel(t) {
  const hasOwner = t.hasOwner ?? !t.isBot;
  const parts = [];
  if (t.managerName) parts.push(`🧑‍💼 Menajer: ${t.managerName}`);
  if (hasOwner) parts.push(`👔 Başkan: ${t.chairman}`);
  if (parts.length === 0) parts.push('🤖 Bot yönetimi');
  return parts.join(' · ');
}

// TeamHead — iki listede (sponsor olduklarım / tüm kulüpler) AYNI kart
// başlığı: arma + isim + tek satır özet, sağda durum bilgisi (`aside`).
function TeamHead({ team, badge, aside }) {
  return (
    <div className="factory-sp-head">
      <FutbolCrest logo={team.logo} initials={team.name?.[0]} size={34} />
      <div className="factory-sp-head-info">
        <span className="factory-sp-name">
          {team.name}
          {badge && <span className="factory-sponsor-badge">{badge}</span>}
        </span>
        <span className="factory-sp-meta">
          {team.tier}. Lig · 👥 {fmt(team.fans)} · 💎 {fmt(team.value)}
        </span>
        <span className="factory-sp-meta">{teamPeopleLabel(team)}</span>
      </div>
      {aside && <div className="factory-sp-aside">{aside}</div>}
    </div>
  );
}

// NoteLine/NoteEditor — kısa not: varsa tek satır, düzenleme sadece butona
// basınca açılır (kart kalabalık görünmesin diye).
function NoteLine({ team }) {
  if (!team.note) return null;
  return (
    <p className="factory-sp-note">
      💬 {team.note}
      {team.noteUpdatedByName && <span className="factory-sponsor-note-author"> — {team.noteUpdatedByName}</span>}
    </p>
  );
}

// FactorySponsorModal — fabrika sahibinin "Sponsor" ekranı. Önce KENDİ
// sponsor olduğu takım(lar), sonra tüm diğer takımlar listelenir (bkz.
// functions/index.js listSponsorshipTeamsForFactory — sıralama zaten
// sunucuda yapılıyor, burada olduğu gibi render ediliyor).
//
// KULLANICI İSTEĞİ: "sponsorluk ekranı biraz karışık geliyor, biraz daha
// sadeleştirip daha kaliteli hale getirebiliriz" — tek bir özet kartı
// (teklif limiti + sponsorluk saati), kartlarda tek satırlık bilgi,
// durum uyarıları en fazla birkaç kısa satır, eylemler tek sırada küçük
// butonlar, ikincil işler (not, tutar seçici) sadece butona basılınca açılır
// ve kulüp listesinde arama kutusu var.
export default function FactorySponsorModal({ onClose }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [offerDrafts, setOfferDrafts] = useState({});
  const [raiseDrafts, setRaiseDrafts] = useState({});
  // expandedOfferId/expandedRaiseId — kullanıcı isteği: "sayı yazabileceğimiz
  // boş kutu olmasın, teklif ver butonuna bastığımızda aktif olsun" — teklif
  // tutar seçici (QuantityStepper) sadece ilgili "Teklif Gönder"/"Yükselt"
  // butonuna basılınca o kartta açılır.
  const [expandedOfferId, setExpandedOfferId] = useState(null);
  const [expandedRaiseId, setExpandedRaiseId] = useState(null);
  const [noteEditingId, setNoteEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [search, setSearch] = useState('');
  // infoMessage — bot kulüplere gönderilen tekliflerin sonucu ANINDA belli
  // olduğu için (kabul/red, bkz. functions/index.js sendFactorySponsorshipOffer)
  // kullanıcıya kısa bir geri bildirim gösteriyoruz — aksi halde buton
  // sadece tekrar "Teklif Gönder" haline dönüyor ve ne olduğu belirsiz kalıyor.
  const [infoMessage, setInfoMessage] = useState('');

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

  // settle — "bugün 19:00" / "yarın 19:00": sponsorluk işlemlerinin devreye
  // gireceği bir sonraki an (bkz. istanbulTime.js nextSponsorshipSettleLabel).
  const settle = nextSponsorshipSettleLabel();

  // handleSponsorOl — kendi takımımıza (isSelfSponsor) teklif her zaman 0
  // altınla ANINDA gönderilir, tutar seçici hiç açılmaz. Diğer takımlarda
  // seçilen tutar gönderilir. Bot kulüpler teklifi ANINDA kabul/red eder
  // (bkz. sendFactorySponsorshipOffer) — sonucu sunucunun döndüğü
  // `autoBot`/`accepted` alanlarından okuyoruz (menajerli takım "bot" DEĞİL,
  // teklif menajerin onayına düşer, o yüzden takım tipini istemcide tahmin
  // etmiyoruz).
  const handleSponsorOl = (teamId, teamName, isSelfSponsor) => {
    const amount = isSelfSponsor ? 0 : Math.max(0, Math.round(Number(offerDrafts[teamId] ?? 0)));
    setInfoMessage('');
    runAction(`offer-${teamId}`, async () => {
      const res = await sendFactorySponsorshipOffer(teamId, amount);
      if (res?.data?.autoBot) {
        setInfoMessage(
          res.data.accepted
            ? `✅ ${teamName} teklifini kabul etti — ${nextSponsorshipSettleLabel()}'da sponsor olacaksın.`
            : `❌ ${teamName} teklifini reddetti — mevcut sponsoru/teklifi bu tutara eşit ya da daha yüksek.`
        );
      } else {
        setInfoMessage(`📤 Teklifin ${teamName} yönetimine iletildi — cevap bekleniyor.`);
      }
    }).then(() => {
      setExpandedOfferId(null);
      setOfferDrafts((d) => ({ ...d, [teamId]: 0 }));
    });
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

  // handleWithdrawCancel — KULLANICI İSTEĞİ: "sponsorluğu feshettiğimde
  // iptal etme özelliği olsun, yanlışlıkla tıklayanlar ya da vazgeçenler
  // için" (bkz. functions/index.js withdrawSponsorshipCancellation).
  const handleWithdrawCancel = (teamId) => {
    runAction(`withdraw-cancel-${teamId}`, () => withdrawSponsorshipCancellation(teamId));
  };

  const handleRaise = (teamId) => {
    const amount = Math.max(0, Math.round(Number(raiseDrafts[teamId] ?? 0)));
    runAction(`raise-${teamId}`, () => raiseSponsorshipFee(teamId, amount)).then(() => {
      setExpandedRaiseId(null);
    });
  };

  // handleFeeRaiseRequestRespond — KULLANICI İSTEĞİ: "takımlar da ücreti
  // yükseltme talebi gönderebilsin" — kulübün gönderdiği talebi kabul/red.
  const handleFeeRaiseRequestRespond = (teamId, accept) => {
    runAction(`fee-request-${teamId}`, () => respondSponsorshipFeeRaiseRequest(teamId, accept));
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

  const teams = data?.teams;
  const mySponsorships = useMemo(() => (teams || []).filter((t) => t.isMySponsorship), [teams]);
  const otherTeams = useMemo(() => (teams || []).filter((t) => !t.isMySponsorship), [teams]);
  const visibleTeams = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return otherTeams;
    return otherTeams.filter((t) =>
      [t.name, t.chairman, t.managerName, t.sponsorFactoryName]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('tr-TR').includes(q))
    );
  }, [otherTeams, search]);

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

  const { offerCap, dailyIncomeAvg10 } = data;

  // renderNoteEditor — not düzenleme/ekleme kutusu (iki listede de aynı).
  const renderNoteEditor = (t) => (
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
  );

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">🤝 Sponsorluk</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Özet kartı — tek bakışta: teklif limitin + anlaşmaların ne zaman
            devreye gireceği. (Eskiden iki ayrı, küçük yazılı ipucu paragrafıydı;
            sponsorluk işlemleri 00:00'da değil her gün 19:00'da işleniyor.) */}
        <div className="factory-sp-summary">
          <div className="factory-sp-summary-main">
            <span className="factory-sp-summary-label">Teklif limitin</span>
            <span className="factory-sp-summary-value">{fmt(offerCap)} altın/gün</span>
            <span className="factory-sp-summary-sub">
              Son 10 gün ort. gelirin {fmt(dailyIncomeAvg10)} altın · limit bunun %25'i
            </span>
          </div>
          <p className="factory-sp-summary-time">
            ⏰ Yeni anlaşma, fesih ve ücret değişiklikleri her gün <strong>19:00</strong>'da devreye girer — sıradaki:{' '}
            <strong>{settle}</strong>
          </p>
        </div>

        {error && <p className="factory-error">{error}</p>}
        {infoMessage && <p className="factory-sp-flash">{infoMessage}</p>}

        {mySponsorships.length > 0 && (
          <>
            <p className="factory-step-label">⭐ Sponsoru olduğum takımlar ({mySponsorships.length})</p>
            <div className="factory-share-list">
              {mySponsorships.map((t) => {
                const beingReplaced = t.pendingSponsorFactoryOwnerUid && t.pendingSponsorFactoryOwnerUid !== user.uid;
                // minRaiseAmount — rakip bir pendingSponsor varsa sponsorluğu
                // tutmak için ondan (ve mevcut ücretten) DAHA YÜKSEK bir tutar
                // girmek şart (bkz. applySponsorshipFeeRaise). KULLANICI
                // REVİZESİ: "ücreti yükselt'e bastığımızda 1 artsın" —
                // seçici artık mevcut ücretin (ya da rakip teklifin) 1 üstünden başlıyor.
                const minRaiseAmount =
                  Math.max(t.sponsorDailyAmount || 0, beingReplaced ? t.pendingSponsorDailyAmount || 0 : 0) + 1;
                const raiseBlocked = minRaiseAmount > offerCap;
                const raiseOpen = expandedRaiseId === t.id;
                const raiseValue = Math.max(raiseDrafts[t.id] ?? minRaiseAmount, minRaiseAmount);
                return (
                  <div key={t.id} className="factory-share-buy-card factory-sp-card">
                    <TeamHead
                      team={t}
                      aside={
                        <>
                          <span className="factory-sp-amount">{fmt(t.sponsorDailyAmount)}</span>
                          <span className="factory-sp-amount-unit">altın/gün</span>
                        </>
                      }
                    />

                    {beingReplaced && (
                      <p className="factory-sp-alert warn">
                        <span>
                          ⚠️ {t.pendingSponsorFactoryName || 'Başka bir fabrika'}{' '}
                          <strong>{fmt(t.pendingSponsorDailyAmount)} altın/gün</strong> teklif etti. {settle}'a kadar
                          daha yüksek bir ücret girmezsen sponsorluk el değiştirecek.
                        </span>
                      </p>
                    )}

                    {t.sponsorCancelPending && (
                      <div className="factory-sp-alert warn">
                        <span>⚠️ Fesih bekliyor — {settle}'da (yeni ödeme yapılmadan) sona erecek.</span>
                        {/* KULLANICI REVİZESİ: "biz kendimiz feshettiysek geri
                            alabiliriz ama biz başka oyuncunun feshini geri
                            alamayız" — buton sadece feshi BAŞLATAN tarafa
                            gösteriliyor, karşı tarafa sadece bilgi metni. */}
                        {t.sponsorCancelInitiatedByMe ? (
                          <button
                            className="factory-btn small primary"
                            disabled={busyKey === `withdraw-cancel-${t.id}`}
                            onClick={() => handleWithdrawCancel(t.id)}
                          >
                            {busyKey === `withdraw-cancel-${t.id}` ? '…' : '↩️ Feshi Geri Al'}
                          </button>
                        ) : (
                          <span className="factory-sp-muted">Feshi sadece başlatan taraf geri alabilir.</span>
                        )}
                      </div>
                    )}

                    {t.feeRaiseRequest && (
                      <div className="factory-sp-alert ask">
                        <span>
                          🙋 {t.feeRaiseRequest.requestedByName || 'Kulüp'} ücreti{' '}
                          <strong>{fmt(t.feeRaiseRequest.requestedAmount)} altın/gün</strong> yapmanı istiyor.
                        </span>
                        <div className="factory-sponsor-note-actions">
                          <button
                            className="factory-btn small"
                            disabled={busyKey === `fee-request-${t.id}`}
                            onClick={() => handleFeeRaiseRequestRespond(t.id, false)}
                          >
                            Reddet
                          </button>
                          <button
                            className="factory-btn small primary"
                            disabled={busyKey === `fee-request-${t.id}`}
                            onClick={() => handleFeeRaiseRequestRespond(t.id, true)}
                          >
                            Kabul Et
                          </button>
                        </div>
                      </div>
                    )}

                    <NoteLine team={t} />

                    {raiseOpen && (
                      <div className="factory-sponsor-offer-box">
                        {/* KULLANICI REVİZESİ: "sponsorluk tekliflerinde -
                            ve + basınca 10 10 artıyor, 1 1 artsın" — step
                            1 (quickAmounts hâlâ hızlı artış sağlıyor). */}
                        <QuantityStepper
                          value={raiseValue}
                          onChange={(v) => setRaiseDrafts((d) => ({ ...d, [t.id]: Math.max(v, minRaiseAmount) }))}
                          max={offerCap}
                          step={1}
                          quickAmounts={SPONSOR_QUICK_AMOUNTS}
                        />
                        <p className="factory-sp-muted">
                          En az {fmt(minRaiseAmount)}, en fazla {fmt(offerCap)} altın/gün.
                          {beingReplaced && ' Rakip teklifi geçmen gerekiyor.'}
                        </p>
                        <div className="factory-sponsor-note-actions">
                          <button className="factory-btn small" onClick={() => setExpandedRaiseId(null)}>
                            Vazgeç
                          </button>
                          <button
                            className="factory-btn small primary"
                            disabled={busyKey === `raise-${t.id}` || raiseValue < minRaiseAmount}
                            onClick={() => handleRaise(t.id)}
                          >
                            {busyKey === `raise-${t.id}` ? '…' : 'Gönder'}
                          </button>
                        </div>
                      </div>
                    )}

                    {noteEditingId === t.id && renderNoteEditor(t)}

                    {/* Eylem satırı — hepsi tek sırada, küçük butonlar. */}
                    {!raiseOpen && noteEditingId !== t.id && (
                      <div className="factory-sp-actions">
                        {!t.isSelfSponsor && !t.sponsorCancelPending && (
                          <button
                            className="factory-btn small primary"
                            disabled={raiseBlocked}
                            title={raiseBlocked ? 'Teklif limitine ulaştın.' : undefined}
                            onClick={() => {
                              setExpandedRaiseId(t.id);
                              setRaiseDrafts((d) => ({ ...d, [t.id]: minRaiseAmount }));
                            }}
                          >
                            {beingReplaced ? '🔁 Geri Kap' : '📈 Ücreti Yükselt'}
                          </button>
                        )}
                        <button className="factory-btn small" onClick={() => openNoteEditor(t)}>
                          ✏️ Not
                        </button>
                        {!t.sponsorCancelPending && (
                          <button
                            className="factory-fire-btn"
                            disabled={busyKey === `cancel-${t.id}`}
                            onClick={() => handleCancel(t.id)}
                          >
                            {busyKey === `cancel-${t.id}` ? '…' : '❌ Feshet'}
                          </button>
                        )}
                      </div>
                    )}
                    {raiseBlocked && !t.isSelfSponsor && !t.sponsorCancelPending && !raiseOpen && (
                      <p className="factory-sp-muted">Teklif limitine ulaştığın için ücreti daha fazla yükseltemezsin.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="factory-step-label">🏟️ Tüm Kulüpler ({otherTeams.length})</p>
        <input
          className="factory-name-input factory-sp-search"
          type="search"
          placeholder="🔎 Kulüp, başkan ya da menajer ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="factory-share-list">
          {visibleTeams.length === 0 && <p className="factory-hint">Eşleşen kulüp bulunamadı.</p>}
          {visibleTeams.map((t) => {
            const myOffer = t.myPendingOffers.find((o) => o.fromRole === 'factory');
            const clubOffer = t.myPendingOffers.find((o) => o.fromRole === 'club');
            const offerOpen = expandedOfferId === t.id;
            // pendingIsMe — teklifim (bot ise anında, oyuncuysa kabul
            // ettikten sonra) kabul edildi ama henüz aktif değil (bir
            // sonraki sponsorluk saatinde devreye girecek) — bu durumda
            // "Teklif Gönder" butonunu tekrar göstermek yerine bekleme
            // durumunu gösteriyoruz (bkz. kullanıcı bildirdiği hata: bot
            // kulüplerde teklif kabul edilse bile buton hep "Teklif Gönder"
            // kalıyordu).
            const pendingIsMe = t.pendingSponsorFactoryOwnerUid === user.uid;
            return (
              <div key={t.id} className="factory-share-buy-card factory-sp-card">
                <TeamHead
                  team={t}
                  badge={t.isSelfSponsor ? '⭐ Kendi Takımın' : null}
                  aside={
                    t.sponsorFactoryOwnerUid ? (
                      <>
                        <span className="factory-sp-chip">🤝 {t.sponsorFactoryName}</span>
                        <span className="factory-sp-amount-unit">{fmt(t.sponsorDailyAmount)} altın/gün</span>
                      </>
                    ) : (
                      <span className="factory-sp-chip free">Sponsor yok</span>
                    )
                  }
                />

                <NoteLine team={t} />

                {clubOffer && (
                  <div className="factory-sp-alert ask">
                    <span>
                      📨 Kulüp senden sponsorluk istiyor: <strong>{fmt(clubOffer.dailyAmount)} altın/gün</strong>
                    </span>
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

                {pendingIsMe ? (
                  <p className="factory-sp-alert ok">
                    <span>✅ Teklifin kabul edildi — {settle}'da sponsor olacaksın.</span>
                  </p>
                ) : myOffer ? (
                  <div className="factory-sp-alert ask">
                    <span>
                      📤 Teklifin: <strong>{fmt(myOffer.dailyAmount)} altın/gün</strong> (bekliyor)
                    </span>
                    <button
                      className="factory-btn small"
                      disabled={busyKey === `withdraw-${t.id}`}
                      onClick={() => handleWithdraw(myOffer.id, t.id)}
                    >
                      Geri Çek
                    </button>
                  </div>
                ) : offerOpen ? (
                  <div className="factory-sponsor-offer-box">
                    <QuantityStepper
                      value={offerDrafts[t.id] ?? 0}
                      onChange={(v) => setOfferDrafts((d) => ({ ...d, [t.id]: v }))}
                      max={offerCap}
                      step={1}
                      quickAmounts={SPONSOR_QUICK_AMOUNTS}
                    />
                    <p className="factory-sp-muted">En fazla {fmt(offerCap)} altın/gün teklif edebilirsin.</p>
                    <div className="factory-sponsor-note-actions">
                      <button className="factory-btn small" onClick={() => setExpandedOfferId(null)}>
                        Vazgeç
                      </button>
                      <button
                        className="factory-btn small primary"
                        disabled={busyKey === `offer-${t.id}`}
                        onClick={() => handleSponsorOl(t.id, t.name, false)}
                      >
                        {busyKey === `offer-${t.id}` ? '…' : 'Gönder'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {noteEditingId === t.id && renderNoteEditor(t)}

                {!pendingIsMe && !myOffer && !offerOpen && noteEditingId !== t.id && (
                  <div className="factory-sp-actions">
                    {t.isSelfSponsor ? (
                      <button
                        className="factory-btn small primary"
                        disabled={busyKey === `offer-${t.id}`}
                        onClick={() => handleSponsorOl(t.id, t.name, true)}
                      >
                        {busyKey === `offer-${t.id}` ? '…' : '🤝 Sponsor Ol (0 altın)'}
                      </button>
                    ) : (
                      <button
                        className="factory-btn small primary"
                        onClick={() => {
                          setExpandedOfferId(t.id);
                          setOfferDrafts((d) => ({ ...d, [t.id]: d[t.id] ?? 0 }));
                        }}
                      >
                        🤝 Teklif Gönder
                      </button>
                    )}
                    <button className="factory-btn small" onClick={() => openNoteEditor(t)}>
                      ✏️ Not
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
