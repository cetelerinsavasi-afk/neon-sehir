// =============================================================================
// v86.1 — KÜFÜR FİLTRESİ (sunucu + istemci ortak; istemci bu dosyayı içe aktarır)
// Sadece ÇOK BARİZ küfürler. Yakalanınca mesaj/gönderi paylaşılmaz, oyuncuya
// kısa bir uyarı gösterilir; küfürsüz yazarsa paylaşabilir. Ceza vermez (ban,
// susturma vb. yine moderasyon sistemindedir).
//
// Yanlış alarm olmasın diye dikkat edilenler:
//   • "sık-" kökü (sıkıştı, sıkıntı, sıktı) ve "şık" küfür sayılmaz: "sik" ailesi
//     yalnızca noktalı i ve s ile yazılınca yakalanır (ı/ş harfleri korunur).
//   • "amin", "ama", "aman", "got (İng.)", "pic (İng.)" yakalanmaz.
// Atlatma denemeleri: büyük/küçük harf, harf tekrarı (siiiktir), araya nokta/
// boşluk (s.i.k.t.i.r, s i k t i r), rakamla yazma (0r0spu, 4mk) yakalanır.
// =============================================================================

export const PROFANITY_WARNING = '🚫 Küfürlü yazı paylaşılamaz. Küfür etmeye devam edersen hesabın engellenebilir (ban). Lütfen küfürsüz yaz.';

// Türkçe harfler korunarak (ı, ş ayrı kalır) — "sik" ailesi için
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '€': 'e', '!': 'i' };
const SOFT = { ç: 'c', ğ: 'g', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u', ê: 'e' };
const HARD = { ...SOFT, ı: 'i', ş: 's' };

const collapse = (w) => w.replace(/(.)\1+/g, '$1');
function mapChars(token, table) {
  let out = '';
  for (const ch of token) {
    const c = LEET[ch] ?? table[ch] ?? ch;
    if (/[a-zışçğöü]/.test(c)) out += c;
  }
  return out;
}

// --- listeler (harf tekrarı birleştirilmiş biçimde) ---
// "sik" ailesi: ı/ş korunmuş biçimde (sıkış ≠ sikiş, şık ≠ sik)
// (ASCII yazımda "sık"=sik, "sıkı"=siki, "sıkış"=sikis, "sıktı"=sikti olduğundan bunlar listede YOK)
const SIK_EXACT = new Set(['sikim', 'sikimi', 'sikime', 'sikimde', 'sikik', 'sikiş', 'sktr', 'skrm', 'skym']);
const SIK_PREFIX = ['siktir', 'siktiğ', 'sikerim', 'sikeyim', 'sikiyim', 'sikicem', 'sikecem', 'sikeceğ', 'sikerler', 'sikiş', 'sikeyin', 'sikerm', 'sikertir', 'sikimin'];
// genel (ı→i, ş→s)
const EXACT = new Set(['amk', 'aq', 'amq', 'amcik', 'pust', 'orspu', 'ibne', 'kahpe', 'yarak', 'yavsak', 'gavat', 'kaltak', 'surtuk', 'pezevenk', 'fck', 'cunt', 'amina', 'aminakoyim', 'aminakoyayim']);
const PREFIX = ['orospu', 'orosbu', 'oruspu', 'orspu', 'amina', 'aminak', 'amcik', 'amcig', 'yarak', 'yarag', 'dalyarak', 'pezeven', 'yavsak', 'kahpe', 'kaltak', 'surtuk', 'gavat', 'ibne', 'gotveren', 'gotlek', 'gotos', 'fuck', 'motherf', 'sikerim', 'siktir'];
// ham (Türkçe harfleriyle) — İngilizce/başka anlamla karışmasın diye
const RAW_EXACT = new Set(['göt', 'götü', 'götün', 'götünü', 'piç', 'piçler', 'piçin', 'oç', 'o.ç']);
const RAW_PREFIX = ['piçlik', 'piçkurusu', 'götveren', 'götlek'];

function tokensOf(text) {
  const parts = String(text || '')
    .toLocaleLowerCase('tr-TR')
    .split(/[\s\n\r\t,;:!?()[\]{}"'“”‘’«»<>/\\|*_~+=^-]+/u)
    .filter(Boolean);
  // tek harfli parçaları birleştir: "s i k t i r" → "siktir"
  const out = [];
  let run = '';
  for (const p of parts) {
    const letters = p.replace(/[^\p{L}\d@$€]/gu, '');
    if (letters.length === 1) {
      run += letters;
      continue;
    }
    if (run) {
      out.push(run);
      run = '';
    }
    out.push(p);
  }
  if (run) out.push(run);
  return out;
}

function tokenIsBad(tok) {
  const raw = collapse(tok.replace(/[^\p{L}\d@$€.]/gu, ''));
  const rawLetters = raw.replace(/\./g, '');
  if (RAW_EXACT.has(raw) || RAW_EXACT.has(rawLetters)) return true;
  if (RAW_PREFIX.some((p) => rawLetters.startsWith(p))) return true;
  const soft = collapse(mapChars(rawLetters, SOFT)); // ı, ş korunur
  if (soft && !/[ış]/.test(soft.slice(0, 4))) {
    if (SIK_EXACT.has(soft)) return true;
    if (SIK_PREFIX.some((p) => soft.startsWith(p))) return true;
  }
  const hard = collapse(mapChars(rawLetters, HARD));
  if (!hard) return false;
  if (EXACT.has(hard)) return true;
  // "amina" ailesinde "amin" (dua) ve "aminati" gibi masumlar yakalanmasın
  return PREFIX.some((p) => hard.startsWith(p));
}

// true → küfür var
export function hasProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const toks = tokensOf(text);
  if (toks.some(tokenIsBad)) return true;
  // kelimeye gömülü bariz olanlar: "hadiamkoyim", "senisikerim"
  const joined = collapse(mapChars(String(text).toLocaleLowerCase('tr-TR').replace(/\s+/g, ''), HARD));
  return /orospu|orosbu|siktir|sikerim|sikeyim|aminakoy|aminakoyim|amcik|pezevenk|yavsak|motherfuck|fucking/.test(joined);
}

// Bir istekteki tüm yazıları (iç içe nesneler dahil) tarar
export function profanityCheck(value, depth = 0) {
  if (value == null || depth > 4) return false;
  if (typeof value === 'string') return value.length <= 5000 && hasProfanity(value);
  if (Array.isArray(value)) return value.slice(0, 50).some((v) => profanityCheck(v, depth + 1));
  if (typeof value === 'object') return Object.values(value).slice(0, 50).some((v) => profanityCheck(v, depth + 1));
  return false;
}
