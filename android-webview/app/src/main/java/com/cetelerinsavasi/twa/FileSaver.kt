package com.cetelerinsavasi.twa

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Web'den gelen dosyayı (ör. şarkı MP3'ü) kaydeder. İzin İSTEMEZ:
 *  - Android 10+ (API 29+): MediaStore.Downloads → telefonun "İndirilenler" klasörü
 *  - Android 7–9: uygulamanın kendi İndirilenler klasörü
 *    (Android/data/com.cetelerinsavasi.twa/files/Download) — izin gerekmez
 *
 * Büyük dosyalar 512 KB'lık parçalarla gelir: parçalar önce önbellekteki geçici
 * dosyaya yazılır, bellekte biriktirilmez.
 */
class FileSaver(private val context: Context) {

    data class Result(val ok: Boolean, val name: String? = null, val location: String? = null)

    private class Transfer(val name: String, val mime: String, val file: File) {
        var bytes = 0L
    }

    private val transfers = ConcurrentHashMap<String, Transfer>()

    /** Tek parça (küçük dosya). */
    fun saveBase64(fileName: String, mimeType: String, base64: String): Result {
        val data = Base64.decode(base64, Base64.DEFAULT)
        if (data.size > MAX_BYTES) return Result(false)
        return write(cleanName(fileName), cleanMime(mimeType)) { it.write(data) }
    }

    fun begin(fileName: String, mimeType: String): String {
        cleanupStale()
        val id = UUID.randomUUID().toString()
        val dir = File(context.cacheDir, "transfers").apply { mkdirs() }
        val tmp = File(dir, "$id.part")
        tmp.writeBytes(ByteArray(0))
        transfers[id] = Transfer(cleanName(fileName), cleanMime(mimeType), tmp)
        return id
    }

    fun chunk(transferId: String, base64: String): Boolean {
        val t = transfers[transferId] ?: return false
        return try {
            val data = Base64.decode(base64, Base64.DEFAULT)
            t.bytes += data.size
            if (t.bytes > MAX_BYTES) {
                abort(transferId)
                return false
            }
            FileOutputStream(t.file, true).use { it.write(data) }
            true
        } catch (_: Exception) {
            abort(transferId)
            false
        }
    }

    fun end(transferId: String): Result {
        val t = transfers.remove(transferId) ?: return Result(false)
        return try {
            t.file.inputStream().use { input -> write(t.name, t.mime) { out -> input.copyTo(out) } }
        } finally {
            t.file.delete()
        }
    }

    fun abort(transferId: String) {
        transfers.remove(transferId)?.file?.delete()
    }

    private fun write(name: String, mime: String, body: (java.io.OutputStream) -> Unit): Result {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return Result(false)
            try {
                resolver.openOutputStream(uri)?.use(body) ?: throw IllegalStateException("akış açılamadı")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                // Aynı adda dosya varsa sistem "(1)" ekleyebilir — gerçek adı oku
                val finalName = resolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                } ?: name
                Result(true, finalName, "İndirilenler")
            } catch (_: Exception) {
                resolver.delete(uri, null, null)
                Result(false)
            }
        } else {
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(context.filesDir, "Download")
            dir.mkdirs()
            val target = uniqueFile(dir, name)
            try {
                FileOutputStream(target).use(body)
                Result(true, target.name, target.parentFile?.absolutePath)
            } catch (_: Exception) {
                target.delete()
                Result(false)
            }
        }
    }

    private fun uniqueFile(dir: File, name: String): File {
        var f = File(dir, name)
        if (!f.exists()) return f
        val base = name.substringBeforeLast('.', name)
        val ext = name.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }
        var i = 1
        while (f.exists()) f = File(dir, "$base ($i)$ext").also { i++ }
        return f
    }

    /** Yarım kalmış (1 saatten eski) geçici dosyaları sil. */
    private fun cleanupStale() {
        val dir = File(context.cacheDir, "transfers")
        val cutoff = System.currentTimeMillis() - 60 * 60 * 1000
        dir.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
    }

    companion object {
        /** Tek dosya için üst sınır (kötüye kullanıma karşı). Şarkılar birkaç MB. */
        const val MAX_BYTES = 50L * 1024 * 1024

        fun cleanName(raw: String?): String {
            val cleaned = (raw ?: "")
                .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
                .trim()
                .trimStart('.')
                .take(120)
            return cleaned.ifEmpty { "neon-sehir-dosya" }
        }

        fun cleanMime(raw: String?): String =
            raw?.takeIf { Regex("^[a-z0-9.+-]+/[a-z0-9.+-]+$", RegexOption.IGNORE_CASE).matches(it) } ?: "application/octet-stream"
    }
}
