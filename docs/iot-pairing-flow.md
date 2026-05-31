# EnerTrack Real IoT Pairing Flow

EnerTrack pairs an ESP32 smart plug through a setup access point, then the ESP32 joins the owner's 2.4GHz Wi-Fi and syncs readings/commands with Firebase.

## Device Flow

1. A new or reset ESP32 starts setup Wi-Fi using the SSID pattern `SP-xxxx-ET`.
2. The mobile app scans nearby Wi-Fi networks with native Wi-Fi permissions.
3. The user selects their 2.4GHz router Wi-Fi and enters its password.
4. The app connects the phone to the ESP32 setup Wi-Fi.
5. The app calls the ESP32 local API at `http://192.168.4.1`.
6. The ESP32 verifies the default setup login.
7. The app sends router Wi-Fi, owner UID, generated device document ID, Firebase project values, and the new device password.
8. The ESP32 saves those values in Preferences/NVS and switches to station mode.
9. The app stores the paired device locally while the phone has no internet.
10. When internet returns, the app creates the Firebase Auth device account, Firestore device document, and device claim.
11. The ESP32 signs in to Firebase, uploads readings, polls commands, and syncs offline SD logs.

## Local API Contract

The ESP32 exposes these endpoints while in pairing mode:

- `GET /api/device-info`
- `GET /api/wifi-networks`
- `POST /api/verify-login`
- `POST /api/pair-device`

The setup address is `http://192.168.4.1` after the phone/computer is connected to the ESP32 AP.

## Mobile App Requirements

The web build cannot scan or switch Wi-Fi by itself. The Android/iOS app build uses Capacitor and `@codext/capacitor-wifi` for:

- `scanWifi()`
- `getCurrentWifi()`
- `connectToWifiBySsidAndPassword()`
- Wi-Fi/location permission prompts

The Capacitor config allows cleartext local HTTP so the app can call `http://192.168.4.1` during provisioning.

## Development Mode

When running at `http://127.0.0.1:5173`, Vite exposes local helper endpoints:

- `GET /api/system-wifi/networks`
- `GET /api/system-wifi/current`
- `POST /api/system-wifi/connect`
- `/api/esp32-proxy`

These helpers use Windows `netsh` only for development testing. They are not part of the hosted web app.
