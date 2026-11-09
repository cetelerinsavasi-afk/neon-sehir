package com.cetelerinsavasi.twa

import android.util.Log
import androidx.activity.ComponentActivity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Google ile giriş — Credential Manager. SADECE Google ID token'ı alınır ve
 * web'e verilir; Firebase oturumunu web tarafı açar:
 *   signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
 * Aynı Google hesabı → aynı Firebase kullanıcısı → aynı UID.
 */
class GoogleSignIn(private val activity: ComponentActivity) {

    sealed class Outcome {
        data class Success(val idToken: String) : Outcome()
        data object Cancelled : Outcome()
        data class Failure(val message: String) : Outcome()
    }

    private val credentialManager = CredentialManager.create(activity)
    @Volatile private var running = false

    fun signIn(onDone: (Outcome) -> Unit) {
        if (running) {
            // ikinci dokunuş: ilk istek sürüyor — bu istek sessizce kapanır
            onDone(Outcome.Cancelled)
            return
        }
        running = true
        activity.lifecycleScope.launch {
            val outcome = try {
                val option = GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false) // her hesap listelensin (yeni oyuncu da girebilsin)
                    .setServerClientId(BuildConfig.WEB_CLIENT_ID)
                    .setAutoSelectEnabled(false)
                    .build()
                val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                val credential = credentialManager.getCredential(activity, request).credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    Outcome.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
                } else {
                    Outcome.Failure("Google hesabı alınamadı. Tekrar dene.")
                }
            } catch (e: GetCredentialCancellationException) {
                Outcome.Cancelled
            } catch (e: GetCredentialInterruptedException) {
                Outcome.Cancelled
            } catch (e: NoCredentialException) {
                Log.w(TAG, "NoCredential: ${e.message}")
                Outcome.Failure("Bu telefonda Google hesabı bulunamadı. Ayarlar › Hesaplar bölümünden bir Google hesabı ekleyip tekrar dene.")
            } catch (e: GetCredentialProviderConfigurationException) {
                Log.w(TAG, "ProviderConfiguration: ${e.message}")
                Outcome.Failure("Google Play Hizmetleri bulunamadı ya da güncel değil. Play Store'dan güncelleyip tekrar dene.")
            } catch (e: GetCredentialUnsupportedException) {
                Log.w(TAG, "Unsupported: ${e.message}")
                Outcome.Failure("Bu cihaz Google ile girişi desteklemiyor (Google Play Hizmetleri gerekli).")
            } catch (e: GoogleIdTokenParsingException) {
                Log.w(TAG, "TokenParsing", e)
                Outcome.Failure("Google girişi tamamlanamadı. Tekrar dene.")
            } catch (e: GetCredentialException) {
                Log.w(TAG, "GetCredential ${e.type}: ${e.message}")
                Outcome.Failure("Google ile giriş yapılamadı. İnternet bağlantını kontrol edip tekrar dene.")
            } catch (e: CancellationException) {
                running = false
                throw e // ekran kapanıyor — sonuç bildirilmez
            } catch (e: Exception) {
                Log.w(TAG, "Beklenmeyen hata", e)
                Outcome.Failure("Google ile giriş yapılamadı.")
            } finally {
                running = false
            }
            onDone(outcome)
        }
    }

    /** Çıkış: bir sonraki girişte hesap seçici yeniden gösterilsin. Hata yutulur. */
    fun signOut() {
        activity.lifecycleScope.launch {
            try {
                credentialManager.clearCredentialState(ClearCredentialStateRequest())
            } catch (e: Exception) {
                Log.w(TAG, "clearCredentialState", e)
            }
        }
    }

    private companion object {
        const val TAG = "NeonSignIn"
    }
}
