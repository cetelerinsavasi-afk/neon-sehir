import { drawWorldLandmarks } from './parkScene';
import { drawCitySceneBackground } from './cityScene';
import { drawBankSceneBackground } from '../components/BankWorldScreen/BankWorldScreen';
import { drawKarakolSceneBackground } from '../components/KarakolWorldScreen/KarakolWorldScreen';
import { drawMosqueSceneBackground } from '../components/MosqueWorldScreen/MosqueWorldScreen';
import { drawCasinoSceneBackground } from '../components/CasinoWorldScreen/CasinoWorldScreen';

// interviewLocations.js — RÖPORTAJ (madde 1) mekan listesi + her mekanın
// GERÇEK arka plan çizim fonksiyonu. Bilerek PostAttachment.jsx'teki
// INTERIOR_BACKGROUNDS'tan AYRI tutuldu (o, "fotoğraf" özelliğine ait ve
// farklı bir mekan kümesi kullanıyor — araba galerisi, silah mağazası vb.);
// burada kullanıcının istediği 6 röportaj mekanı var. Çizim fonksiyonlarının
// KENDİSİ aynı (tekrar YAZILMADI) — Park için parkScene.js'teki
// drawWorldLandmarks (ParkWorldScreen'in kendi arka planı), diğerleri için
// ilgili WorldScreen dosyalarındaki dışa açık drawXxxSceneBackground'lar,
// Şehir için ise (hazır bir sahne olmadığından) YENİ yazılan
// lib/cityScene.js kullanılıyor.
export const INTERVIEW_LOCATIONS = [
  { id: 'park', label: 'Park', emoji: '🌳' },
  { id: 'karakol', label: 'Karakol', emoji: '👮' },
  { id: 'camii', label: 'Camii', emoji: '🕌' },
  { id: 'banka', label: 'Banka', emoji: '🏦' },
  { id: 'sehir', label: 'Şehir', emoji: '🏙️' },
  { id: 'gazino', label: 'Casino', emoji: '🎰' },
];

export const INTERVIEW_LOCATION_LABELS = Object.fromEntries(
  INTERVIEW_LOCATIONS.map((l) => [l.id, l.label])
);

// drawInterviewBackground(locationId, ctx, getAvatarImage, extra) — extra
// SADECE camii için anlamlı (imam/dilenci anlık verisi, bkz. yukarıdaki
// dosyaların kendi yorumları); diğer mekanlar için verilmez.
const DRAWERS = {
  park: (ctx, getAvatarImage) => drawWorldLandmarks(ctx, getAvatarImage),
  karakol: (ctx, getAvatarImage) => drawKarakolSceneBackground(ctx, getAvatarImage),
  camii: (ctx, getAvatarImage, extra) => drawMosqueSceneBackground(ctx, getAvatarImage, extra),
  banka: (ctx, getAvatarImage) => drawBankSceneBackground(ctx, getAvatarImage),
  sehir: (ctx, getAvatarImage) => drawCitySceneBackground(ctx, getAvatarImage),
  gazino: (ctx, getAvatarImage) => drawCasinoSceneBackground(ctx, getAvatarImage),
};

export function getInterviewBackgroundDrawer(locationId) {
  return DRAWERS[locationId] || DRAWERS.sehir;
}

// World-space boyutları — TÜM mekanlarda ortak (bkz. her dosyanın kendi
// W/H=680/1180 sabiti).
export const INTERVIEW_SCENE_W = 680;
export const INTERVIEW_SCENE_H = 1180;
