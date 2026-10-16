package app.waffled.homebridge.android

import android.content.Context
import app.waffled.homebridge.BridgeFailure
import app.waffled.homebridge.BridgeStatus
import app.waffled.homebridge.DeviceCommand
import app.waffled.homebridge.DeviceSnapshot
import app.waffled.homebridge.HomeProvider
import app.waffled.homebridge.ThermostatSnapshot
import app.waffled.homebridge.validateCommand
import com.google.home.ConnectivityState
import com.google.home.DeviceType
import com.google.home.FactoryRegistry
import com.google.home.Home
import com.google.home.HomeConfig
import com.google.home.HomeDevice
import com.google.home.PermissionsState
import com.google.home.matter.standard.ColorTemperatureLightDevice
import com.google.home.matter.standard.ColorControl
import com.google.home.matter.standard.Identify
import com.google.home.matter.standard.DimmableLightDevice
import com.google.home.matter.standard.ExtendedColorLightDevice
import com.google.home.matter.standard.LevelControl
import com.google.home.matter.standard.LevelControlTrait
import com.google.home.matter.standard.OnOff
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.Thermostat
import com.google.home.matter.standard.ThermostatDevice
import com.google.home.matter.standard.ThermostatTrait
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlin.math.roundToInt

class GoogleHomeProvider(context: Context, private val bridgeId: String) : HomeProvider {
    val client = Home.getClient(context.applicationContext, HomeConfig(
        coroutineContext = Dispatchers.IO,
        factoryRegistry = FactoryRegistry(
            traits = listOf(Identify, OnOff, LevelControl, ColorControl, Thermostat),
            types = listOf(OnOffLightDevice, DimmableLightDevice, ColorTemperatureLightDevice, ExtendedColorLightDevice, ThermostatDevice),
        ),
    ))
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var observer: Job? = null
    private data class Facet(val type: DeviceType, val snapshot: DeviceSnapshot)
    private val facets = ConcurrentHashMap<String, Facet>()
    private val commands = ConcurrentHashMap<String, Mutex>()
    @Volatile private var connection = BridgeStatus(bridgeId, "initializing")

    override fun status() = connection
    override suspend fun devices() = facets.values.map { it.snapshot }.sortedBy { it.name }

    @Synchronized fun start() {
        if (observer?.isActive == true) return
        observer = scope.launch {
            while (isActive) {
                try { observe(); delay(1000) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (exception: Exception) {
                    facets.clear()
                    connection = BridgeStatus(bridgeId, "unavailable", error = "Google Home connection failed. Open the app to reconnect.")
                    delay(5000)
                }
            }
        }
    }

    @Synchronized fun stop() {
        observer?.cancel()
        observer = null
        facets.clear()
        connection = BridgeStatus(bridgeId, "stopped")
    }

    private suspend fun observe() {
        client.hasPermissions().collectLatest { permission ->
            facets.clear()
            connection = BridgeStatus(bridgeId, if (permission == PermissionsState.GRANTED) "granted" else "required")
            if (permission != PermissionsState.GRANTED) return@collectLatest
            client.structures().collectLatest structures@ { structures ->
                facets.clear()
                val home = structures.singleOrNull()
                if (home == null) {
                    connection = BridgeStatus(bridgeId, "required", error = "Select one home in the Android permission screen.")
                    return@structures
                }
                connection = BridgeStatus(bridgeId, "granted", home.id.id, home.name)
                combine(home.rooms(), home.devices(enableMultipartDevices = true)) { rooms, devices ->
                    rooms.associate { it.id.id to it.name } to devices
                }.collectLatest { (rooms, devices) ->
                    facets.clear()
                    coroutineScope {
                        devices.forEach { device ->
                            launch {
                                device.types().collect { types ->
                                    val supported = types.filter { it is OnOffLightDevice || it is DimmableLightDevice ||
                                        it is ColorTemperatureLightDevice || it is ExtendedColorLightDevice || it is ThermostatDevice }
                                    val grouped = supported.groupBy { it.metadata.partId ?: "default" }
                                    val next = grouped.mapNotNull { (part, group) ->
                                        val type = group.maxBy { it.traits().size }
                                        val id = Base64.getUrlEncoder().withoutPadding().encodeToString("${device.id.id}\u0000$part".toByteArray())
                                        snapshot(id, device, type, device.roomId?.id?.let { rooms[it] })?.let { id to Facet(type, it) }
                                    }.toMap()
                                    val prefix = "${device.id.id}\u0000"
                                    facets.keys.removeIf { id -> String(Base64.getUrlDecoder().decode(id)).startsWith(prefix) && id !in next }
                                    facets.putAll(next)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private fun snapshot(id: String, device: HomeDevice, type: DeviceType, room: String?): DeviceSnapshot? {
        val online = type.metadata.sourceConnectivity.connectivityState in setOf(ConnectivityState.ONLINE, ConnectivityState.PARTIALLY_ONLINE)
        val thermostat = type.trait(Thermostat)
        val power = type.trait(OnOff)
        val level = type.trait(LevelControl)
        if (thermostat == null && power == null) return null
        val climate = thermostat?.let { trait ->
            ThermostatSnapshot(
                currentC = trait.localTemperature?.takeUnless { it == Short.MIN_VALUE }?.div(100.0),
                heatC = trait.occupiedHeatingSetpoint?.div(100.0),
                coolC = trait.occupiedCoolingSetpoint?.div(100.0),
                mode = modeName(trait.systemMode),
                modes = buildList {
                    add("off")
                    if (trait.featureMap.heating) add("heat")
                    if (trait.featureMap.cooling) add("cool")
                    if (trait.featureMap.autoMode && trait.featureMap.heating && trait.featureMap.cooling) add("heatCool")
                },
                minHeatC = (trait.minHeatSetpointLimit ?: trait.absMinHeatSetpointLimit)?.div(100.0),
                maxHeatC = (trait.maxHeatSetpointLimit ?: trait.absMaxHeatSetpointLimit)?.div(100.0),
                minCoolC = (trait.minCoolSetpointLimit ?: trait.absMinCoolSetpointLimit)?.div(100.0),
                maxCoolC = (trait.maxCoolSetpointLimit ?: trait.absMaxCoolSetpointLimit)?.div(100.0),
                minDeadBandC = trait.minSetpointDeadBand?.div(10.0),
            )
        }
        return DeviceSnapshot(
            id, device.name, room, if (climate != null) "thermostat" else "light", online,
            if (online) Instant.now().toString() else facets[id]?.snapshot?.observedAt,
            buildList {
                if (climate != null) {
                    add("setThermostatMode")
                    if (climate.minHeatC != null && climate.maxHeatC != null || climate.minCoolC != null && climate.maxCoolC != null) add("setThermostatTargets")
                } else {
                    if (power != null) add("setPower")
                    if (level != null) add("setBrightness")
                }
            },
            power = if (climate == null) power?.onOff else null,
            brightness = if (climate == null) level?.currentLevel?.let { (it.toInt() * 100.0 / 254).roundToInt().coerceIn(0, 100) } else null,
            thermostat = climate,
        )
    }

    override suspend fun execute(id: String, command: DeviceCommand) {
        val mutex = commands.getOrPut(id) { Mutex() }
        if (!mutex.tryLock()) throw BridgeFailure(409, "DeviceBusy", "A command is already pending for this device.")
        try {
            val facet = facets[id] ?: throw BridgeFailure(404, "NotFound", "Device not found.")
            if (connection.permission != "granted") throw BridgeFailure(503, "PermissionRequired", "Reconnect Google Home.")
            validateCommand(facet.snapshot, command)
            when (command.action) {
                "setPower" -> facet.type.trait(OnOff)!!.let { if (command.power == true) it.on() else it.off() }
                "setBrightness" -> facet.type.trait(LevelControl)!!.moveToLevelWithOnOff(
                    level = (command.brightness!! * 254.0 / 100).roundToInt().toUByte(), transitionTime = null,
                    optionsMask = LevelControlTrait.OptionsBitmap(), optionsOverride = LevelControlTrait.OptionsBitmap(),
                )
                "setThermostatMode" -> facet.type.trait(Thermostat)!!.update {
                    setSystemMode(when (command.mode) {
                        "heat" -> ThermostatTrait.SystemModeEnum.Heat
                        "cool" -> ThermostatTrait.SystemModeEnum.Cool
                        "heatCool" -> ThermostatTrait.SystemModeEnum.Auto
                        else -> ThermostatTrait.SystemModeEnum.Off
                    })
                }
                "setThermostatTargets" -> facet.type.trait(Thermostat)!!.update {
                    command.heatC?.let { setOccupiedHeatingSetpoint((it * 100).roundToInt().toShort()) }
                    command.coolC?.let { setOccupiedCoolingSetpoint((it * 100).roundToInt().toShort()) }
                }
            }
        } finally { mutex.unlock() }
    }

    private fun modeName(mode: ThermostatTrait.SystemModeEnum?) = when (mode) {
        ThermostatTrait.SystemModeEnum.Off -> "off"
        ThermostatTrait.SystemModeEnum.Heat -> "heat"
        ThermostatTrait.SystemModeEnum.Cool -> "cool"
        ThermostatTrait.SystemModeEnum.Auto -> "heatCool"
        else -> null
    }
}
