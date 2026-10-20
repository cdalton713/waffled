package app.waffled.homebridge

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.response.respond
import io.ktor.server.request.receive
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

interface HomeProvider {
    fun status(): BridgeStatus
    suspend fun devices(): List<DeviceSnapshot>
    suspend fun execute(id: String, command: DeviceCommand)
}

fun Application.bridgeRoutes(token: () -> String, home: HomeProvider) {
    install(ContentNegotiation) { json() }
    install(StatusPages) {
        exception<BridgeFailure> { call, error -> call.respond(HttpStatusCode.fromValue(error.status), ApiError(error.code, error.message.orEmpty())) }
        exception<BadRequestException> { call, _ -> call.respond(HttpStatusCode.BadRequest, ApiError("BadRequest", "Invalid JSON command.")) }
        exception<Throwable> { call, error ->
            when (error) {
                is TimeoutCancellationException -> call.respond(HttpStatusCode.GatewayTimeout, ApiError("CommandTimeout", "The command was not confirmed. Refresh device state."))
                is CancellationException -> throw error
                else -> call.respond(HttpStatusCode.BadGateway, ApiError("DeviceError", "Google Home could not complete this request."))
            }
        }
    }
    routing {
        route("/v1") {
            intercept(io.ktor.server.application.ApplicationCallPipeline.Call) {
                val secret = token()
                val expected = "Bearer $secret".toByteArray()
                val actual = call.request.headers[HttpHeaders.Authorization].orEmpty().toByteArray()
                if (secret.isBlank() || !MessageDigest.isEqual(expected, actual)) {
                    call.respond(HttpStatusCode.Unauthorized)
                    finish()
                } else if (call.request.headers[HttpHeaders.Origin] != null) {
                    call.respond(HttpStatusCode.Forbidden)
                    finish()
                }
            }
            get("/status") { call.respond(home.status()) }
            get("/devices") {
                requireReady(home)
                call.respond(DeviceList(home.devices()))
            }
            post("/devices/{id}/commands") {
                requireReady(home)
                val command = call.receive<DeviceCommand>()
                val device = home.devices().find { it.id == call.parameters["id"] }
                    ?: throw BridgeFailure(404, "NotFound", "Device not found.")
                validateCommand(device, command)
                withTimeout(5000) { home.execute(device.id, command) }
                call.respond(HttpStatusCode.Accepted, CommandAccepted())
            }
        }
    }
}

private fun requireReady(home: HomeProvider) {
    val status = home.status()
    if (status.permission != "granted" || status.homeId == null || status.error != null) {
        throw BridgeFailure(503, "PermissionRequired", "Open Waffled Home Bridge to connect Google Home.")
    }
}
