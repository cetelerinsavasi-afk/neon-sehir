package com.cetelerinsavasi.twa

import java.net.URI

/**
 * Hangi adres oyunun içinde (WebView), hangisi dışarıda açılır?
 *
 * Saf Kotlin (android.* yok) — app/src/test altındaki birim testleriyle doğrulanır.
 */
object UrlPolicy {
    const val SITE_HOST = "cetelerinsavasi.com"
    private val APP_HOSTS = setOf(SITE_HOST, "www.$SITE_HOST")

    /** Kendi sitemizde olup yine de tarayıcıda açılan statik sayfalar (oyun yeniden yüklenmesin). */
    private val EXTERNAL_PATHS = Regex("^/(gizlilik|kosullar|hesap-silme)(\\.html)?/?$", RegexOption.IGNORE_CASE)

    enum class Kind {
        /** WebView içinde aç (oyunun kendisi). */
        IN_APP,
        /** Kendi alan adımız ama tarayıcıda açılmalı (yasal sayfalar). App Links döngüsü olmasın diye tarayıcı zorlanır. */
        EXTERNAL_OWN_SITE,
        /** Başka site/uygulama: Play Store, Instagram, mailto:, tel:, intent: … */
        EXTERNAL,
        /** Hiç açılmaz (file:, content:, data:, blob: ana çerçeve gezinmesi). */
        BLOCK,
    }

    fun classify(url: String?): Kind {
        if (url.isNullOrBlank()) return Kind.BLOCK
        val scheme = url.substringBefore(':', "").lowercase()
        return when (scheme) {
            "https", "http" -> {
                val uri = parse(url) ?: return Kind.EXTERNAL
                val host = uri.host?.lowercase()
                if (host != null && host in APP_HOSTS) {
                    if (EXTERNAL_PATHS.matches(uri.rawPath ?: "")) Kind.EXTERNAL_OWN_SITE else Kind.IN_APP
                } else {
                    Kind.EXTERNAL
                }
            }
            "about", "javascript" -> Kind.IN_APP
            "file", "content", "data", "blob", "" -> Kind.BLOCK
            else -> Kind.EXTERNAL // mailto, tel, sms, market, intent, whatsapp, …
        }
    }

    /** Köprü sadece bu sayfadayken çalışır: https + kendi alan adımız. */
    fun isTrustedPage(url: String?): Boolean {
        if (url == null || !url.startsWith("https://", ignoreCase = true)) return false
        val host = parse(url)?.host?.lowercase() ?: return false
        return host in APP_HOSTS
    }

    fun isPlayStore(url: String): Boolean {
        if (url.startsWith("market:", ignoreCase = true)) return true
        val uri = parse(url) ?: return false
        return uri.host?.lowercase() == "play.google.com"
    }

    /**
     * Açılış adresi: gelen link (deep link) bizim siteye aitse o yol açılır,
     * yoksa ana sayfa. Her durumda src=app&av=<versionCode> eklenir; eski
     * src/av değerleri atılır, diğer parametreler ve #hash korunur.
     */
    fun launchUrl(incoming: String?, versionCode: Int): String {
        val base = "https://$SITE_HOST"
        val uri = incoming?.takeIf { classify(it) == Kind.IN_APP && it.startsWith("http", true) }?.let { parse(it) }
        val path = uri?.rawPath?.takeIf { it.isNotEmpty() } ?: "/"
        val kept = uri?.rawQuery
            ?.split('&')
            ?.filter { it.isNotEmpty() }
            ?.filterNot { part ->
                val key = part.substringBefore('=').lowercase()
                key == "src" || key == "av"
            }
            .orEmpty()
        val query = (kept + listOf("src=app", "av=$versionCode")).joinToString("&")
        val fragment = uri?.rawFragment?.let { "#$it" } ?: ""
        return "$base$path?$query$fragment"
    }

    /** Deep link sadece ana sayfayı mı istiyor? (O zaman açık oyun yeniden yüklenmez.) */
    fun isPlainHome(url: String?): Boolean {
        val uri = url?.let { parse(it) } ?: return true
        val path = uri.rawPath ?: ""
        val q = uri.rawQuery
            ?.split('&')
            ?.filter { it.isNotEmpty() && it.substringBefore('=').lowercase() !in setOf("src", "av") }
            .orEmpty()
        return (path.isEmpty() || path == "/") && q.isEmpty() && uri.rawFragment.isNullOrEmpty()
    }

    private fun parse(url: String): URI? = try {
        URI(url)
    } catch (_: Exception) {
        null
    }
}
