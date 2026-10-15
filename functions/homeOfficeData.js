// =============================================================================
// homeOfficeData.js — v93 Home Ofisler (mescit · sinema · müzik stüdyosu)
// Sunucu (functions/homeOffice.js, venue.js) ve istemci ortak sabitleri.
// =============================================================================

// Ev ekranında home ofis eşyalarına eklenen eylemler (houseEngine.setBizActs)
export const HO_ITEM_ACTS = {
  mescit: { bagiskutusu: [{ act: 'donate', label: '🤲 Bağış yap' }] },
  studyo: { mixer: [{ act: 'studio', label: '🎛️ Müzik yap' }] },
};

// Mescit: bağış kutusu — bir oyuncu bir mescide günde en fazla 10.000 altın
export const MESCIT_DAILY_LIMIT = 10_000;
export const MESCIT_PRESETS = [100, 500, 1000, 5000];
export const MESCIT_MIN = 10;

// Sinema: içecek dolabı + patlamış mısır menüden (ücretli) — 100–1.000
export const CINEMA_PRICE = { def: 200, min: 100, max: 1000 };

// Müzik stüdyosu: mikser konsolu dakika ücreti (internet kafe mantığı) — 100–400
export const STUDIO_MINUTE = { def: 200, min: 100, max: 400 };
export const STUDIO_DEVICE_CAP = { mixer: 1 };
// Süre bittikten sonra da (ör. altın bitti) projenin otomatik kaydı için tanınan süre
export const STUDIO_SAVE_GRACE_MS = 3 * 60 * 1000;

// Şarkı projeleri: 7 gün dokunulmayan proje silinir; oyuncu başı en fazla 5 proje (v93.1)
export const SONG_PROJECT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SONG_PROJECT_MAX = 5;
// Sixtagram: bir hesap bir şarkıya en fazla 5 dinlenme kazandırır
export const SONG_PLAY_MAX_PER_USER = 5;
export const SONG_PLAY_MIN_SEC = 3; // en az bu kadar dinlenince sayılır (istemci)
// Destek (bağış): 10 / 100 / 1000 · bir oyuncu bir sanatçıya günde en fazla 1.000
export const SONG_TIP_AMOUNTS = [10, 100, 1000];
export const SONG_TIP_DAILY = 1000;
export const SONG_TIP_TAX_RATE = 0.1;

// İndirilen ses dosyasının adı: "PROJEADI - cetelerinsavasi.com.mp3"
export function songFileName(title) {
  const t = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${t || 'Şarkı'} - cetelerinsavasi.com.mp3`;
}
