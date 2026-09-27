import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import FutbolCrest from '../FutbolScreen/FutbolCrest';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { getPlayerCard, socialAction } from '../../services/gameActions';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { useSocial } from '../../contexts/SocialContext';
import { openDmWith } from '../../lib/chatsappNav';
import { factoryDisplayName } from '../FactoryScreen/factoryHelpers';
import './PlayerCard.css';

// PlayerCard — v53 Oyuncu Kartı. Bir oyuncunun avatarına / adına dokununca
// (ChatsApp, çete sohbeti, Sixtagram, yorumlar, fikirler, mekandaki
// "Yakındakiler") açılır. Önce OLUMLU bilgi: avatar, çete, fabrika, takım,
// Sixtagram beğenisi (sunucudan, yalnızca herkese açık alanlar — bkz.
// functions/playerCard.js; İstihbarat üyeliği asla gösterilmez).
// Bildir / Engelle köşedeki küçük ⋯ içinde.
//
// props:
//   uid, name, avatar  — elde olan ad/avatar (kart yüklenirken hemen görünür)
//   reportItems        — bu bağlamdaki içerik (ör. dokunulan mesaj) — ⋯ içinde en üstte
//   onClose
const cache = new Map(); // oturum içi kısa önbellek: aynı kişiye tekrar dokununca anında
const CACHE_MS = 60_000;

// v56: Sunucudan ham "internal" gibi teknik bir kod gelirse oyuncuya anlaşılır
// bir mesaj göster; asıl hata geliştirici konsoluna yazılır. "internal" çoğu
// zaman getPlayerCard fonksiyonunun sunucuda (europe-west1) bulunmadığı ya da
// herkese açık çağrı izninin olmadığı anlamına gelir (bkz. v56 notları).
// v60 — Yedek gösterim: sunucuya (getPlayerCard) ulaşılamazsa herkese açık
// verilerle doldurulur (fabrika, takım, Sixtagram beğenisi). Çete üyeliği
// gizli veri olduğu için yedekte GÖSTERİLMEZ.
async function publicCardOf(uid) {
  const [fac, owned, managed, six] = await Promise.all([
    getDoc(doc(db, 'factories', uid)).catch(() => null),
    getDocs(query(collection(db, 'futbolTeams'), where('ownerUid', '==', uid), limit(3))).catch(() => null),
    getDocs(query(collection(db, 'futbolTeams'), where('managerUid', '==', uid), limit(3))).catch(() => null),
    getDoc(doc(db, 'sixtagramProfiles', uid)).catch(() => null),
  ]);
  const teams = [];
  const seen = new Set();
  for (const [snap, role] of [
    [owned, 'owner'],
    [managed, 'manager'],
  ]) {
    for (const d of snap?.docs || []) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const t = d.data();
      teams.push({ id: d.id, name: t.name || 'Takım', logo: t.logo || null, role: t.ownerUid === uid ? 'owner' : role });
    }
  }
  return {
    uid,
    gang: null,
    factory: fac?.exists() ? { name: factoryDisplayName(fac.data()) } : null,
    teams,
    sixtagramLikes: Number((six?.exists() ? six.data()?.totalLikes : 0) || 0),
    partial: true,
  };
}

function friendlyError(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const msg = String(err?.message || '');
  if (code === 'invalid-argument' || code === 'not-found' || code === 'unauthenticated') return msg || 'Oyuncu bulunamadı.';
  return 'Oyuncu bilgileri şu an yüklenemedi.';
}

export default function PlayerCard({ uid, name, avatar, reportItems = [], onClose, hideMessageButton = false }) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const { relationOf } = useSocial();
  const relation = relationOf(uid);
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialMsg, setSocialMsg] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [card, setCard] = useState(() => {
    const c = cache.get(uid);
    return c && Date.now() - c.at < CACHE_MS ? c.data : null;
  });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const isSelf = user?.uid === uid;

  useEffect(() => {
    let alive = true;
    const c = cache.get(uid);
    if (c && Date.now() - c.at < CACHE_MS) return undefined;
    setError('');
    getPlayerCard(uid)
      .then((data) => {
        cache.set(uid, { at: Date.now(), data });
        if (alive) setCard(data);
      })
      .catch(async (err) => {
        console.warn('getPlayerCard hatası', err?.code, err?.message, err?.details);
        const code = String(err?.code || '').replace(/^functions\//, '');
        if (code === 'invalid-argument' || code === 'not-found' || code === 'unauthenticated') {
          if (alive) setError(friendlyError(err));
          return;
        }
        // v60: sunucuya ulaşılamadı → herkese açık verilerle yedek kart
        try {
          const fallback = await publicCardOf(uid);
          if (alive) setCard(fallback);
        } catch {
          if (alive) setError(friendlyError(err));
        }
      });
    return () => {
      alive = false;
    };
  }, [uid, attempt]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runSocial = async (action, payload, okText) => {
    setSocialBusy(true);
    setSocialMsg('');
    try {
      const r = await socialAction(action, payload);
      // Başarı düğmelerin değişmesinden anlaşılır; yalnızca karşılıklı istekte kısa not
      if (r?.result === 'accepted') setSocialMsg(okText(r));
    } catch (err) {
      setSocialMsg(err.message || 'İşlem yapılamadı.');
    } finally {
      setSocialBusy(false);
    }
  };

  const shownName = card?.name || name || 'Oyuncu';
  const shownAvatar = card?.avatar || avatar || null;
  const teams = card?.teams || [];
  const nothing = card && !card.gang && !card.factory && teams.length === 0;

  return (
    <>
      {createPortal(
        <div className="pc-backdrop" onClick={onClose}>
          <div className="pc-sheet" role="dialog" aria-modal="true" aria-label={`${shownName} — oyuncu kartı`} onClick={(e) => e.stopPropagation()}>
            <div className="pc-grip" aria-hidden="true" />
            {!isSelf && user && (
              <button className="pc-more" onClick={() => setMoreOpen(true)} aria-label="Diğer seçenekler" title="Diğer">
                ⋯
              </button>
            )}
            <div className="pc-hero">
              <div className="pc-avatar">
                <AvatarSvg avatar={shownAvatar} />
              </div>
              <p className="pc-name">
                {shownName}
                {isSelf && <span className="pc-you"> (sen)</span>}
              </p>
              {isBlocked(uid) && <span className="pc-blocked">Engelledin</span>}
            </div>

            {/* v60 — Arkadaşlık */}
            {user && !isSelf && !isBlocked(uid) && (
              <div className="pc-social">
                {relation === 'none' && (
                  <button className="pc-social-btn primary" disabled={socialBusy} onClick={() => runSocial('sendFriendRequest', { targetUid: uid }, (r) => (r?.result === 'accepted' ? 'Artık arkadaşsınız! 🎉' : 'Arkadaşlık isteği gönderildi.'))}>
                    ➕ Arkadaş ekle
                  </button>
                )}
                {relation === 'outgoing' && (
                  <button className="pc-social-btn" disabled={socialBusy} onClick={() => runSocial('cancelFriendRequest', { targetUid: uid }, () => 'İstek geri alındı.')}>
                    ⏳ İstek gönderildi · Geri al
                  </button>
                )}
                {relation === 'incoming' && (
                  <>
                    <button className="pc-social-btn primary" disabled={socialBusy} onClick={() => runSocial('respondFriendRequest', { fromUid: uid, accept: true }, () => 'Artık arkadaşsınız! 🎉')}>
                      ✅ İsteği kabul et
                    </button>
                    <button className="pc-social-btn" disabled={socialBusy} onClick={() => runSocial('respondFriendRequest', { fromUid: uid, accept: false }, () => 'İstek reddedildi.')}>
                      Reddet
                    </button>
                  </>
                )}
                {relation === 'friend' && !confirmRemove && (
                  <>
                    {!hideMessageButton && (
                      <button
                        className="pc-social-btn primary"
                        onClick={() => {
                          onClose();
                          openDmWith(uid, shownName, shownAvatar);
                        }}
                      >
                        💬 Mesaj
                      </button>
                    )}
                    <button className="pc-social-btn" onClick={() => setConfirmRemove(true)}>
                      👥 Arkadaşlıktan çıkar
                    </button>
                  </>
                )}
                {relation === 'friend' && confirmRemove && (
                  <>
                    <button className="pc-social-btn danger" disabled={socialBusy} onClick={() => runSocial('removeFriend', { targetUid: uid }, () => 'Arkadaşlıktan çıkarıldı.').then(() => setConfirmRemove(false))}>
                      Evet, çıkar (sohbet silinir)
                    </button>
                    <button className="pc-social-btn" onClick={() => setConfirmRemove(false)}>
                      Vazgeç
                    </button>
                  </>
                )}
                {socialMsg && <p className="pc-social-msg">{socialMsg}</p>}
              </div>
            )}
    
            {!card && !error && <p className="pc-loading">Yükleniyor…</p>}
            {error && (
              <p className="pc-error">
                {error}{' '}
                <button className="pc-retry" onClick={() => setAttempt((n) => n + 1)}>
                  Tekrar dene
                </button>
              </p>
            )}
            {card && (
              <div className="pc-rows">
                {card.gang && (
                  <div className="pc-row">
                    <span className="pc-label">Çete</span>
                    <span className="pc-value">
                      <span
                        className="pc-gang-logo"
                        style={{ background: card.gang.logo?.bg || '#101318', boxShadow: `0 0 0 2px ${card.gang.logo?.color || '#fff'}` }}
                        aria-hidden="true"
                      >
                        {card.gang.logo?.emoji || '🏴'}
                      </span>
                      <span className="pc-strong">{card.gang.name}</span>
                      {card.gang.rankLabel && <span className="pc-sub">{card.gang.rankLabel}</span>}
                    </span>
                  </div>
                )}
                {card.factory && (
                  <div className="pc-row">
                    <span className="pc-label">Fabrika</span>
                    <span className="pc-value">
                      <span className="pc-emoji" aria-hidden="true">
                        🏭
                      </span>
                      <span className="pc-strong">{card.factory.name}</span>
                    </span>
                  </div>
                )}
                {teams.map((t) => (
                  <div key={t.id} className="pc-row">
                    <span className="pc-label">{t.role === 'owner' ? 'Takımı' : 'Menajeri'}</span>
                    <span className="pc-value">
                      <FutbolCrest logo={t.logo} size={22} />
                      <span className="pc-strong">{t.name}</span>
                      <span className="pc-sub">{t.role === 'owner' ? 'Sahibi' : 'Menajer'}</span>
                    </span>
                  </div>
                ))}
                <div className="pc-row">
                  <span className="pc-label">Sixtagram</span>
                  <span className="pc-value">
                    <span className="pc-emoji" aria-hidden="true">
                      ❤️
                    </span>
                    <span className="pc-strong">{(card.sixtagramLikes || 0).toLocaleString('tr-TR')}</span>
                    <span className="pc-sub">toplam beğeni</span>
                  </span>
                </div>
                {nothing && !card.partial && <p className="pc-empty">Henüz bir çetesi, fabrikası ya da takımı yok.</p>}
                {card.partial && <p className="pc-empty">Çete bilgisi şu an gösterilemiyor.</p>}
              </div>
            )}
    
            <button className="pc-close" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>,
        document.body
      )}
      {/* ReportBlockSheet kendi portalıyla kartın üstünde açılır (kartın arka plan tıklamasını tetiklemez) */}
      {moreOpen && (
        <ReportBlockSheet
          targetUid={uid}
          targetName={shownName}
          items={[...reportItems, { label: 'Oyuncuyu bildir', targetType: 'user', targetPath: `users/${uid}` }]}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}
