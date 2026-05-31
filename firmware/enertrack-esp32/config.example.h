#pragma once

// Copy this file to config.h, then fill in your real values.

#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define FIREBASE_API_KEY "YOUR_FIREBASE_WEB_API_KEY"
#define FIREBASE_PROJECT_ID "enertrack-v12026"

// Optional fallback values. The app normally writes these over USB serial during pairing.
#define DEVICE_AUTH_EMAIL "esp32-device@enertrack.local"
#define DEVICE_AUTH_PASSWORD "CHANGE_THIS_DEVICE_PASSWORD"

#define DEVICE_NAME "Electric Fan"

#define DEVICE_PAIR_USERNAME "admin"
#define DEVICE_PAIR_PASSWORD "admin123"

#define SD_SCK_PIN 18
#define SD_MISO_PIN 19
#define SD_MOSI_PIN 23
#define SD_CS_PIN 5
#define SD_SPI_FREQ_HZ 1000000UL
#define RELAY_PIN 26
#define RELAY_ACTIVE_HIGH true

// Optional pairing reset button. Wire the GPIO to GND through a normally open button.
// Keep -1 to disable. Hold for 4 seconds to clear saved Wi-Fi/Firebase pairing.
// This can also reset the PZEM lifetime kWh counter for a clean new pairing.
#define PAIRING_RESET_BUTTON_PIN 27
#define PAIRING_RESET_BOOT_BUTTON_PIN -1
#define PAIRING_RESET_HOLD_MS 3000
#define RESET_PZEM_ENERGY_ON_PAIRING_RESET 1
#define PAIRING_REBOOT_DELAY_MS 15000UL

// Optional pairing status LED. GPIO2 is the onboard LED on many ESP32 DevKit boards.
// Keep -1 to disable. It turns on after pairing and blinks 3x after pairing reset.
#define PAIRING_STATUS_LED_PIN 2
#define PAIRING_STATUS_LED_ACTIVE_HIGH true

#define MANUAL_TOGGLE_BUTTON_PIN 25
#define MANUAL_TOGGLE_BUTTON_ACTIVE_LOW true
#define MANUAL_TOGGLE_DEBOUNCE_MS 60UL

#define MP3_UART_RX_PIN 32
#define MP3_UART_TX_PIN 33
#define MP3_UART_BAUD 9600
#define MP3_AUTOPLAY_ON_BOOT 1
#define MP3_AUTOPLAY_TRACK 1
#define MP3_AUTOPLAY_VOLUME 24
#define MP3_AUTOPLAY_START_DELAY_MS 1800UL

#define RTC_DS1302_CLK_PIN 21
#define RTC_DS1302_IO_PIN 22
#define RTC_DS1302_RST_PIN 4
#define RTC_DS1302_ENABLED 1
#define RTC_SYNC_INTERVAL_MS 21600000UL

#define PZEM_RX_PIN 16
#define PZEM_TX_PIN 17
#define PZEM_SERIAL Serial2

#define READ_INTERVAL_MS 6000
#define READING_ARCHIVE_INTERVAL_MS 30000
#define COMMAND_POLL_MS 1000

#define MAX_POWER_W 1100.0
#define MAX_CURRENT_A 5.0
#define PROTECTION_POWER_HYSTERESIS_W 25.0
#define PROTECTION_CURRENT_HYSTERESIS_A 0.15
#define PZEM_MIN_VALID_AC_VOLTAGE 80.0
#define PZEM_MAX_VALID_AC_VOLTAGE 300.0
#define PZEM_PHANTOM_CURRENT_EPSILON_A 0.0
#define PZEM_PHANTOM_POWER_EPSILON_W 0.0
#define PZEM_MAX_VALID_CURRENT_A 100.0
#define PZEM_MAX_VALID_POWER_W 25000.0
#define PZEM_MAX_VALID_ENERGY_KWH 100000.0
#define PZEM_ENERGY_ROLLBACK_TOLERANCE_KWH 0.05

// Production connectivity behavior.
// Stored pairings reconnect to router Wi-Fi automatically after reboot.
// The setup AP appears only when unpaired or after repeated router failures.
#define AUTO_CONNECT_STORED_WIFI_ON_BOOT 1
#define WIFI_CONNECT_TIMEOUT_MS 15000UL
#define WIFI_BOOT_CONNECT_GRACE_MS 3000UL
#define WIFI_RECONNECT_BASE_MS 3000UL
#define WIFI_RECONNECT_MAX_MS 300000UL
#define WIFI_AP_FALLBACK_AFTER_FAILURES 3
#define WIFI_AP_FALLBACK_AFTER_MS 60000UL
#define PAIRING_ACTIVITY_TIMEOUT_MS 15000UL
#define WIFI_WATCHDOG_REBOOT_MS 600000UL
#define FIREBASE_REAUTH_BASE_MS 15000UL
#define FIREBASE_REAUTH_MAX_MS 120000UL
#define FIREBASE_WATCHDOG_REBOOT_MS 900000UL
#define CLOUD_PRESENCE_HEARTBEAT_MS 12000UL
#define SOFTWARE_RECOVERY_REBOOT_ENABLED 0
#define OFFLINE_SYNC_BATCH_SIZE 50
