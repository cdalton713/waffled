package app.waffled.homebridge

import kotlinx.serialization.Serializable

class BridgeFailure(val status: Int, val code: String, message: String) : RuntimeException(message)

@Serializable data class ApiError(val error: String, val message: String)

fun validateCommand(device: DeviceSnapshot, command: DeviceCommand) {
    if (!device.available) throw BridgeFailure(503, "DeviceUnavailable", "This device is unavailable.")
    fun invalid(message: String): Nothing = throw BridgeFailure(400, "BadRequest", message)
    if (command.action !in device.capabilities) invalid("This device does not support that command.")
    val supplied = listOf(command.power, command.brightness, command.mode, command.heatC, command.coolC).count { it != null }
    when (command.action) {
        "setPower" -> if (device.type != "light" || command.power == null || supplied != 1) invalid("Supply only power.")
        "setBrightness" -> if (device.type != "light" || command.brightness !in 0..100 || supplied != 1) invalid("Supply only brightness from 0 to 100.")
        "setThermostatMode" -> {
            val thermostat = device.thermostat ?: invalid("This is not a thermostat.")
            if (command.mode !in thermostat.modes || supplied != 1) invalid("Supply a supported thermostat mode.")
        }
        "setThermostatTargets" -> {
            val thermostat = device.thermostat ?: invalid("This is not a thermostat.")
            if (command.power != null || command.brightness != null || command.mode != null || supplied == 0) invalid("Supply heatC or coolC.")
            fun checkTarget(value: Double?, min: Double?, max: Double?) {
                if (value != null && (!value.isFinite() || min == null || max == null || value !in min..max)) invalid("Temperature is outside the device limits.")
            }
            checkTarget(command.heatC, thermostat.minHeatC, thermostat.maxHeatC)
            checkTarget(command.coolC, thermostat.minCoolC, thermostat.maxCoolC)
            val heating = thermostat.mode in listOf("heat", "heatCool")
            val cooling = thermostat.mode in listOf("cool", "heatCool")
            if (command.heatC != null && !heating || command.coolC != null && !cooling) invalid("Change the thermostat mode before setting this target.")
            if (thermostat.mode == "heatCool") {
                val heat = command.heatC ?: thermostat.heatC ?: invalid("Heating target is unavailable.")
                val cool = command.coolC ?: thermostat.coolC ?: invalid("Cooling target is unavailable.")
                val gap = thermostat.minDeadBandC ?: invalid("The device temperature gap is unavailable.")
                if (cool - heat < gap - 0.000001) invalid("Keep the targets at least $gap degrees Celsius apart.")
            }
        }
        else -> invalid("Unknown command.")
    }
}
