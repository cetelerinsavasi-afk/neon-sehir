// =============================================================================
// bizPassive.js — v195 PASİF MEKÂN (saf; sunucu + istemci ORTAK, bağımlılıksız)
// -----------------------------------------------------------------------------
// 20 gün oyuna girmeyen oyuncunun işletmeleri (houses/{id}.biz.passive) ve ofisleri
// (houses/{id}.office.passive) pasif olur: mekân listelerinde görünmez, hiçbir yoldan para
// kazanmaz. Stok, eşya ve para olduğu gibi kalır. Sahip oyuna girince otomatik açılır.
// Oyunun kendi mekânları ('__game__' / bizGame) ve çete karargâhı bu kuraldan muaftır.
// Ayrıntı: functions/business.js (gece kontrolü + girişte açma).
// =============================================================================
export const BIZ_IDLE_DAYS = 20; // borsa.js BORSA_IDLE_DAYS ile aynı kural
export const GAME_OWNER_UID = '__game__'; // business.js GAME_VENUE_OWNER
export const BIZ_PASSIVE_TEXT = 'Bu mekân şu an kapalı: sahibi 20 gündür oyuna girmedi.';

export function isBizPassive(h) {
  if (!h || h.bizGame || h.ownerUid === GAME_OWNER_UID || h.hq?.gangId) return false;
  return Boolean(h.biz?.passive || h.office?.passive);
}
