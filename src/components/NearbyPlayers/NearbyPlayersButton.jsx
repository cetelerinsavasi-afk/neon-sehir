import { useState } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PlayerCard from '../PlayerCard/PlayerCard';
import { useBlocks } from '../../contexts/BlocksContext';
import './NearbyPlayersButton.css';

// NearbyPlayersButton — dünya ekranlarında (Park + 7 mekân) sağdaki düğme
// sütununun en üstünde 👥. Aynı ekrandaki oyuncuları listeler; bir oyuncuya
// dokununca Oyuncu Kartı açılır (v53). Balonu bildirmek kartın ⋯ menüsünde.
//
// props: others (use*Presence'tan), collectionName ('parkPresence' | 'interiorPresence'),
//        className (ekranın düğme stili: 'pw' | 'ws')
export default function NearbyPlayersButton({ others = [], collectionName, variant = 'ws' }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const { isBlocked } = useBlocks();

  return (
    <>
      <button className={`nearby-btn nearby-btn-${variant}`} onClick={() => setOpen(true)} title="Yakındakiler" aria-label="Yakındaki oyuncular">
        👥{others.length > 0 && <span className="nearby-count">{others.length}</span>}
      </button>

      {open && !target && (
        <div className="nearby-backdrop" onClick={() => setOpen(false)}>
          <div className="nearby-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="nearby-title">Yakındakiler</p>
            {others.length === 0 && <p className="nearby-empty">Şu an burada başka oyuncu yok.</p>}
            <div className="nearby-list">
              {others.map((o) => (
                <button type="button" key={o.uid} className="nearby-row" onClick={() => setTarget(o)}>
                  <span className="nearby-avatar">
                    <AvatarSvg avatar={o.avatar} size={32} rounded />
                  </span>
                  <span className="nearby-info">
                    <b>{o.displayName || 'Oyuncu'}</b>
                    {isBlocked(o.uid) ? (
                      <span className="nearby-text dim">🚫 Engelledin</span>
                    ) : (
                      o.chatText && <span className="nearby-text">“{o.chatText}”</span>
                    )}
                  </span>
                  <span className="nearby-go" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
            <button className="nearby-close" onClick={() => setOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {target && (
        <PlayerCard
          uid={target.uid}
          name={target.displayName}
          avatar={target.avatar}
          reportItems={
            target.chatText && !isBlocked(target.uid)
              ? [{ label: 'Konuşma balonunu bildir', targetType: 'bubble', targetPath: `${collectionName}/${target.uid}`, preview: target.chatText }]
              : []
          }
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
