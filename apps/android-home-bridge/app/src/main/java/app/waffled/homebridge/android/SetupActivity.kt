package app.waffled.homebridge.android

import android.Manifest
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import app.waffled.homebridge.DeviceCommand
import app.waffled.homebridge.DeviceSnapshot
import com.google.home.ForcePermissionFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

class SetupActivity : ComponentActivity() {
    private val app get() = application as BridgeApplication
    private lateinit var status: TextView
    private lateinit var devices: LinearLayout
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        app.home.client.registerActivityResultCallerForPermissions(this)
        app.home.start()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        setContentView(ScrollView(this).apply { addView(layout) })
        layout.addView(label(getString(R.string.app_name), 24f))
        layout.addView(label(getString(R.string.setup_help)))
        status = label("")
        layout.addView(status)
        layout.addView(button(R.string.connect) {
            lifecycleScope.launch {
                try { app.home.client.requestPermissions(ForcePermissionFlow.FORCE_LAUNCH) }
                catch (exception: Exception) { showMessage(getString(R.string.permission_error)) }
            }
        })
        val port = EditText(this).apply {
            id = View.generateViewId()
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(app.settings.port.toString())
            setSingleLine()
        }
        layout.addView(label(getString(R.string.port)).apply { labelFor = port.id })
        layout.addView(port)
        layout.addView(button(R.string.start) {
            try {
                if (app.serviceState.value.startsWith("Running")) {
                    showMessage(getString(R.string.stop_before_port))
                } else {
                    app.settings.port = port.text.toString().toInt()
                    if (Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                    app.settings.enabled = true
                    startForegroundService(Intent(this, BridgeService::class.java))
                }
            } catch (exception: Exception) { showMessage(getString(R.string.start_error)) }
        })
        layout.addView(button(R.string.stop) {
            app.settings.enabled = false
            stopService(Intent(this, BridgeService::class.java))
        })
        layout.addView(button(R.string.copy_token) {
            try {
                val clip = ClipData.newPlainText(getString(R.string.token_label), app.settings.token())
                if (Build.VERSION.SDK_INT >= 33) clip.description.extras = android.os.PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
                getSystemService(ClipboardManager::class.java).setPrimaryClip(clip)
                showMessage(getString(R.string.token_copied))
            } catch (exception: Exception) { showMessage(getString(R.string.token_error)) }
        })
        layout.addView(button(R.string.rotate_token) {
            AlertDialog.Builder(this).setTitle(R.string.rotate_token).setMessage(R.string.rotate_warning)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    try { app.settings.rotateToken(); showMessage(getString(R.string.token_rotated)) }
                    catch (exception: Exception) { showMessage(getString(R.string.token_error)) }
                }.show()
        })
        layout.addView(button(R.string.refresh_devices) { refreshDevices() })
        devices = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        layout.addView(devices)
        lifecycleScope.launch {
            while (true) {
                val home = app.home.status()
                status.text = getString(R.string.status_text, app.serviceState.value, home.permission, home.homeName ?: "—", home.error.orEmpty())
                delay(1000)
            }
        }
    }

    private fun refreshDevices() {
        lifecycleScope.launch {
            devices.removeAllViews()
            app.home.devices().forEach { device ->
                val box = LinearLayout(this@SetupActivity).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(16), 0, dp(16)) }
                box.addView(label(device.name, 20f))
                box.addView(label(getString(R.string.device_status, device.type, device.available.toString(), device.observedAt ?: "—")))
                if (device.type == "light") {
                    box.addView(label(getString(R.string.power_state, device.power?.toString() ?: "—")))
                    box.addView(button(R.string.light_on) { command(device, DeviceCommand("setPower", power = true)) }.apply { isEnabled = device.available })
                    box.addView(button(R.string.light_off) { command(device, DeviceCommand("setPower", power = false)) }.apply { isEnabled = device.available })
                }
                device.thermostat?.let { thermostat ->
                    box.addView(label(getString(R.string.thermostat_state, thermostat.currentC?.toString() ?: "—", thermostat.mode ?: "—")))
                    val mode = Spinner(this@SetupActivity).apply {
                        adapter = ArrayAdapter(this@SetupActivity, android.R.layout.simple_spinner_dropdown_item, thermostat.modes)
                        contentDescription = getString(R.string.mode)
                        setSelection(thermostat.modes.indexOf(thermostat.mode).coerceAtLeast(0))
                    }
                    box.addView(mode)
                    box.addView(button(R.string.apply_mode) {
                        command(device, DeviceCommand("setThermostatMode", mode = mode.selectedItem?.toString()))
                    }.apply { isEnabled = device.available && thermostat.modes.isNotEmpty() })
                    val heat = targetInput(box, R.string.heat_target, thermostat.heatC)
                    val cool = targetInput(box, R.string.cool_target, thermostat.coolC)
                    box.addView(button(R.string.apply_targets) {
                        val heating = thermostat.mode in listOf("heat", "heatCool")
                        val cooling = thermostat.mode in listOf("cool", "heatCool")
                        val heatC = heat.text.toString().toDoubleOrNull()
                        val coolC = cool.text.toString().toDoubleOrNull()
                        if (heating && heatC == null || cooling && coolC == null) showMessage(getString(R.string.target_error))
                        else command(device, DeviceCommand("setThermostatTargets", heatC = if (heating) heatC else null, coolC = if (cooling) coolC else null))
                    }.apply { isEnabled = device.available && "setThermostatTargets" in device.capabilities })
                }
                devices.addView(box)
            }
            if (devices.childCount == 0) devices.addView(label(getString(R.string.no_devices)))
        }
    }

    private fun command(device: DeviceSnapshot, command: DeviceCommand) {
        lifecycleScope.launch {
            try {
                withTimeout(5000) { app.home.execute(device.id, command) }
                showMessage(getString(R.string.command_accepted))
            } catch (exception: Exception) { showMessage(exception.message ?: getString(R.string.command_error)) }
        }
    }

    private fun targetInput(parent: LinearLayout, labelId: Int, value: Double?): EditText {
        val field = EditText(this).apply {
            id = View.generateViewId()
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
            setSingleLine(); setText(value?.toString().orEmpty())
        }
        parent.addView(label(getString(labelId)).apply { labelFor = field.id })
        parent.addView(field)
        return field
    }

    private fun button(labelId: Int, action: () -> Unit) = Button(this).apply { setText(labelId); setOnClickListener { action() } }
    private fun label(text: String, size: Float = 16f) = TextView(this).apply { this.text = text; textSize = size; setPadding(0, dp(8), 0, dp(8)) }
    private fun showMessage(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        if (!app.settings.enabled) app.home.stop()
        super.onDestroy()
    }
}
