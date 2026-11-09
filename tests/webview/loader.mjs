// Testler için minik çözümleyici: Vite'taki gibi uzantısız göreli içe aktarmaları
// (import x from './platform') .js dosyasına çözer. Sadece bu klasördeki testler kullanır.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[cm]?jsx?$/.test(spec)) return next(spec + '.js', ctx);
    throw e;
  }
}`));
