import { useEffect, useRef } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import FutbolCrest from '../FutbolScreen/FutbolCrest';
import PriceChart from '../PriceChart/PriceChart';
import '../PriceChart/PriceChart.css';
import { vehicleImage } from '../VehicleCard/VehicleCard';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { createAvatarImageCache, renderPhotoFrame as parkRenderPhotoFrame } from '../../lib/parkScene';
import {
  createAvatarImageCache as createAvatarImageCache2, renderPhotoFrame, INTERIOR_AVATAR_SCALE,
} from '../../lib/canvasWorldKit';
import { useImamState } from '../../hooks/useImamState';
import { useBeggars } from '../../hooks/useBeggars';
import { drawBankSceneBackground } from '../BankWorldScreen/BankWorldScreen';
import { drawKarakolSceneBackground } from '../KarakolWorldScreen/KarakolWorldScreen';
import { drawMosqueSceneBackground } from '../MosqueWorldScreen/MosqueWorldScreen';
import { drawCasinoSceneBackground } from '../CasinoWorldScreen/CasinoWorldScreen';
import { drawDealershipSceneBackground } from '../CarDealershipWorldScreen/CarDealershipWorldScreen';
import { drawWeaponShopSceneBackground } from '../WeaponShopWorldScreen/WeaponShopWorldScreen';
import { drawGarageSceneBackground } from '../TuningGarageWorldScreen/TuningGarageWorldScreen';
import './PostAttachment.css';

// Tüm parkPhoto kartları arasında paylaşılan avatar görsel önbelleği —
// aynı avatarı tekrar tekrar SVG'den <img>'e çevirmemek için (bkz.
// lib/parkScene.js createAvatarImageCache).
const parkPhotoImageCache = createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR);

// interiorPhoto kartları için ayrı önbellek (parkPhoto'yla karıştırmamak
// için) — aynı jenerik createAvatarImageCache, sadece ayrı bir örnek.
const interiorPhotoImageCache = createAvatarImageCache2(buildFullAvatarSvgMarkup, DEFAULT_AVATAR);

// locationId -> mekanın kendi drawXxxSceneBackground'ı (bkz. madde 11/12) —
// her mekan zaten kendi WorldScreen dosyasında dışa açık, burada sadece
// eşleniyor; tekrar kod YOK.
// DÜZELTME ("npcler gözükmüyor" hata raporu, Camii): drawMosqueSceneBackground
// diğer mekanlardan farklı olarak imam/dilenci NPC'lerini SABİT/gömülü
// tutmuyor — bunlar canlı Firestore durumu (useImamState/useBeggars, bkz.
// MosqueWorldScreen.jsx) olduğu için üçüncü bir `{ imam, beggars }`
// parametresi bekliyor. Eskiden burada bu parametre hiç verilmiyordu
// (varsayılan `{}` kalıyordu), yani imam/dilenciler paylaşılan fotoğrafta
// HİÇBİR ZAMAN çizilmiyordu — aşağıdaki `extra` artık MosqueInteriorPhotoCanvas
// tarafından canlı state'ten dolduruluyor ve buraya kadar taşınıyor.
const INTERIOR_BACKGROUNDS = {
  banka: (ctx, getAvatarImage) => drawBankSceneBackground(ctx, getAvatarImage),
  karakol: (ctx, getAvatarImage) => drawKarakolSceneBackground(ctx, getAvatarImage),
  camii: (ctx, getAvatarImage, extra) => drawMosqueSceneBackground(ctx, getAvatarImage, extra),
  gazino: (ctx, getAvatarImage) => drawCasinoSceneBackground(ctx, getAvatarImage),
  araba_galerisi: (ctx, getAvatarImage) => drawDealershipSceneBackground(ctx, getAvatarImage),
  silah_magazasi: (ctx, getAvatarImage) => drawWeaponShopSceneBackground(ctx, getAvatarImage),
  modifiye_garaji: (ctx, getAvatarImage) => drawGarageSceneBackground(ctx, getAvatarImage),
};

// InteriorPhotoCanvas — Banka/Karakol/Camii/Gazino'da çekilen fotoğrafı,
// ParkPhotoCanvas'la AYNI mantıkla ama girilebilir mekanın kendi gerçek
// arka planıyla render eder. `extra` — SADECE Camii'nin ihtiyaç duyduğu
// canlı `{ imam, beggars }` verisi (bkz. MosqueInteriorPhotoCanvas), diğer
// mekanlar için `undefined` (kendi NPC'leri zaten gömülü/sabit).
//
// DÜZELTME (genel, TÜM mekanlar): `focalScale` eskiden hiç verilmiyordu,
// yani `renderPhotoFrame`'in varsayılanı (1) kullanılıyordu — oysa her
// mekanın kendi canlı kamera önizlemesi (renderCameraPreview) her zaman
// `AVATAR_SCALE` (INTERIOR_AVATAR_SCALE, 1.42) veriyordu. Bu fark, dikey
// kadraj kaymasına (CAMERA_VERTICAL_LIFT * focalScale) ve kadraj kenarındaki
// NPC'lerin paylaşılan fotoğrafta canlı önizlemedekinden farklı/dışarıda
// kalmasına sebep oluyordu — artık burada da aynı sabit kullanılıyor.
function InteriorPhotoCanvas({ locationId, entities, originX, originY, extra }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const drawBackground = INTERIOR_BACKGROUNDS[locationId];
    if (!canvas || !entities?.length || !drawBackground) return undefined;
    const ctx = canvas.getContext('2d');
    let raf;
    let frames = 0;
    const draw = () => {
      renderPhotoFrame(ctx, {
        width: canvas.width,
        height: canvas.height,
        originX: originX ?? 0,
        originY: originY ?? 0,
        entities,
        getAvatarImage: interiorPhotoImageCache,
        drawBackground: (bgCtx) => drawBackground(bgCtx, interiorPhotoImageCache, extra),
        focalScale: INTERIOR_AVATAR_SCALE,
      });
      frames += 1;
      if (frames < 90) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [locationId, entities, originX, originY, extra]);

  return <canvas ref={canvasRef} width={320} height={320} className="post-att-parkphoto-canvas" />;
}

// MosqueInteriorPhotoCanvas — Camii için InteriorPhotoCanvas'ı canlı imam/
// dilenci verisiyle sarmalar (bkz. yukarıdaki DÜZELTME notu). Firestore
// dinleyicileri (useImamState/useBeggars) SADECE bir Camii fotoğrafı
// gösterilirken mount edilsin diye ayrı bir bileşende tutuluyor — akıştaki
// diğer (Camii olmayan) gönderiler için gereksiz dinleyici açılmıyor.
function MosqueInteriorPhotoCanvas(props) {
  const { imam } = useImamState();
  const { beggars } = useBeggars();
  return <InteriorPhotoCanvas {...props} extra={{ imam, beggars }} />;
}

// ParkPhotoCanvas — kamera karesini GERÇEK park sahnesinden (aynı
// lib/parkScene.js çizim kodu, ParkWorldScreen'deki canlı önizlemeyle
// BİREBİR aynı) render eder. Avatar SVG'leri ilk açılışta asenkron
// yüklendiği için birkaç kare boyunca yeniden çizip önbelleğin
// dolmasını bekliyoruz, sonra duruyoruz (feed'de çok sayıda kart olsa
// bile sonsuz bir animasyon döngüsü çalıştırmamak için).
function ParkPhotoCanvas({ entities, originX, originY }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entities?.length) return undefined;
    const ctx = canvas.getContext('2d');
    let raf;
    let frames = 0;
    const draw = () => {
      // DÜZELTME (madde 16): originX/originY artık sunucudan (fotoğrafı
      // çekenin GERÇEK parkPresence konumu) geliyor — eskiden sabit 0,0
      // kullanılıyordu, bu da arka planın her zaman dünya orijinine yakın
      // (parkın üst tarafı) yanlış bir köşeyi göstermesine yol açıyordu.
      parkRenderPhotoFrame(ctx, {
        width: canvas.width,
        height: canvas.height,
        originX: originX ?? 0,
        originY: originY ?? 0,
        entities,
        getAvatarImage: parkPhotoImageCache,
        focalScale: INTERIOR_AVATAR_SCALE,
      });
      frames += 1;
      if (frames < 90) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [entities, originX, originY]);

  return <canvas ref={canvasRef} width={320} height={320} className="post-att-parkphoto-canvas" />;
}

// PostAttachment — Sixtagram gönderisine eklenen "görsel"i render eder.
// Hepsi oyunun kendi verisinden (sunucuda doğrulanmış) üretiliyor — dosya
// yükleme YOK, bu yüzden her zaman anında ve tutarlı görünür.
export default function PostAttachment({ attachment }) {
  if (!attachment) return null;

  if (attachment.type === 'avatar') {
    return (
      <div className="post-att post-att-avatar">
        <div className="post-att-avatar-frame">
          <div className="post-att-avatar-inner">
            <AvatarSvg avatar={attachment.avatar} />
          </div>
        </div>
      </div>
    );
  }

  if (attachment.type === 'vehicle') {
    const img = vehicleImage(attachment.catalogId);
    return (
      <div className="post-att post-att-vehicle">
        {img && <img src={img} alt={attachment.model} className="post-att-vehicle-img" />}
        <div className="post-att-vehicle-caption">
          <p className="post-att-vehicle-name">{attachment.model}</p>
          <p className="post-att-vehicle-sub">
            Vites {attachment.gearLevel}
            {attachment.gearUpgraded ? ' (geliştirilmiş)' : ''}
            {attachment.tankUpgraded ? ' · Depo geliştirilmiş' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (attachment.type === 'iddaa') {
    const pickLabel = { home: 'Ev Sahibi', draw: 'Beraberlik', away: 'Deplasman' };
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">🎟️ İddaa Kuponu</p>
        <p className="post-att-card-line">
          {attachment.leagueName || 'Lig'} · {attachment.round}. Hafta ·{' '}
          {attachment.stake.toLocaleString('tr-TR')} altın
        </p>
        <div className="post-att-predictions">
          {(attachment.predictions || []).map((p, i) => (
            <div
              key={i}
              className={`post-att-prediction-row ${
                p.correct === true ? 'correct' : p.correct === false ? 'wrong' : ''
              }`}
            >
              <span className="post-att-prediction-teams">
                {p.homeName} - {p.awayName}
                {p.homeScore != null && p.awayScore != null && (
                  <span className="post-att-prediction-score">
                    {' '}
                    ({p.homeScore}-{p.awayScore})
                  </span>
                )}
              </span>
              <span className="post-att-prediction-pick">
                {pickLabel[p.pick] || p.pick}
                {p.correct === true && ' ✅'}
                {p.correct === false && ' ❌'}
              </span>
            </div>
          ))}
        </div>
        <p
          className={`post-att-card-status post-att-status-${attachment.status}`}
        >
          {attachment.status === 'pending' && '⏳ Sonuç bekleniyor'}
          {attachment.status === 'won' &&
            `✅ Kazandı! ${attachment.payout.toLocaleString('tr-TR')} altın`}
          {attachment.status === 'lost' && '❌ Tutmadı'}
        </p>
      </div>
    );
  }

  if (attachment.type === 'lastMatches') {
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">⚽ Son Oynanan Maçlar</p>
        {attachment.leagueName && <p className="post-att-card-line">{attachment.leagueName}</p>}
        <div className="post-att-matches">
          {attachment.matches.map((m, i) => (
            <div key={i} className="post-att-match-row">
              <FutbolCrest logo={m.homeLogo} initials={m.homeName?.[0]} size={22} />
              <span className="post-att-match-team">{m.homeName}</span>
              <span className="post-att-match-score">
                {m.homeScore} - {m.awayScore}
              </span>
              <span className="post-att-match-team">{m.awayName}</span>
              <FutbolCrest logo={m.awayLogo} initials={m.awayName?.[0]} size={22} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (attachment.type === 'upcomingMatches') {
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">🔜 Sıradaki Maçlar</p>
        <p className="post-att-card-line">
          {attachment.leagueName || 'Lig'} · {attachment.round}. Hafta
        </p>
        <div className="post-att-matches">
          {attachment.matches.map((m, i) => (
            <div key={i} className="post-att-match-row">
              <FutbolCrest logo={m.homeLogo} initials={m.homeName?.[0]} size={22} />
              <span className="post-att-match-team">{m.homeName}</span>
              <span className="post-att-match-vs">vs</span>
              <span className="post-att-match-team">{m.awayName}</span>
              <FutbolCrest logo={m.awayLogo} initials={m.awayName?.[0]} size={22} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (attachment.type === 'investment') {
    return (
      <div className="post-att post-att-card">
        <p className="post-att-card-title">📈 {attachment.assetLabel}</p>
        <p className="post-att-card-line">
          Güncel: {attachment.current.toLocaleString('tr-TR')} altın
        </p>
        <PriceChart points={attachment.points} color="#19e8ff" />
      </div>
    );
  }

  if (attachment.type === 'fine') {
    return (
      <div className="post-att post-att-card post-att-fine">
        <p className="post-att-card-title">🚨 Cezam</p>
        <p className="post-att-fine-amount">
          {attachment.totalAmount.toLocaleString('tr-TR')} altın
        </p>
        <p className="post-att-card-line">
          {attachment.count > 1 ? `${attachment.count} kez yakalandım` : 'Yakalandım'}
        </p>
      </div>
    );
  }

  if (attachment.type === 'debt') {
    return (
      <div className="post-att post-att-card post-att-fine">
        <p className="post-att-card-title">💸 Devlete Borcum</p>
        <p className="post-att-fine-amount">{attachment.amount.toLocaleString('tr-TR')} altın</p>
      </div>
    );
  }

  if (attachment.type === 'lotteryWin') {
    return (
      <div className="post-att post-att-card post-att-lottery-win">
        <p className="post-att-card-title">🏆 Piyango Kazandım!</p>
        <p className="post-att-fine-amount">{attachment.amount.toLocaleString('tr-TR')} altın</p>
      </div>
    );
  }

  if (attachment.type === 'flappyScore') {
    // attachment.rank — SADECE sunucuda (buildSixtagramAttachment,
    // flappyScores koleksiyonu üzerinde sayım sorgusuyla) hesaplanır ve
    // sadece ilk 10'daysam (ve "ilk 10" anlamlıysa) dolu gelir; aksi
    // halde null'dır ve rozet hiç gösterilmez (eski davranışta regresyon
    // yok).
    return (
      <div className="post-att post-att-card post-att-flappy-score">
        <p className="post-att-card-title">🐦 Flappy Kuş Rekorum</p>
        <p className="post-att-fine-amount">{attachment.score}</p>
        {attachment.rank && (
          <p className="post-att-flappy-rank">🏆 {attachment.rank}. sırada!</p>
        )}
      </div>
    );
  }

  if (attachment.type === 'parkPhoto') {
    // entities[0] her zaman fotoğrafı çeken kişidir (bkz.
    // functions/index.js) — dx/dy ONA göre gerçek göreli ofset, arka
    // plan da onun o anki gerçek konumundan çizilir (bkz. lib/parkScene.js
    // renderPhotoFrame) — rastgele dizilim ya da "sahneye göre renk" YOK.
    const entities = attachment.entities || [];
    if (!entities.length) return null;
    const names = entities.map((p) => p.displayName || 'Oyuncu');
    return (
      <div className="post-att post-att-parkphoto">
        <div className="post-att-parkphoto-frame">
          <ParkPhotoCanvas entities={entities} originX={attachment.originX} originY={attachment.originY} />
        </div>
        <p className="post-att-parkphoto-names">📷 {names.join(' · ')}</p>
      </div>
    );
  }

  if (attachment.type === 'interiorPhoto') {
    // entities[0] her zaman fotoğrafı çeken kişidir (bkz. functions/index.js
    // 'interiorPhoto' dalı) — bu mekanlar tek kişilik olduğu için ASLA
    // başka gerçek oyuncu yer almaz, sadece kendisi + mekanın kendi NPC'leri
    // (arka planın bir parçası, bkz. drawXxxSceneBackground).
    const entities = attachment.entities || [];
    if (!entities.length) return null;
    const LOCATION_LABELS = {
      banka: 'Banka', karakol: 'Karakol', camii: 'Cami', gazino: 'Gazino',
      araba_galerisi: 'Araba Galerisi', silah_magazasi: 'Silah Mağazası', modifiye_garaji: 'Modifiye Garajı',
    };
    const label = LOCATION_LABELS[attachment.locationId] || 'Mekan';
    // Camii'nin imam/dilenci NPC'leri canlı Firestore verisi (bkz. yukarıdaki
    // DÜZELTME notu) — diğer tüm mekanlar için sade InteriorPhotoCanvas yeterli.
    const Canvas = attachment.locationId === 'camii' ? MosqueInteriorPhotoCanvas : InteriorPhotoCanvas;
    return (
      <div className="post-att post-att-parkphoto">
        <div className="post-att-parkphoto-frame">
          <Canvas
            locationId={attachment.locationId}
            entities={entities}
            originX={attachment.originX}
            originY={attachment.originY}
          />
        </div>
        <p className="post-att-parkphoto-names">📷 {entities[0].displayName || 'Oyuncu'} · {label}</p>
      </div>
    );
  }

  return null;
}
