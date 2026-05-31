import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.enertrack.app",
  appName: "EnerTrack",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "http",
    cleartext: true,
    allowNavigation: ["http://192.168.4.1", "192.168.4.1", "*.local"],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_enertrack",
      iconColor: "#863BFF",
      sound: "enertrack_bell.wav",
    },
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
