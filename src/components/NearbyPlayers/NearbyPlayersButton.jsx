import { useState } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ReportBlockSheet, { MoreButton } from '../ReportBlockSheet/ReportBlockSheet';
import { useBlocks } from '../../contexts/BlocksContext';
import './NearbyPlayersButton.css';

// NearbyPlayersButton — dünya ekranlarında (Park + 7 mekân) sağdaki düğme
// sütununun en üstünde 👥. Aynı ekrandaki oyuncuları listeler; her oyuncu
// için "Balonu şikâyet et / Oyuncuyu şikâyet et / Engelle". Canvas'a
// dokunmadan (avatar seçimi gerektirmeden) balon şikâyetini mümkün kılar.
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
                <div key={o.uid} className="nearby-row">
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
                  <MoreButton onClick={() => setTarget(o)} label={`${o.displayName || 'Oyuncu'} için seçenekler`} />
                </div>
              ))}
            </div>
            <button className="nearby-close" onClick={() => setOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {target && (
        <ReportBlockSheet
          targetUid={target.uid}
          targetName={target.displayName || 'Oyuncu'}
          items={[
            ...(target.chatText && !isBlocked(target.uid)
              ? [{ label: 'Konuşma balonunu şikâyet et', targetType: 'bubble', targetPath: `${collectionName}/${target.uid}`, preview: target.chatText }]
              : []),
            { label: 'Oyuncuyu / adını şikâyet et', targetType: 'user', targetPath: `users/${target.uid}` },
          ]}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
