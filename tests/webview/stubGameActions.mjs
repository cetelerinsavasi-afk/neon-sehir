// v155 testleri: sunucu doğrulamasının sahtesi (verifyPlayPurchase). Her jeton tek kez yüklenir.
const seen = new Set();
export const verifyCalls = [];
globalThis.__verifyCalls = verifyCalls;
export async function verifyPlayPurchase(productId, purchaseToken) {
  verifyCalls.push([productId, purchaseToken]);
  await new Promise((r) => setTimeout(r, 5));
  const first = !seen.has(purchaseToken);
  seen.add(purchaseToken);
  const emerald = productId === 'zumrut_200' ? 200 : 50;
  return { data: { ok: true, credited: first, emerald } };
}
