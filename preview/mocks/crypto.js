// Node 'crypto' modülünün önizlemede kullanılan küçük alt kümesi
function randomInt(min, max) {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return min + (a[0] % (max - min));
}
function randomBytes(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return { toString: () => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') };
}
function createHash() {
  let s = '';
  const h = { update: (x) => ((s += String(x)), h), digest: () => s };
  return h;
}
function timingSafeEqual(a, b) {
  return String(a) === String(b);
}
// v135 önizleme: imzalı fotoğraf (houses.photoShot) için sahte HMAC (64 hex)
function createHmac(alg, key) {
  let s = String(key);
  const h = {
    update: (x) => ((s += String(x)), h),
    digest: () => {
      let out = '';
      let a = 2166136261;
      for (let r = 0; r < 8; r++) {
        for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0;
        a = Math.imul(a ^ r, 2246822519) >>> 0;
        out += a.toString(16).padStart(8, '0');
      }
      return out;
    },
  };
  return h;
}
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = { from: (v) => String(v) };
export default { randomInt, randomBytes, createHash, timingSafeEqual, createHmac };
export { randomInt, randomBytes, createHash, timingSafeEqual, createHmac };
