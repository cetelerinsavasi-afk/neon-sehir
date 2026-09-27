// Yönetim Paneli (UGC D3) — ortak etiketler ve biçimlendirme.
export const STAFF_ROLES = ['admin', 'moderator'];
export const ROLE_LABELS = { admin: 'Yönetici', moderator: 'Moderatör', system: 'Sistem' };

export const TYPE_LABELS = {
  globalChat: '💬 ChatsApp mesajı',
  sixtagramPost: '📸 Sixtagram gönderisi',
  sixtagramComment: '💭 Sixtagram yorumu',
  gangChat: '🏴 Çete sohbeti',
  gangGlobalChat: '🌐 Çeteler genel sohbeti',
  intelChat: '🕵️ İstihbarat sohbeti',
  feedback: '💡 Fikir / öneri',
  bubble: '🗨️ Konuşma balonu',
  user: '👤 Oyuncu adı',
  gang: '🏴 Çete adı / notu',
  factory: '🏭 Fabrika adı',
  vehicleName: '🚗 Araç adı',
  heistNote: '🕶️ Soygun notu',
  beggarNote: '🪙 Dilenci notu',
  nasihat: '🕌 Nasihat',
};

export const REASON_LABELS = {
  hakaret: 'Hakaret',
  taciz: 'Taciz',
  nefret: 'Nefret',
  cinsel: 'Cinsel',
  kisisel_bilgi: 'Kişisel bilgi',
  spam_dolandiricilik: 'Spam / dolandırıcılık',
  gercek_para: 'Gerçek para',
  diger: 'Diğer',
};

export const ACTION_LABELS = {
  report_remove: '🧹 İçerik kaldırıldı',
  report_dismiss: '✅ Şikâyet reddedildi',
  content_restore: '↩️ İçerik geri açıldı',
  warn: '⚠️ Uyarı gönderildi',
  mute: '🔇 Susturuldu',
  unmute: '🔊 Susturma kaldırıldı',
  ban: '⛔ Banlandı',
  unban: '🟢 Ban kaldırıldı',
  ban_expired: '⏱️ Ban süresi doldu',
  set_role: '🎖️ Rol değişti',
  shop_credit: '💰 Mağaza paketi yüklendi',
};

export const MUTE_OPTIONS = [
  { id: '1h', label: '1 saat' },
  { id: '24h', label: '24 saat' },
  { id: '7d', label: '7 gün' },
  { id: '30d', label: '30 gün', adminOnly: true },
];
export const BAN_OPTIONS = [
  { id: '1d', label: '1 gün' },
  { id: '7d', label: '7 gün' },
  { id: '30d', label: '30 gün' },
  { id: 'permanent', label: 'Kalıcı' },
];

const DTF = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export function fmtDate(ms) {
  return ms ? DTF.format(new Date(ms)) : '—';
}

export function effectLabel(effect) {
  return { hidden: 'kalıcı gizlendi', reset: 'varsayılana sıfırlandı', unhidden: 'otomatik gizleme kaldırıldı', missing: 'içerik zaten yok', stale: 'içerik zaten değişmiş', none: '—' }[effect] || effect || '—';
}

export function errText(err) {
  return err?.message || 'Bir şeyler ters gitti, tekrar dene.';
}
