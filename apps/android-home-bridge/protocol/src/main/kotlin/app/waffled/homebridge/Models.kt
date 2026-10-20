package app.waffled.homebridge

import kotlinx.serialization.Serializable

@Serializable
data class BridgeStatus(
    val bridgeId: String,
    val permission: String,
    val homeId: String? = null,
    val homeName: String? = null,
    val apiVersion: Int = 1,
    val error: String? = null,
)

@Serializable
data class DeviceSnapshot(
    val id: String,
    val name: String,
    val room: String? = null,
    val type: String,
    val available: Boolean,
    val observedAt: String?,
    val capabilities: List<String>,
    val power: Boolean? = null,
    val brightness: Int? = null,
    val thermostat: ThermostatSnapshot? = null,
)

@Serializable
data class ThermostatSnapshot(
    val currentC: Double? = null,
    val heatC: Double? = null,
    val coolC: Double? = null,
    val mode: String? = null,
    val modes: List<String> = emptyList(),
    val minHeatC: Double? = null,
    val maxHeatC: Double? = null,
    val minCoolC: Double? = null,
    val maxCoolC: Double? = null,
    val minDeadBandC: Double? = null,
)

@Serializable
data class DeviceList(val devices: List<DeviceSnapshot>)

@Serializable
data class DeviceCommand(
    val action: String,
    val power: Boolean? = null,
    val brightness: Int? = null,
    val mode: String? = null,
    val heatC: Double? = null,
    val coolC: Double? = null,
)

@Serializable
data class CommandAccepted(val accepted: Boolean = true)
