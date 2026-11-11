// Testler için minik çözümleyici: Vite'taki gibi uzantısız göreli içe aktarmaları
// (import x from './platform') .js dosyasına çözer. Sadece bu klasördeki testler kullanır.
// v155: services/gameActions (Firebase) yerine sahte modül; NS_BILLING_OFF=1 iken
// playBilling.js'teki kapatma anahtarı false derlenir (üretim kodunda test kancası yok).
import { register } from 'node:module';
// Not: import.meta.url zaten file:// adresi — Windows'ta pathname'den yeniden adres kurmak
// "C:/C:/..." üretiyordu (v155 ilk deploy). Doğrudan URL kullanılır.
const stub = new URL('./stubGameActions.mjs', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
const STUB = ${JSON.stringify(stub)};
export async function resolve(spec, ctx, next) {
  if (/services\\/gameActions(\\.js)?$/.test(spec)) return { url: STUB, shortCircuit: true };
  try { return await next(spec, ctx); }
  catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[cm]?jsx?$/.test(spec)) return next(spec + '.js', ctx);
    throw e;
  }
}
export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (process.env.NS_BILLING_OFF === '1' && url.endsWith('/src/lib/playBilling.js')) {
    const src = String(r.source).replace('export const NATIVE_PLAY_BILLING_ON = true;', 'export const NATIVE_PLAY_BILLING_ON = false;');
    return { ...r, source: src };
  }
  return r;
}`));
