import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// -----------------------------------------------------------------------------
// GOOGLE GİRİŞİ — Firebase projesinin WEB istemci kimliği
// Firebase Console → Authentication → Sign-in method → Google → (aç) →
// "Web SDK configuration" → "Web client ID". Sonu ".apps.googleusercontent.com".
// (Android istemci kimliği DEĞİL — WEB istemci kimliği.) Ayrıntı: README.md
// -----------------------------------------------------------------------------
val webClientId = "WEB_CLIENT_ID_BURAYA.apps.googleusercontent.com"

// -----------------------------------------------------------------------------
// İmza: keystore.properties (git dışı) veya ortam değişkenleri
//   NEON_STORE_FILE, NEON_STORE_PASSWORD, NEON_KEY_ALIAS, NEON_KEY_PASSWORD
// -----------------------------------------------------------------------------
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? =
    keystoreProps.getProperty(key)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() }

val storePath = signingValue("storeFile", "NEON_STORE_FILE") ?: "../android/android.keystore"
val storePass = signingValue("storePassword", "NEON_STORE_PASSWORD")
val alias = signingValue("keyAlias", "NEON_KEY_ALIAS") ?: "android"
val keyPass = signingValue("keyPassword", "NEON_KEY_PASSWORD")

android {
    namespace = "com.cetelerinsavasi.twa"
    compileSdk = 36

    defaultConfig {
        // DEĞİŞTİRME: Play'deki uygulama ile aynı paket (aksi halde yeni uygulama sayılır)
        applicationId = "com.cetelerinsavasi.twa"
        minSdk = 24
        targetSdk = 36
        versionCode = 14
        versionName = "1.1.0"

        buildConfigField("String", "WEB_CLIENT_ID", "\"$webClientId\"")
        buildConfigField("String", "SITE_HOST", "\"cetelerinsavasi.com\"")
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file(storePath)
            storePassword = storePass
            keyAlias = alias
            keyPassword = keyPass
        }
    }

    buildTypes {
        release {
            // R8 KAPALI — bkz. proguard-rules.pro
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            // Debug derlemesi de aynı paket adıyla kurulur (Play sürümünün üstüne
            // kurulamaz, imza farklı). Test için README → "Yerel deneme".
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// Release derlemesi başlamadan önce eksik ayarları Türkçe ve anlaşılır şekilde bildir.
gradle.taskGraph.whenReady {
    val releasing = allTasks.any { it.project == project && it.name.contains("Release") && (it.name.startsWith("bundle") || it.name.startsWith("assemble")) }
    if (!releasing) return@whenReady
    val problems = mutableListOf<String>()
    if (webClientId.startsWith("WEB_CLIENT_ID_BURAYA")) {
        problems += "app/build.gradle.kts içindeki webClientId hâlâ yer tutucu. Firebase Web istemci kimliğini yaz (README → 3. adım)."
    }
    if (!rootProject.file(storePath).exists()) {
        problems += "Keystore bulunamadı: ${rootProject.file(storePath).absolutePath} (keystore.properties → storeFile)."
    }
    if (storePass == null || keyPass == null) {
        problems += "Keystore şifreleri yok. keystore.properties.example dosyasını keystore.properties olarak kopyalayıp doldur."
    }
    if (problems.isNotEmpty()) {
        throw GradleException("\n\nRELEASE DERLEMESİ DURDU:\n - " + problems.joinToString("\n - ") + "\n")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.core:core-splashscreen:1.0.1")

    // Google ile giriş (Credential Manager) — sadece ID token alınır, Firebase SDK YOK
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    testImplementation("junit:junit:4.13.2")
}
