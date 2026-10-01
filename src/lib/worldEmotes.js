// =============================================================================
// v71 — Mekanlarda hareketler (dans et, el salla, alkışla, zıpla, kalp at).
// Evdeki (houseEngine EMOTES) ile aynı liste. Hareket, kendi presence
// dokümanına `emote` + `emoteTs` olarak yazılır (firestore.rules izinli
// alanlar); diğer oyuncular yeni bir emoteTs gördüğünde animasyonu KENDİ
// saatleriyle oynatır (cihaz saat farkı animasyonu bozmaz).
// =============================================================================
export const WORLD_EMOTES = [
  { key: 'dans', label: 'Dans et', emoji: '💃' },
  { key: 'selam', label: 'El salla', emoji: '👋' },
  { key: 'alkis', label: 'Alkışla', emoji: '👏' },
  { key: 'zipla', label: 'Zıpla', emoji: '🤸' },
  { key: 'kalp', label: 'Kalp at', emoji: '❤️' },
];
export const WORLD_EMOTE_EMOJI = Object.fromEntries(WORLD_EMOTES.map((e) => [e.key, e.emoji]));
export const WORLD_EMOTE_MS = 3200;

// Oyuncu başına son görülen hareket. observe(uid, kind, ts) her karede
// çağrılabilir; o an oynayan hareketi ({ kind, t0 }) ya da null döner.
export function createEmoteTracker() {
  const map = new Map();
  const live = (e) => (e && WORLD_EMOTE_EMOJI[e.kind] && performance.now() - e.t0 <= WORLD_EMOTE_MS ? e : null);
  return {
    play(key, kind) {
      if (!WORLD_EMOTE_EMOJI[kind]) return;
      map.set(key, { kind, ts: null, t0: performance.now() });
    },
    observe(uid, kind, ts) {
      if (!uid) return null;
      const t = Number(ts) || 0;
      if (kind && t && WORLD_EMOTE_EMOJI[kind]) {
        const prev = map.get(uid);
        if (!prev || prev.ts !== t) {
          // ilk kez görülen eski bir hareket (mekana sonradan girdin) oynatılmaz
          const fresh = prev ? true : Math.abs(Date.now() - t) < WORLD_EMOTE_MS;
          map.set(uid, { kind, ts: t, t0: fresh ? performance.now() : -Infinity });
        }
      }
      return live(map.get(uid));
    },
    get(key) {
      return live(map.get(key));
    },
  };
}

// drawAvatarSprite içinde kullanılır: hareketin o anki eğilme/yükselme
// değerleri (yükseklik h'ye oranla) + dans sırasında yürüme pozu.
export function emoteMotion(emote, now = performance.now()) {
  if (!emote) return null;
  const e = (now - emote.t0) / 1000;
  if (e < 0 || e > WORLD_EMOTE_MS / 1000) return null;
  let tilt = 0;
  let lift = 0;
  let pose = null;
  const k = emote.kind;
  if (k === 'dans') {
    tilt = Math.sin(e * 11) * 0.16;
    lift = Math.abs(Math.sin(e * 11)) * 0.04;
    pose = Math.floor(e / 0.2) % 2 ? 'walk2' : 'walk1';
  } else if (k === 'zipla') lift = Math.abs(Math.sin(e * 6)) * 0.22;
  else if (k === 'selam') tilt = Math.sin(e * 8) * 0.06;
  else if (k === 'alkis') lift = Math.abs(Math.sin(e * 14)) * 0.025;
  else if (k === 'kalp') lift = Math.sin(e * 3) * 0.015 + 0.015;
  const fade = Math.min(1, e / 0.2, (WORLD_EMOTE_MS / 1000 - e) / 0.3);
  return { tilt, lift, pose, emoji: WORLD_EMOTE_EMOJI[k], float: Math.sin(e * 4) * 4, alpha: Math.max(0, fade) };
}
