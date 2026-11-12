// =============================================================================
// v157 — Şehirdeki mekânın içinde açılıp kapanan liste: o türdeki oyun işletmeleri
// (oyunun kendi dükkânı + oyuncuların açtıkları). Şehirdeki bina sadece görünüş — içinde
// işlem yapılmaz; listeden seçilen işletmeye gidilir (App: şehir kapanır, işletme açılır,
// çıkınca şehre bu mekânın içine dönülür).
// Firestore: liste SADECE panel açıkken okunur (BusinessHub ile aynı önbellekli sorgu).
// =============================================================================
import { useAuth } from '../../contexts/AuthContext';
import { useBusinessList } from '../../hooks/useBusinessList';
import { usePolledPresence } from '../../hooks/usePolledPresence';
import { BIZ_TYPES } from '../../../functions/businessCatalogData.js';
import { GAME_VENUE } from '../BusinessHub/BusinessHub';
import AvatarSvg from '../AvatarSvg/AvatarSvg';

export default function CityBizList({ type, onPick }) {
  const { user } = useAuth();
  const t = BIZ_TYPES[type];
  const { list, loading, gameRank, gamePeople: gameHousePeople } = useBusinessList(type, { enabled: Boolean(user) });
  const gv = GAME_VENUE[type];
  const game = gv && !gv.hidden ? gv : null;
  const gameLoc = gv?.loc || null;
  const interior = usePolledPresence('interiorPresence', { enabled: Boolean(user && gameLoc), max: 400 });
  const gamePeople = gameLoc ? interior.filter((p) => p.locationId === gameLoc).length : gameHousePeople;
  if (!t) return null;
  if (!user) return <p className="cs-biz-empty">Giriş yapmalısın.</p>;
  if (loading) return <p className="cs-biz-empty">Yükleniyor…</p>;
  const rank = (r) => (Number.isFinite(r) && r > 0 ? r : Infinity);
  const rows = list.map((h, i) => ({ kind: 'h', h, people: h.people || 0, r: rank(h.bizRank), i }));
  if (game) rows.push({ kind: 'game', people: gamePeople || 0, r: rank(gameRank), i: -1 });
  rows.sort((a, b) => b.people - a.people || a.r - b.r || a.i - b.i);
  if (!rows.length) return <p className="cs-biz-empty">{t.icon} Henüz açık {t.label.toLocaleLowerCase('tr-TR')} yok.</p>;
  return (
    <div className="cs-biz-list">
      {rows.map(({ kind, h, people }) =>
        kind === 'game' ? (
          <button key="game" className="hh-row" onClick={() => onPick({ type, game: true })}>
            <span className="hh-avatar bh-game-ico">{t.icon}</span>
            <span className="hh-info">
              <b>{game.name}</b>
              <span>Sahibi: Neon Şehir</span>
            </span>
            <span className={`hh-count${people ? ' live' : ''}`}>
              <i />
              {people} kişi
            </span>
          </button>
        ) : (
          <button key={h.id} className={`hh-row${h.mine ? ' mine' : ''}`} onClick={() => onPick({ type, houseId: h.id })}>
            <span className="hh-avatar">
              <AvatarSvg avatar={h.ownerAvatar} size={36} rounded />
            </span>
            <span className="hh-info">
              <b className="bh-name-row">
                <span className="bh-name">{h.name || t.label}</span>
              </b>
              <span>Sahibi: {h.ownerName || 'Oyuncu'}{h.mine ? ' (sen)' : ''}</span>
            </span>
            <span className={`hh-count${people ? ' live' : ''}`}>
              <i />
              {people} kişi
            </span>
          </button>
        )
      )}
    </div>
  );
}
