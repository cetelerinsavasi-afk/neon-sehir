import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// v166 HIZ — açılıştaki kasma: uygulama açıldıktan 3 sn sonra tüm tam ekran sayfalar (şehir, ev,
// mekânlar, futbol…) arka planda import() ile ÇALIŞTIRILIYORDU — telefonda saniyelerce ana iş
// parçacığı doluyor, o ekranların bütün verisi de bellekte kalıyordu. Artık derlemede bu sayfaların
// dosya listesi (prefetch-list.json) çıkarılır; istemci dosyaları sadece İNDİRİR (modulepreload,
// çalıştırmaz). Sayfa ilk açıldığında ağ beklenmez, ama boşuna işlemci / bellek de harcanmaz.
function prefetchList() {
  const appFile = fileURLToPath(new URL('./src/App.jsx', import.meta.url))
  return {
    name: 'neon-prefetch-list',
    apply: 'build',
    generateBundle(_, bundle) {
      let src = ''
      try {
        src = readFileSync(appFile, 'utf8')
      } catch {
        return
      }
      const want = new Set()
      for (const m of src.matchAll(/lazyScreen\(\(\)\s*=>\s*import\('([^']+)'\)\)/g)) {
        const base = resolve(dirname(appFile), m[1])
        for (const ext of ['', '.jsx', '.js']) want.add(base + ext)
      }
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
      // giriş dosyası + statik bağımlılıkları zaten yüklü
      const eager = new Set()
      const walk = (f) => {
        if (!f || eager.has(f)) return
        eager.add(f)
        bundle[f]?.imports?.forEach(walk)
      }
      chunks.filter((c) => c.isEntry).forEach((c) => walk(c.fileName))
      const out = []
      const seen = new Set()
      const add = (f) => {
        if (!f || seen.has(f) || eager.has(f)) return
        seen.add(f)
        const c = bundle[f]
        if (!c) return
        c.imports?.forEach(add) // önce bağımlılıklar
        out.push('/' + f)
        c.viteMetadata?.importedCss?.forEach((css) => {
          if (!seen.has(css)) {
            seen.add(css)
            out.push('/' + css)
          }
        })
      }
      chunks.filter((c) => c.isDynamicEntry && c.facadeModuleId && want.has(c.facadeModuleId)).forEach((c) => add(c.fileName))
      this.emitFile({ type: 'asset', fileName: 'prefetch-list.json', source: JSON.stringify(out) })
    },
  }
}

// v167 HIZ — şehir parçaları (three.js + şehir motoru ≈ 2 MB) index.html'de <link rel="modulepreload"> ile
// istenir: tarayıcı ana paketle AYNI ANDA indirmeye başlar. Eskiden zincirleme iniyordu (ana paket →
// çalıştır → oturum → şehir ekranı → şehrin parçaları). İlk kez giren oyuncu için en uzun bekleme buydu.
function cityPreload() {
  return {
    name: 'neon-city-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx?.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const city = chunks.find((c) => c.facadeModuleId && c.facadeModuleId.replace(/\\/g, '/').endsWith('/src/components/City/CityScreen.jsx'));
        if (!city) return html;
        const eager = new Set();
        const walkEager = (f) => {
          if (!f || eager.has(f)) return;
          eager.add(f);
          bundle[f]?.imports?.forEach(walkEager);
        };
        chunks.filter((c) => c.isEntry).forEach((c) => walkEager(c.fileName));
        const out = [];
        const seen = new Set();
        const add = (f) => {
          if (!f || seen.has(f) || eager.has(f)) return;
          seen.add(f);
          bundle[f]?.imports?.forEach(add);
          out.push(f);
        };
        add(city.fileName);
        return {
          html,
          tags: out.map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: '/' + f }, injectTo: 'head' })),
        };
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prefetchList(), cityPreload()],
  // v187 GEÇİCİ ÖLÇÜM (3 gün) — okuma kaynağı sayacı (bkz. src/lib/fsMeter). v170'te bu satır
  // kaldırılmıştı, ölçüm kodu hiç yüklenmiyordu. Bitiş: src/lib/fsMeter/meter.js READ_STATS_END
  // (o tarihten sonra sarmalayıcı doğrudan orijinali çağırır). Kaldırmak için bu alias'ı sil.
  resolve: {
    alias: [
      { find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./src/lib/fsMeter/firestoreShim.js', import.meta.url)) },
    ],
  },
})
