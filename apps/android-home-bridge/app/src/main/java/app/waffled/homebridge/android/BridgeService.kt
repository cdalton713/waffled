package app.waffled.homebridge.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import app.waffled.homebridge.bridgeRoutes
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

class BridgeService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val app get() = application as BridgeApplication

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("bridge", "Home controls", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, SetupActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 0, Intent(this, BridgeService::class.java).setAction("stop"), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "bridge")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.service_notification))
            .setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.stop), stop).build()).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, notification)
        scope.launch {
            try {
                app.settings.token()
                app.home.start()
                val server = embeddedServer(CIO, host = "127.0.0.1", port = app.settings.port) {
                    bridgeRoutes({ app.settings.token() }, app.home)
                }
                try {
                    server.start(wait = false)
                    coroutineContext.ensureActive()
                    app.serviceState.value = "Running on 127.0.0.1:${app.settings.port}"
                    awaitCancellation()
                } finally { server.stop(100, 1000) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (exception: Exception) {
                app.serviceState.value = "Cannot start local service. Check the port and restart."
                stopSelf()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") {
            app.settings.enabled = false
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        app.home.stop()
        if (app.serviceState.value.startsWith("Running")) app.serviceState.value = "Stopped"
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

class ResumeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED)) return
        val app = context.applicationContext as BridgeApplication
        if (app.settings.enabled) {
            try { context.startForegroundService(Intent(context, BridgeService::class.java)) }
            catch (exception: IllegalStateException) { app.serviceState.value = "Open the app to restart home controls." }
        }
    }
}
