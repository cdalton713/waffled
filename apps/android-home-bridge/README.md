# Waffled Home Bridge

Native Android prototype for Google Home lights and thermostats. It provides an
authenticated HTTP service at `http://127.0.0.1:8765/v1`. Waffled's backend runs
on the same Android device and forwards authorized commands to this service.

**Current state:** the APK builds and protocol/backend tests pass. Real-device
access, restart behavior, and continuous operation still need verification.
The Waffled Settings panel and Today card are pending that verification gate.

## Build and install

Requirements: Java 21, Android SDK platform 36, Python 3, and an Android 10+
device with Google Play services. Set `JAVA_HOME` and `ANDROID_HOME` to your local
installations. The Gradle wrapper checks the Gradle distribution checksum.

From this directory:

```sh
python3 scripts/setup_sdk.py
./gradlew :protocol:test :app:assembleDebug :app:lintDebug
./gradlew :app:signingReport
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The SDK installer downloads Google Home SDK 1.11.0 and verifies its SHA-256 hash.
It stores the Maven artifacts in the ignored `sdk-repository` directory. SDK
binaries, signing keys, and local Android configuration are not committed.

Register an **Android OAuth client** in your Google Cloud project with package
name `app.waffled.homebridge` and the SHA-1 fingerprint from `signingReport`. Add
your Google account as an OAuth test user. The SDK handles account selection and
Google Home consent; this app does not export Google access tokens.
See [Google's Android OAuth setup](https://developers.home.google.com/apis/android/oauth).

Open **Waffled Home Bridge**, select **Connect or change Google Home**, and grant
access to one home. Select **Start service** and **Refresh devices**. Use the
native light and thermostat controls to verify discovery and commands. Refresh
after each command to confirm the observed state. The native test controls use
Celsius. The local API also accepts light brightness from 0 to 100.

## Verify the local connection

Select **Copy service token**. Run this request from the app that hosts Waffled's
backend on the Android device, using the copied token:

```sh
curl -H 'Authorization: Bearer YOUR_SERVICE_TOKEN' \
  http://127.0.0.1:8765/v1/status
```

The response must show `apiVersion: 1`, `permission: "granted"`, and a `homeId`.
The hosting app must be able to reach Android's loopback network. An isolated VM
or network namespace needs this test before it can be used as the host.

All endpoints require the service bearer token. Browser-origin requests are
rejected. The server binds only to loopback. Store the token in Waffled's backend
configuration; do not put it in browser storage or a URL. Replacing the token in
the Android app immediately invalidates the old token.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/v1/status` | Bridge identity, protocol version, Google permission, and selected home |
| GET | `/v1/devices` | Supported light/thermostat snapshots, capabilities, limits, availability, and observation time |
| POST | `/v1/devices/:id/commands` | Validate and issue one command; return `202 {"accepted":true}` |

Device IDs are opaque URL-safe values. Supported commands are:

```json
{"action":"setPower","power":true}
{"action":"setBrightness","brightness":50}
{"action":"setThermostatMode","mode":"heatCool"}
{"action":"setThermostatTargets","heatC":20,"coolC":24}
```

Only send commands listed in the device's `capabilities`. Thermostat modes are
`off`, `heat`, `cool`, and `heatCool`, limited to those reported by the device.
Targets must match the current mode, reported bounds, and minimum heat/cool gap.
Missing limits prevent target changes. An accepted command does not confirm a
physical change. Read device state to confirm it. Commands time out after five
seconds and are not retried or queued. Concurrent commands for one device are
rejected while its previous SDK call is pending.

The Waffled API exposes `/api/smart-home/config` for administrator connection
setup, `/api/smart-home/discovery` for administrator device selection,
`/api/smart-home/devices` for selected device state, and
`/api/smart-home/devices/:id/commands` for commands. Enable `smartHome` through
the existing administrator module API before using these routes. Configuration
accepts `port`, `token`, `selectedDeviceIds`, and `temperatureUnit` (`F` or `C`).
Connect first, then save device selection in a second request. Replacing the
connection clears selection. All household roles have `smartHome.control` by
default; administrators can revoke it through the existing permission API.
API keys cannot access these routes. Credentials are encrypted in a table that
is excluded from PowerSync.

## Hardware verification gate

Before adding Waffled web controls, record these results on the target device:

1. Discover and control a real light and the thermostat with the native app.
2. Reach the local API from Waffled's actual hosting app.
3. Observe changes made in Google Home, and test permission loss and Wi-Fi recovery.
4. Repeat commands after eight hours with the screen off.
5. Test service stop/start and device reboot followed by first unlock.

The foreground service has a persistent notification with a Stop action. It
requests restart after reboot when previously enabled. Android may require
manual reopening after a force-stop or device-specific background restrictions.
Verify this behavior; an APK build does not prove continuous operation.

## Tests

`:protocol:test` runs HTTP boundary tests against a fake external home provider.
The API's `test/smart-home.integration.test.ts` uses real HTTP requests, temporary
Postgres, and a fake Android service. CI builds the native app against Google's
real SDK and publishes a debug APK artifact. It does not claim real-device tests.
