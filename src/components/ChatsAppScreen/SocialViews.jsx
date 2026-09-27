import { useState } from 'react';
import { useSocial } from '../../contexts/SocialContext';
import { socialAction } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PlayerCard from '../PlayerCard/PlayerCard';
import { hoursLeft } from './chatsappTime';

// v60 — ChatsApp › Arkadaşlar ve Arkadaşlık istekleri ekranları.
function Header({ title, onBack }) {
  return (
    <div className="ca-header">
      <button className="ca-back" onClick={onBack} aria-label="Sohbetler">
        ‹
      </button>
      <div className="ca-header-text">
        <span className="ca-header-name">{title}</span>
      </div>
    </div>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem yapılamadı.');
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

export function FriendsView({ onBack, onOpenChat }) {
  const { friends } = useSocial();
  const { busy, error, run } = useBusy();
  const [confirm, setConfirm] = useState(null);
  const [card, setCard] = useState(null);
  return (
    <div className="chatsapp-screen">
      <Header title={`Arkadaşlar (${friends.length})`} onBack={onBack} />
      <div className="ca-list">
        {friends.length === 0 && (
          <p className="ca-empty">
            Henüz arkadaşın yok. ChatsApp, Sixtagram ya da çete sohbetinde bir oyuncunun adına dokun ve “➕ Arkadaş ekle”ye bas.
          </p>
        )}
        {friends.map((f) => (
          <div key={f.uid} className="ca-row static">
            <button className="ca-row-avatar" onClick={() => setCard(f)} aria-label={`${f.name} profilini gör`}>
              <AvatarSvg avatar={f.avatar} size={44} rounded />
            </button>
            <div className="ca-row-main">
              <span className="ca-row-name">{f.name}</span>
            </div>
            {confirm === f.uid ? (
              <>
                <button className="ca-btn danger" disabled={busy === f.uid} onClick={() => run(f.uid, () => socialAction('removeFriend', { targetUid: f.uid }).then(() => setConfirm(null)))}>
                  {busy === f.uid ? '…' : 'Çıkar'}
                </button>
                <button className="ca-btn ghost" onClick={() => setConfirm(null)}>
                  Vazgeç
                </button>
              </>
            ) : (
              <>
                <button className="ca-btn primary" onClick={() => onOpenChat(f)} aria-label={`${f.name} ile sohbet`}>
                  💬 Mesaj
                </button>
                <button className="ca-btn ghost" onClick={() => setConfirm(f.uid)} aria-label={`${f.name} arkadaşlıktan çıkar`} title="Arkadaşlıktan çıkar">
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
        {confirm && <p className="ca-hint">Arkadaşlıktan çıkarırsan aranızdaki sohbet iki taraftan da silinir.</p>}
        {error && <p className="chatsapp-error">{error}</p>}
      </div>
      {card && <PlayerCard uid={card.uid} name={card.name} avatar={card.avatar} onClose={() => setCard(null)} />}
    </div>
  );
}

export function RequestsView({ onBack }) {
  const { incoming, outgoing } = useSocial();
  const { busy, error, run } = useBusy();
  const [tab, setTab] = useState('in');
  const [card, setCard] = useState(null);
  const list = tab === 'in' ? incoming : outgoing;
  return (
    <div className="chatsapp-screen">
      <Header title="Arkadaşlık istekleri" onBack={onBack} />
      <div className="ca-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'in'} className={`ca-tab${tab === 'in' ? ' on' : ''}`} onClick={() => setTab('in')}>
          Gelen ({incoming.length})
        </button>
        <button role="tab" aria-selected={tab === 'out'} className={`ca-tab${tab === 'out' ? ' on' : ''}`} onClick={() => setTab('out')}>
          Gönderilen ({outgoing.length})
        </button>
      </div>
      <div className="ca-list">
        {list.length === 0 && <p className="ca-empty">{tab === 'in' ? 'Bekleyen arkadaşlık isteğin yok.' : 'Gönderdiğin bekleyen istek yok.'}</p>}
        {list.map((r) => {
          const other = tab === 'in' ? { uid: r.fromUid, name: r.fromName, avatar: r.fromAvatar } : { uid: r.toUid, name: r.toName, avatar: r.toAvatar };
          return (
            <div key={r.id} className="ca-row static">
              <button className="ca-row-avatar" onClick={() => setCard(other)} aria-label={`${other.name} profilini gör`}>
                <AvatarSvg avatar={other.avatar} size={44} rounded />
              </button>
              <div className="ca-row-main">
                <span className="ca-row-name">{other.name}</span>
                <span className="ca-row-last">{hoursLeft(r.expiresAtMs)} saat içinde yanıtlanmazsa silinir</span>
              </div>
              {tab === 'in' ? (
                <>
                  <button className="ca-btn primary" disabled={busy === r.id} onClick={() => run(r.id, () => socialAction('respondFriendRequest', { fromUid: r.fromUid, accept: true }))}>
                    Kabul et
                  </button>
                  <button className="ca-btn ghost" disabled={busy === r.id} onClick={() => run(r.id, () => socialAction('respondFriendRequest', { fromUid: r.fromUid, accept: false }))}>
                    Reddet
                  </button>
                </>
              ) : (
                <button className="ca-btn ghost" disabled={busy === r.id} onClick={() => run(r.id, () => socialAction('cancelFriendRequest', { targetUid: r.toUid }))}>
                  Geri al
                </button>
              )}
            </div>
          );
        })}
        {error && <p className="chatsapp-error">{error}</p>}
      </div>
      {card && <PlayerCard uid={card.uid} name={card.name} avatar={card.avatar} onClose={() => setCard(null)} />}
    </div>
  );
}
