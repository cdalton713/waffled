package app.waffled.homebridge.android

import android.app.Application
import kotlinx.coroutines.flow.MutableStateFlow

class BridgeApplication : Application() {
    val settings by lazy { BridgeSettings(this) }
    val home by lazy { GoogleHomeProvider(this, settings.bridgeId) }
    val serviceState = MutableStateFlow("Stopped")
}
