// v215 — Cloudflare Worker (wrangler.toml › main).
// Var olan dosyalar (index.html, /assets/…, ikonlar) bu koda HİÇ uğramadan doğrudan sunulur.
// Buraya sadece karşılığı OLMAYAN istekler gelir.
//
// Sorun: olmayan bir /assets/…js dosyası istendiğinde (ör. yayın sırasında, ya da geri alma sonrası
// aynı adla geri gelen dosya) Cloudflare SPA kuralı gereği index.html döndürüyordu; _headers'taki
// "/assets/* → 1 yıl sakla" kuralı yüzünden bu HTML hem Cloudflare'de hem oyuncunun cihazında o dosyanın
// adıyla saklanıyordu → şehir "Ekran yüklenemedi" diye açılmıyordu.
// Çözüm: olmayan /assets/ dosyası için saklanmayan 404. Diğer her şey eskisi gibi (sayfa adresleri →
// index.html).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/assets/')) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
