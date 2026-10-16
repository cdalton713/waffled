package app.waffled.homebridge

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

class BridgeHttpTest {
    @Test fun `local device API requires its bearer token`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome()) }
        assertEquals(HttpStatusCode.Unauthorized, client.get("/v1/devices").status)
    }

    @Test fun `authorized caller can discover lights and their observed state`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome()) }
        val response = client.get("/v1/devices") { header("Authorization", "Bearer bridge-secret") }
        assertEquals(HttpStatusCode.OK, response.status)
        assertContains(response.bodyAsText(), "Kitchen light")
        assertContains(response.bodyAsText(), "\"power\":false")
    }

    @Test fun `caller can set light power and read the resulting device state`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome()) }
        val response = client.post("/v1/devices/kitchen/commands") {
            header("Authorization", "Bearer bridge-secret")
            header("Content-Type", "application/json")
            setBody("""{"action":"setPower","power":true}""")
        }
        assertEquals(HttpStatusCode.Accepted, response.status)
        val devices = client.get("/v1/devices") { header("Authorization", "Bearer bridge-secret") }
        assertContains(devices.bodyAsText(), "\"power\":true")
    }

    @Test fun `unsupported or malformed commands never change a device`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome()) }
        for (body in listOf(
            """{"action":"toggle"}""",
            """{"action":"setBrightness","brightness":101}""",
            """{"action":"setPower","power":true,"mode":"heat"}""",
            "not-json",
        )) {
            val response = client.post("/v1/devices/kitchen/commands") {
                header("Authorization", "Bearer bridge-secret")
                header("Content-Type", "application/json")
                setBody(body)
            }
            assertEquals(HttpStatusCode.BadRequest, response.status, body)
        }
        val devices = client.get("/v1/devices") { header("Authorization", "Bearer bridge-secret") }
        assertContains(devices.bodyAsText(), "\"power\":false")
    }

    @Test fun `status and command responses include their protocol fields`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome()) }
        val status = client.get("/v1/status") { header("Authorization", "Bearer bridge-secret") }
        assertContains(status.bodyAsText(), "\"apiVersion\":1")
        val command = client.post("/v1/devices/kitchen/commands") {
            header("Authorization", "Bearer bridge-secret")
            header("Content-Type", "application/json")
            setBody("""{"action":"setPower","power":true}""")
        }
        assertContains(command.bodyAsText(), "\"accepted\":true")
    }

    @Test fun `replaced tokens immediately lose access and browser origins are refused`() = testApplication {
        var secret = "old-secret"
        application { bridgeRoutes({ secret }, FakeHome()) }
        assertEquals(HttpStatusCode.OK, client.get("/v1/status") { header("Authorization", "Bearer old-secret") }.status)
        secret = "new-secret"
        assertEquals(HttpStatusCode.Unauthorized, client.get("/v1/status") { header("Authorization", "Bearer old-secret") }.status)
        assertEquals(HttpStatusCode.Forbidden, client.get("/v1/devices") {
            header("Authorization", "Bearer new-secret")
            header("Origin", "http://example.com")
        }.status)
    }

    @Test fun `permission loss prevents device reads and commands`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome(permission = "required")) }
        assertEquals(HttpStatusCode.ServiceUnavailable, client.get("/v1/devices") { header("Authorization", "Bearer bridge-secret") }.status)
        assertEquals(HttpStatusCode.ServiceUnavailable, client.post("/v1/devices/kitchen/commands") {
            header("Authorization", "Bearer bridge-secret")
            header("Content-Type", "application/json")
            setBody("""{"action":"setPower","power":true}""")
        }.status)
    }

    @Test fun `thermostat targets obey temperature limits and heat cool separation`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome()) }
        for (body in listOf(
            """{"action":"setThermostatTargets","heatC":40}""",
            """{"action":"setThermostatTargets","heatC":23,"coolC":24}""",
            """{"action":"setThermostatMode","mode":"fan"}""",
        )) {
            assertEquals(HttpStatusCode.BadRequest, client.post("/v1/devices/thermostat/commands") {
                header("Authorization", "Bearer bridge-secret")
                header("Content-Type", "application/json")
                setBody(body)
            }.status)
        }
        assertEquals(HttpStatusCode.Accepted, client.post("/v1/devices/thermostat/commands") {
            header("Authorization", "Bearer bridge-secret")
            header("Content-Type", "application/json")
            setBody("""{"action":"setThermostatTargets","heatC":21,"coolC":25}""")
        }.status)
        val response = client.get("/v1/devices") { header("Authorization", "Bearer bridge-secret") }
        assertContains(response.bodyAsText(), "\"heatC\":21.0")
        assertContains(response.bodyAsText(), "\"coolC\":25.0")
    }

    @Test fun `missing and offline devices cannot receive commands`() = testApplication {
        application { bridgeRoutes({ "bridge-secret" }, FakeHome(available = false)) }
        for ((id, expected) in listOf("missing" to HttpStatusCode.NotFound, "kitchen" to HttpStatusCode.ServiceUnavailable)) {
            assertEquals(expected, client.post("/v1/devices/$id/commands") {
                header("Authorization", "Bearer bridge-secret")
                header("Content-Type", "application/json")
                setBody("""{"action":"setPower","power":true}""")
            }.status)
        }
    }
}

private class FakeHome(private val permission: String = "granted", private val available: Boolean = true) : HomeProvider {
    private var power = false
    private var climate = ThermostatSnapshot(currentC = 21.0, heatC = 20.0, coolC = 24.0, mode = "heatCool",
        modes = listOf("off", "heat", "cool", "heatCool"), minHeatC = 7.0, maxHeatC = 30.0, minCoolC = 16.0, maxCoolC = 32.0, minDeadBandC = 2.0)
    override fun status() = BridgeStatus("test-bridge", permission, "test-home", "Home")
    override suspend fun devices() = listOf(
        DeviceSnapshot("kitchen", "Kitchen light", type = "light", available = available,
            observedAt = "2026-10-15T12:00:00Z", capabilities = listOf("setPower"), power = power),
        DeviceSnapshot("thermostat", "Thermostat", type = "thermostat", available = available,
            observedAt = "2026-10-15T12:00:00Z", capabilities = listOf("setThermostatMode", "setThermostatTargets"), thermostat = climate),
    )
    override suspend fun execute(id: String, command: DeviceCommand) {
        when (command.action) {
            "setPower" -> power = command.power!!
            "setThermostatTargets" -> climate = climate.copy(heatC = command.heatC ?: climate.heatC, coolC = command.coolC ?: climate.coolC)
        }
    }
}
