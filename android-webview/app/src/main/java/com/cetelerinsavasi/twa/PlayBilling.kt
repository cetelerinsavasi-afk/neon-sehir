package com.cetelerinsavasi.twa

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject

/**
 * v155 — Google Play Faturalandırma (Zümrüt Mağazası), WebView v15+.
 *
 * KURALLAR (bkz. V155-ZUMRUT-PLAN.md)
 *  - Uygulama ömrü boyunca TEK BillingClient (Activity'ye değil uygulama bağlamına bağlı).
 *  - Bu sınıf ASLA zümrüt yüklemez, Firestore'a / ağa istek atmaz, satın almayı kendi başına
 *    acknowledge / consume ETMEZ. Tüketme sadece web'in `billingConsume` isteğiyle olur ve web
 *    bunu sunucu (verifyPlayPurchase) doğruladıktan SONRA ister. Zümrütü SADECE sunucu yükler.
 *  - Aynı anda tek satın alma akışı.
 *  - Tüm durum ana thread'de değişir (Billing ve JavaBridge geri çağrıları ana thread'e taşınır).
 *  - Sadece tek seferlik (tüketilebilir) ürünler: ProductType.INAPP (zumrut_50, zumrut_200).
 *
 * Kotlin uyumu: sadece geri çağrı (callback) API'leri kullanılır, coroutine YOK → bağımlılık
 * `billing-ktx` yerine düz `billing` yapılırsa bu dosya değişmeden derlenir (app/build.gradle.kts).
 */
object PlayBilling {

    /** Sonuçları web'e veren taraf (LauncherActivity). */
    interface Sink {
        fun deliver(result: JSONObject)
        fun purchasesUpdated()
        fun currentActivity(): Activity?
        fun isInForeground(): Boolean
    }

    private const val TAG = "NeonBilling"
    private const val MAX_RETRY_MS = 60_000L
    private val ACCOUNT_HASH_RE = Regex("^[0-9a-f]{64}$")

    private val main = Handler(Looper.getMainLooper())
    @Volatile private var client: BillingClient? = null
    private var connecting = false
    private var retryMs = 1_000L
    private val waiters = mutableListOf<(BillingResult) -> Unit>()
    private val details = HashMap<String, ProductDetails>()

    /** Süren satın alma akışı (web isteği). */
    private var flowRequestId: String? = null
    private var flowProductId: String? = null

    /** Uygulama arkadayken gelen güncelleme → öne gelince web'e haber ver. */
    private var updateWhileAway = false

    @Volatile var sink: Sink? = null

    /** Köprünün faturalandırma yeteneği (getInfo().billing). */
    val supported: Boolean get() = client != null

    // ------------------------------------------------------------------ yaşam döngüsü
    fun init(context: Context) {
        if (client != null) return
        client = try {
            BillingClient.newBuilder(context.applicationContext)
                .setListener(purchasesListener)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build()
        } catch (t: Throwable) {
            Log.w(TAG, "BillingClient oluşturulamadı", t)
            null
        }
    }

    fun attach(s: Sink) {
        sink = s
    }

    /** Activity öne geldi: arkadayken bir satın alma tamamlandıysa web geri yüklesin. */
    fun onResume() {
        if (updateWhileAway) {
            updateWhileAway = false
            sink?.purchasesUpdated()
        }
    }

    /** Activity kapanıyor: bağlantı kapanır (süren akış varsa sonucu açılışta geri yüklemeyle gelir). */
    fun detach(s: Sink) {
        if (sink !== s) return
        sink = null
        flowRequestId = null
        flowProductId = null
        waiters.clear()
        connecting = false
        main.removeCallbacksAndMessages(null)
        try {
            client?.endConnection()
        } catch (_: Throwable) {
        }
        client = null
        details.clear()
    }

    // ------------------------------------------------------------------ bağlantı
    private fun ensureReady(cb: (BillingResult) -> Unit) {
        val c = client ?: return cb(result(BillingResponseCode.BILLING_UNAVAILABLE))
        if (c.isReady) return cb(result(BillingResponseCode.OK))
        waiters += cb
        if (!connecting) connect()
    }

    private fun connect() {
        val c = client ?: return flush(result(BillingResponseCode.BILLING_UNAVAILABLE))
        connecting = true
        try {
            c.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(billingResult: BillingResult) {
                    main.post {
                        connecting = false
                        val code = billingResult.responseCode
                        if (code == BillingResponseCode.OK) retryMs = 1_000L
                        // Geçici hatada (servis yok / ağ) bekleyenler varsa üstel beklemeyle tekrar dene
                        if (code == BillingResponseCode.SERVICE_UNAVAILABLE || code == BillingResponseCode.NETWORK_ERROR || code == BillingResponseCode.SERVICE_DISCONNECTED) {
                            if (retryMs <= 8_000L && waiters.isNotEmpty()) return@post scheduleReconnect()
                        }
                        flush(billingResult)
                    }
                }

                override fun onBillingServiceDisconnected() {
                    main.post {
                        connecting = false
                        if (waiters.isNotEmpty()) scheduleReconnect()
                    }
                }
            })
        } catch (t: Throwable) {
            connecting = false
            Log.w(TAG, "startConnection", t)
            flush(result(BillingResponseCode.SERVICE_UNAVAILABLE))
        }
    }

    private fun scheduleReconnect() {
        val wait = retryMs
        retryMs = (retryMs * 2).coerceAtMost(MAX_RETRY_MS)
        main.postDelayed({ if (!connecting && client != null) connect() }, wait)
    }

    private fun flush(r: BillingResult) {
        val list = waiters.toList()
        waiters.clear()
        list.forEach { it(r) }
    }

    // ------------------------------------------------------------------ köprü işlemleri
    /** [{ itemId, title, price, priceAmountMicros, priceCurrencyCode }] */
    fun getDetails(requestId: String, productIdsJson: String?) = main.post {
        val ids = parseIds(productIdsJson)
        if (ids.isEmpty()) return@post reply(requestId, JSONObject().put("ok", true).put("items", JSONArray()))
        queryDetails(ids) { br, list ->
            if (br.responseCode != BillingResponseCode.OK) return@queryDetails reply(requestId, error(br))
            val items = JSONArray()
            list.forEach { pd ->
                val o = pd.oneTimePurchaseOfferDetails ?: return@forEach
                items.put(
                    JSONObject()
                        .put("itemId", pd.productId)
                        .put("title", pd.title)
                        .put("price", o.formattedPrice)
                        .put("priceAmountMicros", o.priceAmountMicros)
                        .put("priceCurrencyCode", o.priceCurrencyCode)
                )
            }
            reply(requestId, JSONObject().put("ok", true).put("items", items))
        }
    }

    /**
     * Ödeme penceresini aç. Sonuç PurchasesUpdatedListener'dan gelir.
     * accountHash: Firebase UID'nin SHA-256 özeti (64 küçük hex) — sadece bu biçimdeyse Play'e verilir.
     */
    fun purchase(requestId: String, productId: String?, accountHash: String?) = main.post {
        if (productId.isNullOrBlank()) return@post reply(requestId, failure(BillingResponseCode.DEVELOPER_ERROR))
        if (flowRequestId != null) {
            return@post reply(requestId, JSONObject().put("ok", false).put("busy", true).put("error", "Başka bir ödeme sürüyor. Onu tamamla ya da kapat."))
        }
        flowRequestId = requestId
        flowProductId = productId
        queryDetails(listOf(productId)) { br, list ->
            if (flowRequestId != requestId) return@queryDetails
            val pd = list.firstOrNull { it.productId == productId }
            if (br.responseCode != BillingResponseCode.OK || pd == null) {
                clearFlow()
                return@queryDetails reply(requestId, if (br.responseCode != BillingResponseCode.OK) error(br) else failure(BillingResponseCode.ITEM_UNAVAILABLE))
            }
            val activity = sink?.currentActivity()
            val c = client
            if (activity == null || c == null) {
                clearFlow()
                return@queryDetails reply(requestId, failure(BillingResponseCode.SERVICE_UNAVAILABLE))
            }
            val params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build()))
            if (accountHash != null && ACCOUNT_HASH_RE.matches(accountHash)) params.setObfuscatedAccountId(accountHash)
            val launch = try {
                c.launchBillingFlow(activity, params.build())
            } catch (t: Throwable) {
                Log.w(TAG, "launchBillingFlow", t)
                result(BillingResponseCode.ERROR)
            }
            if (launch.responseCode != BillingResponseCode.OK) {
                clearFlow()
                reply(requestId, flowOutcome(launch, null, productId))
            }
            // OK → sonuç purchasesListener'a gelir
        }
    }

    /** { ok, purchases: [{ itemId, purchaseToken, purchaseState, quantity }] } — sadece PURCHASED. */
    fun listPurchases(requestId: String) = main.post {
        ensureReady { ready ->
            if (ready.responseCode != BillingResponseCode.OK) return@ensureReady reply(requestId, error(ready))
            val c = client ?: return@ensureReady reply(requestId, failure(BillingResponseCode.SERVICE_UNAVAILABLE))
            c.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()) { br, purchases ->
                main.post {
                    if (br.responseCode != BillingResponseCode.OK) return@post reply(requestId, error(br))
                    val out = JSONArray()
                    purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }.forEach { p ->
                        p.products.forEach { id ->
                            out.put(
                                JSONObject()
                                    .put("itemId", id)
                                    .put("purchaseToken", p.purchaseToken)
                                    .put("purchaseState", p.purchaseState)
                                    .put("quantity", p.quantity)
                            )
                        }
                    }
                    reply(requestId, JSONObject().put("ok", true).put("purchases", out))
                }
            }
        }
    }

    /** Sunucu doğruladıktan SONRA web ister. Hata yutulur (sunucu zaten tüketiyor). */
    fun consume(requestId: String, purchaseToken: String?) = main.post {
        if (purchaseToken.isNullOrBlank()) return@post reply(requestId, failure(BillingResponseCode.DEVELOPER_ERROR))
        ensureReady { ready ->
            if (ready.responseCode != BillingResponseCode.OK) return@ensureReady reply(requestId, error(ready))
            val c = client ?: return@ensureReady reply(requestId, failure(BillingResponseCode.SERVICE_UNAVAILABLE))
            c.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build()) { br, _ ->
                main.post { reply(requestId, JSONObject().put("ok", br.responseCode == BillingResponseCode.OK).put("code", br.responseCode)) }
            }
        }
    }

    // ------------------------------------------------------------------ satın alma sonucu
    private val purchasesListener = PurchasesUpdatedListener { br, purchases ->
        main.post { onPurchasesUpdated(br, purchases ?: emptyList()) }
    }

    private fun onPurchasesUpdated(br: BillingResult, purchases: List<Purchase>) {
        val reqId = flowRequestId
        val productId = flowProductId
        if (reqId != null) {
            clearFlow()
            val mine = purchases.firstOrNull { productId != null && it.products.contains(productId) } ?: purchases.firstOrNull()
            reply(reqId, flowOutcome(br, mine, productId))
            // akışla birlikte başka satın almalar da geldiyse (nadiren) web geri yükleme yapsın
            if (purchases.any { it !== mine }) notifyUpdated()
            return
        }
        // Akış dışı güncelleme: yavaş kartın onaylanması (PENDING → PURCHASED) vb.
        if (br.responseCode == BillingResponseCode.OK && purchases.isNotEmpty()) notifyUpdated()
    }

    private fun notifyUpdated() {
        val s = sink
        if (s != null && s.isInForeground()) s.purchasesUpdated() else updateWhileAway = true
    }

    private fun flowOutcome(br: BillingResult, p: Purchase?, productId: String?): JSONObject {
        val res = JSONObject()
        when (br.responseCode) {
            BillingResponseCode.OK -> {
                if (p == null) return failure(BillingResponseCode.ERROR)
                val id = p.products.firstOrNull() ?: productId
                when (p.purchaseState) {
                    Purchase.PurchaseState.PURCHASED -> res.put("ok", true)
                        .put("productId", id).put("purchaseToken", p.purchaseToken).put("orderId", p.orderId ?: "")
                        .put("quantity", p.quantity)
                    Purchase.PurchaseState.PENDING -> res.put("ok", false).put("pending", true)
                        .put("productId", id).put("purchaseToken", p.purchaseToken).put("quantity", p.quantity)
                    else -> return failure(BillingResponseCode.ERROR)
                }
            }
            BillingResponseCode.USER_CANCELED -> res.put("ok", false).put("cancelled", true)
            BillingResponseCode.ITEM_ALREADY_OWNED -> res.put("ok", false).put("alreadyOwned", true)
            else -> return error(br)
        }
        return res
    }

    private fun clearFlow() {
        flowRequestId = null
        flowProductId = null
    }

    // ------------------------------------------------------------------ yardımcılar
    private fun queryDetails(ids: List<String>, cb: (BillingResult, List<ProductDetails>) -> Unit) {
        val cached = ids.mapNotNull { details[it] }
        if (cached.size == ids.size) return cb(result(BillingResponseCode.OK), cached)
        ensureReady { ready ->
            if (ready.responseCode != BillingResponseCode.OK) return@ensureReady cb(ready, emptyList())
            val c = client ?: return@ensureReady cb(result(BillingResponseCode.SERVICE_UNAVAILABLE), emptyList())
            val products = ids.map {
                QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(BillingClient.ProductType.INAPP).build()
            }
            c.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products).build()) { br, res ->
                val list = res.productDetailsList
                main.post {
                    list.forEach { details[it.productId] = it }
                    cb(br, list)
                }
            }
        }
    }

    private fun parseIds(json: String?): List<String> = try {
        val a = JSONArray(json ?: "[]")
        (0 until a.length()).map { a.getString(it) }.filter { it.isNotBlank() }.distinct().take(10)
    } catch (_: Exception) {
        emptyList()
    }

    private fun reply(requestId: String, body: JSONObject) {
        sink?.deliver(body.put("requestId", requestId))
    }

    private fun result(code: Int): BillingResult = BillingResult.newBuilder().setResponseCode(code).build()

    private fun failure(code: Int): JSONObject = error(result(code))

    private fun error(br: BillingResult): JSONObject {
        val code = br.responseCode
        val res = JSONObject().put("ok", false).put("code", code).put("error", message(code))
        if (code == BillingResponseCode.BILLING_UNAVAILABLE || code == BillingResponseCode.FEATURE_NOT_SUPPORTED) res.put("unavailable", true)
        return res
    }

    private fun message(code: Int): String = when (code) {
        BillingResponseCode.BILLING_UNAVAILABLE, BillingResponseCode.FEATURE_NOT_SUPPORTED -> "Google Play ödemesi bu cihazda kullanılamıyor."
        BillingResponseCode.SERVICE_UNAVAILABLE, BillingResponseCode.SERVICE_DISCONNECTED, BillingResponseCode.NETWORK_ERROR ->
            "Google Play'e bağlanılamadı. İnternetini kontrol edip tekrar dene."
        BillingResponseCode.ITEM_UNAVAILABLE -> "Bu paket şu an satın alınamıyor."
        BillingResponseCode.DEVELOPER_ERROR -> "Ödeme başlatılamadı. Uygulamayı Google Play'den güncelleyip tekrar dene."
        else -> "Ödeme tamamlanamadı. Tekrar dene."
    }
}
