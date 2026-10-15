// =============================================================================
// onNumara.js — v93 On Numara eşzamanlı tur kuralları (saf fonksiyonlar; index.js
// işlem içinde kullanır, testler doğrudan çağırır).
//   • Tüm oyuncular aynı anda oynar; herkese aynı anda tek bir 10 sn verilir (kart
//     çekmek süreyi uzatmaz). Süre dolan oyuncu otomatik pas geçer.
//   • Oynayan kalmayınca el kurpiyer aşamasına geçer (kurpiyer oynar, kartlar açılır).
// round: { participants, hands:{uid:{cards,status,deadlineMs?}}, phase, ... }
// =============================================================================
export const ONN_TARGET = 10;
export const ONN_TURN_MS = 10_000;
export const ONN_GRACE_MS = 1500;
const sum = (cards) => cards.reduce((a, b) => a + b, 0);

// Oynayan kalmadıysa 'dealer', kaldıysa en geç süre (izleyici sayacı)
export function simulState(round, hands) {
  const playing = round.participants.filter((u) => hands[u]?.status === 'playing');
  const last = playing.reduce((m, u) => Math.max(m, Number(hands[u].deadlineMs || 0)), 0);
  return { phase: playing.length ? 'playing' : 'dealer', lastDeadlineMs: playing.length ? last : null };
}

// Bir oyuncunun hamlesi. Döner: { hands } ya da { error }
export function simulAct(round, uid, action, now, draw) {
  if (round.phase !== 'playing') return { error: 'El bitti.' };
  const h0 = round.hands?.[uid];
  if (!h0) return { error: 'Bu elde değilsin.' };
  if (h0.status !== 'playing') return { error: 'Hamleni zaten bitirdin.' };
  const late = Number(h0.deadlineMs || 0) + ONN_GRACE_MS < now;
  const hand = { ...h0 };
  if (action === 'hit' && !late) {
    hand.cards = [...hand.cards, draw()];
    const total = sum(hand.cards);
    if (total > ONN_TARGET) hand.status = 'bust';
    else if (total >= ONN_TARGET) hand.status = 'stand';
    // v93.1: süre yenilenmez — herkesin ortak 10 sn'si devam eder
  } else {
    hand.status = 'stand'; // pas (ya da süresi dolmuşken gelen hamle → otomatik pas)
  }
  if (hand.status !== 'playing') delete hand.deadlineMs;
  return { hands: { ...round.hands, [uid]: hand }, late };
}

// Süresi dolan herkesi pas geçirir. Döner: { hands, n }
export function simulAutoStand(round, now) {
  const hands = { ...round.hands };
  let n = 0;
  round.participants.forEach((u) => {
    const h = hands[u];
    if (h?.status === 'playing' && Number(h.deadlineMs || 0) <= now) {
      const nh = { ...h, status: 'stand' };
      delete nh.deadlineMs;
      hands[u] = nh;
      n += 1;
    }
  });
  return { hands, n };
}

// Dağıtımda: oynayan herkesin süresi aynı anda başlar
export function simulDeal(hands, participants, now) {
  const out = {};
  participants.forEach((u) => {
    out[u] = hands[u].status === 'playing' ? { ...hands[u], deadlineMs: now + ONN_TURN_MS } : { ...hands[u] };
  });
  return out;
}
