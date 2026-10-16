---
title: Test the Google Home bridge
description: Build and test the Android connection service for Google Home lights and thermostats.
---

The Google Home bridge is a prototype for Android-hosted Waffled installations.
The Android app provides local access to lights and thermostats. Waffled's
backend provides household permissions and device selection.

**The web setup panel and Today controls are pending real-device verification.**
This prototype does not install Waffled's full server on Android.

## Requirements

- An Android 10 or later device with Google Play services and a Google account.
- A light and thermostat that Google Home APIs can access.
- A compatible Google hub for Matter devices, including a Thread border router
  when the device uses Thread.
- A computer with Java 21, Android SDK platform 36, Python 3, and `adb`.
- A hosting app that lets Waffled's backend reach `127.0.0.1` on the Android device.

See [Google's device requirements](https://developers.home.google.com/apis/android/sdk).

## Build and connect

1. In the Waffled source checkout, open `apps/android-home-bridge`. Set
   `JAVA_HOME` and `ANDROID_HOME` to your Java and Android SDK installations.
2. Run `python3 scripts/setup_sdk.py`, then
   `./gradlew :protocol:test :app:assembleDebug :app:lintDebug`.
3. Run `./gradlew :app:signingReport`. Register an Android OAuth client with
   package name `app.waffled.homebridge` and the reported SHA-1 fingerprint.
   Add your Google account as a test user. Follow
   [Google's OAuth instructions](https://developers.home.google.com/apis/android/oauth).
4. Connect the Android device with USB debugging enabled. Run
   `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
5. Open **Waffled Home Bridge**. Select **Connect or change Google Home**, grant
   access to one home, select **Start service**, and select **Refresh devices**.

Use the native light and thermostat controls to test device access. Temperature
inputs in this test screen use Celsius. Select **Refresh devices** after a
command to confirm the observed state.

## Check the hosting app

Select **Copy service token** in the Android app. From Waffled's hosting app on
the same device, request:

```sh
curl -H 'Authorization: Bearer YOUR_SERVICE_TOKEN' \
  http://127.0.0.1:8765/v1/status
```

Check that the response contains `apiVersion: 1`, `permission: "granted"`, and
a `homeId`. Port `8765` is the default; change it in the Android app while the
service is stopped if needed.

## Verification still required

Test a real light and thermostat, changes made in Google Home, lost Wi-Fi,
permission loss, service restart, and device reboot followed by first unlock.
Repeat commands after eight hours with the screen off. These checks must pass
before Waffled's web controls are added.

The service uses a persistent Android notification. **Stop service** turns it
off. After a force-stop, open the app and start the service again. Device-specific
background restrictions need testing on the actual Android device.

The local and backend API contracts are in
`apps/android-home-bridge/README.md` in your source checkout.
