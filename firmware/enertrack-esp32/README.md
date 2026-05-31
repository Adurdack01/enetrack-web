# EnerTrack ESP32 Firmware Template

This folder is the ESP32 side of the Firebase bridge.

## Required Arduino Libraries

- Firebase ESP Client by Mobizt
- PZEM004Tv30 by Jakub Mandula
- ArduinoJson
- SD
- SPI

## Setup

1. Copy `config.example.h` to `config.h`.
2. Fill in Firebase API key/project fallback values if desired. Wi-Fi, owner UID, device document ID, and the device auth password are normally written by the app during AP Hotspot pairing.
3. In Firebase Authentication, enable Email/Password sign-in. The app creates the ESP32 auth account after pairing when internet returns.

```txt
Email: sp-3051@enertrack.local
Password: your chosen device password
```

4. Pair the device in the app. A new or reset ESP32 starts `SP-xxxx-ET`, exposes the local API at `http://192.168.4.1`, stores the pairing payload in Preferences/NVS, then joins the owner's 2.4GHz Wi-Fi. After router Wi-Fi connects successfully, the setup AP is stopped so the phone can return to an internet Wi-Fi for Firebase sync. If router Wi-Fi fails, the setup AP stays available for retry.

Optional hardening: copy the ESP32 Auth UID into the paired Firestore device document as:

```json
{
  "deviceAuthUid": "ESP32_AUTH_UID"
}
```

5. Wire the PZEM-004T-100A to ESP32 UART2 by default:

```txt
PZEM TX -> ESP32 GPIO 16
PZEM RX -> ESP32 GPIO 17
PZEM VCC -> ESP32 5V/VIN
PZEM GND -> ESP32 GND
```

The defaults are in `config.h`:

```cpp
#define PZEM_RX_PIN 16
#define PZEM_TX_PIN 17
#define PZEM_SERIAL Serial2
```

The firmware reads voltage, current, watts, kWh, and power factor from the PZEM-004T-100A. It uses the PZEM internal kWh counter for total energy and calculates `energyDelta` from the difference between the latest and previous PZEM kWh values.

6. Set the relay wiring values in `config.h`:

```cpp
#define RELAY_PIN 26
#define RELAY_ACTIVE_HIGH true
```

Use the GPIO connected to your relay module. Set `RELAY_ACTIVE_HIGH` to `false` if your relay turns on when the GPIO is LOW.

## Voice Prompts

The firmware can play short status prompts through a DFPlayer-style MP3 module. The readable source MP3 files can keep their descriptive filenames, but the SD card used by the module must contain numeric copies in the MP3 folder:

```txt
/MP3/0001.mp3
/MP3/0002.mp3
...
/MP3/0036.mp3
```

The current SD-card package is generated at:

```txt
C:\Users\USER\Downloads\Mp3\DFPlayer_SD
```

Copy the contents of that folder to the MP3 module's SD card root. Keep `voice-track-map.csv` with your project notes or on the card so each numeric file can be traced back to its voice line. The firmware copy of the same map is in `voice-track-map.csv`.

## What It Does

- Uploads live readings to `users/{uid}/devices/{deviceId}/readings`
- Polls command documents from `users/{uid}/devices/{deviceId}/commands`
- Applies relay and protection commands
- Acknowledges commands by setting `status` to `acknowledged`
- Stores owner UID and app device document ID from the app pairing payload
- Logs readings to microSD while offline
- Uploads a synced offline batch when connection returns

## Pairing Reset

The current hardware defaults in `config.h` are:

```cpp
#define PAIRING_RESET_BUTTON_PIN 27
#define PAIRING_RESET_BOOT_BUTTON_PIN -1
#define PAIRING_STATUS_LED_PIN 2
```

Wire the pairing reset button between `GPIO27` and `GND`. The firmware uses the ESP32 internal pull-up, so no external pull-up resistor is required for a simple normally open button.

Hold the pairing reset button for 4 seconds to clear saved Wi-Fi/Firebase pairing. When reset succeeds, the pairing status LED blinks 3 times and the ESP32 stays alive in setup AP mode as `SP-xxxx-ET`.

The pairing status LED is on `GPIO2` by default, which is the onboard LED on many ESP32 DevKit boards. It turns on solid after the app successfully sends the pairing payload to the ESP32. Set either pin to `-1` to disable that feature.

The matching app and Firestore contract are documented in `docs/firebase-esp32-bridge.md`.

## Compile

Arduino CLI was found on this machine at:

```powershell
C:\arduino-cli_1.4.1_Windows_64bit\arduino-cli.exe
```

Compile for the common 38-pin ESP32 Dev Module:

```powershell
& '.\firmware\enertrack-esp32\build.ps1'
```

The sketch now includes a local `partitions.csv` based on `huge_app`, and the build script compiles with `PartitionScheme=huge_app`. That gives the firmware a 3MB app slot without removing features.

When the board is connected by USB, find the port:

```powershell
& 'C:\arduino-cli_1.4.1_Windows_64bit\arduino-cli.exe' board list
```

Upload by replacing `COM3` with the detected port:

```powershell
& '.\firmware\enertrack-esp32\build.ps1' -Upload -Port COM3
```

## Safety

The PZEM-004T measures AC mains. Keep the high-voltage side isolated, power down before wiring, and use an enclosure before real load testing.
