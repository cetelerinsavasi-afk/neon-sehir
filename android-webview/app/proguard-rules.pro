# Release'de minify KAPALI (eski TWA'da R8 açılışta çökmeye yol açtı — android/neon-cokme2.txt).
# İleride isMinifyEnabled = true yapılırsa JavaScript köprüsü korunmalı:
-keepattributes JavascriptInterface
-keepclassmembers class com.cetelerinsavasi.twa.NeonBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.cetelerinsavasi.twa.NeonBridge { *; }

# v155: Play Faturalandırma kütüphanesi kendi kurallarını getirir (consumer rules); ek kural gerekmez.
