package app.waffled.homebridge.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class BridgeSettings(context: Context) {
    private val preferences = context.getSharedPreferences("bridge", Context.MODE_PRIVATE)
    val bridgeId: String = preferences.getString("bridgeId", null) ?: UUID.randomUUID().toString().also {
        check(preferences.edit().putString("bridgeId", it).commit())
    }
    var port: Int
        get() = preferences.getInt("port", 8765)
        set(value) {
            require(value in 1024..65535) { "Use a port from 1024 to 65535." }
            check(preferences.edit().putInt("port", value).commit())
        }
    var enabled: Boolean
        get() = preferences.getBoolean("enabled", false)
        set(value) { check(preferences.edit().putBoolean("enabled", value).commit()) }

    @Synchronized fun token(): String {
        val packed = preferences.getString("token", null) ?: return rotateToken()
        val bytes = Base64.decode(packed, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8)
    }

    @Synchronized fun rotateToken(): String {
        val token = ByteArray(32).also { SecureRandom().nextBytes(it) }
            .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val packed = Base64.encodeToString(cipher.iv + cipher.doFinal(token.toByteArray()), Base64.NO_WRAP)
        check(preferences.edit().putString("token", packed).commit())
        return token
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("waffled-bridge-token", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("waffled-bridge-token", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
        }.generateKey()
    }
}
