package com.cetelerinsavasi.twa

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.cetelerinsavasi.twa.UrlPolicy.Kind

/** Çalıştır: android-webview klasöründe  gradlew test */
class UrlPolicyTest {

    @Test fun oyunIcerdeAcilir() {
        assertEquals(Kind.IN_APP, UrlPolicy.classify("https://cetelerinsavasi.com/"))
        assertEquals(Kind.IN_APP, UrlPolicy.classify("https://cetelerinsavasi.com/?src=app&av=14"))
        assertEquals(Kind.IN_APP, UrlPolicy.classify("https://www.cetelerinsavasi.com/davet/ABC"))
        assertEquals(Kind.IN_APP, UrlPolicy.classify("https://cetelerinsavasi.com/offline"))
        assertEquals(Kind.IN_APP, UrlPolicy.classify("about:blank"))
    }

    @Test fun yasalSayfalarTarayicida() {
        for (p in listOf("/gizlilik", "/gizlilik?p=android", "/kosullar.html", "/hesap-silme/", "/Kosullar")) {
            assertEquals(p, Kind.EXTERNAL_OWN_SITE, UrlPolicy.classify("https://cetelerinsavasi.com$p"))
        }
        // benzer ama farklı yollar oyunda kalır
        assertEquals(Kind.IN_APP, UrlPolicy.classify("https://cetelerinsavasi.com/gizlilik-ayarlari"))
    }

    @Test fun digerHerSeyDisarida() {
        for (u in listOf(
            "https://play.google.com/store/apps/details?id=com.cetelerinsavasi.twa",
            "market://details?id=com.cetelerinsavasi.twa",
            "https://instagram.com/neonsehir",
            "mailto:studyohustle@gmail.com?subject=x",
            "tel:+905555555555",
            "intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;end",
            "https://neon-sehir.firebaseapp.com/__/auth/handler",
            "https://cetelerinsavasi.com.evil.example/",
        )) {
            assertEquals(u, Kind.EXTERNAL, UrlPolicy.classify(u))
        }
    }

    @Test fun tehlikeliSemalarEngellenir() {
        for (u in listOf("file:///sdcard/a.html", "content://x/y", "data:text/html,hi", "blob:https://cetelerinsavasi.com/1", "", null)) {
            assertEquals(u.toString(), Kind.BLOCK, UrlPolicy.classify(u))
        }
    }

    @Test fun kopruSadeceKendiSitemizde() {
        assertTrue(UrlPolicy.isTrustedPage("https://cetelerinsavasi.com/"))
        assertTrue(UrlPolicy.isTrustedPage("https://www.cetelerinsavasi.com/x"))
        assertFalse(UrlPolicy.isTrustedPage("http://cetelerinsavasi.com/"))
        assertFalse(UrlPolicy.isTrustedPage("https://cetelerinsavasi.com.evil.example/"))
        assertFalse(UrlPolicy.isTrustedPage("https://evil.example/?cetelerinsavasi.com"))
        assertFalse(UrlPolicy.isTrustedPage(null))
    }

    @Test fun acilisAdresi() {
        assertEquals("https://cetelerinsavasi.com/?src=app&av=14", UrlPolicy.launchUrl(null, 14))
        assertEquals("https://cetelerinsavasi.com/?src=app&av=14", UrlPolicy.launchUrl("https://play.google.com/x", 14))
        assertEquals(
            "https://cetelerinsavasi.com/davet/ABC?ref=x&src=app&av=14#k",
            UrlPolicy.launchUrl("https://www.cetelerinsavasi.com/davet/ABC?ref=x&src=twa&av=12#k", 14),
        )
        // yasal sayfa linki gelirse oyun ana sayfadan açılır (sayfa tarayıcıda)
        assertEquals("https://cetelerinsavasi.com/?src=app&av=14", UrlPolicy.launchUrl("https://cetelerinsavasi.com/gizlilik", 14))
    }

    @Test fun anaSayfaLinkiOyunuYenidenYuklemez() {
        assertTrue(UrlPolicy.isPlainHome("https://cetelerinsavasi.com/"))
        assertTrue(UrlPolicy.isPlainHome("https://cetelerinsavasi.com/?src=app&av=14"))
        assertFalse(UrlPolicy.isPlainHome("https://cetelerinsavasi.com/davet/ABC"))
        assertFalse(UrlPolicy.isPlainHome("https://cetelerinsavasi.com/?ref=x"))
    }

    @Test fun playStoreTanima() {
        assertTrue(UrlPolicy.isPlayStore("https://play.google.com/store/apps/details?id=com.cetelerinsavasi.twa"))
        assertTrue(UrlPolicy.isPlayStore("market://details?id=x"))
        assertFalse(UrlPolicy.isPlayStore("https://cetelerinsavasi.com/"))
    }

    @Test fun dosyaAdiTemizligi() {
        assertEquals("a_b_c.mp3", FileSaver.cleanName("a/b\\c.mp3"))
        assertEquals("neon-sehir-dosya", FileSaver.cleanName("..."))
        assertEquals("audio/mpeg", FileSaver.cleanMime("audio/mpeg"))
        assertEquals("application/octet-stream", FileSaver.cleanMime("text/html; x"))
    }
}
