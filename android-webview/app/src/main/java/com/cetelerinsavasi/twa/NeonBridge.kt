package com.cetelerinsavasi.twa

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * window.NeonAndroid — web ile native arasındaki köprü.
 *
 * KURALLAR
 *  - Her metot önce sayfanın https://cetelerinsavasi.com olduğunu kontrol eder
 *    (LauncherActivity.isTrustedPage). Değilse hiçbir şey yapmaz.
 *  - @JavascriptInterface metotları "JavaBridge" thread'inde çalışır; arayüz /
 *    WebView işleri runOnUiThread ile ana thread'e taşınır.
 *  - Asenkron sonuçlar window.__neonNative.resolve("<JSON>") ile döner
 *    (LauncherActivity.resolveJs — ana thread, JSON kaçışlı).
 *  - Hiçbir metot Firestore'a / ağa istek atmaz.
 *
 * Web tarafı: src/lib/nativeBridge.js
 */
class NeonBridge(private val activity: LauncherActivity) {

    private val io = Executors.newSingleThreadExecutor()
    private val files = FileSaver(activity.applicationContext)

    private fun trusted() = activity.isTrustedPage()

    /** Güvenilmeyen sayfadan gelen asenkron isteği beklemeden kapat. */
    private fun reject(requestId: String?) {
        if (!requestId.isNullOrBlank()) activity.resolveJs(JSONObject().put("requestId", requestId).put("ok", false))
    }

    @JavascriptInterface
    fun getInfo(): String {
        if (!trusted()) return "{}"
        return JSONObject()
            .put("shell", "webview")
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("versionName", BuildConfig.VERSION_NAME)
            .put("sdk", Build.VERSION.SDK_INT)
            .toString()
    }

    // ------------------------------------------------------------ Google girişi
    @JavascriptInterface
    fun signInWithGoogle(requestId: String) {
        if (!trusted()) return reject(requestId)
        activity.runOnUiThread {
            activity.googleSignIn.signIn { outcome ->
                val res = JSONObject().put("requestId", requestId)
                when (outcome) {
                    is GoogleSignIn.Outcome.Success -> res.put("ok", true).put("idToken", outcome.idToken)
                    is GoogleSignIn.Outcome.Cancelled -> res.put("ok", false).put("cancelled", true)
                    is GoogleSignIn.Outcome.Failure -> {
                        res.put("ok", false).put("error", outcome.message)
                        activity.toast(outcome.message, long = true)
                    }
                }
                activity.resolveJs(res)
            }
        }
    }

    @JavascriptInterface
    fun signOutGoogle() {
        if (!trusted()) return
        activity.runOnUiThread { activity.googleSignIn.signOut() }
    }

    // ----------------------------------------------------------- Uygulamadan çık
    @JavascriptInterface
    fun exitApp() {
        if (!trusted()) return
        activity.runOnUiThread { activity.finish() }
    }

    // ------------------------------------------------------------------- Pano
    @JavascriptInterface
    fun copyText(text: String?): Boolean {
        if (!trusted() || text == null) return false
        activity.runOnUiThread {
            try {
                val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("Neon Şehir", text))
            } catch (_: Exception) {
                // pano kapalı olabilir — yoksay
            }
        }
        return true
    }

    // ---------------------------------------------------------- Dışarıda aç
    @JavascriptInterface
    fun openExternal(url: String?) {
        if (!trusted() || url.isNullOrBlank()) return
        // Sadece bilinen şemalar (intent: vb. köprüden açılamaz)
        val scheme = url.substringBefore(':').lowercase()
        if (scheme !in setOf("https", "http", "market", "mailto")) return
        activity.runOnUiThread { activity.openOutside(url) }
    }

    // ------------------------------------------------------ Dosya kaydetme
    /** Küçük dosya (≤ 512 KB) tek çağrıda. */
    @JavascriptInterface
    fun saveFile(requestId: String, fileName: String?, mimeType: String?, base64: String?) {
        if (!trusted() || base64 == null) return reject(requestId)
        io.execute {
            val r = try {
                files.saveBase64(fileName ?: "", mimeType ?: "", base64)
            } catch (_: Exception) {
                FileSaver.Result(false)
            }
            finishSave(requestId, r)
        }
    }

    /** Büyük dosya: begin → chunk (512 KB'lık parçalar) → end. */
    @JavascriptInterface
    fun saveFileBegin(fileName: String?, mimeType: String?): String {
        if (!trusted()) return ""
        return try {
            files.begin(fileName ?: "", mimeType ?: "")
        } catch (_: Exception) {
            ""
        }
    }

    @JavascriptInterface
    fun saveFileChunk(transferId: String?, base64: String?): Boolean {
        if (!trusted() || transferId == null || base64 == null) return false
        return files.chunk(transferId, base64)
    }

    @JavascriptInterface
    fun saveFileEnd(requestId: String, transferId: String?) {
        if (!trusted() || transferId == null) return reject(requestId)
        io.execute {
            val r = try {
                files.end(transferId)
            } catch (_: Exception) {
                FileSaver.Result(false)
            }
            finishSave(requestId, r)
        }
    }

    @JavascriptInterface
    fun saveFileAbort(transferId: String?) {
        if (transferId != null) files.abort(transferId)
    }

    private fun finishSave(requestId: String, r: FileSaver.Result) {
        val res = JSONObject().put("requestId", requestId).put("ok", r.ok)
        if (r.ok) {
            res.put("name", r.name)
            activity.toast(activity.getString(R.string.downloaded, r.name ?: ""))
        } else {
            res.put("error", activity.getString(R.string.download_failed))
        }
        activity.resolveJs(res)
    }

    fun shutdown() {
        io.shutdown()
    }
}
