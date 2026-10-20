// v105 — "Paylaşınca nasıl çalacak?" bilgisi (kural: functions/songData.js shareModeOf)
import { shareModeOf } from '../../functions/songData.js';

const L = 'ABCD';

export function songShareInfo(song) {
  const sm = shareModeOf(song);
  if (sm.mode === 'song') {
    const order = (song.song || []).filter((v) => v >= 0).map((v) => L[v]);
    const short = order.length > 8 ? `${order.slice(0, 8).join('→')}…` : order.join('→');
    return { mode: 'song', icon: '🎼', title: 'Şarkı olarak paylaşılır', detail: `Sıradaki bölümler çalar: ${short}` };
  }
  const detail =
    sm.reason === 'empty_section'
      ? `Sırada boş bölüm var (${sm.emptyLetters.join(', ')}). Doldur ya da sıradan çıkar; şimdilik Bölüm ${L[sm.cp]} döngüde çalar.`
      : `Sıra boş, Bölüm ${L[sm.cp]} döngüde çalar. Şarkı yapmak için bölümleri sıraya diz.`;
  return { mode: 'pattern', icon: '🔁', title: 'Bölüm olarak paylaşılır', detail, emptyLetters: sm.emptyLetters, reason: sm.reason };
}
