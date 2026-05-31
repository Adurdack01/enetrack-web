# Firebase ESP32 Bridge

EnerTrack now expects real device data through Firebase using this structure:

```txt
users/{ownerUid}/devices/{deviceId}
users/{ownerUid}/devices/{deviceId}/readings/{readingId}
users/{ownerUid}/devices/{deviceId}/commands/{commandId}
users/{ownerUid}/offlineSyncBatches/{batchId}
users/{ownerUid}/deviceClaims/{esp32Id}
esp32DeviceClaims/{esp32Id}
```

## Pairing

When a user adds a device, the app creates:

- a device document in `users/{ownerUid}/devices/{deviceId}`
- a claim record in `users/{ownerUid}/deviceClaims/{esp32Id}`
- owner metadata on the device document: `ownerUid`, `ownerEmail`, `claimedAt`

The Android AP-hotspot flow sends the selected router Wi-Fi, Firebase public config, owner UID, app device document ID, and ESP32 auth credentials to the ESP32 through `http://192.168.4.1/api/pair-device`. The ESP32 stores that payload locally, connects to the router, and stops its setup AP after the router connection succeeds. The phone must then reconnect to an internet Wi-Fi so the app can create the Firebase Auth account and Firestore documents.

For ESP32 Firestore access, create one Firebase Authentication account for the device. The app writes a global claim document:

```txt
esp32DeviceClaims/{esp32Id}
```

Example:

```json
{
  "id": "SP-3051",
  "uid": "OWNER_UID",
  "ownerEmail": "owner@example.com",
  "deviceId": "APP_DEVICE_DOCUMENT_ID",
  "esp32Id": "SP-3051",
  "deviceAuthEmail": "sp-3051@enertrack.local",
  "deviceName": "Electric Fan",
  "status": "claimed"
}
```

The ESP32 signs in as `deviceAuthEmail`, reads this claim, and dynamically discovers `uid` and `deviceId`. For extra hardening, copy that Firebase Auth UID into the paired device document:

```json
{
  "deviceAuthUid": "ESP32_FIREBASE_AUTH_UID"
}
```

Firestore rules allow that ESP32 Auth user to:

- read its paired device document
- write readings under its paired device
- read pending commands under its paired device
- acknowledge or fail commands
- upload offline sync batches for that paired device

It cannot read or write the rest of the user's account.

## Live Reading Document

ESP32 should create one document per reading:

```txt
users/{ownerUid}/devices/{deviceId}/readings/{readingId}
```

Example:

```json
{
  "id": "SP-3051-20260503T181500",
  "uid": "OWNER_UID",
  "deviceId": "DEVICE_DOC_ID",
  "esp32Id": "SP-3051",
  "deviceName": "Electric Fan",
  "timestamp": "2026-05-03T18:15:00+08:00",
  "voltage": 229.4,
  "current": 0.62,
  "power": 142.3,
  "powerFactor": 0.96,
  "energy": 12.084,
  "energyDelta": 0.018,
  "relayStatus": true,
  "wifiSignal": -62,
  "source": "esp32-live"
}
```

The app listens to these readings, updates the device cards, and records an Energy Reading usage log when `energyDelta` is greater than zero.

For the PZEM-004T-100A firmware template, `energy` comes from the PZEM internal kWh counter and `energyDelta` is calculated as the difference from the previous PZEM kWh reading.

## Command Document

The app writes command documents here:

```txt
users/{ownerUid}/devices/{deviceId}/commands/{commandId}
```

Relay command:

```json
{
  "type": "relay",
  "status": "pending",
  "payload": {
    "relayStatus": true,
    "reason": "manual"
  }
}
```

Protection command:

```json
{
  "type": "protection",
  "status": "pending",
  "payload": {
    "protectionEnabled": true,
    "maxPowerW": 2000,
    "maxCurrentA": 10
  }
}
```

After ESP32 applies the command, it should update the same command document:

```json
{
  "status": "acknowledged",
  "acknowledgedAt": "2026-05-03T18:15:03+08:00"
}
```

If it cannot apply the command, update:

```json
{
  "status": "failed",
  "error": "Relay driver did not respond"
}
```

The firmware template now polls pending commands with:

```txt
status == "pending"
```

Then it:

- applies relay commands to the configured relay GPIO,
- applies protection commands to the local 2000 W / 10 A protection limits,
- patches the device document so the app can see the new status quickly,
- marks the command as `acknowledged` or `failed`.

## Offline Sync

When Wi-Fi or Firebase is unavailable, ESP32 should append readings to microSD. When Firebase is available again, upload only the missed readings as a synced batch:

```txt
users/{ownerUid}/offlineSyncBatches/{batchId}
```

The existing app listener will add those readings to Usage Logs, show a notification, and open the offline sync dialog.
