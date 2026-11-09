package com.cetelerinsavasi.twa

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import org.json.JSONObject

/**
 * Neon Şehir — tek ekranlı WebView kabuğu.
 *
 * Oyun (https://cetelerinsavasi.com) uygulamanın KENDİ sürecindeki WebView'da
 * çalışır. Web tarafı bu kabuğu ?src=app, UA'daki " NeonSehirApp/<sürüm>" eki
 * ve window.NeonAndroid köprüsü ile tanır (src/lib/platform.js).
 *
 * Sınıf adı eski TWA ile aynıdır (ana ekran kısayolları korunur).
 */
class LauncherActivity : ComponentActivity() {

    private lateinit var root: FrameLayout
    private var webView: WebView? = null
    private var errorView: View? = null
    private lateinit var bridge: NeonBridge
    lateinit var googleSignIn: GoogleSignIn
        private set

    /** Köprü (JavaBridge thread) bunu okur — WebView metotları o thread'den çağrılamaz. */
    @Volatile private var trustedPage = false
    /** Render süreci ölürse / bağlantı gelince yeniden açılacak son oyun adresi. */
    private var lastGameUrl: String? = null

    /** loadUrl yeni geçmiş kaydı ekler; yüklenince eski kayıtlar silinsin (geri tuşu eski sayfayı yeniden yüklemesin). */
    private var clearHistoryOnLoad = false
    /** Render süreci uygulama arka plandayken öldürüldüyse oyun öne gelince yeniden açılır. */
    private var reloadOnResume = false

    @Volatile private var pageReady = false
    private val startedAt = SystemClock.uptimeMillis()
    private val crashTimes = mutableListOf<Long>()

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // İlk sayfa çizilene kadar (en fazla ~4 sn) açılış ekranı kalsın
        splash.setKeepOnScreenCondition { !pageReady && SystemClock.uptimeMillis() - startedAt < SPLASH_MAX_MS }

        // Kenardan kenara (Android 15+ zorunlu; eskilerde de aynı görünüm):
        // çubuklar #070A12, ikonlar açık renk; içerik çubukların ALTINA GİRMEZ (padding).
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(BG),
        )
        window.setBackgroundDrawable(ColorDrawable(BG))

        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            // Klavye açıkken alt boşluk klavye kadar → WebView küçülür (Chrome'daki gibi)
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        googleSignIn = GoogleSignIn(this)
        bridge = NeonBridge(this)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val wv = webView
                // Web'deki backStack.js history "bekçi" kaydıyla çalışır: goBack() → popstate
                // → açık ekran kapanır / ana sayfada uyarı → çıkış onayı. Geçmiş bitince çık.
                if (errorView == null && wv != null && wv.canGoBack()) wv.goBack() else finish()
            }
        })

        createWebView()
        val start = UrlPolicy.launchUrl(intent?.dataString, BuildConfig.VERSION_CODE)
        handleOwnSiteExternal(intent?.dataString)
        loadGame(start)
    }

    // ------------------------------------------------------------------ WebView
    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun createWebView(): WebView {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val wv = WebView(this)
        wv.setBackgroundColor(BG)
        wv.overScrollMode = View.OVER_SCROLL_NEVER
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false // oyun sesleri
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            loadWithOverviewMode = false // sitenin kendi viewport meta'sı geçerli
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100 // telefonun yazı boyutu oyunun yerleşimini bozmasın
            cacheMode = WebSettings.LOAD_DEFAULT
            // Chrome UA'sı SİLİNMEZ; sadece sonuna kendi ekimiz eklenir
            userAgentString = "$userAgentString $UA_MARK/${BuildConfig.VERSION_CODE}"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(wv, true)
        }
        wv.addJavascriptInterface(bridge, "NeonAndroid")
        wv.webViewClient = GameClient()
        wv.webChromeClient = GameChromeClient()
        wv.setDownloadListener { url, _, _, _, _ ->
            // Normal (http/https) indirmeler tarayıcıya; blob: indirmeleri köprüden geçer (saveFile)
            if (url.startsWith("http", ignoreCase = true)) openOutside(url)
        }
        root.addView(wv, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        webView = wv
        return wv
    }

    private fun loadGame(url: String) {
        hideError()
        lastGameUrl = url
        val wv = webView ?: createWebView()
        clearHistoryOnLoad = true
        wv.loadUrl(url)
    }

    fun isTrustedPage(): Boolean = trustedPage

    /** Köprü sonucunu web'e ver — ana thread, JSON metni JS dizgesi olarak kaçışlı. */
    fun resolveJs(result: JSONObject) {
        runOnUiThread {
            val js = "window.__neonNative && window.__neonNative.resolve(" + JSONObject.quote(result.toString()) + ")"
            webView?.evaluateJavascript(js, null)
        }
    }

    fun toast(message: String, long: Boolean = false) {
        runOnUiThread { Toast.makeText(this, message, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show() }
    }

    private inner class GameClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            val url = request.url.toString()
            return when (UrlPolicy.classify(url)) {
                UrlPolicy.Kind.IN_APP -> false
                UrlPolicy.Kind.EXTERNAL, UrlPolicy.Kind.EXTERNAL_OWN_SITE -> {
                    openOutside(url)
                    true
                }
                UrlPolicy.Kind.BLOCK -> true
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            trustedPage = UrlPolicy.isTrustedPage(url)
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            // pushState/replaceState dahil — köprü kontrolü ve yeniden yükleme adresi güncel kalsın
            trustedPage = UrlPolicy.isTrustedPage(url)
            if (trustedPage && url != null) lastGameUrl = url
            if (clearHistoryOnLoad && !isReload) {
                clearHistoryOnLoad = false
                view.clearHistory()
            }
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            pageReady = true
        }

        override fun onPageFinished(view: WebView, url: String?) {
            pageReady = true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            // Sadece ana sayfa yüklenemezse (internet yok vb.). Service worker kuruluysa
            // internet yokken zaten sitenin kendi "Bağlantı yok" sayfası gelir.
            if (request.isForMainFrame) {
                Log.w(TAG, "Sayfa yüklenemedi: ${error.errorCode} ${error.description}")
                showError(getString(R.string.offline_body))
            }
        }

        @RequiresApi(26) // sistem bu geri çağrıyı zaten sadece Android 8+ cihazlarda yapar
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // Çökme yerine: WebView'ı at, yenisini kur, oyunu yeniden yükle.
            Log.w(TAG, "WebView render süreci bitti (crash=${detail.didCrash()}, öncelik=${detail.rendererPriorityAtExit()})")
            if (view !== webView) {
                // eski / zaten değiştirilmiş bir WebView — sadece temizle
                view.destroy()
                return true
            }
            root.removeView(view)
            webView = null
            view.destroy()
            if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                // Arka plandayken sistem belleği geri aldı: şimdi yükleme (arka planda
                // dinleyiciler yeniden bağlanmasın), oyun öne gelince yeniden aç.
                reloadOnResume = true
                return true
            }
            val now = SystemClock.uptimeMillis()
            crashTimes.add(now)
            crashTimes.removeAll { now - it > 60_000 }
            if (crashTimes.size >= 3) {
                // 1 dakikada 3. kez: döngüye girmesin, kullanıcı karar versin
                createWebView()
                showError(getString(R.string.offline_crash_body))
            } else {
                createWebView()
                loadGame(UrlPolicy.launchUrl(lastGameUrl, BuildConfig.VERSION_CODE))
            }
            return true
        }
    }

    private inner class GameChromeClient : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = filePathCallback
            return try {
                fileChooser.launch(fileChooserParams.createIntent())
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                filePathCallback.onReceiveValue(null)
                true
            }
        }
    }

    // ------------------------------------------------------------- Dış linkler
    /** Play Store, Instagram, mailto:, tel:, intent:, yasal sayfalar → uygulama dışında. */
    fun openOutside(url: String) {
        try {
            when {
                url.startsWith("intent:", ignoreCase = true) -> openIntentScheme(url)
                UrlPolicy.isPlayStore(url) -> openPlayStore(url)
                UrlPolicy.classify(url) == UrlPolicy.Kind.EXTERNAL_OWN_SITE ||
                    UrlPolicy.classify(url) == UrlPolicy.Kind.IN_APP -> openInBrowser(url)
                UrlPolicy.classify(url) == UrlPolicy.Kind.BLOCK -> Unit
                else -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        } catch (_: ActivityNotFoundException) {
            toast(getString(R.string.no_app_to_open))
        } catch (e: Exception) {
            Log.w(TAG, "Dış link açılamadı: $url", e)
            toast(getString(R.string.no_app_to_open))
        }
    }

    private fun openPlayStore(url: String) {
        val uri = Uri.parse(url)
        val store = Intent(Intent.ACTION_VIEW, uri).setPackage(PLAY_STORE_PKG)
        try {
            startActivity(store)
        } catch (_: ActivityNotFoundException) {
            val web = if (url.startsWith("market:", ignoreCase = true)) {
                Uri.parse("https://play.google.com/store/apps/" + url.substringAfter("market:").removePrefix("//").removePrefix("/"))
            } else {
                uri
            }
            startActivity(Intent(Intent.ACTION_VIEW, web))
        }
    }

    /**
     * Kendi alan adımızı tarayıcıda açar. Normal ACTION_VIEW, App Links yüzünden
     * yine bu uygulamaya dönerdi (döngü) — bu yüzden varsayılan tarayıcı paketi seçilir.
     */
    private fun openInBrowser(url: String) {
        val uri = Uri.parse(url)
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/")).addCategory(Intent.CATEGORY_BROWSABLE)
        val browserPkg = packageManager.resolveActivity(probe, 0)?.activityInfo?.packageName
            ?.takeIf { it != packageName && it != "android" }
        val view = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
        if (browserPkg != null) {
            try {
                startActivity(Intent(view).setPackage(browserPkg))
                return
            } catch (_: ActivityNotFoundException) {
                // aşağıdaki seçiciye düş
            }
        }
        // Varsayılan tarayıcı yoksa: bu uygulama HARİÇ seçici
        val targets = packageManager.queryIntentActivities(probe, 0)
            .map { it.activityInfo.packageName }
            .distinct()
            .filter { it != packageName }
        if (targets.isEmpty()) throw ActivityNotFoundException()
        val first = Intent(view).setPackage(targets.first())
        val chooser = Intent.createChooser(first, null)
        if (targets.size > 1) {
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, targets.drop(1).map { Intent(view).setPackage(it) }.toTypedArray())
        }
        startActivity(chooser)
    }

    private fun openIntentScheme(url: String) {
        val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
            // Güvenlik (Chrome ile aynı): web sayfası uygulamanın iç bileşenlerini
            // açamasın, URI izni veremesin
            addCategory(Intent.CATEGORY_BROWSABLE)
            component = null
            selector = null
            flags = flags and (
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
                ).inv()
        }
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            val fallback = intent.getStringExtra("browser_fallback_url")
            when {
                fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://")) -> openOutside(fallback)
                intent.`package` != null -> openPlayStore("market://details?id=${intent.`package`}")
                else -> throw ActivityNotFoundException()
            }
        }
    }

    /** Dışarıdan gelen link yasal sayfaysa onu tarayıcıda aç (oyun yine açılır). */
    private fun handleOwnSiteExternal(dataString: String?) {
        if (dataString != null && UrlPolicy.classify(dataString) == UrlPolicy.Kind.EXTERNAL_OWN_SITE) {
            openOutside(dataString)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val data = intent.dataString ?: return // simgeden açılış: oyun olduğu gibi öne gelir
        when (UrlPolicy.classify(data)) {
            UrlPolicy.Kind.EXTERNAL_OWN_SITE -> handleOwnSiteExternal(data)
            UrlPolicy.Kind.IN_APP -> {
                // Sadece ana sayfa isteniyorsa açık oyunu yeniden YÜKLEME (gereksiz okuma olmasın)
                if (!UrlPolicy.isPlainHome(data) || webView == null || errorView != null) {
                    loadGame(UrlPolicy.launchUrl(data, BuildConfig.VERSION_CODE))
                }
            }
            else -> Unit
        }
    }

    // ------------------------------------------------------- Bağlantı yok ekranı
    private fun showError(message: String) {
        pageReady = true
        if (errorView != null) {
            (errorView?.findViewWithTag<TextView>("body"))?.text = message
            return
        }
        val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt() }
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BG)
            setPadding(dp(32), dp(32), dp(32), dp(32))
            isClickable = true // alttaki WebView'a dokunuş geçmesin
            addView(TextView(context).apply {
                text = "📡"
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 44f)
                gravity = Gravity.CENTER
            })
            addView(TextView(context).apply {
                text = getString(R.string.offline_title)
                setTextColor(ContextCompat.getColor(context, R.color.neon_text))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                gravity = Gravity.CENTER
                setPadding(0, dp(12), 0, dp(6))
            })
            addView(TextView(context).apply {
                tag = "body"
                text = message
                setTextColor(ContextCompat.getColor(context, R.color.neon_muted))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, dp(24))
            })
            addView(Button(context).apply {
                text = getString(R.string.retry)
                isAllCaps = false
                setTextColor(BG)
                setBackgroundColor(ContextCompat.getColor(context, R.color.neon_accent))
                setPadding(dp(28), dp(12), dp(28), dp(12))
                setOnClickListener {
                    crashTimes.clear()
                    loadGame(UrlPolicy.launchUrl(lastGameUrl, BuildConfig.VERSION_CODE))
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            })
        }
        root.addView(box, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        errorView = box
    }

    private fun hideError() {
        errorView?.let { root.removeView(it) }
        errorView = null
    }

    // ------------------------------------------------------------- Yaşam döngüsü
    override fun onResume() {
        super.onResume()
        if (reloadOnResume) {
            reloadOnResume = false
            createWebView()
            loadGame(UrlPolicy.launchUrl(lastGameUrl, BuildConfig.VERSION_CODE))
        }
        webView?.onResume()
    }

    override fun onPause() {
        // Animasyon/çizim durur (3D sahne CPU yemez); JS ve oyun durumu korunur.
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView?.let {
            root.removeView(it)
            it.destroy()
        }
        webView = null
        bridge.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "NeonSehir"
        private const val UA_MARK = "NeonSehirApp"
        private const val PLAY_STORE_PKG = "com.android.vending"
        private const val SPLASH_MAX_MS = 4000L
        private val BG = Color.parseColor("#070A12")
    }
}
