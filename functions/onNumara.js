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

// =============================================================================
// v125 — AKILLI KURPİYER (hilesiz): kartlar yine rastgele gelir (1–5, eşit olasılık,
// her çekiliş bağımsız). Kurpiyer sadece kurpiyer aşamasında masada AÇIK olan bilgiyi
// kullanır (oyuncuların bitmiş elleri — bu aşamada tüm kartlar açılır) ve her adımda
// "dur" ile "çek"in beklenen kazancını hesaplayıp yüksek olanı seçer (eşitse durur).
// Beraberlik kuralı değişmedi: en yüksek toplamı yapanlar potu EŞİT paylaşır.
// =============================================================================
const CARD_VALUES = [1, 2, 3, 4, 5];
// Kasanın bu eldeki net sonucu (bahis = 1 birim). dealer > 10 → battı.
// contenders: batmamış oyuncuların toplamları · n: eldeki oyuncu sayısı (pot = n + 1)
export function onnHouseNet(dealer, contenders, n) {
  const dealerIn = dealer <= ONN_TARGET;
  if (!dealerIn && contenders.length === 0) return 0; // herkes battı: berabere, bahisler iade
  let best = dealerIn ? dealer : -1;
  for (const s of contenders) if (s > best) best = s;
  const hw = contenders.filter((s) => s === best).length;
  const dw = dealerIn && dealer === best;
  const pot = n + 1;
  const paid = hw > 0 ? (pot / (hw + (dw ? 1 : 0))) * hw : 0;
  return pot - paid - 1; // pot kasaya döner, oyunculara ödenen düşer, kasanın kendi payı (1) çıkar
}
// 'hit' | 'stand' — beklenen kazancı en yüksek hamle
export function dealerBestMove(dealerTotal, contenders, n) {
  const memo = new Map();
  const ev = (t) => {
    if (t > ONN_TARGET) return onnHouseNet(t, contenders, n);
    if (memo.has(t)) return memo.get(t);
    const stand = onnHouseNet(t, contenders, n);
    const hit = CARD_VALUES.reduce((a, c) => a + ev(t + c), 0) / CARD_VALUES.length;
    const v = Math.max(stand, hit);
    memo.set(t, v);
    return v;
  };
  if (dealerTotal >= ONN_TARGET) return 'stand';
  const stand = onnHouseNet(dealerTotal, contenders, n);
  const hit = CARD_VALUES.reduce((a, c) => a + ev(dealerTotal + c), 0) / CARD_VALUES.length;
  return hit > stand + 1e-9 ? 'hit' : 'stand';
}
