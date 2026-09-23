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
  return a === b;
}
export default { randomInt, randomBytes, createHash, timingSafeEqual };
export { randomInt, randomBytes, createHash, timingSafeEqual };
