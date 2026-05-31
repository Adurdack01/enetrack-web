# EnerTrack Mobile App Build

The web app is wrapped with Capacitor so Android and iOS use the same React UI and app functions.

## Generated Native Projects

- Android: `android/`
- iOS: `ios/`

Both projects are synced from the Vite production build in `dist/`.

## Commands

```powershell
npm run build
pnpm exec cap sync
pnpm exec cap open android
pnpm exec cap open ios
```

Package scripts are also available:

```powershell
npm run cap:sync
npm run cap:open:android
npm run cap:open:ios
```

## Android Requirements

Install Android Studio with:

- Android SDK
- Android SDK Platform Tools
- JDK bundled with Android Studio, or a standalone JDK on PATH

After that, run:

```powershell
pnpm exec cap open android
```

Build/run from Android Studio on a device or emulator.

## iOS Requirements

iOS builds require macOS with:

- Xcode
- CocoaPods

On the Mac, run:

```bash
pnpm install
npm run cap:sync
pnpm exec cap open ios
```

Then build/run from Xcode.

## Pairing Permissions

Android permissions are configured in `android/app/src/main/AndroidManifest.xml` for:

- Internet/Firebase access
- Wi-Fi state and Wi-Fi changes
- Location permission for Wi-Fi scanning
- Nearby Wi-Fi devices on newer Android versions
- Cleartext local HTTP for `http://192.168.4.1`

iOS permission prompts are configured in `ios/App/App/Info.plist` for:

- Wi-Fi/location scanning
- Local network access during ESP32 AP pairing
