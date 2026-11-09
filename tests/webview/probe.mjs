// Alt süreçte çalışır: ortamı kurar, istenen senaryoyu yürütür, sonucu JSON yazar.
import './env.mjs';
const scenario = process.argv[2];
const P = await import('../../src/lib/platform.js');
const out = {
  PLATFORM: P.PLATFORM,
  IS_ANDROID_APP: P.IS_ANDROID_APP,
  IS_ANDROID_WEBVIEW: P.IS_ANDROID_WEBVIEW,
  IS_ANDROID_TWA: P.IS_ANDROID_TWA,
  ANDROID_APP_VERSION: P.ANDROID_APP_VERSION,
  ANDROID_UPDATE_REQUIRED: P.ANDROID_UPDATE_REQUIRED,
  ANDROID_UPDATE_AVAILABLE: P.ANDROID_UPDATE_AVAILABLE,
  href: window.location.href,
  session: window.sessionStorage.getItem('ns_platform'),
};
if (scenario !== 'platform') {
  const B = await import('../../src/lib/nativeBridge.js');
  out.hasBridge = B.hasNativeBridge();
  if (scenario === 'signin') out.signin = await B.nativeGoogleSignIn();
  if (scenario === 'exit') out.exit = B.nativeExitApp();
  if (scenario === 'signout') { B.nativeSignOutGoogle(); }
  if (scenario === 'copy') {
    try { out.copy = await B.copyText('abc'); } catch (e) { out.copyErr = e.message; }
  }
  if (scenario === 'save-small' || scenario === 'save-big') {
    const size = scenario === 'save-small' ? 1000 : 1_300_000;
    const data = new Uint8Array(size).map((_, i) => (i * 31 + 7) & 255);
    const blob = new Blob([data], { type: 'audio/mpeg' });
    out.save = await B.nativeSaveBlob(blob, 'Sarki - cetelerinsavasi.com.mp3', 'audio/mpeg');
    if (window.__files) {
      const got = window.__files.get('Sarki - cetelerinsavasi.com.mp3');
      out.sameBytes = Boolean(got) && Buffer.compare(Buffer.from(data), got) === 0;
    }
  }
  if (scenario === 'timeout') {
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms > 1000 ? 20 : ms, ...a); // 60 sn → 20 ms
    out.signin = await B.nativeGoogleSignIn();
  }
  out.calls = window.__calls || null;
}
process.stdout.write(JSON.stringify(out));
