import { lazy, Suspense, useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBusinessList } from '../../hooks/useBusinessList';
import { usePolledPresence } from '../../hooks/usePolledPresence';
import { houseAction, shopAction } from '../../services/gameActions';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { HOUSE_PRICE } from '../../../functions/houseCatalogData.js';
import { BIZ_TYPES, BIZ_TYPE_KEYS, bizMissing } from '../../../functions/businessCatalogData.js';
import PlaceTypePicker from '../PlaceTypePicker/PlaceTypePicker';
import BizRequirements, { FillConfirm } from '../HouseScreen/BizRequirements';
import { bizErrText } from '../../lib/bizErrors';
import { useBackClose } from '../../lib/backStack';
import '../HouseScreen/HouseScreen.css';
import '../../styles/bizui.css';
import './BusinessHub.css';

const HouseScreen = lazy(() => import('../HouseScreen/HouseScreen'));

// Oyunun kendi dükkânı (her zaman açık) — oyuncu dükkânları gibi dünkü kazancına
// göre sıralanır (gameVenues/{tür}.bizRank); sırası yoksa sıralılardan sonra.
const GAME_VENUE = {
  // loc: interiorPresence.locationId (Soygun › Ziyaret sekmesindeki sayıyla aynı kaynak)
  silahci: { name: 'Neon Silah Mağazası', loc: 'silah_magazasi' },
  galeri: { name: 'Neon Araba Galerisi', loc: 'araba_galerisi' },
  modifiye: { name: 'Neon Modifiye Garajı', loc: 'modifiye_garaji' },
  // spor: oyunun salonu da 3D bir ev (houses/game_spor) — içine girilir
  spor: { name: 'Neon Spor Salonu', house: true },
};

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
function Coin({ gem, v, bad }) {
  return (
    <span className={`bh-coin${bad ? ' bad' : ''}`}>
      <span className={gem ? 'emerald-icon' : 'gold-coin-icon'} style={{ width: 13, height: 13 }} />
      {fmt(v)}
    </span>
  );
}

// v77 — BusinessHub: haritada bir işletme türüne (Spor Salonu, Cafe, Bar,
// İnternet Kafe, Silahçı, Galeri, Modifiye) tıklayınca açılır. Aktif dükkânlar
// (dünkü kazanç sırasıyla; kazanç gösterilmez), en üstte "[tür] aç" ve varsa
// oyunun kendi dükkânı. Bir dükkâna girince 3D ev ekranı açılır.
// v77: üstte açılır tür seçici — haritadan hangi türe tıklandıysa o seçili gelir,
// buradan diğer türlere de geçilebilir. Sıra: önce içerideki kişi, eşitlikte dünkü ciro.
const TYPE_OPTIONS = BIZ_TYPE_KEYS.map((k) => ({ key: k, icon: BIZ_TYPES[k].icon, label: BIZ_TYPES[k].label }));
export default function BusinessHub({ type: initialType, onClose, onOpenGameVenue }) {
  const [type, setType] = useState(initialType);
  const t = BIZ_TYPES[type];
  const { user } = useAuth();
  const { player } = usePlayer();
  const [houseId, setHouseId] = useState(null);
  const { list, loading, gameRank, gamePeople: gameHousePeople } = useBusinessList(type, { enabled: Boolean(user) && !houseId });
  // oyunun ev olmayan dükkânları (silahçı/galeri/modifiye): içerideki kişi sayısı
  const gameLoc = GAME_VENUE[type]?.loc || null;
  const interior = usePolledPresence('interiorPresence', { enabled: Boolean(user && gameLoc && !houseId), max: 400 });
  const gamePeople = gameLoc ? interior.filter((p) => p.locationId === gameLoc).length : gameHousePeople;
  const [openAsk, setOpenAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [shake, setShake] = useState(0);
  const [convertAsk, setConvertAsk] = useState(false);
  const [fillAsk, setFillAsk] = useState(false);
  const [fillMsg, setFillMsg] = useState(null);
  useBackClose(!houseId, () => (fillAsk ? setFillAsk(false) : convertAsk ? setConvertAsk(false) : openAsk ? setOpenAsk(false) : onClose()));
  // "Hepsini al" için envanter + "evini çevir" önerisi için işletme olmayan evlerim
  const [invItems, setInvItems] = useState({});
  const [myHouses, setMyHouses] = useState([]);
  useEffect(() => {
    if (!user || !openAsk) return undefined;
    const u1 = onSnapshot(doc(db, 'houseInventories', user.uid), (s) => setInvItems(s.exists() ? s.data().items || {} : {}), () => setInvItems({}));
    const u2 = onSnapshot(
      query(collection(db, 'houses'), where('ownerUid', '==', user.uid), limit(20)),
      (s) => setMyHouses(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((h) => !h.biz?.type)),
      () => setMyHouses([])
    );
    return () => {
      u1();
      u2();
    };
  }, [user, openAsk]);

  if (!t) return null;

  if (houseId) {
    return (
      <Suspense
        fallback={
          <div className="hs-root">
            <div className="hs-loading">
              <div className="hs-spinner" />
            </div>
          </div>
        }
      >
        <HouseScreen
          key={houseId}
          houseId={houseId}
          onExit={(note) => {
            setHouseId(null);
            if (note) setMsg(note);
          }}
        />
      </Suspense>
    );
  }

  const gold = Number(player?.gold || 0);
  const gem = Number(player?.emerald || 0);
  const game = GAME_VENUE[type];

  const today = futbolDayKey(Date.now());
  const openGame = async () => {
    if (!game?.house) return onOpenGameVenue?.(type);
    setBusy(true);
    setMsg(null);
    try {
      const r = await shopAction({ op: 'gymEnsureGame' });
      setHouseId(r.houseId);
    } catch (err) {
      setMsg(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  const missing = bizMissing(type, [], invItems);
  const toBuy = Object.values(missing.buy).reduce((a, b) => a + b, 0);
  // Onay ekranından (FillConfirm) sonra çağrılır; alınanlar envantere gider.
  // v79: chosen = onay ekranında seçilen ürünlerle (ör. hangi araba) yeniden hesaplanmış liste
  const buyMissing = async (chosen = missing) => {
    setBusy(true);
    setMsg(null);
    try {
      await houseAction({ op: 'buyItems', items: chosen.buy, expect: { gold: chosen.gold, gem: chosen.gem } });
      setFillAsk(false);
      setFillMsg(`✓ ${toBuy} parça mobilya envanterine eklendi. Evine girince Ev › Ayarlar › İşletmeler'den odaya yerleştirebilirsin.`);
    } catch (err) {
      setFillAsk(false);
      setMsg(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };
  const convert = async (h) => {
    setBusy(true);
    setMsg(null);
    try {
      await houseAction({ op: 'bizIntent', houseId: h.id, type });
      setConvertAsk(false);
      setOpenAsk(false);
      setHouseId(h.id);
    } catch (err) {
      setMsg(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    if (myHouses.length && !convertAsk) {
      setConvertAsk(true);
      return;
    }
    if (gold < HOUSE_PRICE) {
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await houseAction({ op: 'buy', bizIntent: type });
      setConvertAsk(false);
      setOpenAsk(false);
      setHouseId(r.data.houseId);
    } catch (err) {
      setMsg(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hs-root hh-root bh-root">
      <div className="hh-head">
        <button className="hs-icon-btn" onClick={onClose} title="Kapat">✕</button>
        <div className="hh-title">
          <b>🏪 İşletmeler</b>
        </div>
        {user && (
          <button
            className="hh-buy"
            onClick={() => {
              setMsg(null);
              setFillMsg(null);
              setOpenAsk(true);
            }}
          >
            + {t.label} aç
          </button>
        )}
      </div>

      <div className="hh-body">
        <PlaceTypePicker
          options={TYPE_OPTIONS}
          value={type}
          title="İşletme türü"
          onChange={(k) => {
            setType(k);
            setMsg(null);
          }}
        />
        {msg && !openAsk && <p className="hs-err">{msg}</p>}
        {!user && <p className="hs-dim hh-empty">İşletmeleri görmek için giriş yap.</p>}
        {user && loading && <p className="hs-dim">Yükleniyor…</p>}
        {user && !loading && list.length === 0 && !game && (
          <div className="bh-empty">
            <span>{t.icon}</span>
            <b>Henüz açık {t.label.toLocaleLowerCase('tr-TR')} yok. İlk sen aç!</b>
          </div>
        )}
        {(() => {
          // önce içerideki kişi sayısı, eşitlikte dünkü ciro sırası (bizRank; oyunun dükkânı dahil)
          const rank = (r) => (Number.isFinite(r) && r > 0 ? r : Infinity);
          const rows = list.map((h, i) => ({ kind: 'h', h, people: h.people || 0, r: rank(h.bizRank), i }));
          if (game) rows.push({ kind: 'game', people: gamePeople || 0, r: rank(gameRank), i: -1 });
          rows.sort((a, b) => b.people - a.people || a.r - b.r || a.i - b.i);
          return rows;
        })().map(({ kind, h }) =>
          kind === 'game' ? (
            <button key="game" className="hh-row" disabled={busy} onClick={openGame}>
              <span className="hh-avatar bh-game-ico">{t.icon}</span>
              <span className="hh-info">
                <b>{game.name}</b>
                <span>Sahibi: Neon Şehir</span>
              </span>
              <span className={`hh-count${gamePeople ? ' live' : ''}`}>
                <i />
                {gamePeople || 0} kişi
              </span>
            </button>
          ) : (
          <button key={h.id} className={`hh-row${h.mine ? ' mine' : ''}`} onClick={() => setHouseId(h.id)}>
            <span className="hh-avatar">
              <AvatarSvg avatar={h.ownerAvatar} size={42} rounded />
            </span>
            <span className="hh-info">
              <b>
                {h.name || t.label}
                {type === 'spor' && h.gymBonusDay === today && <em className="bh-bonus">🔥 Bonuslu: +%10 güç</em>}
              </b>
              <span>Sahibi: {h.ownerName || 'Oyuncu'}{h.mine ? ' (sen)' : ''}</span>
            </span>
            <span className={`hh-count${h.people ? ' live' : ''}`}>
              <i />
              {h.people} kişi
            </span>
          </button>
          )
        )}
      </div>

      {openAsk && (
        <div className="bz-modal-bg" onClick={() => !busy && setOpenAsk(false)}>
          <div className="bz-modal bz bh-open-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>
                  {t.icon} {t.label} aç
                </h3>
                <p>Ev al → mobilyaları koy → Ayarlar › İşletmeler › Aç</p>
              </div>
              <button className="bz-x" disabled={busy} onClick={() => setOpenAsk(false)}>
                ✕
              </button>
            </div>
            <div className="bz-wallet">
              <span>Cebindeki altın / zümrüt</span>
              <b>
                <Coin v={gold} /> <Coin gem v={gem} />
              </b>
            </div>

            <div className="bz-sec">
              <p className="bz-sec-title">1) Ev</p>
              <div className="bz-row">
                <span>🏠 Yeni ev fiyatı</span>
                <b className={gold < HOUSE_PRICE ? 'bz-bad' : ''}>{fmt(HOUSE_PRICE)} altın</b>
              </div>
              {myHouses.length > 0 && <p className="bz-hint">Mevcut evini de kullanabilirsin.</p>}
            </div>

            <div className="bz-sec">
              <p className="bz-sec-title">2) Gerekli mobilyalar</p>
              <p className="bz-hint">Fiyatlar tanesi içindir.</p>
              <BizRequirements type={type} invItems={invItems} showPlaced={false} />
            </div>

            <div className="bz-sec">
              <div className="bz-row">
                <span>Eksik mobilyaların tutarı</span>
                <b>
                  {missing.gold > 0 && `${fmt(missing.gold)} altın`}
                  {missing.gold > 0 && missing.gem > 0 && ' + '}
                  {missing.gem > 0 && `${fmt(missing.gem)} zümrüt`}
                  {!missing.gold && !missing.gem && 'Hepsi envanterinde var ✓'}
                </b>
              </div>
              <div className="bz-row total" key={shake}>
                <span>Toplam (ev + eksik mobilyalar)</span>
                <b className={gold < HOUSE_PRICE + missing.gold || gem < missing.gem ? 'bz-bad' : ''}>
                  {fmt(HOUSE_PRICE + missing.gold)} altın{missing.gem > 0 ? ` + ${fmt(missing.gem)} zümrüt` : ''}
                </b>
              </div>
              {toBuy > 0 && (
                <button className="bz-btn ghost wide" disabled={busy} onClick={() => setFillAsk(true)}>
                  🛒 Eksik mobilyaları satın al ({toBuy} parça) — önce listeyi gör
                </button>
              )}
              {fillMsg && <p className="bz-ok">{fillMsg}</p>}
            </div>

            {msg && <p className="bz-warn">{msg}</p>}
            {gold < HOUSE_PRICE && !myHouses.length && <p className="bz-warn">Ev almak için altının yetmiyor: {fmt(HOUSE_PRICE - gold)} altın eksik.</p>}
            <div className="bz-btns">
              <button className="bz-btn ghost" disabled={busy} onClick={() => setOpenAsk(false)}>
                Vazgeç
              </button>
              <button className={`bz-btn gold${shake ? ' cue-shake' : ''}`} key={`b${shake}`} disabled={busy} onClick={buy}>
                {busy ? 'İşleniyor…' : myHouses.length ? '🏠 Ev seç / satın al' : `🏠 Ev satın al — ${fmt(HOUSE_PRICE)} altın`}
              </button>
            </div>
          </div>
        </div>
      )}
      {openAsk && fillAsk && (
        <FillConfirm
          type={type}
          m={missing}
          gold={gold}
          gem={gem}
          busy={busy}
          placeTitle="Envanterinde zaten olanlar (tekrar alınmaz)"
          note="Alınanlar envanterine gider; evine girip yerleştirirsin."
          onCancel={() => setFillAsk(false)}
          onConfirm={buyMissing}
        />
      )}
      {openAsk && convertAsk && (
        <div className="bz-modal-bg" onClick={() => !busy && setConvertAsk(false)}>
          <div className="bz-modal bz bh-convert" onClick={(e) => e.stopPropagation()}>
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>
                  🏠 Evlerinden birini {t.label.toLocaleLowerCase('tr-TR')} yap
                </h3>
                <p>Bir evini seç ya da yeni ev al.</p>
              </div>
              <button className="bz-x" disabled={busy} onClick={() => setConvertAsk(false)}>
                ✕
              </button>
            </div>
            <div className="bh-convert-list">
              {myHouses.map((h) => (
                <button key={h.id} className="hh-row" disabled={busy} onClick={() => convert(h)}>
                  <span className="hh-avatar bh-game-ico">🏠</span>
                  <span className="hh-info">
                    <b>{h.name}</b>
                    <span>
                      {(h.items || []).filter((x) => x.p === 1).length} mobilya yerleştirilmiş
                      {h.bizIntent ? ` · ${BIZ_TYPES[h.bizIntent]?.label || ''} için ayrılmış` : ''}
                    </span>
                  </span>
                  <span className="bh-go">Seç ›</span>
                </button>
              ))}
            </div>
            <button className="bz-btn gold wide" disabled={busy} onClick={buy}>
              🆕 Yeni ev satın al — {fmt(HOUSE_PRICE)} altın
            </button>
            {gold < HOUSE_PRICE && <p className="bz-warn">Yeni ev için {fmt(HOUSE_PRICE - gold)} altın eksik.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
