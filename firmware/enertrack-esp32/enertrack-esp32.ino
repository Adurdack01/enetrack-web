#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Firebase_ESP_Client.h>
#include <PZEM004Tv30.h>
#include <Preferences.h>
#include <SD.h>
#include <SPI.h>
#include <time.h>
#include <sys/time.h>
#include <math.h>
#include <DFRobotDFPlayerMini.h>
#include "config.h"

#ifndef SD_SCK_PIN
#define SD_SCK_PIN 18
#endif

#ifndef SD_MISO_PIN
#define SD_MISO_PIN 19
#endif

#ifndef SD_MOSI_PIN
#define SD_MOSI_PIN 23
#endif

#ifndef SD_SPI_FREQ_HZ
#define SD_SPI_FREQ_HZ 4000000UL
#endif

#ifndef PAIRING_RESET_BUTTON_PIN
#ifdef FACTORY_RESET_PIN
#define PAIRING_RESET_BUTTON_PIN FACTORY_RESET_PIN
#else
#define PAIRING_RESET_BUTTON_PIN -1
#endif
#endif

#ifndef PAIRING_RESET_HOLD_MS
#define PAIRING_RESET_HOLD_MS 3000
#endif

#ifndef PAIRING_RESET_BOOT_BUTTON_PIN
#define PAIRING_RESET_BOOT_BUTTON_PIN -1
#endif

#ifndef PAIRING_STATUS_LED_PIN
#define PAIRING_STATUS_LED_PIN -1
#endif

#ifndef PAIRING_STATUS_LED_ACTIVE_HIGH
#define PAIRING_STATUS_LED_ACTIVE_HIGH true
#endif

#ifndef MANUAL_TOGGLE_BUTTON_PIN
#define MANUAL_TOGGLE_BUTTON_PIN -1
#endif

#ifndef MANUAL_TOGGLE_BUTTON_ACTIVE_LOW
#define MANUAL_TOGGLE_BUTTON_ACTIVE_LOW true
#endif

#ifndef MANUAL_TOGGLE_DEBOUNCE_MS
#define MANUAL_TOGGLE_DEBOUNCE_MS 60UL
#endif

#ifndef MP3_UART_RX_PIN
#define MP3_UART_RX_PIN -1
#endif

#ifndef MP3_UART_TX_PIN
#define MP3_UART_TX_PIN -1
#endif

#ifndef MP3_UART_BAUD
#define MP3_UART_BAUD 9600UL
#endif

#ifndef MP3_AUTOPLAY_ON_BOOT
#define MP3_AUTOPLAY_ON_BOOT 1
#endif

#ifndef MP3_AUTOPLAY_TRACK
#define MP3_AUTOPLAY_TRACK 1
#endif

#ifndef MP3_AUTOPLAY_VOLUME
#define MP3_AUTOPLAY_VOLUME 24
#endif

#ifndef MP3_AUTOPLAY_START_DELAY_MS
#define MP3_AUTOPLAY_START_DELAY_MS 1800UL
#endif

#ifndef RTC_DS1302_CLK_PIN
#define RTC_DS1302_CLK_PIN -1
#endif

#ifndef RTC_DS1302_IO_PIN
#define RTC_DS1302_IO_PIN -1
#endif

#ifndef RTC_DS1302_RST_PIN
#define RTC_DS1302_RST_PIN -1
#endif

#ifndef RTC_DS1302_ENABLED
#define RTC_DS1302_ENABLED 0
#endif

#ifndef RTC_SYNC_INTERVAL_MS
#define RTC_SYNC_INTERVAL_MS 21600000UL
#endif

#ifndef AUTO_CONNECT_STORED_WIFI_ON_BOOT
#define AUTO_CONNECT_STORED_WIFI_ON_BOOT 1
#endif

#ifndef WIFI_CONNECT_TIMEOUT_MS
#define WIFI_CONNECT_TIMEOUT_MS 15000UL
#endif

#ifndef WIFI_BOOT_CONNECT_GRACE_MS
#define WIFI_BOOT_CONNECT_GRACE_MS 3000UL
#endif

#ifndef WIFI_RECONNECT_BASE_MS
#define WIFI_RECONNECT_BASE_MS 3000UL
#endif

#ifndef WIFI_RECONNECT_MAX_MS
#define WIFI_RECONNECT_MAX_MS 300000UL
#endif

#ifndef WIFI_AP_FALLBACK_AFTER_FAILURES
#define WIFI_AP_FALLBACK_AFTER_FAILURES 3
#endif

#ifndef WIFI_AP_FALLBACK_AFTER_MS
#define WIFI_AP_FALLBACK_AFTER_MS 60000UL
#endif

#ifndef PAIRING_ACTIVITY_TIMEOUT_MS
#define PAIRING_ACTIVITY_TIMEOUT_MS 15000UL
#endif

#ifndef RESET_PZEM_ENERGY_ON_PAIRING_RESET
#define RESET_PZEM_ENERGY_ON_PAIRING_RESET 0
#endif

#ifndef PAIRING_REBOOT_DELAY_MS
#define PAIRING_REBOOT_DELAY_MS 15000UL
#endif

#ifndef WIFI_WATCHDOG_REBOOT_MS
#define WIFI_WATCHDOG_REBOOT_MS 600000UL
#endif

#ifndef FIREBASE_REAUTH_BASE_MS
#define FIREBASE_REAUTH_BASE_MS 15000UL
#endif

#ifndef FIREBASE_REAUTH_MAX_MS
#define FIREBASE_REAUTH_MAX_MS 120000UL
#endif

#ifndef FIREBASE_WATCHDOG_REBOOT_MS
#define FIREBASE_WATCHDOG_REBOOT_MS 900000UL
#endif

#ifndef CLOUD_PRESENCE_HEARTBEAT_MS
#define CLOUD_PRESENCE_HEARTBEAT_MS 12000UL
#endif

#ifndef SOFTWARE_RECOVERY_REBOOT_ENABLED
#define SOFTWARE_RECOVERY_REBOOT_ENABLED 0
#endif

#ifndef OFFLINE_SYNC_BATCH_SIZE
#define OFFLINE_SYNC_BATCH_SIZE 50
#endif

#ifndef READING_ARCHIVE_INTERVAL_MS
#define READING_ARCHIVE_INTERVAL_MS 30000UL
#endif

#ifndef PROTECTION_POWER_HYSTERESIS_W
#define PROTECTION_POWER_HYSTERESIS_W 25.0f
#endif

#ifndef PROTECTION_CURRENT_HYSTERESIS_A
#define PROTECTION_CURRENT_HYSTERESIS_A 0.15f
#endif

#ifndef PZEM_MIN_VALID_AC_VOLTAGE
#define PZEM_MIN_VALID_AC_VOLTAGE 80.0f
#endif

#ifndef PZEM_MAX_VALID_AC_VOLTAGE
#define PZEM_MAX_VALID_AC_VOLTAGE 300.0f
#endif

#ifndef PZEM_PHANTOM_CURRENT_EPSILON_A
#define PZEM_PHANTOM_CURRENT_EPSILON_A 0.0f
#endif

#ifndef PZEM_PHANTOM_POWER_EPSILON_W
#define PZEM_PHANTOM_POWER_EPSILON_W 0.0f
#endif

#ifndef PZEM_MAX_VALID_CURRENT_A
#define PZEM_MAX_VALID_CURRENT_A 100.0f
#endif

#ifndef PZEM_MAX_VALID_POWER_W
#define PZEM_MAX_VALID_POWER_W 25000.0f
#endif

#ifndef PZEM_MAX_VALID_ENERGY_KWH
#define PZEM_MAX_VALID_ENERGY_KWH 100000.0f
#endif

#ifndef PZEM_ENERGY_ROLLBACK_TOLERANCE_KWH
#define PZEM_ENERGY_ROLLBACK_TOLERANCE_KWH 0.05f
#endif

#ifndef CLOUD_HEALTH_LOG_MS
#define CLOUD_HEALTH_LOG_MS 30000UL
#endif

#ifndef SCHEDULE_EVALUATE_MS
#define SCHEDULE_EVALUATE_MS 1000UL
#endif

#ifndef SCHEDULE_CLOUD_REFRESH_MS
#define SCHEDULE_CLOUD_REFRESH_MS 300000UL
#endif

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig firebaseConfig;
Preferences preferences;
PZEM004Tv30 pzem(PZEM_SERIAL, PZEM_RX_PIN, PZEM_TX_PIN);
WebServer pairingServer(80);
HardwareSerial mp3Serial(1);

const char *offlineFilePath = "/enertrack-offline.jsonl";
const char *offlineArchiveDir = "/enertrack-archive";
const char *sdTelemetryUpdateMask =
  "offlineLogsSynced,lastOfflineSyncCount,lastOfflineSyncAt,lastOfflineSyncArchive,"
  "sdCardAvailable,sdCardTotalBytes,sdCardUsedBytes,sdCardFreeBytes,sdCardUsagePercent";
const char *scheduleStateUpdateMask =
  "scheduleManualOverride,scheduleManualOverrideUntil,scheduleBudgetReached,"
  "lastScheduleAction,lastScheduleActionAt";
const char *ntpServer = "pool.ntp.org";
const char *firmwareVersion = "2026.05.17-ds1302-local-control";
const char *prefEsp32Id = "esp32Id";
const char *prefWifiSsid = "wifi";
const char *prefWifiPassword = "wifiPass";
const char *prefFirebaseApiKey = "fbApiKey";
const char *prefFirebaseProjectId = "fbProject";
const char *prefDeviceAuthEmail = "authEmail";
const char *prefDeviceAuthPassword = "authPass";
const char *prefDeviceName = "devName";
const char *prefDeviceLocation = "devLoc";
const char *prefOwnerUid = "ownerUid";
const char *prefDeviceDocId = "docId";
const char *prefPaired = "paired";
const char *prefOfflineLogsSynced = "offSynced";
const char *prefScheduleEnabled = "schedEn";
const char *prefScheduleMode = "schedMode";
const char *prefScheduleStart = "schedStart";
const char *prefScheduleEnd = "schedEnd";
const char *prefScheduleBudgetPhp = "schedBudPhp";
const char *prefScheduleBudgetKwh = "schedBudKwh";
const char *prefScheduleRate = "schedRate";
const long gmtOffsetSeconds = 8 * 60 * 60;
const int daylightOffsetSeconds = 0;
const unsigned long pairingGraceMs = 5UL * 60UL * 1000UL;

unsigned long lastReadingAt = 0;
unsigned long lastReadingArchiveAt = 0;
unsigned long lastCommandPollAt = 0;
unsigned long lastClaimCheckAt = 0;
unsigned long lastInvalidReadingLogAt = 0;
unsigned long lastWaitingClaimLogAt = 0;
unsigned long lastWifiConnectAt = 0;
unsigned long lastFirebaseSetupAt = 0;
unsigned long pairingGraceEndsAt = 0;
unsigned long lastDeviceStatePatchAt = 0;
unsigned long pairingResetButtonPressedAt = 0;
unsigned long wifiAttemptStartedAt = 0;
unsigned long nextWifiAttemptAt = 0;
unsigned long wifiOutageStartedAt = 0;
unsigned long lastWifiHealthyAt = 0;
unsigned long nextFirebaseAuthAttemptAt = 0;
unsigned long firebaseNotReadySince = 0;
unsigned long lastFirebaseHealthyAt = 0;
unsigned long lastCloudHealthLogAt = 0;
unsigned long lastWatchdogLogAt = 0;
unsigned long lastPairingActivityAt = 0;
unsigned long manualToggleButtonLastChangeAt = 0;
unsigned long lastManualToggleLogAt = 0;
unsigned long lastScheduleEvaluateAt = 0;
unsigned long lastScheduleCloudRefreshAt = 0;
unsigned long lastMp3SerialLogAt = 0;
unsigned long nextMp3BootCommandAt = 0;
unsigned long lastRtcSyncAt = 0;
bool relayStatus = false;
bool protectionEnabled = true;
bool scheduleEnabled = false;
String scheduleMode = "time";
String scheduleStartTime = "08:00:00";
String scheduleEndTime = "22:00:00";
float scheduleBudgetLimitPhp = 0.0f;
float scheduleBudgetLimitKwh = 0.0f;
float scheduleElectricityRate = 0.0f;
bool scheduleManualOverride = false;
bool scheduleManualOverrideWindowState = false;
bool scheduleBudgetReached = false;
String lastScheduleAction = "";
String lastScheduleActionAt = "";
float maxPowerLimitW = MAX_POWER_W;
float maxCurrentLimitA = MAX_CURRENT_A;
float totalEnergyKwh = 0.0;
float lastMeterEnergyKwh = 0.0;
bool hasLastMeterEnergy = false;
String ownerUid = "";
String deviceDocId = "";
String runtimeEsp32Id = "";
String runtimeWifiSsid = "";
String runtimeWifiPassword = "";
String runtimeFirebaseApiKey = "";
String runtimeFirebaseProjectId = "";
String runtimeDeviceAuthEmail = "";
String runtimeDeviceAuthPassword = "";
String cloudDeviceName = "";
String deviceLocation = "";
String pairingSsid = "";
String localPairingToken = "";
String serialInputBuffer = "";
bool pendingNetworkRestart = false;
bool pendingPairingReboot = false;
bool pairingServerStarted = false;
bool pairingServerRoutesConfigured = false;
bool cloudServicesStarted = false;
bool pairingApActive = false;
bool firebaseSessionStarted = false;
bool cloudPresenceNeedsPatch = true;
bool networkRuntimeReady = false;
bool sdReady = false;
bool offlineBacklogSyncPending = false;
uint32_t offlineLogsSyncedTotal = 0;
int lastOfflineSyncCount = 0;
String lastOfflineSyncAt = "";
String lastOfflineSyncArchive = "";
bool pairingResetHoldLogged = false;
bool pairingResetPressedLogged = false;
bool pairingResetCompletedThisHold = false;
bool pairingCompletedThisBoot = false;
bool pairingLedBlinkState = false;
bool manualToggleButtonLastRawState = false;
bool manualToggleButtonStableState = false;
bool mp3SerialReady = false;
bool mp3BootAutoplayCompleted = false;
bool rtcReady = false;
bool rtcHasValidClock = false;
unsigned long pairingRebootAt = 0;
uint8_t wifiReconnectAttempt = 0;
uint8_t firebaseReconnectAttempt = 0;
uint8_t mp3BootCommandStage = 0;
unsigned long lastPairingResetProgressLogAt = 0;
unsigned long lastPairingLedBlinkAt = 0;
unsigned long lastApOnlyStatusLogAt = 0;

enum WifiManagerState {
  WIFI_MANAGER_IDLE,
  WIFI_MANAGER_CONNECTING,
  WIFI_MANAGER_CONNECTED,
  WIFI_MANAGER_AP_FALLBACK
};

WifiManagerState wifiManagerState = WIFI_MANAGER_IDLE;

struct SensorReading {
  String id;
  String timestamp;
  float voltage;
  float current;
  float power;
  float powerFactor;
  float energy;
  float energyDelta;
  int wifiSignal;
  bool relayStatus;
};

// Forward declarations used by helper functions before their full definitions.
bool pairingResetButtonPressed();
bool wifiReady();
bool hasStoredPairing();
bool hasConfiguredWifi();
bool canConnectToRouterWifiThisBoot();
bool pairingSessionActive(unsigned long now);
bool beginSdCard(const char *context);
void runScheduleTask(unsigned long now);
void markPairingActivity();
void startPairingAccessPointIfNeeded();
void connectWifi();
void setupFirebase();
void resetWifiReconnectBackoff();
void resetFirebaseAuthBackoff();
void requestWifiReconnect(unsigned long now, const char *reason);
void serviceWifiManager(unsigned long now);
void serviceFirebaseManager(unsigned long now);
void runPairingTask(unsigned long now);
void runLocalControlTask(unsigned long now);
void runCloudBridgeTask(unsigned long now);
void runFirmwareWatchdogTask(unsigned long now);
void serviceMp3Autoplay(unsigned long now);
void serviceRtcClock(unsigned long now);

struct Ds1302DateTime {
  uint8_t second;
  uint8_t minute;
  uint8_t hour;
  uint8_t day;
  uint8_t month;
  uint8_t weekday;
  uint16_t year;
};

uint8_t decimalToBcd(uint8_t value) {
  return static_cast<uint8_t>(((value / 10) << 4) | (value % 10));
}

uint8_t bcdToDecimal(uint8_t value) {
  return static_cast<uint8_t>(((value >> 4) * 10) + (value & 0x0F));
}

bool ds1302PinsConfigured() {
#if RTC_DS1302_ENABLED
  return RTC_DS1302_CLK_PIN >= 0 &&
         RTC_DS1302_IO_PIN >= 0 &&
         RTC_DS1302_RST_PIN >= 0;
#else
  return false;
#endif
}

void ds1302DriveIo(bool high) {
  pinMode(RTC_DS1302_IO_PIN, OUTPUT);
  digitalWrite(RTC_DS1302_IO_PIN, high ? HIGH : LOW);
}

void ds1302BeginTransaction() {
  digitalWrite(RTC_DS1302_CLK_PIN, LOW);
  digitalWrite(RTC_DS1302_RST_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(RTC_DS1302_RST_PIN, HIGH);
  delayMicroseconds(4);
}

void ds1302EndTransaction() {
  digitalWrite(RTC_DS1302_RST_PIN, LOW);
  delayMicroseconds(2);
}

void ds1302WriteByte(uint8_t value) {
  pinMode(RTC_DS1302_IO_PIN, OUTPUT);
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(RTC_DS1302_CLK_PIN, LOW);
    digitalWrite(RTC_DS1302_IO_PIN, (value & 0x01) ? HIGH : LOW);
    delayMicroseconds(1);
    digitalWrite(RTC_DS1302_CLK_PIN, HIGH);
    delayMicroseconds(1);
    value >>= 1;
  }
  digitalWrite(RTC_DS1302_CLK_PIN, LOW);
}

uint8_t ds1302ReadByte() {
  uint8_t value = 0;
  pinMode(RTC_DS1302_IO_PIN, INPUT);

  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(RTC_DS1302_CLK_PIN, LOW);
    delayMicroseconds(1);
    if (digitalRead(RTC_DS1302_IO_PIN)) {
      value |= static_cast<uint8_t>(1U << i);
    }
    digitalWrite(RTC_DS1302_CLK_PIN, HIGH);
    delayMicroseconds(1);
  }

  digitalWrite(RTC_DS1302_CLK_PIN, LOW);
  return value;
}

void ds1302WriteRegister(uint8_t address, uint8_t value) {
  ds1302BeginTransaction();
  ds1302WriteByte(address);
  ds1302WriteByte(value);
  ds1302EndTransaction();
}

uint8_t ds1302ReadRegister(uint8_t address) {
  ds1302BeginTransaction();
  ds1302WriteByte(address);
  const uint8_t value = ds1302ReadByte();
  ds1302EndTransaction();
  return value;
}

bool ds1302ReadClock(Ds1302DateTime &clock) {
  if (!rtcReady) {
    return false;
  }

  const uint8_t rawSecond = ds1302ReadRegister(0x81);
  const uint8_t rawMinute = ds1302ReadRegister(0x83);
  const uint8_t rawHour = ds1302ReadRegister(0x85);
  const uint8_t rawDay = ds1302ReadRegister(0x87);
  const uint8_t rawMonth = ds1302ReadRegister(0x89);
  const uint8_t rawWeekday = ds1302ReadRegister(0x8B);
  const uint8_t rawYear = ds1302ReadRegister(0x8D);

  if (rawSecond & 0x80) {
    return false;
  }

  clock.second = bcdToDecimal(static_cast<uint8_t>(rawSecond & 0x7F));
  clock.minute = bcdToDecimal(static_cast<uint8_t>(rawMinute & 0x7F));

  if (rawHour & 0x80) {
    const uint8_t hour12 = bcdToDecimal(static_cast<uint8_t>(rawHour & 0x1F));
    const bool pm = rawHour & 0x20;
    clock.hour = pm ? static_cast<uint8_t>((hour12 % 12) + 12) : static_cast<uint8_t>(hour12 % 12);
  } else {
    clock.hour = bcdToDecimal(static_cast<uint8_t>(rawHour & 0x3F));
  }

  clock.day = bcdToDecimal(static_cast<uint8_t>(rawDay & 0x3F));
  clock.month = bcdToDecimal(static_cast<uint8_t>(rawMonth & 0x1F));
  clock.weekday = bcdToDecimal(static_cast<uint8_t>(rawWeekday & 0x07));
  clock.year = static_cast<uint16_t>(2000 + bcdToDecimal(rawYear));

  const bool valid =
    clock.year >= 2024 && clock.year <= 2099 &&
    clock.month >= 1 && clock.month <= 12 &&
    clock.day >= 1 && clock.day <= 31 &&
    clock.hour <= 23 &&
    clock.minute <= 59 &&
    clock.second <= 59;

  return valid;
}

void ds1302WriteClock(const Ds1302DateTime &clock) {
  if (!rtcReady) {
    return;
  }

  ds1302WriteRegister(0x8E, 0x00);
  ds1302WriteRegister(0x80, decimalToBcd(clock.second));
  ds1302WriteRegister(0x82, decimalToBcd(clock.minute));
  ds1302WriteRegister(0x84, decimalToBcd(clock.hour));
  ds1302WriteRegister(0x86, decimalToBcd(clock.day));
  ds1302WriteRegister(0x88, decimalToBcd(clock.month));
  ds1302WriteRegister(0x8A, decimalToBcd(clock.weekday));
  ds1302WriteRegister(0x8C, decimalToBcd(static_cast<uint8_t>(clock.year % 100)));
  ds1302WriteRegister(0x8E, 0x80);
}

void tmToDs1302(const struct tm &timeinfo, Ds1302DateTime &clock) {
  clock.second = static_cast<uint8_t>(timeinfo.tm_sec);
  clock.minute = static_cast<uint8_t>(timeinfo.tm_min);
  clock.hour = static_cast<uint8_t>(timeinfo.tm_hour);
  clock.day = static_cast<uint8_t>(timeinfo.tm_mday);
  clock.month = static_cast<uint8_t>(timeinfo.tm_mon + 1);
  clock.weekday = static_cast<uint8_t>(timeinfo.tm_wday + 1);
  clock.year = static_cast<uint16_t>(timeinfo.tm_year + 1900);
}

void ds1302ToTm(const Ds1302DateTime &clock, struct tm &timeinfo) {
  memset(&timeinfo, 0, sizeof(timeinfo));
  timeinfo.tm_sec = clock.second;
  timeinfo.tm_min = clock.minute;
  timeinfo.tm_hour = clock.hour;
  timeinfo.tm_mday = clock.day;
  timeinfo.tm_mon = clock.month - 1;
  timeinfo.tm_year = clock.year - 1900;
  timeinfo.tm_wday = clock.weekday > 0 ? clock.weekday - 1 : 0;
  timeinfo.tm_isdst = 0;
}

bool setSystemClockFromRtc() {
  Ds1302DateTime rtcClock;
  if (!ds1302ReadClock(rtcClock)) {
    rtcHasValidClock = false;
    return false;
  }

  struct tm timeinfo;
  ds1302ToTm(rtcClock, timeinfo);
  const time_t epoch = mktime(&timeinfo);
  if (epoch <= 0) {
    rtcHasValidClock = false;
    return false;
  }

  timeval tv = { epoch, 0 };
  settimeofday(&tv, nullptr);
  rtcHasValidClock = true;
  return true;
}

bool syncRtcFromSystemClock() {
  if (!rtcReady) {
    return false;
  }

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) {
    return false;
  }

  if (timeinfo.tm_year + 1900 < 2024) {
    return false;
  }

  Ds1302DateTime rtcClock;
  tmToDs1302(timeinfo, rtcClock);
  ds1302WriteClock(rtcClock);
  rtcHasValidClock = true;
  lastRtcSyncAt = millis();
  return true;
}

bool getBestLocalTime(struct tm &timeinfo) {
  if (getLocalTime(&timeinfo, 10)) {
    return true;
  }

  if (setSystemClockFromRtc()) {
    return getLocalTime(&timeinfo, 10);
  }

  return false;
}

bool manualToggleButtonPressedRaw() {
#if MANUAL_TOGGLE_BUTTON_PIN >= 0
  return digitalRead(MANUAL_TOGGLE_BUTTON_PIN) ==
         (MANUAL_TOGGLE_BUTTON_ACTIVE_LOW ? LOW : HIGH);
#else
  return false;
#endif
}

void setPairingStatusLed(bool on) {
#if PAIRING_STATUS_LED_PIN >= 0
  const int onLevel = PAIRING_STATUS_LED_ACTIVE_HIGH ? HIGH : LOW;
  const int offLevel = PAIRING_STATUS_LED_ACTIVE_HIGH ? LOW : HIGH;
  digitalWrite(PAIRING_STATUS_LED_PIN, on ? onLevel : offLevel);
#endif
}

void blinkPairingStatusLed(int times) {
#if PAIRING_STATUS_LED_PIN >= 0
  for (int i = 0; i < times; i++) {
    setPairingStatusLed(true);
    delay(160);
    setPairingStatusLed(false);
    delay(160);
  }
#else
  (void)times;
#endif
}

void updatePairingStatusLed(unsigned long now) {
#if PAIRING_STATUS_LED_PIN >= 0
  if (pairingResetButtonPressed()) {
    if (now - lastPairingLedBlinkAt >= 120) {
      lastPairingLedBlinkAt = now;
      pairingLedBlinkState = !pairingLedBlinkState;
      setPairingStatusLed(pairingLedBlinkState);
    }
    return;
  }

  if (wifiReady() && hasStoredPairing()) {
    setPairingStatusLed(true);
    return;
  }

  if (pairingApActive) {
    if (now - lastPairingLedBlinkAt >= 700) {
      lastPairingLedBlinkAt = now;
      pairingLedBlinkState = !pairingLedBlinkState;
      setPairingStatusLed(pairingLedBlinkState);
    }
    return;
  }

  setPairingStatusLed(false);
#else
  (void)now;
#endif
}

void printPairingHardwareStatus() {
  Serial.println("Pairing hardware status:");

#if PAIRING_RESET_BUTTON_PIN >= 0
  Serial.printf(
    "- Reset button: GPIO %d, raw=%d, pressed=%s, wiring should be GPIO%d -> button -> GND\n",
    PAIRING_RESET_BUTTON_PIN,
    digitalRead(PAIRING_RESET_BUTTON_PIN),
    digitalRead(PAIRING_RESET_BUTTON_PIN) == LOW ? "YES" : "NO",
    PAIRING_RESET_BUTTON_PIN
  );
#else
  Serial.println("- Reset button: disabled. Set PAIRING_RESET_BUTTON_PIN >= 0 to enable.");
#endif

#if PAIRING_RESET_BOOT_BUTTON_PIN >= 0
  Serial.printf(
    "- BOOT fallback: GPIO %d, raw=%d, pressed=%s\n",
    PAIRING_RESET_BOOT_BUTTON_PIN,
    digitalRead(PAIRING_RESET_BOOT_BUTTON_PIN),
    digitalRead(PAIRING_RESET_BOOT_BUTTON_PIN) == LOW ? "YES" : "NO"
  );
#else
  Serial.println("- BOOT fallback: disabled.");
#endif

#if PAIRING_STATUS_LED_PIN >= 0
  Serial.printf(
    "- Status LED: GPIO %d, active high=%s. AP mode blinks slowly, reset hold blinks fast, paired Wi-Fi is solid ON.\n",
    PAIRING_STATUS_LED_PIN,
    PAIRING_STATUS_LED_ACTIVE_HIGH ? "true" : "false"
  );
#else
  Serial.println("- Status LED: disabled. Set PAIRING_STATUS_LED_PIN >= 0 to enable.");
#endif
}

void printLocalControlHardwareStatus() {
  Serial.println("Local control hardware status:");

#if MANUAL_TOGGLE_BUTTON_PIN >= 0
  Serial.printf(
    "- Manual relay button: GPIO %d, raw=%d, pressed=%s, wiring should be GPIO%d -> button -> %s\n",
    MANUAL_TOGGLE_BUTTON_PIN,
    digitalRead(MANUAL_TOGGLE_BUTTON_PIN),
    manualToggleButtonPressedRaw() ? "YES" : "NO",
    MANUAL_TOGGLE_BUTTON_PIN,
    MANUAL_TOGGLE_BUTTON_ACTIVE_LOW ? "GND" : "3V3"
  );
#else
  Serial.println("- Manual relay button: disabled. Set MANUAL_TOGGLE_BUTTON_PIN >= 0 to enable.");
#endif

#if MP3_UART_RX_PIN >= 0 && MP3_UART_TX_PIN >= 0
  Serial.printf(
    "- MP3 UART: RX=GPIO %d, TX=GPIO %d, baud=%lu, autoplay=%s, track=%d, volume=%d, start delay=%lu ms\n",
    MP3_UART_RX_PIN,
    MP3_UART_TX_PIN,
    (unsigned long)MP3_UART_BAUD,
#if MP3_AUTOPLAY_ON_BOOT
    "true",
#else
    "false",
#endif
    MP3_AUTOPLAY_TRACK,
    MP3_AUTOPLAY_VOLUME,
    (unsigned long)MP3_AUTOPLAY_START_DELAY_MS
  );
#else
  Serial.println("- MP3 UART: disabled. Set MP3_UART_RX_PIN and MP3_UART_TX_PIN >= 0 to enable.");
#endif
}

void printRtcHardwareStatus() {
  Serial.println("RTC hardware status:");

  if (!ds1302PinsConfigured()) {
    Serial.println("- DS1302 RTC: disabled. Set RTC_DS1302_ENABLED and RTC_DS1302_* pins to enable.");
    return;
  }

  Serial.printf(
    "- DS1302 RTC: CLK=GPIO %d, IO=GPIO %d, RST=GPIO %d, sync interval=%lu ms, VCC expected from your RTC supply\n",
    RTC_DS1302_CLK_PIN,
    RTC_DS1302_IO_PIN,
    RTC_DS1302_RST_PIN,
    (unsigned long)RTC_SYNC_INTERVAL_MS
  );
}

void sendMp3Command(uint8_t command, uint16_t parameter) {
  if (!mp3SerialReady) {
    return;
  }

  const uint8_t version = 0xFF;
  const uint8_t length = 0x06;
  const uint8_t feedback = 0x00;
  const uint8_t paramHigh = static_cast<uint8_t>((parameter >> 8) & 0xFF);
  const uint8_t paramLow = static_cast<uint8_t>(parameter & 0xFF);
  const uint16_t checksumBase = version + length + command + feedback + paramHigh + paramLow;
  const uint16_t checksum = static_cast<uint16_t>(0U - checksumBase);

  const uint8_t frame[] = {
    0x7E,
    version,
    length,
    command,
    feedback,
    paramHigh,
    paramLow,
    static_cast<uint8_t>((checksum >> 8) & 0xFF),
    static_cast<uint8_t>(checksum & 0xFF),
    0xEF
  };

  mp3Serial.write(frame, sizeof(frame));
  mp3Serial.flush();
  Serial.printf("[MP3] TX cmd=0x%02X param=%u\n", command, parameter);
}

void serviceMp3Autoplay(unsigned long now) {
  if (!mp3SerialReady || mp3BootAutoplayCompleted || now < nextMp3BootCommandAt) {
    return;
  }

#if !MP3_AUTOPLAY_ON_BOOT
  mp3BootAutoplayCompleted = true;
  return;
#endif

  switch (mp3BootCommandStage) {
    case 0:
      Serial.println("[MP3] Selecting TF card storage.");
      sendMp3Command(0x09, 0x0002);
      mp3BootCommandStage = 1;
      nextMp3BootCommandAt = now + 250;
      return;

    case 1:
      Serial.printf("[MP3] Setting startup volume to %d.\n", MP3_AUTOPLAY_VOLUME);
      sendMp3Command(0x06, static_cast<uint16_t>(constrain(MP3_AUTOPLAY_VOLUME, 0, 30)));
      mp3BootCommandStage = 2;
      nextMp3BootCommandAt = now + 250;
      return;

    case 2:
      Serial.printf("[MP3] Playing MP3/000%d.mp3 using MP3-folder command.\n", MP3_AUTOPLAY_TRACK);
      sendMp3Command(0x12, static_cast<uint16_t>(max(1, MP3_AUTOPLAY_TRACK)));
      mp3BootCommandStage = 3;
      mp3BootAutoplayCompleted = true;
      nextMp3BootCommandAt = 0;
      return;

    default:
      mp3BootAutoplayCompleted = true;
      nextMp3BootCommandAt = 0;
      return;
  }
}

void setupPairingHardware() {
#if PAIRING_RESET_BUTTON_PIN >= 0
  pinMode(PAIRING_RESET_BUTTON_PIN, INPUT_PULLUP);
#endif

#if PAIRING_RESET_BOOT_BUTTON_PIN >= 0 && PAIRING_RESET_BOOT_BUTTON_PIN != PAIRING_RESET_BUTTON_PIN
  pinMode(PAIRING_RESET_BOOT_BUTTON_PIN, INPUT_PULLUP);
#endif

#if PAIRING_STATUS_LED_PIN >= 0
  pinMode(PAIRING_STATUS_LED_PIN, OUTPUT);
  setPairingStatusLed(false);
#endif

  delay(30);
  printPairingHardwareStatus();
}

void setupLocalControlHardware() {
#if MANUAL_TOGGLE_BUTTON_PIN >= 0
  pinMode(
    MANUAL_TOGGLE_BUTTON_PIN,
    MANUAL_TOGGLE_BUTTON_ACTIVE_LOW ? INPUT_PULLUP : INPUT
  );
  delay(5);
  manualToggleButtonLastRawState = manualToggleButtonPressedRaw();
  manualToggleButtonStableState = manualToggleButtonLastRawState;
  manualToggleButtonLastChangeAt = millis();
#endif

#if MP3_UART_RX_PIN >= 0 && MP3_UART_TX_PIN >= 0
  mp3Serial.begin(MP3_UART_BAUD, SERIAL_8N1, MP3_UART_RX_PIN, MP3_UART_TX_PIN);
  mp3SerialReady = true;
  mp3BootAutoplayCompleted = false;
  mp3BootCommandStage = 0;
  nextMp3BootCommandAt = millis() + MP3_AUTOPLAY_START_DELAY_MS;
#else
  mp3SerialReady = false;
  mp3BootAutoplayCompleted = true;
  mp3BootCommandStage = 0;
  nextMp3BootCommandAt = 0;
#endif

  printLocalControlHardwareStatus();
}

void setupRtcHardware() {
  if (!ds1302PinsConfigured()) {
    rtcReady = false;
    rtcHasValidClock = false;
    printRtcHardwareStatus();
    return;
  }

  pinMode(RTC_DS1302_CLK_PIN, OUTPUT);
  pinMode(RTC_DS1302_RST_PIN, OUTPUT);
  digitalWrite(RTC_DS1302_CLK_PIN, LOW);
  digitalWrite(RTC_DS1302_RST_PIN, LOW);
  pinMode(RTC_DS1302_IO_PIN, INPUT);

  rtcReady = true;
  rtcHasValidClock = setSystemClockFromRtc();

  printRtcHardwareStatus();
  Serial.printf("[RTC] DS1302 boot clock status: %s\n", rtcHasValidClock ? "VALID" : "UNSET_OR_INVALID");
}

bool pairingResetButtonPressed() {
  bool pressed = false;

#if PAIRING_RESET_BUTTON_PIN >= 0
  pressed = pressed || digitalRead(PAIRING_RESET_BUTTON_PIN) == LOW;
#endif

#if PAIRING_RESET_BOOT_BUTTON_PIN >= 0 && PAIRING_RESET_BOOT_BUTTON_PIN != PAIRING_RESET_BUTTON_PIN
  pressed = pressed || digitalRead(PAIRING_RESET_BOOT_BUTTON_PIN) == LOW;
#endif

  return pressed;
}

void clearStoredPairing() {
  Serial.println("[RESET] Removing saved Wi-Fi, Firebase, owner UID, and device document ID from NVS.");
  preferences.remove(prefWifiSsid);
  preferences.remove(prefWifiPassword);
  preferences.remove(prefFirebaseApiKey);
  preferences.remove(prefFirebaseProjectId);
  preferences.remove(prefDeviceAuthEmail);
  preferences.remove(prefDeviceAuthPassword);
  preferences.remove(prefDeviceName);
  preferences.remove(prefDeviceLocation);
  preferences.remove(prefOwnerUid);
  preferences.remove(prefDeviceDocId);
  preferences.remove(prefOfflineLogsSynced);
  preferences.remove(prefScheduleEnabled);
  preferences.remove(prefScheduleMode);
  preferences.remove(prefScheduleStart);
  preferences.remove(prefScheduleEnd);
  preferences.remove(prefScheduleBudgetPhp);
  preferences.remove(prefScheduleBudgetKwh);
  preferences.remove(prefScheduleRate);
  preferences.putBool(prefPaired, false);

  runtimeWifiSsid = "";
  runtimeWifiPassword = "";
  runtimeFirebaseApiKey = "";
  runtimeFirebaseProjectId = "";
  runtimeDeviceAuthEmail = "";
  runtimeDeviceAuthPassword = "";
  ownerUid = "";
  deviceDocId = "";
  cloudDeviceName = DEVICE_NAME;
  deviceLocation = "";
  localPairingToken = "";
  pairingCompletedThisBoot = false;
  cloudServicesStarted = false;
  firebaseSessionStarted = false;
  cloudPresenceNeedsPatch = true;
  networkRuntimeReady = false;
  sdReady = false;
  offlineBacklogSyncPending = false;
  offlineLogsSyncedTotal = 0;
  lastOfflineSyncCount = 0;
  lastOfflineSyncAt = "";
  lastOfflineSyncArchive = "";
  scheduleEnabled = false;
  scheduleMode = "time";
  scheduleStartTime = "08:00:00";
  scheduleEndTime = "22:00:00";
  scheduleBudgetLimitPhp = 0.0f;
  scheduleBudgetLimitKwh = 0.0f;
  scheduleElectricityRate = 0.0f;
  scheduleManualOverride = false;
  scheduleBudgetReached = false;
  lastScheduleAction = "";
  lastScheduleActionAt = "";
  wifiReconnectAttempt = 0;
  firebaseReconnectAttempt = 0;
  wifiManagerState = WIFI_MANAGER_IDLE;
  wifiAttemptStartedAt = 0;
  nextWifiAttemptAt = 0;
  wifiOutageStartedAt = 0;
  lastWifiHealthyAt = 0;
  nextFirebaseAuthAttemptAt = 0;
  firebaseNotReadySince = 0;
  lastFirebaseHealthyAt = 0;

  WiFi.disconnect(true, true);
  delay(200);
  setPairingStatusLed(false);
}

void clearPairingResetEnergyState() {
  totalEnergyKwh = 0.0f;
  lastMeterEnergyKwh = 0.0f;
  hasLastMeterEnergy = false;
}

void clearOfflineArchiveForPairingReset() {
  if (!SD.exists(offlineArchiveDir)) {
    return;
  }

  File archiveDir = SD.open(offlineArchiveDir, FILE_READ);
  if (!archiveDir || !archiveDir.isDirectory()) {
    if (archiveDir) {
      archiveDir.close();
    }
    Serial.println("[RESET] Offline archive directory is unavailable.");
    return;
  }

  File child = archiveDir.openNextFile();
  while (child) {
    const bool childIsDirectory = child.isDirectory();
    const String childPath = child.path();
    child.close();

    if (!childIsDirectory) {
      SD.remove(childPath.c_str());
    }

    child = archiveDir.openNextFile();
  }

  archiveDir.close();

  if (SD.rmdir(offlineArchiveDir)) {
    Serial.println("[RESET] Offline archive directory removed from SD.");
  } else {
    Serial.println("[RESET] Offline archive directory could not be removed.");
  }
}

void clearOfflineBacklogForPairingReset() {
  const bool sdAvailable = sdReady || beginSdCard("pairing reset cleanup");

  if (!sdAvailable) {
    Serial.println("[RESET] SD card is not available. Skipping offline backlog cleanup.");
    return;
  }

  if (!SD.exists(offlineFilePath)) {
    Serial.println("[RESET] No offline backlog file was found on SD.");
    clearOfflineArchiveForPairingReset();
    return;
  }

  if (SD.remove(offlineFilePath)) {
    Serial.println("[RESET] Offline backlog file removed from SD.");
  } else {
    Serial.println("[RESET] Failed to remove offline backlog file from SD.");
  }

  clearOfflineArchiveForPairingReset();
}

void completePairingReset() {
  Serial.println("[RESET] Hold time reached. Clearing stored EnerTrack pairing now.");
#if RESET_PZEM_ENERGY_ON_PAIRING_RESET
  if (pzem.resetEnergy()) {
    Serial.println("[RESET] PZEM lifetime energy counter reset successfully.");
  } else {
    Serial.println("[RESET] PZEM lifetime energy counter reset failed.");
  }
#else
  Serial.println("[RESET] PZEM lifetime energy reset is disabled in config.");
#endif
  clearPairingResetEnergyState();
  clearOfflineBacklogForPairingReset();
  clearStoredPairing();
  pairingResetCompletedThisHold = true;
  Serial.println("[LED] Reset success blink x3.");
  blinkPairingStatusLed(3);
  Serial.println("[RESET] Pairing cleared. Staying alive and starting AP hotspot setup mode.");
  startPairingAccessPointIfNeeded();
}

void factoryResetIfRequested() {
#if PAIRING_RESET_BUTTON_PIN >= 0 || PAIRING_RESET_BOOT_BUTTON_PIN >= 0
  if (!pairingResetButtonPressed()) {
    Serial.println("[RESET] Reset button not held at boot.");
    return;
  }

  Serial.printf("[RESET] Button is held at boot. Keep holding for %lu ms to clear pairing.\n", (unsigned long)PAIRING_RESET_HOLD_MS);
  const unsigned long startedAt = millis();
  unsigned long lastBootResetLogAt = 0;

  while (millis() - startedAt < PAIRING_RESET_HOLD_MS) {
    const unsigned long now = millis();
    if (!pairingResetButtonPressed()) {
      Serial.println("[RESET] Boot reset cancelled because button was released early.");
      setPairingStatusLed(false);
      return;
    }

    updatePairingStatusLed(now);

    if (now - lastBootResetLogAt >= 1000) {
      lastBootResetLogAt = now;
      Serial.printf("[RESET] Boot hold progress: %lu / %lu ms\n", now - startedAt, (unsigned long)PAIRING_RESET_HOLD_MS);
    }

    delay(20);
  }

  completePairingReset();
#else
  Serial.println("[RESET] Pairing reset button is disabled in config.h.");
#endif
}

void handlePairingResetButton() {
#if PAIRING_RESET_BUTTON_PIN >= 0 || PAIRING_RESET_BOOT_BUTTON_PIN >= 0
  const bool pressed = pairingResetButtonPressed();
  const unsigned long now = millis();

  if (!pressed) {
    if (pairingResetButtonPressedAt > 0) {
      Serial.println("[RESET] Button released before reset completion.");
    }
    pairingResetButtonPressedAt = 0;
    pairingResetHoldLogged = false;
    pairingResetPressedLogged = false;
    pairingResetCompletedThisHold = false;
    lastPairingResetProgressLogAt = 0;
    return;
  }

  if (pairingResetCompletedThisHold) {
    return;
  }

  if (pairingResetButtonPressedAt == 0) {
    pairingResetButtonPressedAt = now;
  }

  if (!pairingResetPressedLogged) {
    Serial.println("[RESET] Pairing reset button PRESSED.");
    printPairingHardwareStatus();
    pairingResetPressedLogged = true;
  }

  updatePairingStatusLed(now);

  const unsigned long heldFor = now - pairingResetButtonPressedAt;

  if (!pairingResetHoldLogged && heldFor >= 500) {
    Serial.printf("[RESET] Keep holding for %lu ms to clear saved pairing.\n", (unsigned long)PAIRING_RESET_HOLD_MS);
    pairingResetHoldLogged = true;
  }

  if (heldFor >= 1000 && now - lastPairingResetProgressLogAt >= 1000) {
    lastPairingResetProgressLogAt = now;
    Serial.printf("[RESET] Hold progress: %lu / %lu ms\n", heldFor, (unsigned long)PAIRING_RESET_HOLD_MS);
  }

  if (heldFor >= PAIRING_RESET_HOLD_MS) {
    completePairingReset();
  }
#else
  // Reset button disabled.
#endif
}

String buildDefaultEsp32Id() {
  const uint64_t mac = ESP.getEfuseMac();
  const unsigned long suffix = ((unsigned long)(mac & 0xFFFF) % 9000) + 1000;
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "SP-%04lu", suffix);
  return String(buffer);
}

String buildPairingSsid() {
  return runtimeEsp32Id + "-ET";
}

String readPreferenceOrDefault(const char *key, const char *fallback) {
  const String value = preferences.getString(key, "");
  return value.length() > 0 ? value : String(fallback);
}

void loadRuntimeConfig() {
  preferences.begin("enertrack", false);

  runtimeEsp32Id = preferences.getString(prefEsp32Id, "");
  if (runtimeEsp32Id.length() == 0 || !runtimeEsp32Id.startsWith("SP-")) {
    runtimeEsp32Id = buildDefaultEsp32Id();
    preferences.putString(prefEsp32Id, runtimeEsp32Id);
  }

  runtimeWifiSsid = readPreferenceOrDefault(prefWifiSsid, WIFI_SSID);
  runtimeWifiPassword = readPreferenceOrDefault(prefWifiPassword, WIFI_PASSWORD);
  runtimeFirebaseApiKey = readPreferenceOrDefault(prefFirebaseApiKey, FIREBASE_API_KEY);
  runtimeFirebaseProjectId = readPreferenceOrDefault(prefFirebaseProjectId, FIREBASE_PROJECT_ID);
  runtimeDeviceAuthEmail = readPreferenceOrDefault(prefDeviceAuthEmail, DEVICE_AUTH_EMAIL);
  runtimeDeviceAuthPassword = readPreferenceOrDefault(prefDeviceAuthPassword, DEVICE_AUTH_PASSWORD);
  cloudDeviceName = readPreferenceOrDefault(prefDeviceName, DEVICE_NAME);
  deviceLocation = preferences.getString(prefDeviceLocation, "");
  ownerUid = preferences.getString(prefOwnerUid, "");
  deviceDocId = preferences.getString(prefDeviceDocId, "");
  offlineLogsSyncedTotal = preferences.getUInt(prefOfflineLogsSynced, 0);
  scheduleEnabled = preferences.getBool(prefScheduleEnabled, false);
  scheduleMode = preferences.getString(prefScheduleMode, "time");
  scheduleStartTime = preferences.getString(prefScheduleStart, "08:00:00");
  scheduleEndTime = preferences.getString(prefScheduleEnd, "22:00:00");
  scheduleBudgetLimitPhp = preferences.getFloat(prefScheduleBudgetPhp, 0.0f);
  scheduleBudgetLimitKwh = preferences.getFloat(prefScheduleBudgetKwh, 0.0f);
  scheduleElectricityRate = preferences.getFloat(prefScheduleRate, 0.0f);
  pairingSsid = buildPairingSsid();
}

bool hasConfiguredWifi() {
  return runtimeWifiSsid.length() > 0 &&
         runtimeWifiSsid != runtimeEsp32Id &&
         runtimeWifiSsid.indexOf("YOUR_WIFI") < 0;
}

bool hasConfiguredFirebase() {
  return runtimeFirebaseApiKey.length() > 0 &&
         runtimeFirebaseProjectId.length() > 0 &&
         runtimeDeviceAuthEmail.length() > 0 &&
         runtimeDeviceAuthPassword.length() > 0 &&
         runtimeFirebaseApiKey.indexOf("YOUR_FIREBASE") < 0;
}

bool beginSdCard(const char *context) {
  bool mounted = false;
  uint8_t cardType = CARD_NONE;

  for (int attempt = 1; attempt <= 3; attempt++) {
    pinMode(SD_CS_PIN, OUTPUT);
    digitalWrite(SD_CS_PIN, HIGH);
    SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
    delay(50 * attempt);

    mounted = SD.begin(SD_CS_PIN, SPI, SD_SPI_FREQ_HZ);
    if (mounted) {
      cardType = SD.cardType();
      if (cardType != CARD_NONE) {
        break;
      }

      mounted = false;
    }

    delay(120);
  }

  sdReady = mounted;

  if (!mounted) {
    Serial.printf(
      "[SD] Mount failed%s%s after 3 attempts. CS=%d SCK=%d MISO=%d MOSI=%d FREQ=%luHz\n",
      context && context[0] ? " during " : "",
      context && context[0] ? context : "",
      SD_CS_PIN,
      SD_SCK_PIN,
      SD_MISO_PIN,
      SD_MOSI_PIN,
      (unsigned long)SD_SPI_FREQ_HZ
    );
    return false;
  }

  Serial.printf(
    "[SD] Mounted%s%s. Type=%u Size=%llu bytes Used=%llu bytes\n",
    context && context[0] ? " during " : "",
    context && context[0] ? context : "",
    cardType,
    static_cast<unsigned long long>(SD.cardSize()),
    static_cast<unsigned long long>(SD.usedBytes())
  );
  return true;
}

bool hasStoredPairing() {
  return preferences.getBool(prefPaired, false) &&
         hasConfiguredWifi() &&
         hasConfiguredFirebase();
}

bool canConnectToRouterWifiThisBoot() {
  if (!hasConfiguredWifi()) {
    return false;
  }

  if (pairingCompletedThisBoot) {
    return true;
  }

#if AUTO_CONNECT_STORED_WIFI_ON_BOOT
  return hasStoredPairing();
#else
  return false;
#endif
}

unsigned long nextBackoffDelayMs(
  uint8_t attempt,
  unsigned long baseMs,
  unsigned long maxMs
) {
  unsigned long delayMs = baseMs;

  for (uint8_t i = 0; i < attempt && delayMs < maxMs; i++) {
    if (delayMs > maxMs / 2) {
      delayMs = maxMs;
      break;
    }

    delayMs *= 2;
  }

  if (delayMs > maxMs) {
    delayMs = maxMs;
  }

  const unsigned long jitterMax = min(2000UL, max(250UL, delayMs / 5));
  return delayMs + random(0, jitterMax + 1);
}

void resetWifiReconnectBackoff() {
  wifiReconnectAttempt = 0;
  wifiAttemptStartedAt = 0;
  nextWifiAttemptAt = millis();
}

void resetFirebaseAuthBackoff() {
  firebaseReconnectAttempt = 0;
  nextFirebaseAuthAttemptAt = millis();
  firebaseNotReadySince = 0;
}

void scheduleNextWifiAttempt(unsigned long now, const char *reason) {
  const unsigned long backoffMs = nextBackoffDelayMs(
    wifiReconnectAttempt,
    WIFI_RECONNECT_BASE_MS,
    WIFI_RECONNECT_MAX_MS
  );

  if (wifiReconnectAttempt < 10) {
    wifiReconnectAttempt++;
  }
  nextWifiAttemptAt = now + backoffMs;

  Serial.printf(
    "[WIFI] %s. Next reconnect attempt in %lu ms (failure count=%u).\n",
    reason,
    backoffMs,
    wifiReconnectAttempt
  );
}

void scheduleNextFirebaseAuthAttempt(unsigned long now, const char *reason) {
  const unsigned long backoffMs = nextBackoffDelayMs(
    firebaseReconnectAttempt,
    FIREBASE_REAUTH_BASE_MS,
    FIREBASE_REAUTH_MAX_MS
  );

  if (firebaseReconnectAttempt < 10) {
    firebaseReconnectAttempt++;
  }
  nextFirebaseAuthAttemptAt = now + backoffMs;

  Serial.printf(
    "[FIREBASE] %s. Next re-auth attempt in %lu ms (failure count=%u).\n",
    reason,
    backoffMs,
    firebaseReconnectAttempt
  );
}

void logApOnlyModeIfNeeded(const char *reason) {
  const unsigned long now = millis();
  if (now - lastApOnlyStatusLogAt < 10000) {
    return;
  }

  lastApOnlyStatusLogAt = now;
  Serial.printf("[AP-PAIRING] AP-only mode active. %s\n", reason);
  Serial.printf("[AP-PAIRING] Connect phone/laptop to SSID '%s' using password '%s'. Open http://192.168.4.1\n", pairingSsid.c_str(), DEVICE_PAIR_PASSWORD);
  Serial.printf("[AP-PAIRING] Stored pairing: %s, configured Wi-Fi: %s, pairing completed this boot: %s, auto-connect stored Wi-Fi on boot: %s\n",
                hasStoredPairing() ? "YES" : "NO",
                hasConfiguredWifi() ? "YES" : "NO",
                pairingCompletedThisBoot ? "YES" : "NO",
#if AUTO_CONNECT_STORED_WIFI_ON_BOOT
                "YES"
#else
                "NO"
#endif
  );
}

float readVoltageFromMeter() {
  return pzem.voltage();
}

float readCurrentFromMeter() {
  return pzem.current();
}

float readPowerFromMeter() {
  return pzem.power();
}

float readPowerFactorFromMeter() {
  return pzem.pf();
}

float readEnergyFromMeter() {
  return pzem.energy();
}

void setRelay(bool enabled) {
  relayStatus = enabled;
  digitalWrite(RELAY_PIN, enabled == RELAY_ACTIVE_HIGH ? HIGH : LOW);
}

void setProtection(
  bool enabled,
  float maxPowerW,
  float maxCurrentA
) {
  float nextMaxPower = finiteNumber(maxPowerW) && maxPowerW > 0.0f
    ? maxPowerW
    : MAX_POWER_W;
  float nextMaxCurrent = finiteNumber(maxCurrentA) && maxCurrentA > 0.0f
    ? maxCurrentA
    : MAX_CURRENT_A;

  protectionEnabled = enabled;
  maxPowerLimitW = nextMaxPower;
  maxCurrentLimitA = nextMaxCurrent;
}

bool scheduleUsesTime() {
  return scheduleEnabled &&
         (scheduleMode == "time" || scheduleMode == "both");
}

bool scheduleUsesBudget() {
  return scheduleEnabled &&
         (scheduleMode == "budget" || scheduleMode == "both");
}

int parseScheduleTimeSeconds(const String &value) {
  int firstColon = value.indexOf(':');
  if (firstColon < 0) return -1;

  int secondColon = value.indexOf(':', firstColon + 1);
  const int hours = value.substring(0, firstColon).toInt();
  const int minutes = secondColon > 0
    ? value.substring(firstColon + 1, secondColon).toInt()
    : value.substring(firstColon + 1).toInt();
  const int seconds = secondColon > 0
    ? value.substring(secondColon + 1).toInt()
    : 0;

  if (hours < 0 || hours > 23 ||
      minutes < 0 || minutes > 59 ||
      seconds < 0 || seconds > 59) {
    return -1;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

bool currentSecondOfDay(int &secondOfDay) {
  struct tm timeinfo;
  if (!getBestLocalTime(timeinfo)) {
    return false;
  }

  if (timeinfo.tm_year + 1900 < 2024) {
    return false;
  }

  secondOfDay =
    timeinfo.tm_hour * 3600 +
    timeinfo.tm_min * 60 +
    timeinfo.tm_sec;
  return true;
}

bool scheduleTimeWindowActive(bool &active) {
  int nowSeconds = 0;
  if (!currentSecondOfDay(nowSeconds)) {
    return false;
  }

  const int startSeconds = parseScheduleTimeSeconds(scheduleStartTime);
  const int endSeconds = parseScheduleTimeSeconds(scheduleEndTime);

  if (startSeconds < 0 || endSeconds < 0 || startSeconds == endSeconds) {
    return false;
  }

  active = startSeconds < endSeconds
    ? nowSeconds >= startSeconds && nowSeconds < endSeconds
    : nowSeconds >= startSeconds || nowSeconds < endSeconds;
  return true;
}

float activeBudgetKwhLimit() {
  if (scheduleBudgetLimitKwh > 0.0f) {
    return scheduleBudgetLimitKwh;
  }

  if (scheduleBudgetLimitPhp > 0.0f && scheduleElectricityRate > 0.0f) {
    return scheduleBudgetLimitPhp / scheduleElectricityRate;
  }

  return 0.0f;
}

void saveScheduleConfig() {
  preferences.putBool(prefScheduleEnabled, scheduleEnabled);
  preferences.putString(prefScheduleMode, scheduleMode);
  preferences.putString(prefScheduleStart, scheduleStartTime);
  preferences.putString(prefScheduleEnd, scheduleEndTime);
  preferences.putFloat(prefScheduleBudgetPhp, scheduleBudgetLimitPhp);
  preferences.putFloat(prefScheduleBudgetKwh, scheduleBudgetLimitKwh);
  preferences.putFloat(prefScheduleRate, scheduleElectricityRate);
}

void applyScheduleConfig(
  bool enabled,
  String mode,
  const String &startTime,
  const String &endTime,
  float budgetLimitPhp,
  float budgetLimitKwh,
  float electricityRate
) {
  mode.toLowerCase();
  if (mode != "time" && mode != "budget" && mode != "both") {
    mode = "time";
  }

  const bool configChanged =
    scheduleEnabled != enabled ||
    scheduleMode != mode ||
    scheduleStartTime != (startTime.length() > 0 ? startTime : "08:00:00") ||
    scheduleEndTime != (endTime.length() > 0 ? endTime : "22:00:00") ||
    fabs(scheduleBudgetLimitPhp - (finiteNumber(budgetLimitPhp) && budgetLimitPhp > 0.0f ? budgetLimitPhp : 0.0f)) > 0.01f ||
    fabs(scheduleElectricityRate - (finiteNumber(electricityRate) && electricityRate > 0.0f ? electricityRate : 0.0f)) > 0.01f ||
    fabs(scheduleBudgetLimitKwh - (finiteNumber(budgetLimitKwh) && budgetLimitKwh > 0.0f ? budgetLimitKwh : 0.0f)) > 0.0001f;

  scheduleEnabled = enabled;
  scheduleMode = mode;
  scheduleStartTime = startTime.length() > 0 ? startTime : "08:00:00";
  scheduleEndTime = endTime.length() > 0 ? endTime : "22:00:00";
  scheduleBudgetLimitPhp =
    finiteNumber(budgetLimitPhp) && budgetLimitPhp > 0.0f
      ? budgetLimitPhp
      : 0.0f;
  scheduleElectricityRate =
    finiteNumber(electricityRate) && electricityRate > 0.0f
      ? electricityRate
      : 0.0f;
  if (finiteNumber(budgetLimitKwh) && budgetLimitKwh > 0.0f) {
    scheduleBudgetLimitKwh = budgetLimitKwh;
  } else if (scheduleBudgetLimitPhp > 0.0f && scheduleElectricityRate > 0.0f) {
    scheduleBudgetLimitKwh = scheduleBudgetLimitPhp / scheduleElectricityRate;
  } else {
    scheduleBudgetLimitKwh = 0.0f;
  }
  if (configChanged) {
    scheduleManualOverride = false;
    scheduleBudgetReached = false;
  }
  saveScheduleConfig();

  Serial.printf(
    "[SCHEDULE] Config updated. enabled=%s mode=%s start=%s end=%s budgetPhp=%.2f budgetKwh=%.4f rate=%.2f\n",
    scheduleEnabled ? "true" : "false",
    scheduleMode.c_str(),
    scheduleStartTime.c_str(),
    scheduleEndTime.c_str(),
    scheduleBudgetLimitPhp,
    scheduleBudgetLimitKwh,
    scheduleElectricityRate
  );
}

void activateScheduleManualOverride() {
  bool active = false;
  if (!scheduleUsesTime() || !scheduleTimeWindowActive(active)) {
    return;
  }

  scheduleManualOverride = true;
  scheduleManualOverrideWindowState = active;
  Serial.println("[SCHEDULE] Manual override active until the next schedule boundary.");
}

void clearScheduleManualOverrideIfBoundaryChanged(bool currentWindowState) {
  if (!scheduleManualOverride) {
    return;
  }

  if (currentWindowState == scheduleManualOverrideWindowState) {
    return;
  }

  scheduleManualOverride = false;
  Serial.println("[SCHEDULE] Manual override cleared at schedule boundary.");
}

void recordScheduleAction(const char *action) {
  lastScheduleAction = action;
  lastScheduleActionAt = isoNow();
}

String devicePath() {
  return String("users/") + ownerUid + "/devices/" + deviceDocId;
}

String readingsPath() {
  return devicePath() + "/readings";
}

String commandsPath() {
  return devicePath() + "/commands";
}

String offlineBatchesPath() {
  return String("users/") + ownerUid + "/offlineSyncBatches";
}

String claimPath() {
  return String("esp32DeviceClaims/") + runtimeEsp32Id;
}

String isoNow() {
  struct tm timeinfo;
  if (!getBestLocalTime(timeinfo)) {
    return String("unsynced:") + String(millis());
  }

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S+08:00", &timeinfo);
  return String(buffer);
}

String readingId(const String &timestamp) {
  String clean = timestamp;
  clean.replace("-", "");
  clean.replace(":", "");
  clean.replace("+", "");
  return runtimeEsp32Id + "-" + clean + "-" + String(millis());
}

bool wifiReady() {
  return WiFi.status() == WL_CONNECTED;
}

bool firebaseReady() {
  return Firebase.ready() && wifiReady();
}

bool claimReady() {
  return ownerUid.length() > 0 && deviceDocId.length() > 0;
}

bool hasPairingClientConnected() {
  return pairingApActive && WiFi.softAPgetStationNum() > 0;
}

bool pairingSessionActive(unsigned long now) {
  return lastPairingActivityAt > 0 &&
         now - lastPairingActivityAt < PAIRING_ACTIVITY_TIMEOUT_MS;
}

void markPairingActivity() {
  lastPairingActivityAt = millis();
}

bool finiteNumber(float value) {
  return !isnan(value) && !isinf(value);
}

float normalizedEnergyTotal(float rawEnergy) {
  if (!finiteNumber(rawEnergy) ||
      rawEnergy < 0.0f ||
      rawEnergy > PZEM_MAX_VALID_ENERGY_KWH) {
    return hasLastMeterEnergy ? lastMeterEnergyKwh : 0.0f;
  }

  if (hasLastMeterEnergy &&
      rawEnergy + PZEM_ENERGY_ROLLBACK_TOLERANCE_KWH < lastMeterEnergyKwh) {
    return lastMeterEnergyKwh;
  }

  return rawEnergy;
}

void applyPzemSanityFilter(SensorReading &reading) {
  reading.energy = normalizedEnergyTotal(reading.energy);

  const bool invalidVoltage =
    !finiteNumber(reading.voltage) ||
    reading.voltage < PZEM_MIN_VALID_AC_VOLTAGE ||
    reading.voltage > PZEM_MAX_VALID_AC_VOLTAGE;

  if (invalidVoltage) {
    reading.voltage = 0.0f;
    reading.current = 0.0f;
    reading.power = 0.0f;
    reading.powerFactor = 0.0f;
    reading.energyDelta = 0.0f;
    return;
  }

  if (!finiteNumber(reading.current) ||
      reading.current < 0.0f ||
      reading.current > PZEM_MAX_VALID_CURRENT_A) {
    reading.current = 0.0f;
  }

  if (!finiteNumber(reading.power) ||
      reading.power < 0.0f ||
      reading.power > PZEM_MAX_VALID_POWER_W) {
    reading.power = 0.0f;
  }

  if (!finiteNumber(reading.powerFactor) ||
      reading.powerFactor < 0.0f ||
      reading.powerFactor > 1.0f) {
    reading.powerFactor = 0.0f;
  }

  if (reading.current < PZEM_PHANTOM_CURRENT_EPSILON_A) {
    reading.current = 0.0f;
  }

  if (reading.power < PZEM_PHANTOM_POWER_EPSILON_W) {
    reading.power = 0.0f;
  }

  if (reading.current == 0.0f || reading.power == 0.0f) {
    reading.powerFactor = 0.0f;
  }
}

bool validReading(const SensorReading &reading) {
  return finiteNumber(reading.voltage) &&
         finiteNumber(reading.current) &&
         finiteNumber(reading.power) &&
         finiteNumber(reading.powerFactor) &&
         finiteNumber(reading.energy);
}

SensorReading captureReading() {
  const String timestamp = isoNow();
  SensorReading reading;

  reading.id = readingId(timestamp);
  reading.timestamp = timestamp;
  reading.voltage = readVoltageFromMeter();
  reading.current = readCurrentFromMeter();
  reading.power = readPowerFromMeter();
  reading.powerFactor = readPowerFactorFromMeter();
  reading.energy = readEnergyFromMeter();
  reading.energyDelta = 0.0;
  reading.wifiSignal = WiFi.RSSI();
  reading.relayStatus = relayStatus;

  applyPzemSanityFilter(reading);

  if (finiteNumber(reading.energy)) {
    if (hasLastMeterEnergy && reading.energy >= lastMeterEnergyKwh) {
      reading.energyDelta = reading.energy - lastMeterEnergyKwh;
    }

    lastMeterEnergyKwh = reading.energy;
    hasLastMeterEnergy = true;
    totalEnergyKwh = reading.energy;
  }

  return reading;
}

void readingToFirestoreJson(FirebaseJson &json, const SensorReading &reading, const char *source) {
  json.clear();
  json.set("fields/id/stringValue", reading.id);
  json.set("fields/uid/stringValue", ownerUid);
  json.set("fields/deviceId/stringValue", deviceDocId);
  json.set("fields/esp32Id/stringValue", runtimeEsp32Id);
  json.set("fields/deviceName/stringValue", cloudDeviceName);
  json.set("fields/timestamp/stringValue", reading.timestamp);
  json.set("fields/voltage/doubleValue", reading.voltage);
  json.set("fields/current/doubleValue", reading.current);
  json.set("fields/power/doubleValue", reading.power);
  json.set("fields/powerFactor/doubleValue", reading.powerFactor);
  json.set("fields/energy/doubleValue", reading.energy);
  json.set("fields/energyDelta/doubleValue", reading.energyDelta);
  json.set("fields/relayStatus/booleanValue", reading.relayStatus);
  json.set("fields/wifiSignal/integerValue", reading.wifiSignal);
  json.set("fields/source/stringValue", source);
}

bool uploadReading(const SensorReading &reading, const char *source) {
  if (!claimReady()) return false;

  FirebaseJson json;
  readingToFirestoreJson(json, reading, source);

  const String path = readingsPath() + "/" + reading.id;
  return Firebase.Firestore.createDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    path.c_str(),
    json.raw()
  );
}

bool upsertReading(const SensorReading &reading, const char *source) {
  if (!claimReady()) return false;

  FirebaseJson json;
  readingToFirestoreJson(json, reading, source);

  const String path = readingsPath() + "/" + reading.id;
  return Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    path.c_str(),
    json.raw(),
    "id,uid,deviceId,esp32Id,deviceName,timestamp,voltage,current,power,powerFactor,energy,energyDelta,relayStatus,wifiSignal,source"
  );
}

String documentPathFromName(const String &name) {
  const String marker = "/documents/";
  int markerIndex = name.indexOf(marker);

  if (markerIndex < 0) {
    return name;
  }

  return name.substring(markerIndex + marker.length());
}

String documentIdFromPath(const String &path) {
  int slashIndex = path.lastIndexOf('/');

  if (slashIndex < 0) {
    return path;
  }

  return path.substring(slashIndex + 1);
}

bool getJsonString(FirebaseJson &json, const String &path, String &value) {
  FirebaseJsonData data;
  json.get(data, path.c_str());

  if (!data.success) {
    return false;
  }

  value = data.to<String>();
  return true;
}

bool getJsonBool(FirebaseJson &json, const String &path, bool &value) {
  FirebaseJsonData data;
  json.get(data, path.c_str());

  if (!data.success) {
    return false;
  }

  value = data.to<bool>();
  return true;
}

bool getJsonFloat(FirebaseJson &json, const String &path, float &value) {
  FirebaseJsonData data;
  json.get(data, path.c_str());

  if (!data.success) {
    return false;
  }

  value = data.to<float>();
  return true;
}

void writeSerialJson(FirebaseJson &json) {
  String output;
  json.toString(output, false);
  Serial.println(output);
}

void sendPairingError(const char *type, const String &message) {
  FirebaseJson response;
  response.set("type", type);
  response.set("ok", false);
  response.set("message", message);
  writeSerialJson(response);
}

bool pairingCredentialsMatch(FirebaseJson &command) {
  String username;
  String password;

  if (!getJsonString(command, "username", username) ||
      !getJsonString(command, "password", password)) {
    return false;
  }

  return username == DEVICE_PAIR_USERNAME && password == DEVICE_PAIR_PASSWORD;
}

String jsonToString(FirebaseJson &json) {
  String output;
  json.toString(output, false);
  return output;
}

void addCorsHeaders() {
  pairingServer.sendHeader("Access-Control-Allow-Origin", "*");
  pairingServer.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  pairingServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  pairingServer.sendHeader("Access-Control-Allow-Private-Network", "true");
}

void sendLocalJson(int statusCode, FirebaseJson &json) {
  addCorsHeaders();
  pairingServer.sendHeader("Connection", "close");
  pairingServer.send(statusCode, "application/json", jsonToString(json));
}

void sendLocalJsonString(int statusCode, const String &json) {
  addCorsHeaders();
  pairingServer.sendHeader("Connection", "close");
  pairingServer.send(statusCode, "application/json", json);
}

void sendLocalError(int statusCode, const String &message) {
  FirebaseJson response;
  response.set("success", false);
  response.set("message", message);
  sendLocalJson(statusCode, response);
}

FirebaseJson readLocalRequestJson() {
  FirebaseJson json;
  json.setJsonData(pairingServer.arg("plain"));
  return json;
}

String createPairingToken() {
  const uint64_t mac = ESP.getEfuseMac();
  return String("pt-") + String((unsigned long)(mac & 0xFFFFFF), HEX) + "-" + String(millis());
}

void addDeviceInfoFields(FirebaseJson &response) {
  response.set("esp32Id", runtimeEsp32Id);
  response.set("ssid", pairingSsid);
  response.set("paired", hasStoredPairing());
  response.set("deviceType", "smart_plug");
  response.set("firmwareVersion", firmwareVersion);
  response.set("setupIp", WiFi.softAPIP().toString());
}

void handleCorsOptions() {
  addCorsHeaders();
  pairingServer.send(204);
}

void handleDeviceInfoApi() {
  markPairingActivity();
  Serial.println("Local API request: GET /api/device-info");
  FirebaseJson response;
  addDeviceInfoFields(response);
  sendLocalJson(200, response);
  Serial.println("Local API response sent: /api/device-info");
}

void handlePairingRootApi() {
  markPairingActivity();
  addCorsHeaders();

  String html = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  html += "<title>EnerTrack ESP32 Setup</title></head>";
  html += "<body style=\"font-family:Arial,sans-serif;padding:24px;line-height:1.45\">";
  html += "<h1>EnerTrack ESP32 Setup</h1>";
  html += "<p>Status: setup server is running.</p>";
  html += "<p>ESP32 ID: " + runtimeEsp32Id + "</p>";
  html += "<p>SSID: " + pairingSsid + "</p>";
  html += "<p>Use the EnerTrack app to finish pairing.</p>";
  html += "<p>Device info API: <a href=\"/api/device-info\">/api/device-info</a></p>";
  html += "</body></html>";

  pairingServer.send(200, "text/html", html);
}

String escapeJsonString(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", "\\n");
  value.replace("\r", "\\r");
  value.replace("\t", "\\t");
  return value;
}

void handleWifiNetworksApi() {
  markPairingActivity();
  Serial.println("Local API request: GET /api/wifi-networks");
  WiFi.mode(WIFI_AP_STA);
  const int count = WiFi.scanNetworks(false, true);
  String response = "{\"success\":true,\"networks\":[";
  int added = 0;

  for (int i = 0; i < count && added < 12; i++) {
    const String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;

    if (added > 0) response += ",";
    response += "{\"ssid\":\"";
    response += escapeJsonString(ssid);
    response += "\",\"rssi\":";
    response += String(WiFi.RSSI(i));
    response += ",\"secure\":";
    response += WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true";
    response += "}";
    added++;
  }

  response += "]}";
  WiFi.scanDelete();
  sendLocalJsonString(200, response);
  Serial.println("Local API response sent: /api/wifi-networks");
}

void handleVerifyLoginApi() {
  markPairingActivity();
  Serial.println("Local API request: POST /api/verify-login");
  FirebaseJson request = readLocalRequestJson();

  if (!pairingCredentialsMatch(request)) {
    FirebaseJson response;
    response.set("success", false);
    response.set("message", "Invalid default username or password");
    sendLocalJson(401, response);
    return;
  }

  localPairingToken = createPairingToken();
  Serial.println("[PAIRING] Default ESP32 login verified. Pairing token created.");

  FirebaseJson response;
  response.set("success", true);
  response.set("message", "Device login verified");
  response.set("pairingToken", localPairingToken);
  sendLocalJson(200, response);
}

bool readRequiredLocalString(
  FirebaseJson &request,
  const String &path,
  String &value
) {
  if (!getJsonString(request, path, value) || value.length() == 0) {
    sendLocalError(400, String("Missing ") + path + ".");
    return false;
  }

  return true;
}

void schedulePairingReboot(const char *reason) {
  pendingPairingReboot = true;
  pairingRebootAt = millis() + PAIRING_REBOOT_DELAY_MS;
  pendingNetworkRestart = false;
  Serial.printf("[PAIRING] ESP32 reboot scheduled: %s\n", reason);
}

void handlePairDeviceApi() {
  markPairingActivity();
  Serial.println("Local API request: POST /api/pair-device");
  FirebaseJson request = readLocalRequestJson();
  String nextOwnerUid;
  String nextDeviceDocId;
  String esp32Id;
  String nextDeviceName;
  String nextDeviceLocation;
  String nextWifiSsid;
  String nextWifiPassword;
  String newDevicePassword;

  if (!readRequiredLocalString(request, "ownerUid", nextOwnerUid) ||
      !readRequiredLocalString(request, "deviceDocId", nextDeviceDocId) ||
      !readRequiredLocalString(request, "esp32Id", esp32Id) ||
      !readRequiredLocalString(request, "deviceName", nextDeviceName) ||
      !readRequiredLocalString(request, "deviceLocation", nextDeviceLocation) ||
      !readRequiredLocalString(request, "wifiSsid", nextWifiSsid) ||
      !readRequiredLocalString(request, "wifiPassword", nextWifiPassword) ||
      !readRequiredLocalString(request, "newDevicePassword", newDevicePassword)) {
    return;
  }

  if (esp32Id != runtimeEsp32Id) {
    sendLocalError(400, "Pairing request is for a different ESP32.");
    return;
  }

  if (newDevicePassword.length() < 6) {
    sendLocalError(400, "New device password must be at least 6 characters.");
    return;
  }

  String nextFirebaseApiKey;
  String nextFirebaseProjectId;
  String nextDeviceAuthEmail;
  String nextDeviceAuthPassword;

  getJsonString(request, "firebaseApiKey", nextFirebaseApiKey);
  getJsonString(request, "firebaseProjectId", nextFirebaseProjectId);
  getJsonString(request, "deviceAuthEmail", nextDeviceAuthEmail);
  getJsonString(request, "deviceAuthPassword", nextDeviceAuthPassword);

  ownerUid = nextOwnerUid;
  deviceDocId = nextDeviceDocId;
  cloudDeviceName = nextDeviceName;
  deviceLocation = nextDeviceLocation;
  runtimeWifiSsid = nextWifiSsid;
  runtimeWifiPassword = nextWifiPassword;

  if (nextFirebaseApiKey.length() > 0) runtimeFirebaseApiKey = nextFirebaseApiKey;
  if (nextFirebaseProjectId.length() > 0) runtimeFirebaseProjectId = nextFirebaseProjectId;
  if (nextDeviceAuthEmail.length() > 0) runtimeDeviceAuthEmail = nextDeviceAuthEmail;
  runtimeDeviceAuthPassword = nextDeviceAuthPassword.length() > 0 ? nextDeviceAuthPassword : newDevicePassword;

  preferences.putString(prefOwnerUid, ownerUid);
  preferences.putString(prefDeviceDocId, deviceDocId);
  preferences.putString(prefDeviceName, cloudDeviceName);
  preferences.putString(prefDeviceLocation, deviceLocation);
  preferences.putString(prefWifiSsid, runtimeWifiSsid);
  preferences.putString(prefWifiPassword, runtimeWifiPassword);
  preferences.putString(prefFirebaseApiKey, runtimeFirebaseApiKey);
  preferences.putString(prefFirebaseProjectId, runtimeFirebaseProjectId);
  preferences.putString(prefDeviceAuthEmail, runtimeDeviceAuthEmail);
  preferences.putString(prefDeviceAuthPassword, runtimeDeviceAuthPassword);
  preferences.putBool(prefPaired, true);

  pairingCompletedThisBoot = true;
  cloudServicesStarted = false;
  firebaseSessionStarted = false;
  cloudPresenceNeedsPatch = true;
  networkRuntimeReady = false;
  resetWifiReconnectBackoff();
  resetFirebaseAuthBackoff();
  setPairingStatusLed(true);

  Serial.println("[PAIRING] Pairing payload accepted from local AP API.");
  Serial.printf("[PAIRING] Device name: %s, location: %s\n", cloudDeviceName.c_str(), deviceLocation.c_str());
  Serial.printf("[PAIRING] Owner UID: %s, Device document ID: %s\n", ownerUid.c_str(), deviceDocId.c_str());
  Serial.printf("[PAIRING] Router Wi-Fi SSID saved: %s\n", runtimeWifiSsid.c_str());
  Serial.println("[PAIRING] Router Wi-Fi connection is now allowed because pairing completed this boot.");

  localPairingToken = "";

  FirebaseJson response;
  response.set("success", true);
  response.set("message", "Device paired successfully. ESP32 will reboot once.");
  sendLocalJson(200, response);
  Serial.println("Local API response sent: /api/pair-device");

  pairingGraceEndsAt = 0;
  schedulePairingReboot("Local AP pairing completed");
}

void handleLocalNotFoundApi() {
  Serial.printf(
    "Local API request: %s %s not found\n",
    pairingServer.method() == HTTP_GET ? "GET" : pairingServer.method() == HTTP_POST ? "POST" : "OTHER",
    pairingServer.uri().c_str()
  );
  sendLocalError(404, "ESP32 setup API route not found.");
}

void setupLocalPairingApi() {
  if (!pairingServerRoutesConfigured) {
    pairingServer.on("/", HTTP_OPTIONS, handleCorsOptions);
    pairingServer.on("/api/device-info", HTTP_OPTIONS, handleCorsOptions);
    pairingServer.on("/api/wifi-networks", HTTP_OPTIONS, handleCorsOptions);
    pairingServer.on("/api/verify-login", HTTP_OPTIONS, handleCorsOptions);
    pairingServer.on("/api/pair-device", HTTP_OPTIONS, handleCorsOptions);
    pairingServer.on("/", HTTP_GET, handlePairingRootApi);
    pairingServer.on("/api/device-info", HTTP_GET, handleDeviceInfoApi);
    pairingServer.on("/api/wifi-networks", HTTP_GET, handleWifiNetworksApi);
    pairingServer.on("/api/verify-login", HTTP_POST, handleVerifyLoginApi);
    pairingServer.on("/api/pair-device", HTTP_POST, handlePairDeviceApi);
    pairingServer.onNotFound(handleLocalNotFoundApi);
    pairingServerRoutesConfigured = true;
  }

  if (pairingServerStarted || !pairingApActive) return;

  pairingServer.begin();
  pairingServerStarted = true;
  Serial.println("Local pairing API listening on http://192.168.4.1");
}

void handleLocalPairingApi() {
  if (pairingServerStarted) {
    pairingServer.handleClient();
  }
}

void startPairingAccessPointIfNeeded() {
  if (pairingApActive) {
    return;
  }

  WiFi.mode(canConnectToRouterWifiThisBoot() ? WIFI_AP_STA : WIFI_AP);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);
  WiFi.setSleep(false);

  const IPAddress apIp(192, 168, 4, 1);
  WiFi.softAPConfig(apIp, apIp, IPAddress(255, 255, 255, 0));
  pairingApActive = WiFi.softAP(pairingSsid.c_str(), DEVICE_PAIR_PASSWORD);

  if (pairingApActive) {
    wifiManagerState = WIFI_MANAGER_AP_FALLBACK;
    setupLocalPairingApi();
    Serial.printf("[AP-PAIRING] Pairing Wi-Fi ready. SSID: %s, password: %s, IP: %s\n", pairingSsid.c_str(), DEVICE_PAIR_PASSWORD, WiFi.softAPIP().toString().c_str());
    Serial.println("[AP-PAIRING] Local setup API: http://192.168.4.1");
  } else {
    Serial.println("[AP-PAIRING] Pairing Wi-Fi failed to start.");
  }
}

void stopPairingAccessPointAfterRouterConnect() {
  if (!pairingApActive || !hasStoredPairing() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  WiFi.softAPdisconnect(true);
  pairingApActive = false;
  if (pairingServerStarted) {
    pairingServer.stop();
    pairingServerStarted = false;
  }
  WiFi.mode(WIFI_STA);
  setPairingStatusLed(true);
  Serial.println("[AP-PAIRING] Pairing Wi-Fi stopped. ESP32 is now connected to the router Wi-Fi.");
}

void addIdentityFields(FirebaseJson &response) {
  response.set("esp32Id", runtimeEsp32Id);
  response.set("deviceName", cloudDeviceName);
  response.set("mac", WiFi.macAddress());
  response.set("firmwareVersion", firmwareVersion);
  response.set(
    "paired",
    hasStoredPairing()
  );
}

bool getRequiredConfigString(
  FirebaseJson &command,
  const String &path,
  String &value,
  const char *responseType
) {
  if (!getJsonString(command, path, value) || value.length() == 0) {
    sendPairingError(responseType, String("Missing ") + path + ".");
    return false;
  }

  return true;
}

void handleIdentityCommand(FirebaseJson &command) {
  markPairingActivity();
  if (!pairingCredentialsMatch(command)) {
    sendPairingError("identity", "Incorrect ESP32 username or password.");
    return;
  }

  FirebaseJson response;
  response.set("type", "identity");
  response.set("ok", true);
  addIdentityFields(response);
  writeSerialJson(response);
}

void handleConfigureCommand(FirebaseJson &command) {
  markPairingActivity();
  if (!pairingCredentialsMatch(command)) {
    sendPairingError("configured", "Incorrect ESP32 username or password.");
    return;
  }

  String wifiSsid;
  String wifiPassword;
  String firebaseApiKey;
  String firebaseProjectId;
  String deviceAuthEmail;
  String deviceAuthPassword;
  String deviceName;

  if (!getRequiredConfigString(command, "wifiSsid", wifiSsid, "configured") ||
      !getRequiredConfigString(command, "wifiPassword", wifiPassword, "configured") ||
      !getRequiredConfigString(command, "firebaseApiKey", firebaseApiKey, "configured") ||
      !getRequiredConfigString(command, "firebaseProjectId", firebaseProjectId, "configured") ||
      !getRequiredConfigString(command, "deviceAuthEmail", deviceAuthEmail, "configured") ||
      !getRequiredConfigString(command, "deviceAuthPassword", deviceAuthPassword, "configured") ||
      !getRequiredConfigString(command, "deviceName", deviceName, "configured")) {
    return;
  }

  runtimeWifiSsid = wifiSsid;
  runtimeWifiPassword = wifiPassword;
  runtimeFirebaseApiKey = firebaseApiKey;
  runtimeFirebaseProjectId = firebaseProjectId;
  runtimeDeviceAuthEmail = deviceAuthEmail;
  runtimeDeviceAuthPassword = deviceAuthPassword;
  cloudDeviceName = deviceName;
  ownerUid = "";
  deviceDocId = "";

  preferences.putString(prefEsp32Id, runtimeEsp32Id);
  preferences.putString(prefWifiSsid, runtimeWifiSsid);
  preferences.putString(prefWifiPassword, runtimeWifiPassword);
  preferences.putString(prefFirebaseApiKey, runtimeFirebaseApiKey);
  preferences.putString(prefFirebaseProjectId, runtimeFirebaseProjectId);
  preferences.putString(prefDeviceAuthEmail, runtimeDeviceAuthEmail);
  preferences.putString(prefDeviceAuthPassword, runtimeDeviceAuthPassword);
  preferences.putString(prefDeviceName, cloudDeviceName);
  preferences.putBool(prefPaired, true);
  pairingCompletedThisBoot = true;
  cloudServicesStarted = false;
  firebaseSessionStarted = false;
  cloudPresenceNeedsPatch = true;
  networkRuntimeReady = false;
  resetWifiReconnectBackoff();
  resetFirebaseAuthBackoff();
  setPairingStatusLed(true);

  Serial.println("[PAIRING] Serial configure command accepted. Router Wi-Fi connection is now allowed for this boot.");

  FirebaseJson response;
  response.set("type", "configured");
  response.set("ok", true);
  addIdentityFields(response);
  writeSerialJson(response);

  schedulePairingReboot("Serial pairing configure command completed");
}

void processSerialPairingLine(String line) {
  line.trim();

  if (!line.startsWith("{")) {
    return;
  }

  FirebaseJson command;
  command.setJsonData(line);

  String type;
  if (!getJsonString(command, "type", type)) {
    return;
  }

  if (type == "identity") {
    handleIdentityCommand(command);
    return;
  }

  if (type == "configure") {
    handleConfigureCommand(command);
    return;
  }
}

void handleSerialPairing() {
  while (Serial.available() > 0) {
    const char nextChar = (char)Serial.read();

    if (nextChar == '\n') {
      processSerialPairingLine(serialInputBuffer);
      serialInputBuffer = "";
      continue;
    }

    if (nextChar == '\r') {
      continue;
    }

    if (serialInputBuffer.length() < 2048) {
      serialInputBuffer += nextChar;
    } else {
      serialInputBuffer = "";
    }
  }
}

void restartNetworkServices() {
  pendingNetworkRestart = false;
  cloudServicesStarted = false;
  firebaseSessionStarted = false;
  cloudPresenceNeedsPatch = true;
  networkRuntimeReady = false;
  resetWifiReconnectBackoff();
  resetFirebaseAuthBackoff();
  lastClaimCheckAt = 0;

  if (!canConnectToRouterWifiThisBoot()) {
    Serial.println("[NETWORK] Router Wi-Fi is not available yet. Starting isolated AP pairing fallback.");
    logApOnlyModeIfNeeded("No stored pairing is available.");
    startPairingAccessPointIfNeeded();
    return;
  }

  Serial.println("[NETWORK] Starting managed router Wi-Fi + Firebase services.");
  WiFi.disconnect(false, false);
  requestWifiReconnect(millis(), "network restart requested");
}

void servicePairingRebootTask(unsigned long now) {
  if (!pendingPairingReboot || now < pairingRebootAt) {
    return;
  }

  pendingPairingReboot = false;
  pairingRebootAt = 0;
  Serial.println("[PAIRING] Rebooting ESP32 now to apply the new pairing settings.");
  delay(100);
  ESP.restart();
}

void startCloudServicesIfReady() {
  const unsigned long now = millis();
  serviceWifiManager(now);
  serviceFirebaseManager(now);
}

void initializeNetworkRuntimeOnce() {
  if (networkRuntimeReady) {
    return;
  }

  configTime(gmtOffsetSeconds, daylightOffsetSeconds, ntpServer);
  sdReady = beginSdCard("network runtime init");
  offlineBacklogSyncPending = sdReady && SD.exists(offlineFilePath);
  networkRuntimeReady = true;

  Serial.printf(
    "[NETWORK] Runtime services initialized. SD=%s, NTP=%s\n",
    sdReady ? "READY" : "UNAVAILABLE",
    ntpServer
  );
}

void serviceRtcClock(unsigned long now) {
  if (!rtcReady) {
    return;
  }

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) {
    if (!rtcHasValidClock && setSystemClockFromRtc()) {
      Serial.println("[RTC] System clock restored from DS1302 while offline.");
    }
    return;
  }

  if (timeinfo.tm_year + 1900 < 2024) {
    return;
  }

  if (lastRtcSyncAt == 0 || now - lastRtcSyncAt >= RTC_SYNC_INTERVAL_MS) {
    if (syncRtcFromSystemClock()) {
      Serial.println("[RTC] DS1302 updated from current system/NTP time.");
    }
  }
}

void waitForSerialPairingWindow(unsigned long durationMs) {
  const unsigned long startedAt = millis();

  while (millis() - startedAt < durationMs && !pendingNetworkRestart) {
    handlePairingResetButton();
    handleSerialPairing();
    handleLocalPairingApi();
    updatePairingStatusLed(millis());
    delay(10);
  }
}

String uint64ToString(uint64_t value) {
  char buffer[24];
  snprintf(buffer, sizeof(buffer), "%llu", static_cast<unsigned long long>(value));
  return String(buffer);
}

bool ensureSdMounted() {
  if (sdReady) {
    return true;
  }

  sdReady = beginSdCard("telemetry patch");
  return sdReady;
}

void appendSdTelemetryFields(FirebaseJson &content) {
  content.set("fields/offlineLogsSynced/integerValue", uint64ToString(offlineLogsSyncedTotal));
  content.set("fields/lastOfflineSyncCount/integerValue", lastOfflineSyncCount);
  content.set("fields/lastOfflineSyncAt/stringValue", lastOfflineSyncAt);
  content.set("fields/lastOfflineSyncArchive/stringValue", lastOfflineSyncArchive);

  if (!ensureSdMounted()) {
    content.set("fields/sdCardAvailable/booleanValue", false);
    content.set("fields/sdCardTotalBytes/integerValue", "0");
    content.set("fields/sdCardUsedBytes/integerValue", "0");
    content.set("fields/sdCardFreeBytes/integerValue", "0");
    content.set("fields/sdCardUsagePercent/doubleValue", 0.0);
    return;
  }

  const uint64_t totalBytes = SD.cardSize();
  uint64_t usedBytes = SD.usedBytes();
  if (totalBytes > 0 && usedBytes > totalBytes) {
    usedBytes = totalBytes;
  }
  const uint64_t freeBytes = totalBytes > usedBytes ? totalBytes - usedBytes : 0;
  const double usagePercent =
    totalBytes > 0 ? (static_cast<double>(usedBytes) * 100.0) / static_cast<double>(totalBytes) : 0.0;

  content.set("fields/sdCardAvailable/booleanValue", true);
  content.set("fields/sdCardTotalBytes/integerValue", uint64ToString(totalBytes));
  content.set("fields/sdCardUsedBytes/integerValue", uint64ToString(usedBytes));
  content.set("fields/sdCardFreeBytes/integerValue", uint64ToString(freeBytes));
  content.set("fields/sdCardUsagePercent/doubleValue", usagePercent);
}

void appendScheduleStateFields(FirebaseJson &content) {
  content.set("fields/scheduleManualOverride/booleanValue", scheduleManualOverride);
  content.set(
    "fields/scheduleManualOverrideUntil/stringValue",
    scheduleManualOverride ? "next schedule boundary" : ""
  );
  content.set("fields/scheduleBudgetReached/booleanValue", scheduleBudgetReached);
  content.set("fields/lastScheduleAction/stringValue", lastScheduleAction);
  content.set("fields/lastScheduleActionAt/stringValue", lastScheduleActionAt);
}

bool patchDeviceState() {
  if (!claimReady()) return false;

  FirebaseJson content;
  content.set("fields/status/booleanValue", relayStatus);
  content.set("fields/relayState/booleanValue", relayStatus);
  content.set("fields/online/booleanValue", wifiReady());
  content.set("fields/protectionEnabled/booleanValue", protectionEnabled);
  content.set("fields/maxPowerLimit/doubleValue", maxPowerLimitW);
  content.set("fields/maxCurrentLimit/doubleValue", maxCurrentLimitA);
  content.set("fields/readingSource/stringValue", "esp32");
  appendSdTelemetryFields(content);
  appendScheduleStateFields(content);

  const String now = isoNow();
  content.set("fields/lastReadingAt/stringValue", now);
  content.set("fields/lastSyncedAt/stringValue", now);
  content.set("fields/updatedAt/stringValue", now);

  String updateMask =
    "status,relayState,online,protectionEnabled,maxPowerLimit,maxCurrentLimit,"
    "readingSource,lastReadingAt,lastSyncedAt,updatedAt,";
  updateMask += sdTelemetryUpdateMask;
  updateMask += ",";
  updateMask += scheduleStateUpdateMask;

  const bool patched = Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    devicePath().c_str(),
    content.raw(),
    updateMask.c_str()
  );

  if (patched) {
    lastDeviceStatePatchAt = millis();
  }

  return patched;
}

bool patchDeviceReadingState(const SensorReading &reading, int pendingOfflineLogs) {
  if (!claimReady()) return false;

  FirebaseJson content;
  content.set("fields/status/booleanValue", reading.relayStatus);
  content.set("fields/relayState/booleanValue", reading.relayStatus);
  content.set("fields/online/booleanValue", wifiReady());
  content.set("fields/power/doubleValue", reading.power);
  content.set("fields/voltage/doubleValue", reading.voltage);
  content.set("fields/current/doubleValue", reading.current);
  content.set("fields/powerFactor/doubleValue", reading.powerFactor);
  content.set("fields/energy/doubleValue", reading.energy);
  content.set("fields/wifiSignal/integerValue", reading.wifiSignal);
  content.set("fields/protectionEnabled/booleanValue", protectionEnabled);
  content.set("fields/maxPowerLimit/doubleValue", maxPowerLimitW);
  content.set("fields/maxCurrentLimit/doubleValue", maxCurrentLimitA);
  content.set("fields/readingSource/stringValue", "esp32");
  content.set("fields/pendingOfflineLogs/integerValue", pendingOfflineLogs);
  appendSdTelemetryFields(content);
  appendScheduleStateFields(content);

  const String now = isoNow();
  content.set("fields/lastReadingAt/stringValue", reading.timestamp);
  content.set("fields/lastSyncedAt/stringValue", now);
  content.set("fields/updatedAt/stringValue", now);

  String updateMask =
    "status,relayState,online,power,voltage,current,powerFactor,energy,wifiSignal,"
    "protectionEnabled,maxPowerLimit,maxCurrentLimit,readingSource,pendingOfflineLogs,"
    "lastReadingAt,lastSyncedAt,updatedAt,";
  updateMask += sdTelemetryUpdateMask;
  updateMask += ",";
  updateMask += scheduleStateUpdateMask;

  const bool patched = Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    devicePath().c_str(),
    content.raw(),
    updateMask.c_str()
  );

  if (patched) {
    lastDeviceStatePatchAt = millis();
  }

  return patched;
}

bool patchDeviceReadingCoreState(const SensorReading &reading) {
  if (!claimReady()) return false;

  FirebaseJson content;
  content.set("fields/status/booleanValue", reading.relayStatus);
  content.set("fields/relayState/booleanValue", reading.relayStatus);
  content.set("fields/online/booleanValue", wifiReady());
  content.set("fields/power/doubleValue", reading.power);
  content.set("fields/voltage/doubleValue", reading.voltage);
  content.set("fields/current/doubleValue", reading.current);
  content.set("fields/powerFactor/doubleValue", reading.powerFactor);
  content.set("fields/energy/doubleValue", reading.energy);
  content.set("fields/wifiSignal/integerValue", reading.wifiSignal);
  content.set("fields/readingSource/stringValue", "esp32");

  const String now = isoNow();
  content.set("fields/lastReadingAt/stringValue", reading.timestamp);
  content.set("fields/lastSyncedAt/stringValue", now);
  content.set("fields/updatedAt/stringValue", now);

  const bool patched = Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    devicePath().c_str(),
    content.raw(),
    "status,relayState,online,power,voltage,current,powerFactor,energy,wifiSignal,readingSource,lastReadingAt,lastSyncedAt,updatedAt"
  );

  if (patched) {
    lastDeviceStatePatchAt = millis();
  }

  return patched;
}

bool patchDeviceReadingStateWithFallback(
  const SensorReading &reading,
  int pendingOfflineLogs
) {
  if (patchDeviceReadingState(reading, pendingOfflineLogs)) {
    return true;
  }

  const String fullError = fbdo.errorReason();
  Serial.printf(
    "[FIREBASE] Full reading-state patch failed: %s\n",
    fullError.c_str()
  );

  if (patchDeviceReadingCoreState(reading)) {
    Serial.println(
      "[FIREBASE] Core reading-state fallback succeeded without extended protection/offline fields."
    );
    return true;
  }

  const String coreError = fbdo.errorReason();
  Serial.printf(
    "[FIREBASE] Core reading-state fallback failed: %s\n",
    coreError.c_str()
  );

  if (patchDeviceState()) {
    Serial.println(
      "[FIREBASE] Presence fallback succeeded. Device will stay online in the app while reading diagnostics continue."
    );
    return true;
  }

  Serial.printf(
    "[FIREBASE] Presence fallback also failed: %s\n",
    fbdo.errorReason().c_str()
  );
  return false;
}

void patchCloudPresenceHeartbeatIfDue(unsigned long now, const char *reason) {
  if (!firebaseReady() || !ensureClaimReady()) {
    return;
  }

  if (
    lastDeviceStatePatchAt > 0 &&
    now - lastDeviceStatePatchAt < CLOUD_PRESENCE_HEARTBEAT_MS
  ) {
    return;
  }

  if (patchDeviceState()) {
    Serial.printf("[FIREBASE] Cloud presence heartbeat patched (%s).\n", reason);
    return;
  }

  Serial.printf(
    "[FIREBASE] Cloud presence heartbeat failed (%s): %s\n",
    reason,
    fbdo.errorReason().c_str()
  );
}

bool updateCommandStatus(const String &commandPath, const char *status, const String &error = "") {
  FirebaseJson content;
  content.set("fields/status/stringValue", status);
  content.set("fields/acknowledgedAt/stringValue", isoNow());

  String updateMask = "status,acknowledgedAt";

  if (error.length() > 0) {
    content.set("fields/error/stringValue", error);
    updateMask += ",error";
  }

  return Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    commandPath.c_str(),
    content.raw(),
    updateMask.c_str()
  );
}

bool resolveDeviceClaim() {
  if (!firebaseReady()) return false;

  String mask = "uid,deviceId,deviceName";

  if (!Firebase.Firestore.getDocument(
        &fbdo,
        runtimeFirebaseProjectId.c_str(),
        "",
        claimPath().c_str(),
        mask.c_str()
      )) {
    Serial.printf("Device claim not ready: %s\n", fbdo.errorReason().c_str());
    return false;
  }

  FirebaseJson claim;
  claim.setJsonData(fbdo.payload());

  String nextOwnerUid;
  String nextDeviceDocId;
  String nextDeviceName;

  if (!getJsonString(claim, "fields/uid/stringValue", nextOwnerUid) ||
      !getJsonString(claim, "fields/deviceId/stringValue", nextDeviceDocId)) {
    Serial.println("Device claim is missing uid or deviceId.");
    return false;
  }

  if (getJsonString(claim, "fields/deviceName/stringValue", nextDeviceName) &&
      nextDeviceName.length() > 0) {
    cloudDeviceName = nextDeviceName;
  }

  ownerUid = nextOwnerUid;
  deviceDocId = nextDeviceDocId;
  Serial.printf("Claim loaded. Owner UID: %s, Device ID: %s\n", ownerUid.c_str(), deviceDocId.c_str());
  return true;
}

bool getFirestoreNumberField(
  FirebaseJson &json,
  const String &fieldName,
  float &value
) {
  if (getJsonFloat(json, String("fields/") + fieldName + "/doubleValue", value)) {
    return true;
  }

  return getJsonFloat(json, String("fields/") + fieldName + "/integerValue", value);
}

bool loadCloudScheduleConfig() {
  if (!firebaseReady() || !claimReady()) {
    return false;
  }

  const char *mask =
    "scheduleEnabled,scheduleMode,scheduleStartTime,scheduleEndTime,"
    "budgetLimit,scheduleBudgetLimit,scheduleBudgetKwhLimit,scheduleElectricityRate";

  if (!Firebase.Firestore.getDocument(
        &fbdo,
        runtimeFirebaseProjectId.c_str(),
        "",
        devicePath().c_str(),
        mask
      )) {
    Serial.printf("[SCHEDULE] Cloud schedule refresh failed: %s\n", fbdo.errorReason().c_str());
    return false;
  }

  FirebaseJson device;
  device.setJsonData(fbdo.payload());

  bool nextScheduleEnabled = scheduleEnabled;
  String nextScheduleMode = scheduleMode;
  String nextScheduleStartTime = scheduleStartTime;
  String nextScheduleEndTime = scheduleEndTime;
  float nextBudgetLimitPhp = scheduleBudgetLimitPhp;
  float nextBudgetLimitKwh = scheduleBudgetLimitKwh;
  float nextElectricityRate = scheduleElectricityRate;

  getJsonBool(device, "fields/scheduleEnabled/booleanValue", nextScheduleEnabled);
  getJsonString(device, "fields/scheduleMode/stringValue", nextScheduleMode);
  getJsonString(device, "fields/scheduleStartTime/stringValue", nextScheduleStartTime);
  getJsonString(device, "fields/scheduleEndTime/stringValue", nextScheduleEndTime);
  if (!getFirestoreNumberField(device, "scheduleBudgetLimit", nextBudgetLimitPhp)) {
    getFirestoreNumberField(device, "budgetLimit", nextBudgetLimitPhp);
  }
  getFirestoreNumberField(device, "scheduleBudgetKwhLimit", nextBudgetLimitKwh);
  getFirestoreNumberField(device, "scheduleElectricityRate", nextElectricityRate);

  applyScheduleConfig(
    nextScheduleEnabled,
    nextScheduleMode,
    nextScheduleStartTime,
    nextScheduleEndTime,
    nextBudgetLimitPhp,
    nextBudgetLimitKwh,
    nextElectricityRate
  );
  return true;
}

bool ensureClaimReady() {
  if (claimReady()) return true;

  if (millis() - lastClaimCheckAt < 5000) {
    return false;
  }

  lastClaimCheckAt = millis();
  return resolveDeviceClaim();
}

void applyPendingCommand(FirebaseJson &result) {
  String documentName;

  if (!getJsonString(result, "document/name", documentName)) {
    return;
  }

  const String commandPath = documentPathFromName(documentName);
  const String commandId = documentIdFromPath(commandPath);

  String commandType;
  if (!getJsonString(result, "document/fields/type/stringValue", commandType)) {
    updateCommandStatus(commandPath, "failed", "Missing command type.");
    return;
  }

  if (commandType == "relay") {
    bool nextRelayStatus = relayStatus;

    if (!getJsonBool(
          result,
          "document/fields/payload/mapValue/fields/relayStatus/booleanValue",
          nextRelayStatus
        )) {
      updateCommandStatus(commandPath, "failed", "Missing relayStatus payload.");
      return;
    }

    String reason = "manual";
    getJsonString(
      result,
      "document/fields/payload/mapValue/fields/reason/stringValue",
      reason
    );

    setRelay(nextRelayStatus);
    if (reason == "manual") {
      activateScheduleManualOverride();
    }
    patchDeviceState();
    updateCommandStatus(commandPath, "acknowledged");
    Serial.printf("Applied relay command %s: %s\n", commandId.c_str(), nextRelayStatus ? "ON" : "OFF");
    return;
  }

  if (commandType == "protection") {
    bool nextProtectionEnabled = protectionEnabled;
    float nextMaxPowerW = maxPowerLimitW;
    float nextMaxCurrentA = maxCurrentLimitA;

    getJsonBool(
      result,
      "document/fields/payload/mapValue/fields/protectionEnabled/booleanValue",
      nextProtectionEnabled
    );
    if (!getJsonFloat(
          result,
          "document/fields/payload/mapValue/fields/maxPowerW/doubleValue",
          nextMaxPowerW
        )) {
      getJsonFloat(
        result,
        "document/fields/payload/mapValue/fields/maxPowerW/integerValue",
        nextMaxPowerW
      );
    }
    if (!getJsonFloat(
          result,
          "document/fields/payload/mapValue/fields/maxCurrentA/doubleValue",
          nextMaxCurrentA
        )) {
      getJsonFloat(
        result,
        "document/fields/payload/mapValue/fields/maxCurrentA/integerValue",
        nextMaxCurrentA
      );
    }

    setProtection(
      nextProtectionEnabled,
      nextMaxPowerW,
      nextMaxCurrentA
    );
    patchDeviceState();
    updateCommandStatus(commandPath, "acknowledged");
    Serial.printf("Applied protection command %s\n", commandId.c_str());
    return;
  }

  if (commandType == "schedule") {
    bool nextScheduleEnabled = scheduleEnabled;
    String nextScheduleMode = scheduleMode;
    String nextScheduleStartTime = scheduleStartTime;
    String nextScheduleEndTime = scheduleEndTime;
    float nextBudgetLimitPhp = scheduleBudgetLimitPhp;
    float nextBudgetLimitKwh = scheduleBudgetLimitKwh;
    float nextElectricityRate = scheduleElectricityRate;

    getJsonBool(
      result,
      "document/fields/payload/mapValue/fields/scheduleEnabled/booleanValue",
      nextScheduleEnabled
    );
    getJsonString(
      result,
      "document/fields/payload/mapValue/fields/scheduleMode/stringValue",
      nextScheduleMode
    );
    getJsonString(
      result,
      "document/fields/payload/mapValue/fields/scheduleStartTime/stringValue",
      nextScheduleStartTime
    );
    getJsonString(
      result,
      "document/fields/payload/mapValue/fields/scheduleEndTime/stringValue",
      nextScheduleEndTime
    );
    if (!getJsonFloat(
          result,
          "document/fields/payload/mapValue/fields/scheduleBudgetLimit/doubleValue",
          nextBudgetLimitPhp
        )) {
      if (!getJsonFloat(
            result,
            "document/fields/payload/mapValue/fields/scheduleBudgetLimit/integerValue",
            nextBudgetLimitPhp
          )) {
        if (!getJsonFloat(
              result,
              "document/fields/payload/mapValue/fields/budgetLimit/doubleValue",
              nextBudgetLimitPhp
            )) {
          getJsonFloat(
            result,
            "document/fields/payload/mapValue/fields/budgetLimit/integerValue",
            nextBudgetLimitPhp
          );
        }
      }
    }
    if (!getJsonFloat(
          result,
          "document/fields/payload/mapValue/fields/scheduleBudgetKwhLimit/doubleValue",
          nextBudgetLimitKwh
        )) {
      getJsonFloat(
        result,
        "document/fields/payload/mapValue/fields/scheduleBudgetKwhLimit/integerValue",
        nextBudgetLimitKwh
      );
    }
    if (!getJsonFloat(
          result,
          "document/fields/payload/mapValue/fields/scheduleElectricityRate/doubleValue",
          nextElectricityRate
        )) {
      getJsonFloat(
        result,
        "document/fields/payload/mapValue/fields/scheduleElectricityRate/integerValue",
        nextElectricityRate
      );
    }

    applyScheduleConfig(
      nextScheduleEnabled,
      nextScheduleMode,
      nextScheduleStartTime,
      nextScheduleEndTime,
      nextBudgetLimitPhp,
      nextBudgetLimitKwh,
      nextElectricityRate
    );
    patchDeviceState();
    updateCommandStatus(commandPath, "acknowledged");
    Serial.printf("Applied schedule command %s\n", commandId.c_str());
    return;
  }

  if (commandType == "format_sd") {
    bool confirmed = false;

    if (!getJsonBool(
          result,
          "document/fields/payload/mapValue/fields/confirm/booleanValue",
          confirmed
        ) || !confirmed) {
      updateCommandStatus(commandPath, "failed", "Missing format confirmation payload.");
      return;
    }

    if (!formatSdCardData()) {
      updateCommandStatus(commandPath, "failed", "SD card format failed.");
      return;
    }

    updateCommandStatus(commandPath, "acknowledged");
    Serial.printf("Applied SD card cleanup command %s\n", commandId.c_str());
    return;
  }

  updateCommandStatus(commandPath, "failed", String("Unsupported command type: ") + commandType);
}

void appendOfflineReading(const SensorReading &reading) {
  if (!beginSdCard("offline append")) return;

  File file = SD.open(offlineFilePath, FILE_APPEND);
  if (!file) return;

  FirebaseJson json;
  json.set("id", reading.id);
  json.set("deviceId", claimReady() ? deviceDocId : runtimeEsp32Id);
  json.set("deviceName", cloudDeviceName);
  json.set("timestamp", reading.timestamp);
  json.set("voltage", reading.voltage);
  json.set("current", reading.current);
  json.set("power", reading.power);
  json.set("powerFactor", reading.powerFactor);
  json.set("energy", reading.energy);
  json.set("energyDelta", reading.energyDelta);
  json.set("relayStatus", reading.relayStatus);

  String line;
  json.toString(line, false);
  file.println(line);
  file.close();
  offlineBacklogSyncPending = true;
}

int countOfflineReadingsOnSd() {
  if (!beginSdCard("offline count") || !SD.exists(offlineFilePath)) {
    return 0;
  }

  File file = SD.open(offlineFilePath, FILE_READ);
  if (!file) {
    return 0;
  }

  int count = 0;

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      count++;
    }
  }

  file.close();
  return count;
}

bool patchPendingOfflineLogsState(int pendingOfflineLogs) {
  if (!claimReady()) return false;

  FirebaseJson content;
  content.set("fields/online/booleanValue", wifiReady());
  content.set("fields/pendingOfflineLogs/integerValue", pendingOfflineLogs);
  appendSdTelemetryFields(content);

  const String now = isoNow();
  content.set("fields/lastSyncedAt/stringValue", now);
  content.set("fields/updatedAt/stringValue", now);

  String updateMask = "online,pendingOfflineLogs,lastSyncedAt,updatedAt,";
  updateMask += sdTelemetryUpdateMask;

  return Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    devicePath().c_str(),
    content.raw(),
    updateMask.c_str()
  );
}

bool patchSdFormatState(
  const char *status,
  int progress,
  const String &message,
  bool includeLastFormattedAt = false
) {
  if (!claimReady()) return false;

  const int normalizedProgress = max(0, min(100, progress));
  FirebaseJson content;
  content.set("fields/sdFormatStatus/stringValue", status);
  content.set("fields/sdFormatProgress/integerValue", normalizedProgress);
  content.set("fields/sdFormatMessage/stringValue", message);

  const String now = isoNow();
  content.set("fields/sdFormatUpdatedAt/stringValue", now);
  content.set("fields/updatedAt/stringValue", now);

  String updateMask =
    "sdFormatStatus,sdFormatProgress,sdFormatMessage,sdFormatUpdatedAt,updatedAt";

  if (includeLastFormattedAt) {
    content.set("fields/lastSdFormatAt/stringValue", now);
    updateMask += ",lastSdFormatAt";
  }

  return Firebase.Firestore.patchDocument(
    &fbdo,
    runtimeFirebaseProjectId.c_str(),
    "",
    devicePath().c_str(),
    content.raw(),
    updateMask.c_str()
  );
}

int countSdEntriesRecursive(const String &path) {
  File entry = SD.open(path.c_str(), FILE_READ);

  if (!entry) {
    return 0;
  }

  if (!entry.isDirectory()) {
    entry.close();
    return 1;
  }

  int count = path == "/" ? 0 : 1;
  File child = entry.openNextFile();

  while (child) {
    const String childPath = child.path();
    child.close();
    count += countSdEntriesRecursive(childPath);
    child = entry.openNextFile();
  }

  entry.close();
  return count;
}

void maybeReportSdFormatProgress(
  int processedEntries,
  int totalEntries,
  int &lastReportedProgress
) {
  if (totalEntries <= 0) {
    if (lastReportedProgress < 90) {
      lastReportedProgress = 90;
      patchSdFormatState("formatting", 90, "Finalizing SD card cleanup...");
    }
    return;
  }

  const int computedProgress =
    max(15, min(95, 15 + (processedEntries * 75) / totalEntries));

  if (computedProgress <= lastReportedProgress &&
      processedEntries < totalEntries) {
    return;
  }

  lastReportedProgress = computedProgress;
  patchSdFormatState(
    "formatting",
    computedProgress,
    String("Deleting SD card data... ") + String(processedEntries) + "/" +
      String(totalEntries)
  );
}

bool deleteSdPathRecursive(
  const String &path,
  int totalEntries,
  int &processedEntries,
  int &lastReportedProgress
) {
  File entry = SD.open(path.c_str(), FILE_READ);

  if (!entry) {
    return !SD.exists(path.c_str());
  }

  if (!entry.isDirectory()) {
    entry.close();
    const bool removed = SD.remove(path.c_str());

    if (removed) {
      processedEntries++;
      maybeReportSdFormatProgress(
        processedEntries,
        totalEntries,
        lastReportedProgress
      );
    }

    return removed;
  }

  File child = entry.openNextFile();

  while (child) {
    const bool childIsDirectory = child.isDirectory();
    const String childPath = child.path();
    child.close();

    const bool removed = childIsDirectory
      ? deleteSdPathRecursive(
          childPath,
          totalEntries,
          processedEntries,
          lastReportedProgress
        )
      : SD.remove(childPath.c_str());

    if (!removed) {
      entry.close();
      return false;
    }

    if (!childIsDirectory) {
      processedEntries++;
      maybeReportSdFormatProgress(
        processedEntries,
        totalEntries,
        lastReportedProgress
      );
    }

    child = entry.openNextFile();
  }

  entry.close();

  if (path == "/") {
    return true;
  }

  const bool removed = SD.rmdir(path.c_str());

  if (removed) {
    processedEntries++;
    maybeReportSdFormatProgress(
      processedEntries,
      totalEntries,
      lastReportedProgress
    );
  }

  return removed;
}

bool formatSdCardData() {
  patchSdFormatState("formatting", 10, "Mounting SD card...");

  if (!beginSdCard("SD cleanup")) {
    sdReady = false;
    Serial.println("[SD] Format failed: SD card mount failed.");
    patchSdFormatState("failed", 0, "SD card mount failed.");
    return false;
  }

  sdReady = true;

  patchSdFormatState("formatting", 30, "Scanning EnerTrack SD data...");
  int totalEntries = 0;
  if (SD.exists(offlineFilePath)) {
    totalEntries += countSdEntriesRecursive(offlineFilePath);
  }
  if (SD.exists(offlineArchiveDir)) {
    totalEntries += countSdEntriesRecursive(offlineArchiveDir);
  }
  int processedEntries = 0;
  int lastReportedProgress = 30;

  if (totalEntries == 0) {
    patchSdFormatState("formatting", 95, "EnerTrack SD data is already clear.");
  }

  if (SD.exists(offlineFilePath) &&
      !deleteSdPathRecursive(
        offlineFilePath,
        totalEntries,
        processedEntries,
        lastReportedProgress
      )) {
    Serial.println("[SD] Format failed: unable to delete offline backlog file.");
    patchSdFormatState("failed", lastReportedProgress, "Unable to delete the offline backlog file.");
    return false;
  }

  if (SD.exists(offlineArchiveDir) &&
      !deleteSdPathRecursive(
        offlineArchiveDir,
        totalEntries,
        processedEntries,
        lastReportedProgress
      )) {
    Serial.println("[SD] Format failed: unable to delete offline archive directory.");
    patchSdFormatState("failed", lastReportedProgress, "Unable to delete the offline archive directory.");
    return false;
  }

  Serial.println("[SD] Format complete: EnerTrack SD data cleared.");
  offlineBacklogSyncPending = false;
  lastOfflineSyncCount = 0;
  lastOfflineSyncAt = "";
  lastOfflineSyncArchive = "";
  patchPendingOfflineLogsState(0);
  patchSdFormatState("completed", 100, "EnerTrack SD data cleared.", true);
  return true;
}

String sanitizeOfflineIdPart(String value) {
  value.replace("-", "");
  value.replace(":", "");
  value.replace("+", "");
  value.replace(".", "");
  value.replace("/", "");
  return value;
}

String buildOfflineBatchId(const String &startedAt, int chunkIndex) {
  return String("offline-") + runtimeEsp32Id + "-" +
         sanitizeOfflineIdPart(startedAt) + "-" + String(chunkIndex);
}

bool ensureOfflineArchiveDir() {
  if (SD.exists(offlineArchiveDir)) {
    return true;
  }

  return SD.mkdir(offlineArchiveDir);
}

String buildOfflineArchivePath(int syncedCount) {
  String timestamp = sanitizeOfflineIdPart(isoNow());
  if (timestamp.length() == 0) {
    timestamp = String(millis());
  }

  return String(offlineArchiveDir) + "/offline-" + runtimeEsp32Id + "-" +
         timestamp + "-" + String(millis()) + "-" + String(syncedCount) + ".jsonl";
}

bool copySdFile(const String &sourcePath, const String &targetPath) {
  File source = SD.open(sourcePath.c_str(), FILE_READ);
  if (!source) {
    return false;
  }

  if (SD.exists(targetPath.c_str())) {
    SD.remove(targetPath.c_str());
  }

  File target = SD.open(targetPath.c_str(), FILE_WRITE);
  if (!target) {
    source.close();
    return false;
  }

  uint8_t buffer[512];
  bool copied = true;

  while (source.available()) {
    const int bytesRead = source.read(buffer, sizeof(buffer));
    if (bytesRead <= 0) {
      copied = false;
      break;
    }

    if (target.write(buffer, bytesRead) != static_cast<size_t>(bytesRead)) {
      copied = false;
      break;
    }
  }

  target.close();
  source.close();

  if (!copied) {
    SD.remove(targetPath.c_str());
  }

  return copied;
}

bool archiveOfflineBacklogFile(int syncedCount, String &archivePath) {
  if (!SD.exists(offlineFilePath)) {
    return false;
  }

  if (!ensureOfflineArchiveDir()) {
    Serial.println("[OFFLINE] Could not create SD archive directory.");
    return false;
  }

  archivePath = buildOfflineArchivePath(syncedCount);

  if (SD.rename(offlineFilePath, archivePath.c_str())) {
    return true;
  }

  Serial.println("[OFFLINE] SD rename failed, trying copy/remove archive fallback.");

  if (!copySdFile(offlineFilePath, archivePath)) {
    Serial.println("[OFFLINE] SD archive copy failed.");
    return false;
  }

  if (!SD.remove(offlineFilePath)) {
    Serial.println("[OFFLINE] SD archive copied, but active backlog could not be removed.");
    SD.remove(archivePath.c_str());
    return false;
  }

  return true;
}

void recordOfflineSyncCompleted(int syncedCount, const String &archivePath) {
  const uint32_t increment = syncedCount > 0
    ? static_cast<uint32_t>(syncedCount)
    : 0;

  if (UINT32_MAX - offlineLogsSyncedTotal < increment) {
    offlineLogsSyncedTotal = UINT32_MAX;
  } else {
    offlineLogsSyncedTotal += increment;
  }

  preferences.putUInt(prefOfflineLogsSynced, offlineLogsSyncedTotal);
  lastOfflineSyncCount = syncedCount;
  lastOfflineSyncAt = isoNow();
  lastOfflineSyncArchive = archivePath;
}

bool firestoreErrorAlreadyExists() {
  String reason = fbdo.errorReason();
  reason.toLowerCase();
  return reason.indexOf("already exists") >= 0 ||
         reason.indexOf("already_exists") >= 0 ||
         reason.indexOf("409") >= 0;
}

bool createFirestoreDocumentAllowExists(const String &path, FirebaseJson &json) {
  if (Firebase.Firestore.createDocument(
        &fbdo,
        runtimeFirebaseProjectId.c_str(),
        "",
        path.c_str(),
        json.raw()
      )) {
    return true;
  }

  return firestoreErrorAlreadyExists();
}

bool parseOfflineReadingLine(const String &line, SensorReading &reading) {
  FirebaseJson json;
  json.setJsonData(line);

  if (!getJsonString(json, "id", reading.id) ||
      !getJsonString(json, "timestamp", reading.timestamp) ||
      !getJsonFloat(json, "voltage", reading.voltage) ||
      !getJsonFloat(json, "current", reading.current) ||
      !getJsonFloat(json, "power", reading.power) ||
      !getJsonFloat(json, "powerFactor", reading.powerFactor) ||
      !getJsonFloat(json, "energy", reading.energy)) {
    return false;
  }

  reading.energyDelta = 0.0;
  reading.relayStatus = false;
  reading.wifiSignal = WiFi.RSSI();

  getJsonFloat(json, "energyDelta", reading.energyDelta);
  getJsonBool(json, "relayStatus", reading.relayStatus);
  return true;
}

void appendOfflineReadingValue(
  FirebaseJsonArray &values,
  const SensorReading &reading,
  const String &batchId
) {
  FirebaseJson value;
  value.set("mapValue/fields/id/stringValue", reading.id);
  value.set("mapValue/fields/deviceId/stringValue", deviceDocId);
  value.set("mapValue/fields/batchId/stringValue", batchId);
  value.set("mapValue/fields/timestamp/stringValue", reading.timestamp);
  value.set("mapValue/fields/voltage/doubleValue", reading.voltage);
  value.set("mapValue/fields/current/doubleValue", reading.current);
  value.set("mapValue/fields/power/doubleValue", reading.power);
  value.set("mapValue/fields/powerFactor/doubleValue", reading.powerFactor);
  value.set("mapValue/fields/energy/doubleValue", reading.energy);
  value.set("mapValue/fields/energyDelta/doubleValue", reading.energyDelta);
  value.set("mapValue/fields/relayStatus/booleanValue", reading.relayStatus);
  values.add(value);
}

bool uploadOfflineBatchChunk(
  const String &batchId,
  FirebaseJsonArray &readings,
  int entries,
  float totalEnergy,
  const String &startedAt,
  const String &endedAt
) {
  if (entries <= 0 || !claimReady()) {
    return false;
  }

  const String path = offlineBatchesPath() + "/" + batchId;

  FirebaseJson json;
  json.set("fields/id/stringValue", batchId);
  json.set("fields/deviceId/stringValue", deviceDocId);
  json.set("fields/deviceName/stringValue", cloudDeviceName);
  json.set("fields/status/stringValue", "synced");
  json.set("fields/startedAt/stringValue", startedAt);
  json.set("fields/endedAt/stringValue", endedAt);
  json.set("fields/syncedAt/stringValue", isoNow());
  json.set("fields/entries/integerValue", entries);
  json.set("fields/totalEnergy/doubleValue", totalEnergy);
  json.set("fields/readings/arrayValue/values", readings);

  return createFirestoreDocumentAllowExists(path, json);
}

void syncOfflineFile(const SensorReading &latestReading) {
  if (!firebaseReady() || !ensureClaimReady()) {
    return;
  }

  if (!beginSdCard("offline sync")) {
    patchDeviceReadingStateWithFallback(latestReading, 0);
    return;
  }

  const int totalPendingLogs = countOfflineReadingsOnSd();
  offlineBacklogSyncPending = totalPendingLogs > 0;
  if (totalPendingLogs <= 0) {
    if (SD.exists(offlineFilePath)) {
      SD.remove(offlineFilePath);
    }
    offlineBacklogSyncPending = false;
    patchDeviceReadingStateWithFallback(latestReading, 0);
    return;
  }

  if (!SD.exists(offlineFilePath)) {
    offlineBacklogSyncPending = false;
    patchDeviceReadingStateWithFallback(latestReading, 0);
    return;
  }

  File file = SD.open(offlineFilePath, FILE_READ);
  if (!file) return;

  int remainingPendingLogs = totalPendingLogs;
  int chunkIndex = 0;
  int uploadedEntries = 0;
  bool allUploaded = true;

  while (file.available()) {
    FirebaseJsonArray readings;
    int chunkEntries = 0;
    float chunkTotalEnergy = 0.0;
    String startedAt = "";
    String endedAt = "";
    String batchId = "";

    while (file.available() && chunkEntries < OFFLINE_SYNC_BATCH_SIZE) {
      String line = file.readStringUntil('\n');
      line.trim();
      if (!line.length()) continue;

      SensorReading offlineReading;
      if (!parseOfflineReadingLine(line, offlineReading)) {
        Serial.println("[OFFLINE] Skipping unreadable offline log line.");
        if (remainingPendingLogs > 0) {
          remainingPendingLogs--;
        }
        continue;
      }

      if (chunkEntries == 0) {
        startedAt = offlineReading.timestamp;
        batchId = buildOfflineBatchId(startedAt, chunkIndex);
      }

      endedAt = offlineReading.timestamp;
      chunkTotalEnergy += offlineReading.energyDelta;
      appendOfflineReadingValue(readings, offlineReading, batchId);
      chunkEntries++;
    }

    if (chunkEntries == 0) {
      continue;
    }

    if (!uploadOfflineBatchChunk(
          batchId,
          readings,
          chunkEntries,
          chunkTotalEnergy,
          startedAt,
          endedAt
        )) {
      Serial.printf(
        "[OFFLINE] Batch upload failed for %s: %s\n",
        batchId.c_str(),
        fbdo.errorReason().c_str()
      );
      allUploaded = false;
      break;
    }

    remainingPendingLogs -= chunkEntries;
    uploadedEntries += chunkEntries;
    if (remainingPendingLogs < 0) {
      remainingPendingLogs = 0;
    }

    patchDeviceReadingStateWithFallback(latestReading, remainingPendingLogs);
    chunkIndex++;
  }

  file.close();

  if (!allUploaded) {
    offlineBacklogSyncPending = remainingPendingLogs > 0;
    patchDeviceReadingStateWithFallback(latestReading, remainingPendingLogs);
    return;
  }

  String archivePath = "";
  if (!archiveOfflineBacklogFile(uploadedEntries, archivePath)) {
    Serial.println("[OFFLINE] All batches uploaded, but SD archive failed. Active file will stay pending.");
    offlineBacklogSyncPending = true;
    patchDeviceReadingStateWithFallback(latestReading, totalPendingLogs);
    return;
  }

  recordOfflineSyncCompleted(uploadedEntries, archivePath);
  offlineBacklogSyncPending = false;
  Serial.printf(
    "[OFFLINE] Archived %d synced offline log%s to %s\n",
    uploadedEntries,
    uploadedEntries == 1 ? "" : "s",
    archivePath.c_str()
  );

  patchDeviceReadingStateWithFallback(latestReading, 0);
}

void pollCommands() {
  if (!firebaseReady() || !ensureClaimReady()) return;

  FirebaseJson query;
  query.set("from/collectionId", "commands");
  query.set("from/allDescendants", false);
  query.set("where/fieldFilter/field/fieldPath", "status");
  query.set("where/fieldFilter/op", "EQUAL");
  query.set("where/fieldFilter/value/stringValue", "pending");
  query.set("limit", 5);

  if (!Firebase.Firestore.runQuery(
        &fbdo,
        runtimeFirebaseProjectId.c_str(),
        "",
        devicePath().c_str(),
        &query
      )) {
    Serial.printf("Command query failed: %s\n", fbdo.errorReason().c_str());
    return;
  }

  FirebaseJsonArray results;
  FirebaseJsonData resultData;
  results.setJsonArrayData(fbdo.payload());

  for (size_t i = 0; i < results.size(); i++) {
    results.get(resultData, i);

    if (!resultData.success || resultData.type != "object") {
      continue;
    }

    FirebaseJson result;
    resultData.get<FirebaseJson>(result);
    applyPendingCommand(result);
  }
}

void runScheduleTask(unsigned long now) {
  if (now - lastScheduleEvaluateAt < SCHEDULE_EVALUATE_MS) {
    return;
  }

  lastScheduleEvaluateAt = now;

  if (!scheduleEnabled) {
    if (scheduleManualOverride || scheduleBudgetReached) {
      scheduleManualOverride = false;
      scheduleBudgetReached = false;
      if (firebaseReady() && ensureClaimReady()) {
        patchDeviceState();
      }
    }
    return;
  }

  const bool usesTime = scheduleUsesTime();
  const bool usesBudget = scheduleUsesBudget();
  bool timeWindowActive = true;
  bool hasTimeState = true;

  if (usesTime) {
    hasTimeState = scheduleTimeWindowActive(timeWindowActive);
    if (!hasTimeState) {
      timeWindowActive = false;
    }
  }

  const float budgetKwhLimit = activeBudgetKwhLimit();
  const bool budgetReachedNow =
    usesBudget &&
    budgetKwhLimit > 0.0f &&
    totalEnergyKwh >= budgetKwhLimit;

  if (budgetReachedNow) {
    const bool budgetStateChanged = !scheduleBudgetReached;
    scheduleBudgetReached = true;
    scheduleManualOverride = false;

    if (relayStatus) {
      setRelay(false);
      recordScheduleAction("budget_off");
      Serial.printf(
        "[SCHEDULE] Budget reached. Relay OFF. energy=%.4f kWh limit=%.4f kWh\n",
        totalEnergyKwh,
        budgetKwhLimit
      );
      if (firebaseReady() && ensureClaimReady()) {
        patchDeviceState();
      }
    } else if (budgetStateChanged && firebaseReady() && ensureClaimReady()) {
      recordScheduleAction("budget_off");
      patchDeviceState();
    }
    return;
  }

  if (scheduleBudgetReached && !budgetReachedNow) {
    scheduleBudgetReached = false;
    if (firebaseReady() && ensureClaimReady()) {
      patchDeviceState();
    }
  }

  if (!usesTime || !hasTimeState) {
    return;
  }

  clearScheduleManualOverrideIfBoundaryChanged(timeWindowActive);

  if (scheduleManualOverride) {
    return;
  }

  const bool desiredRelayState = timeWindowActive;
  if (relayStatus == desiredRelayState) {
    return;
  }

  setRelay(desiredRelayState);
  recordScheduleAction(desiredRelayState ? "scheduled_on" : "scheduled_off");
  Serial.printf(
    "[SCHEDULE] Time window %s. Relay %s.\n",
    timeWindowActive ? "active" : "inactive",
    desiredRelayState ? "ON" : "OFF"
  );

  if (firebaseReady() && ensureClaimReady()) {
    patchDeviceState();
  }
}

void enforceProtection(SensorReading &reading) {
  if (!protectionEnabled) {
    return;
  }

  if (!relayStatus) {
    return;
  }

  const bool overCurrent =
    maxCurrentLimitA > 0.0f && reading.current > maxCurrentLimitA;
  const bool overPower =
    maxPowerLimitW > 0.0f && reading.power > maxPowerLimitW;

  if (!overCurrent && !overPower) {
    return;
  }

  setRelay(false);
  reading.relayStatus = false;
  patchDeviceState();
}

void requestWifiReconnect(unsigned long now, const char *reason) {
  if (!hasConfiguredWifi()) {
    Serial.println("[WIFI] Wi-Fi is not configured. Starting setup AP.");
    startPairingAccessPointIfNeeded();
    return;
  }

  if (!canConnectToRouterWifiThisBoot()) {
    Serial.println("[WIFI] Router Wi-Fi is isolated until AP pairing writes a valid owner/device claim.");
    startPairingAccessPointIfNeeded();
    return;
  }

  if (hasPairingClientConnected() && pairingSessionActive(now)) {
    Serial.println("[WIFI] Active pairing session is using the setup AP; router reconnect is paused temporarily.");
    return;
  }

  if (wifiReady()) {
    wifiManagerState = WIFI_MANAGER_CONNECTED;
    return;
  }

  if (wifiManagerState == WIFI_MANAGER_CONNECTING) {
    return;
  }

  Serial.printf("[WIFI] Connecting to router SSID '%s' (%s).\n", runtimeWifiSsid.c_str(), reason);
  WiFi.mode(pairingApActive ? WIFI_AP_STA : WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.disconnect(false, false);
  WiFi.begin(runtimeWifiSsid.c_str(), runtimeWifiPassword.c_str());

  wifiManagerState = WIFI_MANAGER_CONNECTING;
  wifiAttemptStartedAt = now;
  lastWifiConnectAt = now;

  if (wifiOutageStartedAt == 0) {
    wifiOutageStartedAt = now;
  }
}

void connectWifi() {
  requestWifiReconnect(millis(), "connectWifi request");
}

void serviceWifiManager(unsigned long now) {
  if (!hasConfiguredWifi() || !canConnectToRouterWifiThisBoot()) {
    startPairingAccessPointIfNeeded();
    logApOnlyModeIfNeeded("Waiting for first-time AP pairing or reset pairing.");
    return;
  }

  if (hasPairingClientConnected() && pairingSessionActive(now)) {
    return;
  }

  if (wifiReady()) {
    if (wifiManagerState != WIFI_MANAGER_CONNECTED) {
      Serial.printf(
        "[WIFI] Connected. IP=%s RSSI=%d dBm after %u failed attempt(s).\n",
        WiFi.localIP().toString().c_str(),
        WiFi.RSSI(),
        wifiReconnectAttempt
      );
    }

    wifiManagerState = WIFI_MANAGER_CONNECTED;
    lastWifiHealthyAt = now;
    wifiOutageStartedAt = 0;
    resetWifiReconnectBackoff();
    stopPairingAccessPointAfterRouterConnect();
    initializeNetworkRuntimeOnce();
    return;
  }

  if (wifiOutageStartedAt == 0) {
    wifiOutageStartedAt = now;
  }

  if (wifiManagerState == WIFI_MANAGER_CONNECTED) {
    Serial.println("[WIFI] Router connection lost. Firebase will re-auth after Wi-Fi returns.");
    firebaseSessionStarted = false;
    cloudServicesStarted = false;
    cloudPresenceNeedsPatch = true;
    wifiManagerState = WIFI_MANAGER_IDLE;
    nextWifiAttemptAt = now;
  }

  if (wifiManagerState == WIFI_MANAGER_CONNECTING) {
    if (now - wifiAttemptStartedAt < WIFI_CONNECT_TIMEOUT_MS) {
      return;
    }

    WiFi.disconnect(false, false);
    wifiManagerState = pairingApActive ? WIFI_MANAGER_AP_FALLBACK : WIFI_MANAGER_IDLE;
    scheduleNextWifiAttempt(now, "Wi-Fi connect timed out");

    if (
      wifiReconnectAttempt >= WIFI_AP_FALLBACK_AFTER_FAILURES ||
      now - wifiOutageStartedAt >= WIFI_AP_FALLBACK_AFTER_MS
    ) {
      startPairingAccessPointIfNeeded();
    }

    return;
  }

  if (
    !pairingApActive &&
    (
      wifiReconnectAttempt >= WIFI_AP_FALLBACK_AFTER_FAILURES ||
      now - wifiOutageStartedAt >= WIFI_AP_FALLBACK_AFTER_MS
    )
  ) {
    Serial.println("[AP-PAIRING] Router Wi-Fi is still unavailable. Starting V380-style setup AP fallback.");
    startPairingAccessPointIfNeeded();
  }

  if (nextWifiAttemptAt == 0 || now >= nextWifiAttemptAt) {
    requestWifiReconnect(now, "scheduled backoff reconnect");
  }
}

void setupFirebase() {
  if (!hasConfiguredFirebase()) {
    Serial.println("[FIREBASE] Firebase is not configured. Pair this ESP32 in the app.");
    return;
  }

  if (!wifiReady()) {
    return;
  }

  lastFirebaseSetupAt = millis();
  firebaseSessionStarted = true;
  Serial.printf("[FIREBASE] Starting device sign-in as %s\n", runtimeDeviceAuthEmail.c_str());
  firebaseConfig.api_key = runtimeFirebaseApiKey.c_str();
  auth.user.email = runtimeDeviceAuthEmail.c_str();
  auth.user.password = runtimeDeviceAuthPassword.c_str();

  Firebase.begin(&firebaseConfig, &auth);
  Firebase.reconnectWiFi(false);
}

void serviceFirebaseManager(unsigned long now) {
  if (!wifiReady() || !hasConfiguredFirebase() ||
      (hasPairingClientConnected() && pairingSessionActive(now))) {
    return;
  }

  if (Firebase.ready()) {
    if (firebaseNotReadySince > 0 || firebaseReconnectAttempt > 0) {
      Serial.println("[FIREBASE] Device auth recovered.");
    }

    if (cloudPresenceNeedsPatch && ensureClaimReady()) {
      if (patchDeviceState()) {
        cloudPresenceNeedsPatch = false;
        Serial.println("[FIREBASE] Cloud device presence patched successfully.");
      } else {
        Serial.printf(
          "[FIREBASE] Cloud device presence patch pending: %s\n",
          fbdo.errorReason().c_str()
        );
      }
    }

    if (
      ensureClaimReady() &&
      (lastScheduleCloudRefreshAt == 0 ||
       now - lastScheduleCloudRefreshAt >= SCHEDULE_CLOUD_REFRESH_MS)
    ) {
      if (loadCloudScheduleConfig()) {
        lastScheduleCloudRefreshAt = now;
      }
    }

    cloudServicesStarted = true;
    lastFirebaseHealthyAt = now;
    firebaseSessionStarted = true;
    resetFirebaseAuthBackoff();
    return;
  }

  if (firebaseNotReadySince == 0) {
    firebaseNotReadySince = now;
  }

  if (!firebaseSessionStarted || nextFirebaseAuthAttemptAt == 0 || now >= nextFirebaseAuthAttemptAt) {
    setupFirebase();
    scheduleNextFirebaseAuthAttempt(now, "Firebase is not ready");
  }

  if (now - lastCloudHealthLogAt >= CLOUD_HEALTH_LOG_MS) {
    lastCloudHealthLogAt = now;
    Serial.println("[FIREBASE] Waiting for device auth token / Firestore readiness.");
  }
}

void retryFirebaseSetupIfNeeded(unsigned long now) {
  serviceFirebaseManager(now);
}

void runPairingTask(unsigned long now) {
  handlePairingResetButton();
  handleSerialPairing();
  handleLocalPairingApi();
  updatePairingStatusLed(now);
}

void runLocalControlTask(unsigned long now) {
#if MANUAL_TOGGLE_BUTTON_PIN >= 0
  const bool rawPressed = manualToggleButtonPressedRaw();

  if (rawPressed != manualToggleButtonLastRawState) {
    manualToggleButtonLastRawState = rawPressed;
    manualToggleButtonLastChangeAt = now;
    lastManualToggleLogAt = now;
    Serial.printf(
      "[BUTTON] Raw GPIO %d -> %s\n",
      MANUAL_TOGGLE_BUTTON_PIN,
      rawPressed ? "PRESSED" : "RELEASED"
    );
  }

  if (
    rawPressed != manualToggleButtonStableState &&
    now - manualToggleButtonLastChangeAt >= MANUAL_TOGGLE_DEBOUNCE_MS
  ) {
    manualToggleButtonStableState = rawPressed;
    Serial.printf(
      "[BUTTON] Debounced GPIO %d -> %s\n",
      MANUAL_TOGGLE_BUTTON_PIN,
      manualToggleButtonStableState ? "PRESSED" : "RELEASED"
    );

    if (manualToggleButtonStableState) {
      setRelay(!relayStatus);
      activateScheduleManualOverride();
      Serial.printf("[BUTTON] Manual relay toggle -> %s\n", relayStatus ? "ON" : "OFF");

      if (firebaseReady() && ensureClaimReady()) {
        if (!patchDeviceState()) {
          Serial.printf("[BUTTON] Relay changed locally, but cloud patch failed: %s\n", fbdo.errorReason().c_str());
        }
      } else {
        Serial.println("[BUTTON] Relay changed locally. Cloud sync will follow when Wi-Fi/Firebase is ready.");
      }
    }
  }
#else
  (void)now;
#endif

  serviceMp3Autoplay(now);

  if (!mp3SerialReady || now - lastMp3SerialLogAt < 250) {
    return;
  }

  if (mp3Serial.available() <= 0) {
    return;
  }

  uint8_t rxBytes[24];
  size_t rxCount = 0;

  while (mp3Serial.available() > 0 && rxCount < sizeof(rxBytes)) {
    rxBytes[rxCount++] = static_cast<uint8_t>(mp3Serial.read());
  }

  if (rxCount == 0) {
    return;
  }

  lastMp3SerialLogAt = now;
  Serial.printf("[MP3] RX %u byte(s):", static_cast<unsigned>(rxCount));
  for (size_t i = 0; i < rxCount; i++) {
    Serial.printf(" %02X", rxBytes[i]);
  }
  if (mp3Serial.available() > 0) {
    Serial.print(" ...");
    while (mp3Serial.available() > 0) {
      mp3Serial.read();
    }
  }
  Serial.println();
}

void runCloudBridgeTask(unsigned long now) {
  if (!canConnectToRouterWifiThisBoot() ||
      (hasPairingClientConnected() && pairingSessionActive(now))) {
    return;
  }

  if (now - lastCommandPollAt >= COMMAND_POLL_MS) {
    lastCommandPollAt = now;
    pollCommands();
  }

  if (now - lastReadingAt < READ_INTERVAL_MS) {
    patchCloudPresenceHeartbeatIfDue(now, "between readings");
    return;
  }

  lastReadingAt = now;

  SensorReading reading = captureReading();
  if (!validReading(reading)) {
    if (millis() - lastInvalidReadingLogAt > 10000) {
      lastInvalidReadingLogAt = millis();
      Serial.println("Waiting for valid PZEM-004T readings. Check RX/TX wiring, power, and CT clamp.");
    }
    patchCloudPresenceHeartbeatIfDue(now, "invalid reading");
    return;
  }

  enforceProtection(reading);

  if (firebaseReady() && ensureClaimReady()) {
    const bool shouldArchiveReading =
      now - lastReadingArchiveAt >= READING_ARCHIVE_INTERVAL_MS;

    Serial.printf(
      "Reading: %.1f V, %.3f A, %.1f W, %.4f kWh, delta %.4f kWh, PF %.2f\n",
      reading.voltage,
      reading.current,
      reading.power,
      reading.energy,
      reading.energyDelta,
      reading.powerFactor
    );

    if (shouldArchiveReading) {
      if (!uploadReading(reading, "esp32-live")) {
        Serial.printf("Cloud archive upload failed, saving to SD: %s\n", fbdo.errorReason().c_str());
        appendOfflineReading(reading);
      } else {
        lastReadingArchiveAt = now;
        Serial.println("Cloud reading archived.");
      }
    }

    patchDeviceReadingStateWithFallback(
      reading,
      offlineBacklogSyncPending ? countOfflineReadingsOnSd() : 0
    );

    if (offlineBacklogSyncPending) {
      syncOfflineFile(reading);
    } else if (shouldArchiveReading && beginSdCard("offline sync retry") && SD.exists(offlineFilePath)) {
      offlineBacklogSyncPending = true;
      syncOfflineFile(reading);
    }
  } else if (firebaseReady()) {
    if (millis() - lastWaitingClaimLogAt > 10000) {
      lastWaitingClaimLogAt = millis();
      Serial.println("Waiting for app pairing claim before cloud upload.");
    }
  } else {
    Serial.println("Firebase not ready, saving reading to SD.");
    appendOfflineReading(reading);
      }
}

void runFirmwareWatchdogTask(unsigned long now) {
  if (!hasStoredPairing() ||
      (hasPairingClientConnected() && pairingSessionActive(now))) {
    return;
  }

  if (wifiReady()) {
    lastWifiHealthyAt = now;
  } else {
    if (wifiOutageStartedAt == 0) {
      wifiOutageStartedAt = now;
    }

    if (now - lastWatchdogLogAt >= CLOUD_HEALTH_LOG_MS) {
      lastWatchdogLogAt = now;
      Serial.printf(
        "[WATCHDOG] Wi-Fi outage active for %lu ms. Reboot threshold=%lu ms.\n",
        now - wifiOutageStartedAt,
        (unsigned long)WIFI_WATCHDOG_REBOOT_MS
      );
    }

    if (now - wifiOutageStartedAt >= WIFI_WATCHDOG_REBOOT_MS) {
      Serial.println("[WATCHDOG] Wi-Fi stuck too long. Resetting Wi-Fi manager and keeping AP fallback alive.");
      startPairingAccessPointIfNeeded();
      WiFi.disconnect(false, false);
      wifiManagerState = WIFI_MANAGER_AP_FALLBACK;
      wifiOutageStartedAt = now;
      nextWifiAttemptAt = now + WIFI_RECONNECT_MAX_MS;
#if SOFTWARE_RECOVERY_REBOOT_ENABLED
      Serial.println("[WATCHDOG] Software reboot recovery is enabled. Restarting ESP32.");
      delay(100);
      ESP.restart();
#endif
    }
  }

  if (
    wifiReady() &&
    hasConfiguredFirebase() &&
    firebaseNotReadySince > 0 &&
    now - firebaseNotReadySince >= FIREBASE_WATCHDOG_REBOOT_MS
  ) {
    Serial.println("[WATCHDOG] Firebase auth stuck too long after Wi-Fi recovery. Resetting Firebase session.");
    firebaseSessionStarted = false;
    firebaseNotReadySince = now;
    resetFirebaseAuthBackoff();
#if SOFTWARE_RECOVERY_REBOOT_ENABLED
    Serial.println("[WATCHDOG] Software reboot recovery is enabled. Restarting ESP32.");
    delay(100);
    ESP.restart();
#endif
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  randomSeed((uint32_t)(ESP.getEfuseMac() ^ micros()));

  Serial.println();
  Serial.println("==================================================");
  Serial.println("EnerTrack ESP32 booting - production Wi-Fi manager");
  Serial.println("==================================================");

  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.setSleep(false);
  WiFi.disconnect(false, false);
  delay(200);

  loadRuntimeConfig();
  setupPairingHardware();
  setupLocalControlHardware();
  setupRtcHardware();
  factoryResetIfRequested();

  Serial.printf("Firmware version: %s\n", firmwareVersion);
  Serial.printf("ESP32 ID: %s\n", runtimeEsp32Id.c_str());
  Serial.printf("Pairing SSID: %s\n", pairingSsid.c_str());
  Serial.printf("Pairing AP password: %s\n", DEVICE_PAIR_PASSWORD);
  Serial.printf("Stored pairing in NVS: %s\n", hasStoredPairing() ? "YES" : "NO");
  Serial.printf("Configured Wi-Fi available in NVS/config: %s\n", hasConfiguredWifi() ? "YES" : "NO");
  Serial.printf("Auto-connect stored Wi-Fi on boot: %s\n",
#if AUTO_CONNECT_STORED_WIFI_ON_BOOT
                "YES"
#else
                "NO"
#endif
  );
  Serial.println("Mode: stored pairing connects to router first; setup AP starts only for unpaired devices or Wi-Fi fallback.");

  pairingGraceEndsAt = 0;
  setupLocalPairingApi();

  Serial.printf("PZEM UART RX: GPIO %d, TX: GPIO %d\n", PZEM_RX_PIN, PZEM_TX_PIN);
  Serial.printf("Relay GPIO: %d, active high: %s\n", RELAY_PIN, RELAY_ACTIVE_HIGH ? "true" : "false");
  Serial.printf("Pairing reset button GPIO: %d\n", PAIRING_RESET_BUTTON_PIN);
  Serial.printf("Pairing reset BOOT fallback GPIO: %d\n", PAIRING_RESET_BOOT_BUTTON_PIN);
  Serial.printf("Pairing status LED GPIO: %d\n", PAIRING_STATUS_LED_PIN);
  Serial.printf("Manual relay toggle GPIO: %d, active low: %s\n", MANUAL_TOGGLE_BUTTON_PIN, MANUAL_TOGGLE_BUTTON_ACTIVE_LOW ? "true" : "false");
  Serial.printf("MP3 UART RX GPIO: %d, TX GPIO: %d, baud: %lu\n", MP3_UART_RX_PIN, MP3_UART_TX_PIN, (unsigned long)MP3_UART_BAUD);
  Serial.printf("DS1302 RTC CLK GPIO: %d, IO GPIO: %d, RST GPIO: %d, enabled: %s\n",
                RTC_DS1302_CLK_PIN,
                RTC_DS1302_IO_PIN,
                RTC_DS1302_RST_PIN,
                ds1302PinsConfigured() ? "true" : "false");

  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);

  if (canConnectToRouterWifiThisBoot()) {
    Serial.println("[BOOT] Stored pairing found. Router Wi-Fi will start after boot grace period.");
    resetWifiReconnectBackoff();
    resetFirebaseAuthBackoff();
    nextWifiAttemptAt = millis() + WIFI_BOOT_CONNECT_GRACE_MS;
  } else {
    Serial.println("[BOOT] No complete stored pairing. Starting isolated setup AP.");
    startPairingAccessPointIfNeeded();
    logApOnlyModeIfNeeded("Initial boot requires AP pairing.");
  }
}

void loop() {
  const unsigned long now = millis();

  // Cooperative FreeRTOS-style task separation keeps Firebase/WebServer on one task.
  runPairingTask(now);

  if (pendingNetworkRestart) {
    restartNetworkServices();
  }

  servicePairingRebootTask(now);

  serviceWifiManager(now);
  serviceFirebaseManager(now);
  serviceRtcClock(now);
  runLocalControlTask(now);
  runScheduleTask(now);
  runCloudBridgeTask(now);
  runFirmwareWatchdogTask(now);

  delay(1);
}
