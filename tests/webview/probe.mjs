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
  if (scenario.startsWith('billing')) {
    const PB = await import('../../src/lib/playBilling.js');
    out.billingCap = B.hasNativeBilling();
    out.storeOpen = PB.webViewStoreOpen();
    out.reachable = PB.zumrutStoreReachable();
    out.restoreOk = PB.playRestoreSupported();
    out.flag = PB.NATIVE_PLAY_BILLING_ON;
    const svc = await PB.getPlayBillingService();
    out.service = svc ? (svc.isNative ? 'native' : 'digital-goods') : null;
    if (svc && scenario === 'billing-prices') {
      out.prices = await PB.getPlayPrices(svc);
      out.unavailable = Boolean(svc.unavailable);
    }
    const tryBuy = async () => {
      try {
        return await PB.buyWithPlay(svc, 'zumrut_50', 'uid-123');
      } catch (e) {
        return { thrown: e.message, safePending: Boolean(e.safePending), unavailable: Boolean(e.unavailable) };
      }
    };
    if (svc && scenario === 'billing-buy') out.buy = await tryBuy();
    if (svc && scenario === 'billing-restore') out.restored = await PB.restorePlayPurchases(svc);
    if (svc && scenario === 'billing-quiet') out.restored = await PB.quietRestorePlayPurchases();
    if (svc && scenario === 'billing-race') {
      // satın alma sonucu + o anda çalışan geri yükleme aynı jetonu birlikte doğrular
      const [a, b] = await Promise.all([tryBuy(), PB.restorePlayPurchases(svc)]);
      out.buy = a;
      out.restored = b;
    }
    out.hash = await PB.accountHashOf('uid-123');
    out.verify = globalThis.__verifyCalls || [];
  }
  out.calls = window.__calls || null;
}
process.stdout.write(JSON.stringify(out));
