# Firebase Offline Sync Contract

The app listens for ESP32 offline sync batches in:

```txt
users/{uid}/offlineSyncBatches/{batchId}
```

When a batch document has `status: "synced"`, the app:

- adds the readings to Usage Logs,
- updates Stats and Device Details through the shared log data,
- shows a notification,
- opens an offline sync summary dialog,
- ignores duplicate batches already announced on the same browser.

Example batch:

```json
{
  "id": "offline-SP-3051-20260501-214200",
  "deviceId": "SP-3051",
  "deviceName": "Electric Fan",
  "status": "synced",
  "startedAt": "2026-05-01T21:42:00+08:00",
  "endedAt": "2026-05-01T22:10:00+08:00",
  "syncedAt": "2026-05-01T22:10:20+08:00",
  "entries": 3,
  "totalEnergy": 0.42,
  "estimatedCost": 5.38,
  "readings": [
    {
      "id": "offline-SP-3051-20260501-214201",
      "deviceId": "SP-3051",
      "deviceName": "Electric Fan",
      "batchId": "offline-SP-3051-20260501-214200",
      "timestamp": "2026-05-01T21:42:01+08:00",
      "voltage": 229.4,
      "current": 0.62,
      "power": 142.3,
      "powerFactor": 0.96,
      "energyDelta": 0.14,
      "relayStatus": true
    }
  ]
}
```

Use stable `id` values for each reading and batch. The app uses those IDs to avoid duplicate usage logs when a sync is retried.

Pair the ESP32 with the device first using the bridge contract in
`docs/firebase-esp32-bridge.md`. The synced batch must use the same `deviceId`
as the paired document in `users/{uid}/devices/{deviceId}`.
