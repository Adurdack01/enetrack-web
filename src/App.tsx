import AppLayout from "@/components/layout/AppLayout";
import AuthScreen from "@/features/auth/AuthScreen";
import HomeScreen from "@/features/home/HomeScreen";
import StatsScreen from "@/features/stats/StatsScreen";
import DevicesScreen from "@/features/devices/DevicesScreen";
import SettingsScreen from "@/features/settings/SettingsScreen";
import type { Device } from "@/types/device";
import DeviceDetailsScreen from "@/features/device-details/DeviceDetailsScreen";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import type { AppNotification } from "@/types/notification";
import NotificationsModal from "@/components/modals/NotificationsModal";
import type { UsageHistoryEntry } from "@/types/usageHistory";
import type { UsageLog } from "@/types/usageLog";
import SearchModal from "@/components/modals/SearchModal";
import type { ExportRecord } from "@/types/exportRecord";
import type { FamilyInvitation, FamilyMember, Permission } from "@/types/family";
import type { OfflineSyncBatch } from "@/types/offlineSync";
import {
  clearCloudExportRecords,
  clearCloudNotifications,
  clearCloudUsageLogs,
  deleteCloudDevice,
  deleteCloudDeviceAliases,
  deleteCloudDeviceClaim,
  deleteCloudOfflineSyncBatchesForDevice,
  deleteCloudExportRecord,
  deleteCloudFamilyMember,
  deleteCloudNotification,
  deleteUserCloudData,
  ensureUserCloudDefaults,
  findCloudDevicesByEsp32Id,
  revokeCloudDeviceSharesForInvitation,
  saveCloudDeviceSharesForInvitation,
  saveCloudDevice,
  saveCloudDeviceCommand,
  saveCloudExportRecord,
  saveCloudFamilyInvitation,
  saveCloudFamilyMember,
  saveCloudNotification,
  saveCloudNotifications,
  saveCloudUsageHistoryEntry,
  saveCloudUsageLog,
  saveElectricityRateSettings,
  saveUserPreferences,
  saveUserProfile,
  subscribeCloudSharedDevices,
  subscribeCloudSharedUsageData,
  subscribeCloudDeviceCommands,
  subscribeCloudUsageHistory,
  subscribeCloudUsageLogs,
  subscribeIncomingFamilyInvitations,
  subscribeSentFamilyInvitations,
  subscribeUserCloudData,
  updateCloudFamilyInvitationStatus,
} from "@/services/cloudStore";
import {
  cleanupFailedDevicePairing,
  createDeviceDocument,
} from "@/services/firebaseDevicePairing";
import {
  fetchEsp32Readings,
  hasEsp32Endpoint,
  readingMatchesDevice,
  sendEsp32ProtectionCommand,
  sendEsp32RelayCommand,
  type Esp32Reading,
} from "@/services/esp32";
import type {
  DeviceClaimRecord,
  DeviceCommand,
} from "@/types/esp32Bridge";
import {
  firebaseAuth,
  resetFirestoreNetworkConnection,
  firebasePublicConfig,
  googleProvider,
  isFirebaseConfigured,
} from "@/services/firebase";
import { createId } from "@/lib/utils";
import {
  ensureDeviceAuthAccount,
  hashDevicePassword,
  verifyDeviceAuthPassword,
} from "@/services/esp32Pairing";
import {
  clearPendingDevicePairings,
  hasPendingDevicePairings,
  readPendingDevicePairings,
  removePendingDevicePairing,
  removePendingDevicePairingsByEsp32Id,
  savePendingDevicePairing,
  type PendingDevicePairing,
} from "@/services/pendingDevicePairing";
import { checkFirebaseConnectivity } from "@/services/connectivity";
import {
  formatProtectionSummary,
  resolveProtectionState,
} from "@/utils/protection";
import type {
  ElectricityRateSettings,
  UserProfile,
} from "@/types/settings";
import type { CloudSyncRequestResult } from "@/types/pairing";
import {
  ensureNativeNotificationPermission,
  showNativeNotification,
} from "@/services/nativeNotifications";

type Tab = "home" | "stats" | "devices" | "settings";

type AuthAccount = UserProfile & {
  password?: string;
};

type ActionResult = {
  ok: boolean;
  message?: string;
};

const defaultUserProfile: UserProfile = {
  displayName: "EnerTrack User",
  email: "",
  provider: "Email account",
};

const defaultAuthAccounts: AuthAccount[] = [];

const defaultElectricityRate: ElectricityRateSettings = {
  mode: "manual",
  rate: 0,
  previousRate: 0,
  providerUrl: "",
  sourceName: "Unavailable",
  status: "unset",
  statusMessage: "No electricity rate set",
  effectiveBillingMonth: "Unavailable",
  lastChecked: new Date().toISOString(),
  difference: 0,
};

const PENDING_PAIRING_SYNC_INTERVAL_MS = 2500;
const PENDING_PAIRING_CONNECTIVITY_CACHE_MS = 1000;
const PENDING_PAIRING_FORCE_RETRY_WINDOW_MS = 30000;
const PENDING_PAIRING_FORCE_RETRY_STEP_MS = 1200;
const PENDING_PAIRING_IN_FLIGHT_WAIT_MS = 12000;
const PENDING_PAIRING_IN_FLIGHT_STEP_MS = 300;
const LOCAL_ESP32_SYNC_INTERVAL_MS = 1000;
const ESP32_TELEMETRY_STALE_MS = 30000;
const ESP32_TIMESTAMP_FUTURE_TOLERANCE_MS = 15000;
const UI_CLOCK_TICK_MS = 1000;
const TIMESTAMP_YEAR_MIN = 2020;
const TIMESTAMP_YEAR_MAX = 2100;
const removedDeviceIdsKey = "removedDeviceIds";
const monthlyRateReminderStateKey = "monthlyRateReminderState";
const persistedAppDataKeys = [
  "devices",
  "familyMembers",
  "homeSelectedDeviceId",
  "notifications",
  "logs",
  "usageHistory",
  "darkMode",
  "profile",
  "isAuthenticated",
  "pushNotificationsEnabled",
  "electricityRate",
  "exportRecords",
  "processedCloudReadingIds",
  "announcedOfflineBatchIds",
  monthlyRateReminderStateKey,
  removedDeviceIdsKey,
  "lastHomeWifiSsid",
] as const;

type MonthlyRateReminderState = Record<string, string>;

type MonthlyRateReminder = {
  monthKey: string;
  monthLabel: string;
  currentRate: number;
  sourceName: string;
  effectiveBillingMonth: string;
};

function isUnsyncedEsp32Timestamp(value: string | null | undefined) {
  if (!value) return true;

  const normalized = value.trim().toLowerCase();

  if (normalized.startsWith("unsynced:")) {
    return true;
  }

  return /^\d{1,10}$/.test(normalized);
}

function parseDisplayTimestamp(value: string | null | undefined) {
  if (!value || isUnsyncedEsp32Timestamp(value)) {
    return null;
  }

  const parsed = new Date(value);
  const time = parsed.getTime();
  const year = parsed.getFullYear();

  if (
    !Number.isFinite(time) ||
    year < TIMESTAMP_YEAR_MIN ||
    year > TIMESTAMP_YEAR_MAX
  ) {
    return null;
  }

  return parsed;
}

function formatTimestampLabel(
  value: string | null | undefined,
  fallback = "Smart Plug clock not synced"
) {
  const parsed = parseDisplayTimestamp(value);
  return parsed ? parsed.toLocaleString() : fallback;
}

function getBillingMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getBillingMonthLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getStoredRateReminderAccountKey(
  profile: UserProfile,
  cloudUid: string | null
) {
  const email = profile.email.trim().toLowerCase();
  return email || cloudUid || "";
}

function toNotificationIdPart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/(^-|-$)/g, "") || "user";
}

function readMonthlyRateReminderState(): MonthlyRateReminderState {
  const saved = localStorage.getItem(monthlyRateReminderStateKey);
  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object"
      ? (parsed as MonthlyRateReminderState)
      : {};
  } catch {
    return {};
  }
}

function saveMonthlyRateReminderState(state: MonthlyRateReminderState) {
  localStorage.setItem(monthlyRateReminderStateKey, JSON.stringify(state));
}

function getMonthKeyFromTimestamp(value: string | null | undefined) {
  if (!value) return "";

  const parsed = new Date(value);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return "";

  return getBillingMonthKey(parsed);
}

function isElectricityRateCurrentForMonth(
  settings: ElectricityRateSettings,
  monthKey: string,
  monthLabel: string
) {
  if (settings.status !== "verified" || settings.rate <= 0) {
    return false;
  }

  if (getMonthKeyFromTimestamp(settings.lastChecked) === monthKey) {
    return true;
  }

  return (
    settings.effectiveBillingMonth.trim().toLowerCase() ===
    monthLabel.toLowerCase()
  );
}

function buildOfflinePeriodLabel(batch: OfflineSyncBatch) {
  const startedAt = parseDisplayTimestamp(batch.startedAt);
  const endedAt = parseDisplayTimestamp(batch.endedAt);

  if (startedAt && endedAt) {
    return `${startedAt.toLocaleString()} to ${endedAt.toLocaleString()}`;
  }

  if (startedAt) {
    return `${startedAt.toLocaleString()} to Smart Plug clock not synced`;
  }

  if (endedAt) {
    return `Smart Plug clock not synced to ${endedAt.toLocaleString()}`;
  }

  return batch.syncedAt
    ? `Smart Plug clock not synced during outage. Synced ${formatTimestampLabel(batch.syncedAt, "recently")}.`
    : "Smart Plug clock was not synced during the offline period.";
}

function toUsageLogTimestamp(
  primary: string | null | undefined,
  fallback: string | null | undefined
) {
  const parsedPrimary = parseDisplayTimestamp(primary);
  if (parsedPrimary) {
    return parsedPrimary.toISOString();
  }

  const parsedFallback = parseDisplayTimestamp(fallback);
  if (parsedFallback) {
    return parsedFallback.toISOString();
  }

  return new Date().toISOString();
}

function toUsageLogMinuteBucket(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function getLocalDateKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildTodayCostByDevice(
  entries: UsageHistoryEntry[],
  todayKey: string,
  fallbackRate: number
) {
  const costs = new Map<string, number>();

  entries.forEach((entry) => {
    if (getLocalDateKey(entry.date) !== todayKey) {
      return;
    }

    const entryCost =
      typeof entry.cost === "number" && Number.isFinite(entry.cost)
        ? entry.cost
        : computeCost(entry.energy, entry.electricityRate ?? fallbackRate);

    costs.set(
      entry.deviceId,
      Number(((costs.get(entry.deviceId) ?? 0) + entryCost).toFixed(2))
    );
  });

  return costs;
}

function getDeviceFallbackTodayCost(device: Device, todayKey: string) {
  const latestDeviceDate = getLocalDateKey(
    device.lastReadingAt ??
      device.lastSyncedAt ??
      device.updatedAt ??
      device.createdAt ??
      ""
  );

  return latestDeviceDate === todayKey ? device.todayCost : 0;
}

function buildScheduleCommandPayload(device: Device): DeviceCommand["payload"] {
  const rate =
    typeof device.scheduleElectricityRate === "number" &&
    Number.isFinite(device.scheduleElectricityRate)
      ? device.scheduleElectricityRate
      : 0;
  const budgetLimit =
    typeof device.scheduleBudgetLimit === "number" &&
    Number.isFinite(device.scheduleBudgetLimit)
      ? device.scheduleBudgetLimit
      : device.budgetLimit;
  const budgetKwhLimit =
    typeof device.scheduleBudgetKwhLimit === "number" &&
    Number.isFinite(device.scheduleBudgetKwhLimit)
      ? device.scheduleBudgetKwhLimit
      : rate > 0 && budgetLimit > 0
        ? Number((budgetLimit / rate).toFixed(4))
        : 0;

  return {
    scheduleEnabled: Boolean(device.scheduleEnabled),
    scheduleMode: device.scheduleMode,
    schedule: device.schedule,
    scheduleStartTime: device.scheduleStartTime,
    scheduleEndTime: device.scheduleEndTime,
    budgetLimit,
    scheduleBudgetLimit: budgetLimit,
    scheduleBudgetKwhLimit: budgetKwhLimit,
    scheduleElectricityRate: rate,
  };
}

function computeCost(energy: number, rate: number) {
  return Number((energy * rate).toFixed(2));
}

const ENERGY_BASELINE_ROLLBACK_TOLERANCE_KWH = 0.05;

function normalizeEnergyKwh(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(4))
    : null;
}

function deviceHasActualEnergySnapshot(device: Partial<Device> | undefined) {
  return Boolean(
    device &&
      (device.readingSource === "esp32" ||
        device.lastReadingAt ||
        device.lastSyncedAt)
  );
}

function syncDeviceEnergyState(
  device: Device,
  rawEnergyOverride?: number | null,
  hasActualSnapshot = deviceHasActualEnergySnapshot(device)
): Device {
  const carryover = normalizeEnergyKwh(device.energyCarryoverKwh) ?? 0;
  const baseline = normalizeEnergyKwh(device.energyBaselineKwh);
  const rawOverride = normalizeEnergyKwh(rawEnergyOverride);
  const storedRaw = normalizeEnergyKwh(device.rawEnergyTotal);
  const legacyEnergy = normalizeEnergyKwh(device.energy) ?? 0;
  const rawEnergy =
    rawOverride ??
    storedRaw ??
    (baseline != null || device.energyBaselinePending ? 0 : legacyEnergy);

  if (device.energyBaselinePending) {
    if (!hasActualSnapshot || rawOverride == null) {
      return {
        ...device,
        rawEnergyTotal: storedRaw ?? 0,
        energyCarryoverKwh: carryover,
        energy: 0,
      };
    }

    return {
      ...device,
      rawEnergyTotal: rawEnergy,
      energyBaselineKwh: rawEnergy,
      energyCarryoverKwh: 0,
      energyBaselinePending: false,
      energy: 0,
    };
  }

  if (baseline == null) {
    return {
      ...device,
      rawEnergyTotal: rawEnergy,
      energyCarryoverKwh: carryover,
      energy: rawEnergy,
    };
  }

  if (rawEnergy + ENERGY_BASELINE_ROLLBACK_TOLERANCE_KWH < baseline) {
    const nextCarryover = normalizeEnergyKwh(
      Math.max(carryover, legacyEnergy)
    ) ?? carryover;

    return {
      ...device,
      rawEnergyTotal: rawEnergy,
      energyBaselineKwh: rawEnergy,
      energyCarryoverKwh: nextCarryover,
      energyBaselinePending: false,
      energy: nextCarryover,
    };
  }

  return {
    ...device,
    rawEnergyTotal: rawEnergy,
    energyBaselineKwh: baseline,
    energyCarryoverKwh: carryover,
    energyBaselinePending: false,
    energy: Number((carryover + Math.max(0, rawEnergy - baseline)).toFixed(4)),
  };
}

function getFirebaseAuthMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";

  if (code.includes("invalid-credential") || code.includes("wrong-password")) {
    return "Incorrect email or password.";
  }

  if (code.includes("user-not-found")) {
    return "No account found. Create an account first.";
  }

  if (code.includes("email-already-in-use")) {
    return "This email address already has an account.";
  }

  if (code.includes("requires-recent-login")) {
    return "Please sign out, sign in again, then retry this security change.";
  }

  if (code.includes("weak-password")) {
    return "Password must be at least 6 characters.";
  }

  if (code.includes("popup-closed-by-user")) {
    return "Google sign-in was closed before it finished.";
  }

  if (code.includes("network-request-failed")) {
    return "Network connection failed. Please try again.";
  }

  return "Firebase could not complete this request.";
}

function getProfileFromFirebaseUser(user: User): UserProfile {
  return {
    displayName:
      user.displayName?.trim() || user.email?.split("@")[0] || "EnerTrack User",
    email: user.email ?? "",
    provider:
      user.providerData[0]?.providerId === "google.com"
        ? "Google account"
        : "Email account",
  };
}

function hasPasswordProvider(user: User) {
  return user.providerData.some((provider) => provider.providerId === "password");
}

function hasGoogleProvider(user: User) {
  return user.providerData.some(
    (provider) => provider.providerId === "google.com"
  );
}

async function reauthenticateFirebaseUser(
  user: User,
  currentPassword?: string
) {
  if (hasPasswordProvider(user)) {
    if (!currentPassword?.trim() || !user.email) {
      throw new Error("Please enter your current password.");
    }

    const credential = EmailAuthProvider.credential(
      user.email,
      currentPassword
    );
    await reauthenticateWithCredential(user, credential);
    return;
  }

  if (hasGoogleProvider(user)) {
    await reauthenticateWithPopup(user, googleProvider);
  }
}

function buildOfflineUsageLogs(
  batch: OfflineSyncBatch,
  devices: Device[],
  electricityRate: number
): UsageLog[] {
  const device = devices.find((item) => item.id === batch.deviceId);
  const deviceName = batch.deviceName ?? device?.name ?? "Smart Plug";
  const period = buildOfflinePeriodLabel(batch);

  if (batch.readings?.length) {
    return batch.readings.map((reading) => {
      const energy = reading.energyDelta ?? reading.energy ?? 0;

      return {
        id: reading.id,
        deviceId: reading.deviceId || batch.deviceId,
        deviceName: reading.deviceName ?? deviceName,
        date: toUsageLogTimestamp(reading.timestamp, batch.syncedAt),
        energy,
        electricityRate,
        cost: reading.cost ?? computeCost(energy, electricityRate),
        action: "offline_synced",
        details: `Synced from Smart Plug microSD offline batch ${batch.id}. Offline period: ${period}.`,
      };
    });
  }

  return [
    {
      id: `${batch.id}-summary`,
      deviceId: batch.deviceId,
      deviceName,
      date: toUsageLogTimestamp(batch.endedAt, batch.syncedAt),
      energy: batch.totalEnergy,
      electricityRate,
      cost: batch.estimatedCost ?? computeCost(batch.totalEnergy, electricityRate),
      action: "offline_synced",
      details: `Synced ${batch.entries} Smart Plug microSD log entries. Offline period: ${period}.`,
    },
  ];
}

function isHistoricalUsageLog(log: Pick<UsageLog, "action" | "energy">) {
  return (
    log.energy > 0 &&
    (log.action === "energy_reading" || log.action === "offline_synced")
  );
}

function toUsageHistorySource(
  action: UsageLog["action"]
): UsageHistoryEntry["source"] {
  return action === "offline_synced" ? "offline_sync" : "live";
}

function toUsageHistoryEntry(
  log: UsageLog
): UsageHistoryEntry | null {
  if (!isHistoricalUsageLog(log)) {
    return null;
  }

  return {
    id: log.id,
    deviceId: log.deviceId,
    deviceName: log.deviceName,
    date: log.date,
    energy: Number(log.energy.toFixed(4)),
    cost: Number(log.cost.toFixed(2)),
    electricityRate: log.electricityRate,
    source: toUsageHistorySource(log.action),
  };
}

function sortUsageHistoryEntries(
  a: Pick<UsageHistoryEntry, "date">,
  b: Pick<UsageHistoryEntry, "date">
) {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

function mergeStoredUsageHistoryEntry(
  existing: UsageHistoryEntry,
  incoming: UsageHistoryEntry
) {
  const incomingIsRicher =
    incoming.energy > existing.energy ||
    (incoming.energy === existing.energy &&
      new Date(incoming.date).getTime() >= new Date(existing.date).getTime());

  return incomingIsRicher
    ? {
        ...existing,
        ...incoming,
      }
    : existing;
}

function accumulateUsageHistoryEntry(
  existing: UsageHistoryEntry,
  incoming: UsageHistoryEntry
) {
  if (incoming.source !== "live" || existing.source !== "live") {
    return mergeStoredUsageHistoryEntry(existing, incoming);
  }

  return {
    ...existing,
    deviceName: incoming.deviceName,
    date:
      new Date(incoming.date).getTime() >= new Date(existing.date).getTime()
        ? incoming.date
        : existing.date,
    energy: Number((existing.energy + incoming.energy).toFixed(4)),
    cost: Number((existing.cost + incoming.cost).toFixed(2)),
    electricityRate:
      existing.electricityRate === incoming.electricityRate
        ? existing.electricityRate
        : undefined,
    source: incoming.source,
  };
}

function mergeUsageHistoryCollections(
  existingEntries: UsageHistoryEntry[],
  incomingEntries: UsageHistoryEntry[]
) {
  if (!incomingEntries.length) {
    return existingEntries;
  }

  const nextEntries = new Map(
    existingEntries.map((entry) => [entry.id, entry] as const)
  );

  incomingEntries.forEach((entry) => {
    const existing = nextEntries.get(entry.id);
    nextEntries.set(
      entry.id,
      existing ? mergeStoredUsageHistoryEntry(existing, entry) : entry
    );
  });

  return [...nextEntries.values()].sort(sortUsageHistoryEntries);
}

function buildUsageHistoryFromLogs(logs: UsageLog[]) {
  const entries = new Map<string, UsageHistoryEntry>();

  logs.forEach((log) => {
    const nextEntry = toUsageHistoryEntry(log);
    if (!nextEntry) return;

    const existingEntry = entries.get(nextEntry.id);
    entries.set(
      nextEntry.id,
      existingEntry
        ? accumulateUsageHistoryEntry(existingEntry, nextEntry)
        : nextEntry
    );
  });

  return [...entries.values()].sort(sortUsageHistoryEntries);
}

function readStoredUsageHistory() {
  const saved = localStorage.getItem("usageHistory");

  if (saved) {
    try {
      const parsed = JSON.parse(saved) as UsageHistoryEntry[];
      if (Array.isArray(parsed)) {
        return parsed.sort(sortUsageHistoryEntries);
      }
    } catch {
      // Fall back to logs migration below.
    }
  }

  const savedLogs = localStorage.getItem("logs");

  if (!savedLogs) {
    return [];
  }

  try {
    const parsedLogs = JSON.parse(savedLogs) as UsageLog[];
    if (!Array.isArray(parsedLogs)) {
      return [];
    }

    return buildUsageHistoryFromLogs(parsedLogs);
  } catch {
    return [];
  }
}

function formatChangeValue(value: unknown) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return value.toFixed(value % 1 === 0 ? 0 : 2);
  if (value == null || value === "") return "Not Set";

  return String(value);
}

function formatCurrencyValue(value: unknown) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function buildDeviceChangeDetails(device: Device, updates: Partial<Device>) {
  const changeChecks: {
    key: keyof Device;
    label: string;
    format?: (value: unknown) => string;
  }[] = [
    { key: "name", label: "Name" },
    { key: "room", label: "Location" },
    { key: "scheduleEnabled", label: "Schedule automation" },
    { key: "scheduleMode", label: "Schedule mode" },
    { key: "schedule", label: "Schedule" },
    { key: "budgetLimit", label: "Budget limit", format: formatCurrencyValue },
    { key: "protectionEnabled", label: "Protection" },
    { key: "maxPowerLimit", label: "Power limit", format: (value) => `${formatChangeValue(value)} W` },
    { key: "maxCurrentLimit", label: "Current limit", format: (value) => `${formatChangeValue(value)} A` },
  ];

  const details = changeChecks.flatMap(({ key, label, format }) => {
    if (!(key in updates)) return [];

    const nextValue = updates[key];
    const currentValue = device[key];

    if (nextValue === currentValue) return [];

    const formatValue = format ?? formatChangeValue;
    return [`${label}: ${formatValue(currentValue)} to ${formatValue(nextValue)}`];
  });

  return details.join("; ");
}

function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isTransientFirebaseConnectivityError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();

  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("offline") ||
    message.includes("resolve host") ||
    message.includes("unknownhost") ||
    message.includes("no address associated")
  );
}

function updatePendingPairingsRegistrationState(
  pendingPairings: PendingDevicePairing[],
  status: Device["cloudRegistrationStatus"],
  message: string
) {
  if (!pendingPairings.length) return [];

  const updatedDevices = pendingPairings.map((pairing) => {
    const updatedDevice: Device = {
      ...pairing.device,
      cloudRegistrationStatus: status,
      cloudRegistrationError: message,
      updatedAt: new Date().toISOString(),
    };

    savePendingDevicePairing({
      ...pairing,
      device: updatedDevice,
    });

    return updatedDevice;
  });

  return updatedDevices;
}

function readUserProfile() {
  const saved = localStorage.getItem("profile");
  return saved ? (JSON.parse(saved) as UserProfile) : defaultUserProfile;
}

function readAuthAccounts() {
  const saved = localStorage.getItem("authAccounts");
  if (!saved) return defaultAuthAccounts;

  return JSON.parse(saved) as AuthAccount[];
}

function readElectricityRateSettings() {
  const saved = localStorage.getItem("electricityRate");
  if (!saved) return defaultElectricityRate;

  const parsed = JSON.parse(saved) as ElectricityRateSettings;
  const isOldPreviewRate =
    parsed.mode === "manual" &&
    parsed.rate === 12.5 &&
    parsed.sourceName === "Manual" &&
    parsed.status === "verified" &&
    parsed.effectiveBillingMonth === "Manual entry";

  return isOldPreviewRate ? defaultElectricityRate : parsed;
}

function readFamilyMembers() {
  const saved = localStorage.getItem("familyMembers");
  if (!saved) return [];

  return JSON.parse(saved) as FamilyMember[];
}

function readRemovedDeviceIds() {
  const saved = localStorage.getItem(removedDeviceIdsKey);
  if (!saved) return new Set<string>();

  try {
    return new Set(JSON.parse(saved) as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveRemovedDeviceIds(deviceIds: Iterable<string>) {
  localStorage.setItem(removedDeviceIdsKey, JSON.stringify([...deviceIds]));
}

function rememberRemovedDeviceId(deviceId: string) {
  const nextIds = readRemovedDeviceIds();
  nextIds.add(deviceId);
  saveRemovedDeviceIds(nextIds);
}

function forgetRemovedDeviceId(deviceId: string) {
  const nextIds = readRemovedDeviceIds();
  if (!nextIds.delete(deviceId)) return;
  saveRemovedDeviceIds(nextIds);
}

const scheduledStorageWrites = new Map<string, number>();

function scheduleLocalStorageWrite(key: string, value: string) {
  const existingHandle = scheduledStorageWrites.get(key);
  if (existingHandle != null) {
    window.clearTimeout(existingHandle);
  }

  const handle = window.setTimeout(() => {
    localStorage.setItem(key, value);
    scheduledStorageWrites.delete(key);
  }, 0);

  scheduledStorageWrites.set(key, handle);
}

function clearScheduledLocalStorageWrite(key: string) {
  const existingHandle = scheduledStorageWrites.get(key);
  if (existingHandle != null) {
    window.clearTimeout(existingHandle);
    scheduledStorageWrites.delete(key);
  }
}

function clearPersistedAppData(keys: readonly string[]) {
  keys.forEach((key) => {
    clearScheduledLocalStorageWrite(key);
    localStorage.removeItem(key);
  });
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function waitForDelay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function countSharedUsersForDevice(
  familyMembers: FamilyMember[],
  deviceId: string
) {
  return familyMembers.filter(
    (member) =>
      isAcceptedSharedMember(member) && member.deviceIds.includes(deviceId)
  ).length;
}

function isAcceptedSharedMember(member: FamilyMember) {
  if (member.isOwner) return false;

  return member.inviteId
    ? member.inviteStatus === "accepted"
    : member.inviteStatus == null || member.inviteStatus === "accepted";
}

function canPermissionControlDevice(permission?: Permission) {
  return permission === "View + Control" || permission === "Full Access";
}

function canControlDevice(device?: Device | null) {
  if (!device) return false;
  if (!device.isShared) return true;

  return canPermissionControlDevice(device.accessPermission);
}

function canManageDevice(device?: Device | null) {
  return Boolean(device && !device.isShared);
}

function getDeviceCloudOwnerUid(
  device: Device,
  fallbackUid: string | null
) {
  return device.sharedOwnerUid ?? device.ownerUid ?? fallbackUid;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function resetNonEsp32Readings(device: Device): Device {
  if (device.readingSource === "esp32") return device;
  const protectionState = resolveProtectionState(device);

  return {
    ...device,
    status: false,
    relayState: false,
    power: 0,
    voltage: 0,
    current: 0,
    powerFactor: null,
    energy: 0,
    rawEnergyTotal: 0,
    energyBaselineKwh: null,
    energyCarryoverKwh: 0,
    energyBaselinePending: false,
    todayCost: 0,
    budgetUsed: 0,
    readingSource: "none",
    lastReadingAt: undefined,
    wifiSignal: null,
    ...protectionState,
  };
}

function getDeviceRelayState(
  device?: Partial<Pick<Device, "status" | "relayState">>,
  fallback = false
) {
  if (!device) return fallback;
  if (typeof device.relayState === "boolean") return device.relayState;

  return typeof device.status === "boolean" ? device.status : fallback;
}

function syncDeviceRelayState(
  device: Device,
  relayState = getDeviceRelayState(device)
): Device {
  return {
    ...device,
    status: relayState,
    relayState,
  };
}

function getDeviceSnapshotTime(device: Partial<Device> | undefined) {
  if (!device) return 0;

  const candidates = [
    device.updatedAt,
    device.lastSyncedAt,
    device.lastReadingAt,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function getDeviceTelemetrySnapshotTime(
  device: Partial<Device> | undefined,
  nowMs: number
) {
  if (!device) return 0;

  const latestTelemetryTime = [
    device.telemetryReceivedAt,
    device.lastSyncedAt,
    device.lastReadingAt,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => parseDisplayTimestamp(value)?.getTime() ?? 0)
    .filter(
      (value) =>
        value > 0 && value <= nowMs + ESP32_TIMESTAMP_FUTURE_TOLERANCE_MS
    );

  return latestTelemetryTime.length > 0 ? Math.max(...latestTelemetryTime) : 0;
}

function getEsp32CloudTelemetrySignature(device: Partial<Device> | undefined) {
  if (!device || device.readingSource !== "esp32") {
    return null;
  }

  return JSON.stringify([
    device.lastSyncedAt ?? "",
    device.lastReadingAt ?? "",
    typeof device.power === "number" ? device.power : null,
    typeof device.voltage === "number" ? device.voltage : null,
    typeof device.current === "number" ? device.current : null,
    typeof device.powerFactor === "number" ? device.powerFactor : null,
    normalizeEnergyKwh(device.rawEnergyTotal) ??
      normalizeEnergyKwh(device.energy) ??
      null,
    typeof device.wifiSignal === "number" ? device.wifiSignal : null,
    getDeviceRelayState(device),
    typeof device.online === "boolean" ? device.online : null,
    typeof device.pendingOfflineLogs === "number"
      ? device.pendingOfflineLogs
      : null,
    typeof device.offlineLogsSynced === "number"
      ? device.offlineLogsSynced
      : null,
    typeof device.lastOfflineSyncCount === "number"
      ? device.lastOfflineSyncCount
      : null,
    device.lastOfflineSyncAt ?? "",
    device.lastOfflineSyncArchive ?? "",
    typeof device.sdCardAvailable === "boolean"
      ? device.sdCardAvailable
      : null,
    typeof device.sdCardTotalBytes === "number"
      ? device.sdCardTotalBytes
      : null,
    typeof device.sdCardUsedBytes === "number" ? device.sdCardUsedBytes : null,
    typeof device.sdCardFreeBytes === "number" ? device.sdCardFreeBytes : null,
    typeof device.sdCardUsagePercent === "number"
      ? device.sdCardUsagePercent
      : null,
    typeof device.protectionEnabled === "boolean"
      ? device.protectionEnabled
      : null,
    typeof device.maxPowerLimit === "number" ? device.maxPowerLimit : null,
    typeof device.maxCurrentLimit === "number" ? device.maxCurrentLimit : null,
  ]);
}

function getEsp32CloudHeartbeatKey(device: Partial<Device> | undefined) {
  if (!device || device.readingSource !== "esp32") {
    return null;
  }

  return JSON.stringify([
    device.updatedAt ?? "",
    device.lastSyncedAt ?? "",
    device.lastReadingAt ?? "",
    typeof device.online === "boolean" ? device.online : null,
    getDeviceRelayState(device),
    typeof device.pendingOfflineLogs === "number"
      ? device.pendingOfflineLogs
      : null,
    typeof device.offlineLogsSynced === "number"
      ? device.offlineLogsSynced
      : null,
    typeof device.lastOfflineSyncCount === "number"
      ? device.lastOfflineSyncCount
      : null,
    device.lastOfflineSyncAt ?? "",
    typeof device.sdCardUsagePercent === "number"
      ? device.sdCardUsagePercent
      : null,
  ]);
}

function pickLatestReasonableTelemetryTimestamp(
  values: Array<string | null | undefined>,
  nowMs: number
) {
  let bestValue: string | undefined;
  let bestTime = 0;

  values.forEach((value) => {
    if (!value) return;

    const parsed = parseDisplayTimestamp(value);
    const time = parsed?.getTime() ?? 0;

    if (
      time > 0 &&
      time <= nowMs + ESP32_TIMESTAMP_FUTURE_TOLERANCE_MS &&
      time >= bestTime
    ) {
      bestTime = time;
      bestValue = value;
    }
  });

  return bestValue;
}

function isRecentEsp32TelemetryTimestamp(
  value: string | null | undefined,
  nowMs: number
) {
  const parsed = parseDisplayTimestamp(value);
  const time = parsed?.getTime() ?? 0;

  return (
    time > 0 &&
    time <= nowMs + ESP32_TIMESTAMP_FUTURE_TOLERANCE_MS &&
    nowMs - time <= ESP32_TELEMETRY_STALE_MS
  );
}

function hasRecentEsp32CloudSnapshot(
  device: Partial<Device> | undefined,
  nowMs: number
) {
  if (!device || device.readingSource !== "esp32") {
    return false;
  }

  return [device.updatedAt, device.lastSyncedAt, device.lastReadingAt].some(
    (value) => isRecentEsp32TelemetryTimestamp(value, nowMs)
  );
}

function mergeSdState(
  existingDevice: Device | undefined,
  cloudDevice: Device
) {
  return {
    pendingOfflineLogs:
      cloudDevice.pendingOfflineLogs ?? existingDevice?.pendingOfflineLogs,
    offlineLogsSynced:
      cloudDevice.offlineLogsSynced ?? existingDevice?.offlineLogsSynced,
    lastOfflineSyncCount:
      cloudDevice.lastOfflineSyncCount ?? existingDevice?.lastOfflineSyncCount,
    lastOfflineSyncAt:
      cloudDevice.lastOfflineSyncAt ?? existingDevice?.lastOfflineSyncAt,
    lastOfflineSyncArchive:
      cloudDevice.lastOfflineSyncArchive ??
      existingDevice?.lastOfflineSyncArchive,
    sdCardAvailable:
      cloudDevice.sdCardAvailable ?? existingDevice?.sdCardAvailable,
    sdCardTotalBytes:
      cloudDevice.sdCardTotalBytes ?? existingDevice?.sdCardTotalBytes,
    sdCardUsedBytes:
      cloudDevice.sdCardUsedBytes ?? existingDevice?.sdCardUsedBytes,
    sdCardFreeBytes:
      cloudDevice.sdCardFreeBytes ?? existingDevice?.sdCardFreeBytes,
    sdCardUsagePercent:
      cloudDevice.sdCardUsagePercent ?? existingDevice?.sdCardUsagePercent,
    sdFormatStatus: cloudDevice.sdFormatStatus ?? existingDevice?.sdFormatStatus,
    sdFormatCommandId:
      cloudDevice.sdFormatCommandId ?? existingDevice?.sdFormatCommandId,
    sdFormatProgress:
      cloudDevice.sdFormatProgress ?? existingDevice?.sdFormatProgress,
    sdFormatMessage:
      cloudDevice.sdFormatMessage ?? existingDevice?.sdFormatMessage,
    sdFormatUpdatedAt:
      cloudDevice.sdFormatUpdatedAt ?? existingDevice?.sdFormatUpdatedAt,
    lastSdFormatAt: cloudDevice.lastSdFormatAt ?? existingDevice?.lastSdFormatAt,
  };
}

function isEsp32TelemetryStale(device: Device, nowMs: number) {
  if (device.readingSource !== "esp32") return false;

  const snapshotTime = getDeviceTelemetrySnapshotTime(device, nowMs);

  if (snapshotTime === 0) {
    return Boolean(device.lastReadingAt || device.lastSyncedAt);
  }

  return nowMs - snapshotTime > ESP32_TELEMETRY_STALE_MS;
}

function toDisplayDevice(device: Device, nowMs: number): Device {
  if (!isEsp32TelemetryStale(device, nowMs)) {
    return {
      ...device,
      telemetryStale: false,
    };
  }

  return {
    ...device,
    online: false,
    power: 0,
    voltage: 0,
    current: 0,
    powerFactor: null,
    wifiSignal: null,
    telemetryStale: true,
  };
}

function isDeviceOfflineForCloudCommand(device: Device, nowMs: number) {
  if (device.readingSource !== "esp32") {
    return false;
  }

  return device.online === false || isEsp32TelemetryStale(device, nowMs);
}

function mergeCloudDeviceSnapshot(
  existingDevice: Device | undefined,
  cloudDevice: Device
): Device {
  const incomingRelayState = getDeviceRelayState(cloudDevice);
  const normalizedCloudDevice = syncDeviceRelayState(
    cloudDevice,
    incomingRelayState
  );
  const existingRelayState = getDeviceRelayState(
    existingDevice,
    incomingRelayState
  );
  const deviceHasEsp32Snapshot = normalizedCloudDevice.readingSource === "esp32";
  const existingHasEsp32Snapshot = existingDevice?.readingSource === "esp32";
  const nextTelemetryReceivedAt = existingDevice?.telemetryReceivedAt;

  if (deviceHasEsp32Snapshot) {
    if (!existingDevice) {
      return syncDeviceEnergyState(
        {
          ...normalizedCloudDevice,
          telemetryReceivedAt: nextTelemetryReceivedAt,
          ...resolveProtectionState(normalizedCloudDevice),
        },
        normalizedCloudDevice.energy,
        deviceHasEsp32Snapshot
      );
    }

    if (!existingHasEsp32Snapshot) {
      const firstEsp32SnapshotDevice = syncDeviceEnergyState(
        syncDeviceRelayState(
          {
            ...existingDevice,
            ...normalizedCloudDevice,
            telemetryReceivedAt: nextTelemetryReceivedAt,
            ...mergeSdState(existingDevice, normalizedCloudDevice),
            power: normalizedCloudDevice.power ?? existingDevice.power,
            voltage: normalizedCloudDevice.voltage ?? existingDevice.voltage,
            current: normalizedCloudDevice.current ?? existingDevice.current,
            powerFactor:
              normalizedCloudDevice.powerFactor ?? existingDevice.powerFactor,
            energy:
              normalizedCloudDevice.energy ??
              existingDevice.rawEnergyTotal ??
              existingDevice.energy,
            todayCost:
              normalizedCloudDevice.todayCost ?? existingDevice.todayCost,
            budgetUsed:
              normalizedCloudDevice.budgetUsed ?? existingDevice.budgetUsed,
            readingSource: "esp32",
            lastReadingAt:
              normalizedCloudDevice.lastReadingAt ?? existingDevice.lastReadingAt,
            lastSyncedAt:
              normalizedCloudDevice.lastSyncedAt ?? existingDevice.lastSyncedAt,
            updatedAt: normalizedCloudDevice.updatedAt ?? existingDevice.updatedAt,
            wifiSignal:
              normalizedCloudDevice.wifiSignal ?? existingDevice.wifiSignal,
            ...resolveProtectionState({
              ...existingDevice,
              ...normalizedCloudDevice,
            }),
            pendingOfflineLogs:
              normalizedCloudDevice.pendingOfflineLogs ??
              existingDevice.pendingOfflineLogs,
          },
          incomingRelayState
        ),
        normalizedCloudDevice.energy,
        true
      );

      return firstEsp32SnapshotDevice;
    }

    const mergedDevice = syncDeviceEnergyState(
      syncDeviceRelayState(
        {
          ...existingDevice,
          ...normalizedCloudDevice,
          telemetryReceivedAt: nextTelemetryReceivedAt,
          ...mergeSdState(existingDevice, normalizedCloudDevice),
          power: normalizedCloudDevice.power ?? existingDevice.power,
          voltage: normalizedCloudDevice.voltage ?? existingDevice.voltage,
          current: normalizedCloudDevice.current ?? existingDevice.current,
          powerFactor:
            normalizedCloudDevice.powerFactor ?? existingDevice.powerFactor,
          energy: normalizedCloudDevice.energy ?? existingDevice.energy,
          todayCost:
            normalizedCloudDevice.todayCost ?? existingDevice.todayCost,
          budgetUsed:
            normalizedCloudDevice.budgetUsed ?? existingDevice.budgetUsed,
          ...resolveProtectionState({
            ...existingDevice,
            ...normalizedCloudDevice,
          }),
        },
        incomingRelayState
      ),
      normalizedCloudDevice.energy,
      true
    );

    return mergedDevice;
  }

  if (!existingHasEsp32Snapshot || !existingDevice) {
    if (existingDevice) {
      return syncDeviceEnergyState(
        syncDeviceRelayState({
          ...existingDevice,
          ...normalizedCloudDevice,
          telemetryReceivedAt: nextTelemetryReceivedAt,
          ...mergeSdState(existingDevice, normalizedCloudDevice),
          online: normalizedCloudDevice.online ?? existingDevice.online ?? false,
          power: 0,
          voltage: 0,
          current: 0,
          powerFactor: null,
          readingSource:
            normalizedCloudDevice.readingSource ??
            existingDevice.readingSource ??
            "none",
          wifiSignal: null,
          ...resolveProtectionState({
            ...existingDevice,
            ...normalizedCloudDevice,
          }),
          pendingOfflineLogs:
            normalizedCloudDevice.pendingOfflineLogs ??
            existingDevice.pendingOfflineLogs,
          lastSyncedAt:
            normalizedCloudDevice.lastSyncedAt ?? existingDevice.lastSyncedAt,
        })
      );
    }

    return syncDeviceEnergyState(
      syncDeviceRelayState(resetNonEsp32Readings(normalizedCloudDevice))
    );
  }

  return syncDeviceEnergyState(
    syncDeviceRelayState(
      {
        ...normalizedCloudDevice,
        telemetryReceivedAt: nextTelemetryReceivedAt,
        ...mergeSdState(existingDevice, normalizedCloudDevice),
        online: normalizedCloudDevice.online ?? existingDevice.online,
        power: existingDevice.power,
        voltage: existingDevice.voltage,
        current: existingDevice.current,
        powerFactor: existingDevice.powerFactor,
        energy: existingDevice.energy,
        todayCost: existingDevice.todayCost,
        budgetUsed: existingDevice.budgetUsed,
        readingSource: "esp32",
        lastReadingAt: existingDevice.lastReadingAt,
        wifiSignal: normalizedCloudDevice.wifiSignal ?? existingDevice.wifiSignal,
        ...resolveProtectionState({
          ...existingDevice,
          ...normalizedCloudDevice,
        }),
        pendingOfflineLogs:
          normalizedCloudDevice.pendingOfflineLogs ??
          existingDevice.pendingOfflineLogs,
        lastSyncedAt:
          normalizedCloudDevice.lastSyncedAt ?? existingDevice.lastSyncedAt,
      },
      existingRelayState
    ),
    existingDevice.rawEnergyTotal ?? existingDevice.energy,
    existingHasEsp32Snapshot
  );
}

function readStoredDevices() {
  const saved = localStorage.getItem("devices");
  if (!saved) return [];

  const removedDeviceIds = readRemovedDeviceIds();
  const pendingPairings = new Map(
    readPendingDevicePairings()
      .filter((pairing) => !removedDeviceIds.has(pairing.device.id))
      .map((pairing) => [pairing.device.id, pairing])
  );

  return (JSON.parse(saved) as Device[])
    .filter(
      (device) =>
        !removedDeviceIds.has(device.id) && !pendingPairings.has(device.id)
    )
    .map((device) => {
      if (
        device.readingSource === "esp32" ||
        Boolean(device.lastReadingAt) ||
        Boolean(device.lastSyncedAt)
      ) {
        return syncDeviceEnergyState(syncDeviceRelayState(device));
      }

      return syncDeviceEnergyState(
        syncDeviceRelayState(resetNonEsp32Readings(device))
      );
    });
}

function applyEsp32ReadingToDevice(
  device: Device,
  reading: Esp32Reading,
  electricityRate: number,
  markTelemetryReceivedAt = false
): Device {
  const currentRawEnergy =
    normalizeEnergyKwh(device.rawEnergyTotal) ??
    normalizeEnergyKwh(device.energy) ??
    0;
  const nextRawEnergy =
    normalizeEnergyKwh(reading.energy) ?? currentRawEnergy;
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const readingSnapshotTime = getDeviceSnapshotTime({
    lastReadingAt: reading.timestamp,
  });
  const deviceSnapshotTime = getDeviceSnapshotTime(device);
  const nextLastReadingAt =
    pickLatestReasonableTelemetryTimestamp(
      [reading.timestamp, device.lastReadingAt],
      nowMs
    ) ??
    reading.timestamp ??
    device.lastReadingAt ??
    now;
  const nextLastSyncedAt =
    pickLatestReasonableTelemetryTimestamp(
      [device.lastSyncedAt, reading.timestamp, device.lastReadingAt],
      nowMs
    ) ??
    device.lastSyncedAt ??
    reading.timestamp ??
    device.lastReadingAt ??
    now;
  const nextTelemetryReceivedAt = markTelemetryReceivedAt
    ? now
    : device.telemetryReceivedAt;
  const nextOnline =
    markTelemetryReceivedAt ||
    isRecentEsp32TelemetryTimestamp(nextLastReadingAt, nowMs) ||
    isRecentEsp32TelemetryTimestamp(nextLastSyncedAt, nowMs)
      ? true
      : device.online;
  const relayState =
    typeof reading.status === "boolean" &&
    (readingSnapshotTime === 0 || readingSnapshotTime >= deviceSnapshotTime)
      ? reading.status
      : getDeviceRelayState(device);
  const protectionState = resolveProtectionState({
    ...device,
    ...reading,
  });

  const nextDevice = syncDeviceEnergyState(
    {
      ...device,
      status: relayState,
      relayState,
      power: reading.power ?? device.power,
      voltage: reading.voltage ?? device.voltage,
      current: reading.current ?? device.current,
      powerFactor: reading.powerFactor ?? device.powerFactor ?? null,
      online: nextOnline,
      readingSource: "esp32",
      lastReadingAt: nextLastReadingAt,
      lastSyncedAt: nextLastSyncedAt,
      telemetryReceivedAt: nextTelemetryReceivedAt,
      wifiSignal: reading.wifiSignal ?? device.wifiSignal ?? null,
      ...protectionState,
    },
    nextRawEnergy,
    true
  );
  const cost = computeCost(nextDevice.energy, electricityRate);

  return {
    ...nextDevice,
    todayCost: cost,
    budgetUsed: cost,
  };
}

function createDeviceCommand({
  uid,
  device,
  requestedBy,
  type,
  payload,
}: {
  uid: string;
  device: Device;
  requestedBy: string;
  type: DeviceCommand["type"];
  payload: DeviceCommand["payload"];
}): DeviceCommand {
  return {
    id: createId(),
    uid,
    deviceId: device.id,
    esp32Id: device.esp32Id,
    deviceName: device.name,
    type,
    status: "pending",
    requestedAt: new Date().toISOString(),
    requestedBy,
    payload,
  };
}

function getDeviceAuthEmail(esp32Id: string) {
  const localPart = esp32Id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${localPart || "esp32-device"}@enertrack.local`;
}

function createDeviceClaimRecord(
  uid: string,
  profile: UserProfile,
  device: Device
): DeviceClaimRecord | null {
  if (!device.esp32Id) return null;

  const readingPath = `users/${uid}/devices/${device.id}/readings`;
  const commandPath = `users/${uid}/devices/${device.id}/commands`;

  return {
    id: device.esp32Id,
    uid,
    ownerEmail: profile.email,
    deviceId: device.id,
    esp32Id: device.esp32Id,
    deviceAuthEmail: device.deviceAuthEmail ?? getDeviceAuthEmail(device.esp32Id),
    deviceAuthUid: device.deviceAuthUid,
    deviceName: device.name,
    status: "claimed",
    claimedAt: device.claimedAt ?? new Date().toISOString(),
    readingPath,
    commandPath,
  };
}

function getComparableDeviceTimestamp(device: Partial<Device> | undefined) {
  if (!device) return 0;

  const candidates = [
    getDeviceSnapshotTime(device),
    device.updatedAt,
    device.createdAt,
    device.claimedAt,
  ]
    .filter((value): value is string | number => Boolean(value))
    .map((value) =>
      typeof value === "number" ? value : new Date(value).getTime()
    )
    .filter((value) => Number.isFinite(value));

  return candidates.length ? Math.max(...candidates) : 0;
}

function pickMostRecentDevice(candidates: Device[]) {
  return [...candidates].sort(
    (left, right) =>
      getComparableDeviceTimestamp(right) - getComparableDeviceTimestamp(left)
  )[0];
}

function getCloudDeviceIdsToCleanup(
  cloudDevices: Device[],
  removedDeviceIds: Set<string>
) {
  const deviceIdsToCleanup = new Set<string>();
  const activeDevicesByEsp32Id = new Map<string, Device[]>();

  cloudDevices.forEach((device) => {
    if (removedDeviceIds.has(device.id)) {
      deviceIdsToCleanup.add(device.id);
      return;
    }

    if (!device.esp32Id) {
      return;
    }

    const devicesForEsp32 = activeDevicesByEsp32Id.get(device.esp32Id) ?? [];
    devicesForEsp32.push(device);
    activeDevicesByEsp32Id.set(device.esp32Id, devicesForEsp32);
  });

  activeDevicesByEsp32Id.forEach((devicesForEsp32) => {
    if (devicesForEsp32.length <= 1) {
      return;
    }

    const canonicalDevice = pickMostRecentDevice(devicesForEsp32);
    devicesForEsp32.forEach((device) => {
      if (device.id !== canonicalDevice.id) {
        deviceIdsToCleanup.add(device.id);
      }
    });
  });

  return [...deviceIdsToCleanup];
}

function isAppForegroundVisible() {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

function App() {
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [devices, setDevices] = useState<Device[]>(readStoredDevices);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(
    readFamilyMembers
  );
  const [incomingFamilyInvitations, setIncomingFamilyInvitations] = useState<
    FamilyInvitation[]
  >([]);
  const [sentFamilyInvitations, setSentFamilyInvitations] = useState<
    FamilyInvitation[]
  >([]);
  const [sharedDevices, setSharedDevices] = useState<Device[]>([]);
  const [sharedUsageHistory, setSharedUsageHistory] = useState<
    UsageHistoryEntry[]
  >([]);
  const [activeFamilyInvitation, setActiveFamilyInvitation] =
    useState<FamilyInvitation | null>(null);
  const [homeSelectedDeviceId, setHomeSelectedDeviceId] = useState<string>(
    () => localStorage.getItem("homeSelectedDeviceId") ?? ""
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [realtimeNow, setRealtimeNow] = useState(() => Date.now());
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
  const saved = localStorage.getItem("notifications");
  return saved ? JSON.parse(saved) : [];
});
  const [showNotifications, setShowNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
  const saved = localStorage.getItem("darkMode");
  return saved ? JSON.parse(saved) : false;
});
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>(() => {
  const saved = localStorage.getItem("logs");
  return saved ? JSON.parse(saved) : [];
});
  const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>(
    readStoredUsageHistory
  );
  const [currentUser, setCurrentUser] = useState<UserProfile>(readUserProfile);
  const [authAccounts, setAuthAccounts] =
    useState<AuthAccount[]>(readAuthAccounts);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
  const saved = localStorage.getItem("isAuthenticated");
  return saved ? JSON.parse(saved) : false;
});
  const [pushNotificationsEnabled, setPushNotificationsEnabled] =
    useState<boolean>(() => {
  const saved = localStorage.getItem("pushNotificationsEnabled");
  return saved ? JSON.parse(saved) : true;
});
  const [electricityRate, setElectricityRate] =
    useState<ElectricityRateSettings>(() => {
  return readElectricityRateSettings();
});
  const [exportRecords, setExportRecords] = useState<ExportRecord[]>(() => {
  const saved = localStorage.getItem("exportRecords");
  return saved ? JSON.parse(saved) : [];
});
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [offlineSyncBatches, setOfflineSyncBatches] = useState<
    OfflineSyncBatch[]
  >([]);
  const [offlineSyncDialog, setOfflineSyncDialog] =
    useState<OfflineSyncBatch | null>(null);
  const [monthlyRateReminder, setMonthlyRateReminder] =
    useState<MonthlyRateReminder | null>(null);
  const announcedOfflineBatchIds = useRef<Set<string>>(
    new Set(
      JSON.parse(localStorage.getItem("announcedOfflineBatchIds") ?? "[]") as string[]
    )
  );
  const monthlyRateReminderSessionKeys = useRef<Set<string>>(new Set());
  const duplicateCloudCleanupKeys = useRef<Set<string>>(new Set());
  const cloudDeviceTelemetrySignatures = useRef<Map<string, string>>(new Map());
  const cloudDeviceHeartbeatKeys = useRef<Map<string, string>>(new Map());
  const announcedPairingSyncErrors = useRef<Set<string>>(new Set());
  const usageHistoryBackfillAttempted = useRef<Set<string>>(new Set());
  const pendingPairingSyncInFlight = useRef(false);
  const nativeNotificationSessionStartedAt = useRef(Date.now());
  const nativeNotificationIds = useRef<Set<string> | null>(null);
  const electricityRateRef = useRef(electricityRate.rate);
  const pendingCloudEnergyLogs = useRef<Map<string, UsageLog>>(new Map());
  const pendingCloudUsageHistory = useRef<Map<string, UsageHistoryEntry>>(
    new Map()
  );

  const resetLocalUserData = useCallback(
    (nextAuthAccounts: AuthAccount[]) => {
      clearPersistedAppData(persistedAppDataKeys);
      clearScheduledLocalStorageWrite("authAccounts");
      clearPendingDevicePairings();

      duplicateCloudCleanupKeys.current.clear();
      cloudDeviceTelemetrySignatures.current.clear();
      cloudDeviceHeartbeatKeys.current.clear();
      announcedOfflineBatchIds.current.clear();
      announcedPairingSyncErrors.current.clear();
      usageHistoryBackfillAttempted.current.clear();
      pendingPairingSyncInFlight.current = false;
      pendingCloudEnergyLogs.current.clear();
      pendingCloudUsageHistory.current.clear();
      monthlyRateReminderSessionKeys.current.clear();

      setCloudUserId(null);
      setIsAuthenticated(false);
      setCurrentUser(defaultUserProfile);
      setAuthAccounts(nextAuthAccounts);
      setDevices([]);
      setFamilyMembers([]);
      setIncomingFamilyInvitations([]);
      setSentFamilyInvitations([]);
      setSharedDevices([]);
      setSharedUsageHistory([]);
      setActiveFamilyInvitation(null);
      setHomeSelectedDeviceId("");
      setSelectedDeviceId(null);
      setNotifications([]);
      setShowNotifications(false);
      setShowSearch(false);
      setDarkMode(false);
      setUsageLogs([]);
      setUsageHistory([]);
      setPushNotificationsEnabled(true);
      setElectricityRate(defaultElectricityRate);
      setExportRecords([]);
      setOfflineSyncBatches([]);
      setOfflineSyncDialog(null);
      setMonthlyRateReminder(null);
      setActiveTab("home");
    },
    []
  );

  const syncEsp32ReadingsNow = useCallback(async () => {
    if (!hasEsp32Endpoint()) return;

    try {
      const readings = await fetchEsp32Readings();

      setDevices((prev) =>
        prev.map((device) => {
          const reading = readings.find((item) =>
            readingMatchesDevice(device, item)
          );

          if (!reading) return device;

          const nextDevice = applyEsp32ReadingToDevice(
            device,
            reading,
            electricityRate.rate,
            true
          );

          return nextDevice;
        })
      );
    } catch {
      // Keep the manual refresh silent; the live loops and listeners continue running.
    }
  }, [electricityRate.rate]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const handleTogglePushNotifications = async () => {
    if (pushNotificationsEnabled) {
      setPushNotificationsEnabled(false);
      return;
    }

    const permissionGranted = await ensureNativeNotificationPermission();
    setPushNotificationsEnabled(permissionGranted);

    if (!permissionGranted) {
      addNotification({
        title: "Phone notifications blocked",
        message:
          "Allow notification permission in Android settings to receive EnerTrack alerts on your phone.",
        time: "Just now",
        type: "warning",
        isRead: false,
      });
    }
  };

  const historyViewActive = activeTab === "stats" || Boolean(selectedDeviceId);

  const displayUsageHistory = useMemo(
    () =>
      [...usageHistory, ...sharedUsageHistory].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [sharedUsageHistory, usageHistory]
  );

  const displayDevices = useMemo(() => {
    const ownDeviceIds = new Set(devices.map((device) => device.id));
    const visibleSharedDevices = sharedDevices.filter(
      (device) => !ownDeviceIds.has(device.id)
    );
    const todayKey = getLocalDateKey(realtimeNow);
    const todayCostByDevice = buildTodayCostByDevice(
      displayUsageHistory,
      todayKey,
      electricityRate.rate
    );

    return [...devices, ...visibleSharedDevices].map((device) => {
      const displayDevice = toDisplayDevice(device, realtimeNow);

      return {
        ...displayDevice,
        todayCost:
          todayCostByDevice.get(device.id) ??
          getDeviceFallbackTodayCost(displayDevice, todayKey),
      };
    });
  }, [
    devices,
    displayUsageHistory,
    electricityRate.rate,
    realtimeNow,
    sharedDevices,
  ]);

  const getElectricityRateForDevice = useCallback(
    (device?: Device | null) =>
      device?.isShared && typeof device.sharedElectricityRate === "number"
        ? device.sharedElectricityRate
        : electricityRate.rate,
    [electricityRate.rate]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRealtimeNow(Date.now());
    }, UI_CLOCK_TICK_MS);

    return () => window.clearInterval(interval);
  }, []);

useEffect(() => {
  if (!isFirebaseConfigured || !firebaseAuth) return;

  return onAuthStateChanged(firebaseAuth, (user) => {
    if (!user) {
      setCloudUserId(null);
      setIsAuthenticated(false);
      return;
    }

    const profile = getProfileFromFirebaseUser(user);
    setCloudUserId(user.uid);
    setCurrentUser(profile);
    setIsAuthenticated(true);
    void ensureUserCloudDefaults(
      user.uid,
      profile,
      {
        darkMode,
        pushNotificationsEnabled,
        homeSelectedDeviceId,
      },
      electricityRate
    ).catch((error) => {
      console.error("Failed to sync Firebase user defaults.", error);
    });
  });
}, []);

useEffect(() => {
  electricityRateRef.current = electricityRate.rate;
}, [electricityRate.rate]);

useEffect(() => {
  if (!cloudUserId) return;

  return subscribeUserCloudData(cloudUserId, {
    onProfile: setCurrentUser,
    onPreferences: (preferences) => {
      setDarkMode(preferences.darkMode);
      setPushNotificationsEnabled(preferences.pushNotificationsEnabled);
      setHomeSelectedDeviceId(preferences.homeSelectedDeviceId);
    },
    onElectricityRate: setElectricityRate,
    onDevices: (cloudDevices) => {
      const removedDeviceIds = readRemovedDeviceIds();
      const cloudDeviceIdsToCleanup = getCloudDeviceIdsToCleanup(
        cloudDevices,
        removedDeviceIds
      );

      if (cloudUserId && cloudDeviceIdsToCleanup.length > 0) {
        const cleanupKey = [...cloudDeviceIdsToCleanup].sort().join("|");

        if (!duplicateCloudCleanupKeys.current.has(cleanupKey)) {
          duplicateCloudCleanupKeys.current.add(cleanupKey);

          writeCloud(
            deleteCloudDeviceAliases(cloudUserId, cloudDeviceIdsToCleanup).finally(
              () => {
                duplicateCloudCleanupKeys.current.delete(cleanupKey);
              }
            )
          );
        }
      }

      const visibleCloudDevices = cloudDevices.filter(
        (device) => !removedDeviceIds.has(device.id)
      );
      const previousTelemetrySignatures =
        cloudDeviceTelemetrySignatures.current;
      const previousHeartbeatKeys = cloudDeviceHeartbeatKeys.current;
      const nextTelemetrySignatures = new Map<string, string>();
      const nextHeartbeatKeys = new Map<string, string>();
      const pendingTelemetryLogs: Array<{
        id: string;
        deviceId: string;
        deviceName: string;
        date: string;
        energy: number;
        electricityRate?: number;
        cost: number;
        action: UsageLog["action"];
        details: string;
      }> = [];

      visibleCloudDevices.forEach((device) => {
        const signature = getEsp32CloudTelemetrySignature(device);
        const heartbeatKey = getEsp32CloudHeartbeatKey(device);
        if (signature) {
          nextTelemetrySignatures.set(device.id, signature);
        }
        if (heartbeatKey) {
          nextHeartbeatKeys.set(device.id, heartbeatKey);
        }
      });

      setDevices((prev) => {
        const previousDevices = new Map(
          prev.map((device) => [device.id, device])
        );
        const rootTelemetryReceivedAt = new Date().toISOString();
        const rootTelemetryNowMs = Date.now();
        const syncedDevices = visibleCloudDevices.map((device) => {
          const previousDevice = previousDevices.get(device.id);
          const mergedDevice = mergeCloudDeviceSnapshot(
            previousDevice,
            device
          );
          const previousSignature = previousTelemetrySignatures.get(device.id);
          const nextSignature = nextTelemetrySignatures.get(device.id);
          const previousHeartbeatKey = previousHeartbeatKeys.get(device.id);
          const nextHeartbeatKey = nextHeartbeatKeys.get(device.id);
          const hasLiveRootTelemetryUpdate =
            Boolean(previousSignature) &&
            Boolean(nextSignature) &&
            previousSignature !== nextSignature;
          const hasRootHeartbeatUpdate =
            Boolean(previousHeartbeatKey) &&
            Boolean(nextHeartbeatKey) &&
            previousHeartbeatKey !== nextHeartbeatKey;
          const hasRecentInitialRootSnapshot =
            !previousHeartbeatKey &&
            Boolean(nextHeartbeatKey) &&
            device.online === true &&
            hasRecentEsp32CloudSnapshot(device, rootTelemetryNowMs);
          const shouldRefreshRootTelemetry =
            hasLiveRootTelemetryUpdate ||
            hasRootHeartbeatUpdate ||
            hasRecentInitialRootSnapshot;

          if (hasLiveRootTelemetryUpdate) {
            const previousRawEnergy =
              normalizeEnergyKwh(previousDevice?.rawEnergyTotal) ??
              normalizeEnergyKwh(previousDevice?.energy) ??
              0;
            const nextRawEnergy =
              normalizeEnergyKwh(mergedDevice.rawEnergyTotal) ??
              normalizeEnergyKwh(mergedDevice.energy) ??
              previousRawEnergy;
            const energyDelta = Number(
              Math.max(0, nextRawEnergy - previousRawEnergy).toFixed(4)
            );

            if (energyDelta > 0) {
              const logDate = toUsageLogTimestamp(
                mergedDevice.lastReadingAt,
                mergedDevice.lastSyncedAt
              );
              const minuteBucket = toUsageLogMinuteBucket(logDate);

              pendingTelemetryLogs.push({
                id: `root-reading-${device.id}-${minuteBucket}`,
                deviceId: device.id,
                deviceName: mergedDevice.name,
                date: logDate,
                energy: energyDelta,
                electricityRate: electricityRateRef.current,
                cost: computeCost(energyDelta, electricityRateRef.current),
                action: "energy_reading",
                details:
                  "Smart Plug live reading accumulated during this minute.",
              });
            }
          }

          if (!shouldRefreshRootTelemetry) {
            return mergedDevice;
          }

          return {
            ...mergedDevice,
            online: true,
            telemetryReceivedAt: rootTelemetryReceivedAt,
          };
        });
        const pendingDevices = readPendingDevicePairings()
          .filter((pairing) => !removedDeviceIds.has(pairing.device.id))
          .filter(
            (pairing) =>
              !visibleCloudDevices.some((device) => device.id === pairing.device.id)
          )
          .map((pairing) =>
            syncDeviceEnergyState(
              syncDeviceRelayState({
                ...(previousDevices.get(pairing.device.id) ?? pairing.device),
                ...pairing.device,
              })
            )
          );

        return [...syncedDevices, ...pendingDevices];
      });

      pendingTelemetryLogs.forEach((log) => {
        addUsageLog(log);
      });

      cloudDeviceTelemetrySignatures.current = nextTelemetrySignatures;
      cloudDeviceHeartbeatKeys.current = nextHeartbeatKeys;
    },
    onFamilyMembers: setFamilyMembers,
    onNotifications: setNotifications,
    onExportRecords: setExportRecords,
    onOfflineSyncBatches: setOfflineSyncBatches,
  });
}, [cloudUserId]);

useEffect(() => {
  if (!cloudUserId || !currentUser.email) {
    setIncomingFamilyInvitations([]);
    setSentFamilyInvitations([]);
    setSharedDevices([]);
    return;
  }

  const unsubscribeIncoming = subscribeIncomingFamilyInvitations(
    normalizeEmail(currentUser.email),
    setIncomingFamilyInvitations
  );
  const unsubscribeSent = subscribeSentFamilyInvitations(
    cloudUserId,
    setSentFamilyInvitations
  );

  return () => {
    unsubscribeIncoming();
    unsubscribeSent();
  };
}, [cloudUserId, currentUser.email]);

useEffect(() => {
  if (!cloudUserId) {
    setSharedDevices([]);
    return;
  }

  return subscribeCloudSharedDevices(
    incomingFamilyInvitations,
    cloudUserId,
    setSharedDevices
  );
}, [cloudUserId, incomingFamilyInvitations]);

useEffect(() => {
  if (!cloudUserId || !historyViewActive) {
    setSharedUsageHistory([]);
    return;
  }

  return subscribeCloudSharedUsageData(
    incomingFamilyInvitations,
    cloudUserId,
    setSharedUsageHistory
  );
}, [cloudUserId, historyViewActive, incomingFamilyInvitations]);

useEffect(() => {
  const pendingInvite = incomingFamilyInvitations.find(
    (invitation) => invitation.status === "pending"
  );

  setActiveFamilyInvitation((current) => {
    if (current) {
      const refreshed = incomingFamilyInvitations.find(
        (invitation) => invitation.id === current.id
      );

      if (refreshed?.status === "pending") {
        return refreshed;
      }
    }

    return pendingInvite ?? null;
  });
}, [incomingFamilyInvitations]);

useEffect(() => {
  if (!cloudUserId) return;

  void saveUserPreferences(cloudUserId, {
    darkMode,
    pushNotificationsEnabled,
    homeSelectedDeviceId,
  });
}, [cloudUserId, darkMode, homeSelectedDeviceId, pushNotificationsEnabled]);

useEffect(() => {
  if (!cloudUserId || !historyViewActive) return;

  const unsubscribeUsageLogs = subscribeCloudUsageLogs(cloudUserId, setUsageLogs);
  const unsubscribeUsageHistory = subscribeCloudUsageHistory(
    cloudUserId,
    (entries) => {
      setUsageHistory((prev) => mergeUsageHistoryCollections(prev, entries));
    }
  );

  return () => {
    unsubscribeUsageLogs();
    unsubscribeUsageHistory();
  };
}, [cloudUserId, historyViewActive]);

useEffect(() => {
  if (usageHistory.length > 0) {
    return;
  }

  const derivedHistory = buildUsageHistoryFromLogs(usageLogs);

  if (!derivedHistory.length) {
    return;
  }

  setUsageHistory(derivedHistory);
}, [usageHistory.length, usageLogs]);

useEffect(() => {
  if (
    !cloudUserId ||
    !historyViewActive ||
    usageHistoryBackfillAttempted.current.has(cloudUserId) ||
    usageHistory.length === 0
  ) {
    return;
  }

  usageHistoryBackfillAttempted.current.add(cloudUserId);
  usageHistory.forEach((entry) => {
    writeCloud(saveCloudUsageHistoryEntry(cloudUserId, entry));
  });
}, [cloudUserId, historyViewActive, usageHistory]);

useEffect(() => {
  if (!cloudUserId || !selectedDeviceId) return;

  return subscribeCloudDeviceCommands(cloudUserId, selectedDeviceId, (commands) => {
    const latestFormatCommand = commands.find(
      (command) => command.type === "format_sd"
    );

    if (!latestFormatCommand) {
      return;
    }

    setDevices((prev) =>
      prev.map((device) => {
        if (device.id !== selectedDeviceId) return device;

        const trackedCommandId = device.sdFormatCommandId;
        const relevantCommand =
          trackedCommandId && latestFormatCommand.id !== trackedCommandId
            ? commands.find(
                (command) =>
                  command.type === "format_sd" &&
                  command.id === trackedCommandId
              )
            : latestFormatCommand;

        if (!relevantCommand) {
          return device;
        }

        const requestedAtMs = new Date(relevantCommand.requestedAt).getTime();
        const commandWaitingTooLong =
          relevantCommand.status === "pending" &&
          Number.isFinite(requestedAtMs) &&
          realtimeNow - requestedAtMs > 30000;

        if (relevantCommand.status === "failed") {
          return {
            ...device,
            sdFormatCommandId: relevantCommand.id,
            sdFormatStatus: "failed",
            sdFormatProgress: device.sdFormatProgress ?? 0,
            sdFormatMessage:
              relevantCommand.error ??
              "The Smart Plug reported that SD data cleanup failed.",
            sdFormatUpdatedAt:
              relevantCommand.acknowledgedAt ?? new Date().toISOString(),
          };
        }

        if (relevantCommand.status === "acknowledged") {
          if (
            device.sdFormatStatus === "completed" ||
            device.sdFormatStatus === "failed"
          ) {
            return device;
          }

          return {
            ...device,
            sdFormatCommandId: relevantCommand.id,
            sdFormatStatus: "completed",
            sdFormatProgress: 100,
            sdFormatMessage:
              "Smart Plug acknowledged the cleanup command and completed the SD card cleanup.",
            sdFormatUpdatedAt:
              relevantCommand.acknowledgedAt ?? new Date().toISOString(),
            lastSdFormatAt:
              relevantCommand.acknowledgedAt ?? new Date().toISOString(),
          };
        }

        return {
          ...device,
          sdFormatCommandId: relevantCommand.id,
          sdFormatStatus: "queued",
          sdFormatProgress: 0,
          sdFormatMessage: commandWaitingTooLong
            ? "Still waiting for the Smart Plug to read the Firebase SD cleanup command. Check that the Smart Plug is online and flashed with the latest firmware."
            : "Command queued. Waiting for the Smart Plug to start SD cleanup.",
          sdFormatUpdatedAt:
            relevantCommand.requestedAt ?? device.sdFormatUpdatedAt,
        };
      })
    );
  });
}, [cloudUserId, realtimeNow, selectedDeviceId]);

useEffect(() => {
  scheduleLocalStorageWrite("devices", JSON.stringify(devices));
}, [devices]);

useEffect(() => {
  scheduleLocalStorageWrite("familyMembers", JSON.stringify(familyMembers));
}, [familyMembers]);

useEffect(() => {
  scheduleLocalStorageWrite("homeSelectedDeviceId", homeSelectedDeviceId);
}, [homeSelectedDeviceId]);

useEffect(() => {
  scheduleLocalStorageWrite("notifications", JSON.stringify(notifications));
}, [notifications]);

useEffect(() => {
  if (nativeNotificationIds.current === null) {
    nativeNotificationIds.current = new Set(
      notifications.map((notification) => notification.id)
    );
    return;
  }

  const knownIds = nativeNotificationIds.current;

  if (!pushNotificationsEnabled) {
    notifications.forEach((notification) => knownIds.add(notification.id));
    return;
  }

  notifications.forEach((notification) => {
    if (notification.isRead || knownIds.has(notification.id)) {
      return;
    }

    knownIds.add(notification.id);

    const createdAtMs = new Date(notification.createdAt ?? "").getTime();
    if (
      !Number.isFinite(createdAtMs) ||
      createdAtMs < nativeNotificationSessionStartedAt.current - 30_000 ||
      isAppForegroundVisible()
    ) {
      return;
    }

    void showNativeNotification(notification);
  });
}, [notifications, pushNotificationsEnabled]);

useEffect(() => {
  scheduleLocalStorageWrite("logs", JSON.stringify(usageLogs));
}, [usageLogs]);

useEffect(() => {
  scheduleLocalStorageWrite("usageHistory", JSON.stringify(usageHistory));
}, [usageHistory]);

useEffect(() => {
  const deviceIds = new Set(devices.map((device) => device.id));

  setFamilyMembers((prev) => {
    const nextMembers = prev
      .map((member) => {
        if (member.isOwner) return member;

        return {
          ...member,
          deviceIds: member.deviceIds.filter((deviceId) =>
            deviceIds.has(deviceId)
          ),
        };
      })
      .filter((member) => member.isOwner || member.deviceIds.length > 0);

    return JSON.stringify(nextMembers) === JSON.stringify(prev)
      ? prev
      : nextMembers;
  });

  setHomeSelectedDeviceId((prev) => {
    if (devices.length === 0) return "";
    if (prev && deviceIds.has(prev)) return prev;

    return devices[0].id;
  });

  setOfflineSyncBatches((prev) => {
    const nextBatches = prev.filter((batch) => deviceIds.has(batch.deviceId));
    return nextBatches.length === prev.length ? prev : nextBatches;
  });
}, [devices]);

useEffect(() => {
  setDevices((prev) => {
    let changed = false;
    const nextDevices = prev.map((device) => {
      const sharedWith = countSharedUsersForDevice(familyMembers, device.id);

      if ((device.sharedWith || 0) === sharedWith) {
        return device;
      }

      changed = true;
      return {
        ...device,
        sharedWith,
      };
    });

    return changed ? nextDevices : prev;
  });
}, [familyMembers]);

useEffect(() => {
  const visibleDevices = [...devices, ...sharedDevices];
  const deviceIds = new Set(visibleDevices.map((device) => device.id));

  setHomeSelectedDeviceId((prev) => {
    if (visibleDevices.length === 0) return "";
    if (prev && deviceIds.has(prev)) return prev;

    return visibleDevices[0].id;
  });

  setSelectedDeviceId((prev) => {
    if (!prev || deviceIds.has(prev)) return prev;

    return null;
  });
}, [devices, sharedDevices]);

useEffect(() => {
  if (!sentFamilyInvitations.length) return;

  const invitationsById = new Map(
    sentFamilyInvitations.map((invitation) => [invitation.id, invitation])
  );

  setFamilyMembers((prev) => {
    let changed = false;
    const nextMembers = prev.map((member) => {
      if (!member.inviteId) return member;

      const invitation = invitationsById.get(member.inviteId);
      if (!invitation) return member;

      const nextMember = {
        ...member,
        inviteStatus: invitation.status,
        acceptedAt:
          invitation.status === "accepted"
            ? invitation.respondedAt ?? member.acceptedAt ?? null
            : member.acceptedAt ?? null,
      };

      if (JSON.stringify(nextMember) !== JSON.stringify(member)) {
        changed = true;
      }

      return nextMember;
    });

    return changed ? nextMembers : prev;
  });
}, [sentFamilyInvitations]);

useEffect(() => {
  scheduleLocalStorageWrite("darkMode", JSON.stringify(darkMode));
}, [darkMode]);

useEffect(() => {
  scheduleLocalStorageWrite("profile", JSON.stringify(currentUser));
}, [currentUser]);

useEffect(() => {
  scheduleLocalStorageWrite("authAccounts", JSON.stringify(authAccounts));
}, [authAccounts]);

useEffect(() => {
  scheduleLocalStorageWrite("isAuthenticated", JSON.stringify(isAuthenticated));
}, [isAuthenticated]);

useEffect(() => {
  scheduleLocalStorageWrite(
    "pushNotificationsEnabled",
    JSON.stringify(pushNotificationsEnabled)
  );
}, [pushNotificationsEnabled]);

useEffect(() => {
  scheduleLocalStorageWrite("electricityRate", JSON.stringify(electricityRate));
}, [electricityRate]);

useEffect(() => {
  scheduleLocalStorageWrite("exportRecords", JSON.stringify(exportRecords));
}, [exportRecords]);

useEffect(() => {
  setDevices((prev) =>
    prev.map((device) => {
      const syncedCost = computeCost(device.energy, electricityRate.rate);

      return {
        ...device,
        todayCost: syncedCost,
        budgetUsed: syncedCost,
      };
    })
  );
}, [electricityRate.rate]);

useEffect(() => {
  if (!cloudUserId || electricityRate.rate <= 0) return;

  sentFamilyInvitations
    .filter(
      (invitation) =>
        invitation.ownerUid === cloudUserId &&
        invitation.status !== "declined" &&
        invitation.status !== "revoked" &&
        invitation.electricityRate !== electricityRate.rate
    )
    .forEach((invitation) => {
      writeCloud(
        saveCloudFamilyInvitation({
          ...invitation,
          electricityRate: electricityRate.rate,
          electricityRateUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
    });
}, [cloudUserId, electricityRate.rate, sentFamilyInvitations]);

const writeCloud = (task: Promise<unknown>) => {
  if (!cloudUserId) return;

  void task.catch(() => {
    // Local state stays usable if Firebase is temporarily unreachable.
  });
};

async function getCloudDevicesForEsp32(esp32Id: string) {
  if (!cloudUserId || !esp32Id) {
    return [];
  }

  return findCloudDevicesByEsp32Id(cloudUserId, esp32Id);
}

async function cleanupCloudDevicesByIds(deviceIds: string[]) {
  if (!cloudUserId) {
    return;
  }

  const uniqueDeviceIds = [...new Set(deviceIds.filter(Boolean))];
  if (!uniqueDeviceIds.length) {
    return;
  }

  const deviceIdSet = new Set(uniqueDeviceIds);
  const affectedFamilyMembers = familyMembers.filter(
    (member) =>
      !member.isOwner &&
      member.deviceIds.some((memberDeviceId) => deviceIdSet.has(memberDeviceId))
  );

  await Promise.all([
    ...uniqueDeviceIds.map((deviceId) => deleteCloudDevice(cloudUserId, deviceId)),
    ...uniqueDeviceIds.map((deviceId) =>
      deleteCloudOfflineSyncBatchesForDevice(cloudUserId, deviceId)
    ),
    ...affectedFamilyMembers.map((member) => {
      const nextMember = {
        ...member,
        deviceIds: member.deviceIds.filter(
          (memberDeviceId) => !deviceIdSet.has(memberDeviceId)
        ),
      };

      return nextMember.deviceIds.length > 0
        ? saveCloudFamilyMember(cloudUserId, nextMember)
        : deleteCloudFamilyMember(cloudUserId, member.id);
    }),
  ]);
}

async function resolvePairingRegistrationTarget(pairing: PendingDevicePairing) {
  if (!pairing.device.esp32Id) {
    return {
      device: pairing.device,
      duplicateDeviceIds: [] as string[],
    };
  }

  const cloudDevices = await getCloudDevicesForEsp32(pairing.device.esp32Id);
  if (!cloudDevices.length) {
    return {
      device: pairing.device,
      duplicateDeviceIds: [] as string[],
    };
  }

  const matchingPasswordDevices = pairing.device.devicePasswordHash
    ? cloudDevices.filter(
        (device) =>
          device.devicePasswordHash === pairing.device.devicePasswordHash
      )
    : [];

  if (!matchingPasswordDevices.length) {
    return {
      device: pairing.device,
      duplicateDeviceIds: cloudDevices.map((device) => device.id),
    };
  }

  const canonicalDevice = pickMostRecentDevice(matchingPasswordDevices);
  const duplicateDeviceIds = cloudDevices
    .filter((device) => device.id !== canonicalDevice.id)
    .map((device) => device.id);
  const nextDevice = mergeCloudDeviceSnapshot(canonicalDevice, {
    ...pairing.device,
    id: canonicalDevice.id,
    deviceAuthEmail:
      canonicalDevice.deviceAuthEmail ?? pairing.device.deviceAuthEmail,
    deviceAuthUid: canonicalDevice.deviceAuthUid ?? pairing.device.deviceAuthUid,
    createdAt: canonicalDevice.createdAt ?? pairing.device.createdAt,
    claimedAt: canonicalDevice.claimedAt ?? pairing.device.claimedAt,
    updatedAt: new Date().toISOString(),
  });

  return {
    device: nextDevice,
    duplicateDeviceIds,
  };
}

const createClaimForDevice = (device: Device) =>
  cloudUserId ? createDeviceClaimRecord(cloudUserId, currentUser, device) : null;

const addUsageHistoryEntries = (entries: UsageHistoryEntry[]) => {
  if (!entries.length) {
    return;
  }

  setUsageHistory((prev) => {
    const nextEntries = new Map(
      prev.map((entry) => [entry.id, entry] as const)
    );

    entries.forEach((entry) => {
      const existingEntry = nextEntries.get(entry.id);
      nextEntries.set(
        entry.id,
        existingEntry
          ? accumulateUsageHistoryEntry(existingEntry, entry)
          : entry
      );
    });

    return [...nextEntries.values()].sort(sortUsageHistoryEntries);
  });

  if (!cloudUserId) {
    return;
  }

  entries.forEach((entry) => {
    const existingEntry = pendingCloudUsageHistory.current.get(entry.id);
    pendingCloudUsageHistory.current.set(
      entry.id,
      existingEntry
        ? accumulateUsageHistoryEntry(existingEntry, entry)
        : entry
    );
  });
};

const addUsageLog = (
  log: Omit<UsageLog, "id" | "date"> & {
    id?: string;
    date?: string;
  }
) => {
  const nextLog = {
    ...log,
    electricityRate: log.electricityRate ?? electricityRateRef.current,
    id: log.id ?? createId(),
    date: log.date ?? new Date().toISOString(),
  };
  const historyEntry = toUsageHistoryEntry(nextLog);

  setUsageLogs((prev) => {
    const existingIndex = prev.findIndex((item) => item.id === nextLog.id);

    if (existingIndex < 0) {
      return [nextLog, ...prev];
    }

    const existingLog = prev[existingIndex];

    if (
      existingLog.action === "energy_reading" &&
      nextLog.action === "energy_reading"
    ) {
      const mergedLog: UsageLog = {
        ...existingLog,
        deviceName: nextLog.deviceName,
        date:
          new Date(nextLog.date).getTime() >= new Date(existingLog.date).getTime()
            ? nextLog.date
            : existingLog.date,
        energy: Number((existingLog.energy + nextLog.energy).toFixed(4)),
        cost: Number((existingLog.cost + nextLog.cost).toFixed(2)),
        electricityRate:
          existingLog.electricityRate === nextLog.electricityRate
            ? existingLog.electricityRate
            : undefined,
        details: nextLog.details,
      };
      const nextLogs = [...prev];
      nextLogs.splice(existingIndex, 1);
      return [mergedLog, ...nextLogs];
    }

    return prev;
  });

  if (historyEntry) {
    addUsageHistoryEntries([historyEntry]);
  }

  if (cloudUserId) {
    if (nextLog.action === "energy_reading") {
      const existingLog = pendingCloudEnergyLogs.current.get(nextLog.id);

      pendingCloudEnergyLogs.current.set(
        nextLog.id,
        existingLog
          ? {
              ...existingLog,
              deviceName: nextLog.deviceName,
              date:
                new Date(nextLog.date).getTime() >=
                new Date(existingLog.date).getTime()
                  ? nextLog.date
                  : existingLog.date,
              energy: Number((existingLog.energy + nextLog.energy).toFixed(4)),
              cost: Number((existingLog.cost + nextLog.cost).toFixed(2)),
              electricityRate:
                existingLog.electricityRate === nextLog.electricityRate
                  ? existingLog.electricityRate
                  : undefined,
              details: nextLog.details,
            }
          : nextLog
      );
      return;
    }

    writeCloud(saveCloudUsageLog(cloudUserId, nextLog));
  }
};

useEffect(() => {
  if (!cloudUserId) {
    pendingCloudEnergyLogs.current.clear();
    pendingCloudUsageHistory.current.clear();
    return;
  }

  const flushPendingEnergyLogs = () => {
    const currentMinuteBucket = toUsageLogMinuteBucket(new Date().toISOString());
    const readyLogs = [...pendingCloudEnergyLogs.current.values()].filter(
      (log) => toUsageLogMinuteBucket(log.date) < currentMinuteBucket
    );
    const readyUsageHistory = [...pendingCloudUsageHistory.current.values()].filter(
      (entry) => toUsageLogMinuteBucket(entry.date) < currentMinuteBucket
    );

    if (!readyLogs.length && !readyUsageHistory.length) {
      return;
    }

    readyLogs.forEach((log) => {
      pendingCloudEnergyLogs.current.delete(log.id);
      writeCloud(saveCloudUsageLog(cloudUserId, log));
    });

    readyUsageHistory.forEach((entry) => {
      pendingCloudUsageHistory.current.delete(entry.id);
      writeCloud(saveCloudUsageHistoryEntry(cloudUserId, entry));
    });
  };

  flushPendingEnergyLogs();
  const interval = window.setInterval(flushPendingEnergyLogs, 15000);

  return () => window.clearInterval(interval);
}, [cloudUserId]);

const addNotification = (
  notification: Omit<AppNotification, "id"> & {
    id?: string;
  }
) => {
  const nextNotification = {
    ...notification,
    id: notification.id ?? createId(),
    createdAt: notification.createdAt ?? new Date().toISOString(),
  };

  setNotifications((prev) => [nextNotification, ...prev]);

  if (cloudUserId) {
    writeCloud(saveCloudNotification(cloudUserId, nextNotification));
  }
};

useEffect(() => {
  if (!isAuthenticated) return;

  const accountKey = getStoredRateReminderAccountKey(currentUser, cloudUserId);
  if (!accountKey) return;

  const monthDate = new Date();
  const monthKey = getBillingMonthKey(monthDate);
  const monthLabel = getBillingMonthLabel(monthDate);

  if (isElectricityRateCurrentForMonth(electricityRate, monthKey, monthLabel)) {
    setMonthlyRateReminder((prev) =>
      prev?.monthKey === monthKey ? null : prev
    );
    return;
  }

  const sessionKey = `${accountKey}:${monthKey}`;
  if (monthlyRateReminderSessionKeys.current.has(sessionKey)) {
    return;
  }

  const reminderState = readMonthlyRateReminderState();
  if (reminderState[accountKey] === monthKey) {
    monthlyRateReminderSessionKeys.current.add(sessionKey);
    return;
  }

  monthlyRateReminderSessionKeys.current.add(sessionKey);
  saveMonthlyRateReminderState({
    ...reminderState,
    [accountKey]: monthKey,
  });

  setMonthlyRateReminder({
    monthKey,
    monthLabel,
    currentRate: electricityRate.rate,
    sourceName: electricityRate.sourceName,
    effectiveBillingMonth: electricityRate.effectiveBillingMonth,
  });

  if (pushNotificationsEnabled) {
    addNotification({
      id: `monthly-rate-update-${monthKey}-${toNotificationIdPart(accountKey)}`,
      title: "Review Electricity Rate",
      message: `Review your electricity rate for ${monthLabel} so estimated costs stay accurate.`,
      time: "Just now",
      type: "info",
      isRead: false,
      category: "monthly_rate_update",
    });
  }
}, [
  cloudUserId,
  currentUser,
  electricityRate,
  isAuthenticated,
  pushNotificationsEnabled,
]);

const deviceHasPendingCloudRegistration = (deviceId: string) =>
  readPendingDevicePairings().some((pairing) => pairing.device.id === deviceId);

const requireDeviceCloudRegistration = async (device: Device) => {
  if (!deviceHasPendingCloudRegistration(device.id)) {
    return true;
  }

  await syncPendingDevicePairings(true);

  if (!deviceHasPendingCloudRegistration(device.id)) {
    return true;
  }

  const pendingPairing = readPendingDevicePairings().find(
    (pairing) => pairing.device.id === device.id
  );
  const registrationError =
    pendingPairing?.device.cloudRegistrationError ??
    "Reconnect to internet Wi-Fi and wait for Firebase registration to finish.";

  if (pushNotificationsEnabled) {
    addNotification({
      title: "Device registration pending",
      message: `${device.name} is not registered in Firebase yet. ${registrationError}`,
      time: "Just now",
      type: "info",
      isRead: false,
    });
  }

  return false;
};

const notifyOfflineCloudCommandBlocked = (
  device: Device,
  actionLabel: string
) => {
  if (!pushNotificationsEnabled) {
    return;
  }

  addNotification({
    title: `${actionLabel} not sent`,
    message: `${device.name} is offline right now. Reconnect the Smart Plug first, then try again.`,
    time: "Just now",
    type: "info",
    isRead: false,
  });
};

const handleEsp32RelayCommand = async (
  targetDevice: Device,
  nextStatus: boolean,
  reason: "manual" | "schedule" | "budget" = "manual",
  showConnectionError = true
) => {
  if (!canControlDevice(targetDevice)) {
    if (showConnectionError && pushNotificationsEnabled) {
      addNotification({
        title: "Control access required",
        message: `${targetDevice.name} is shared with view-only access. Ask the owner to allow control access.`,
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return false;
  }

  const commandOwnerUid = getDeviceCloudOwnerUid(targetDevice, cloudUserId);

  if (!hasEsp32Endpoint()) {
    const canUseCloudCommand = await requireDeviceCloudRegistration(targetDevice);

    if (!canUseCloudCommand) {
      return false;
    }

    if (isDeviceOfflineForCloudCommand(targetDevice, Date.now())) {
      if (showConnectionError) {
        notifyOfflineCloudCommandBlocked(targetDevice, "Relay command");
      }

      return false;
    }

    if (commandOwnerUid) {
      const connectivity = await checkFirebaseConnectivity();

      if (!connectivity.ok) {
        if (showConnectionError && pushNotificationsEnabled) {
          addNotification({
            title: "Smart Plug command not queued",
            message:
              connectivity.message ??
              "Firebase is not reachable from this network yet.",
            time: "Just now",
            type: "info",
            isRead: false,
          });
        }

        return false;
      }

      const command = createDeviceCommand({
        uid: commandOwnerUid,
        device: targetDevice,
        requestedBy: currentUser.email,
        type: "relay",
        payload: {
          relayStatus: nextStatus,
          reason,
        },
      });

      try {
        await saveCloudDeviceCommand(commandOwnerUid, command);
      } catch (error) {
        if (showConnectionError && pushNotificationsEnabled) {
          addNotification({
            title: "Smart Plug command not queued",
            message: getErrorMessage(
              error,
              `Firebase could not save the command for ${targetDevice.name}.`
            ),
            time: "Just now",
            type: "info",
            isRead: false,
          });
        }

        return false;
      }

      if (pushNotificationsEnabled) {
        addNotification({
          title: "Smart Plug command queued",
          message: `${targetDevice.name} will turn ${nextStatus ? "ON" : "OFF"} when the Smart Plug reads the Firebase command.`,
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }

      addUsageLog({
        deviceId: targetDevice.id,
        deviceName: targetDevice.name,
        energy: targetDevice.energy,
        cost: targetDevice.todayCost,
        action: "relay_command_queued",
        details: `Relay turn ${nextStatus ? "ON" : "OFF"} command queued in Firebase. Waiting for Smart Plug confirmation.`,
      });

      return true;
    }

    if (showConnectionError && pushNotificationsEnabled) {
      addNotification({
        title: "Smart Plug connection required",
        message:
          "Relay state and readings must come from the Smart Plug. Configure the local Smart Plug endpoint to control this device.",
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return false;
  }

  try {
    const reading = await sendEsp32RelayCommand(targetDevice, nextStatus);
    const syncedReading = {
      ...reading,
      status: reading.status ?? nextStatus,
    };
    const energy = syncedReading.energy ?? targetDevice.energy;
    const cost = computeCost(energy, electricityRate.rate);
    const title =
      reason === "schedule"
        ? `Scheduled turn ${nextStatus ? "ON" : "OFF"}`
        : reason === "budget"
          ? "Budget auto turn off"
          : `Device turned ${nextStatus ? "ON" : "OFF"}`;
    const message =
      reason === "schedule"
        ? `${targetDevice.name} was turned ${nextStatus ? "ON" : "OFF"} by its Smart Plug schedule command.`
        : reason === "budget"
          ? `${targetDevice.name} was turned OFF by its Smart Plug budget command.`
          : `${targetDevice.name} was turned ${nextStatus ? "ON" : "OFF"} by Smart Plug.`;

    setDevices((prev) =>
      prev.map((device) =>
        device.id === targetDevice.id
          ? applyEsp32ReadingToDevice(
              device,
              {
                ...syncedReading,
                energy,
              },
              electricityRate.rate,
              true
            )
          : device
      )
    );
    if (pushNotificationsEnabled) {
      addNotification({
        title,
        message,
        time: "Just now",
        type: reason === "budget" ? "budget" : "info",
        isRead: false,
      });
    }

    addUsageLog({
      deviceId: targetDevice.id,
      deviceName: targetDevice.name,
      energy,
      cost,
      action: nextStatus ? "turned_on" : "turned_off",
      details:
        reason === "schedule"
          ? `Relay turned ${nextStatus ? "ON" : "OFF"} by schedule.`
          : reason === "budget"
            ? "Relay turned OFF because the budget limit was reached."
            : `Relay turned ${nextStatus ? "ON" : "OFF"} manually.`,
    });

    return true;
  } catch {
    if (showConnectionError && pushNotificationsEnabled) {
      addNotification({
        title: "Smart Plug command failed",
        message: `The app could not confirm ${targetDevice.name} from the Smart Plug, so the local relay state was not changed.`,
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return false;
  }
};

const handleSetProtectionMode = async (
  deviceId: string,
  enabled: boolean
) => {
  const targetDevice = displayDevices.find((device) => device.id === deviceId);
  if (!targetDevice) return;

  if (!canManageDevice(targetDevice)) {
    if (pushNotificationsEnabled) {
      addNotification({
        title: "Owner access required",
        message: "Protection settings can only be changed by the device owner.",
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return;
  }

  const commandOwnerUid = getDeviceCloudOwnerUid(targetDevice, cloudUserId);
  const protectionState = resolveProtectionState(targetDevice);
  const nextProtectionState = {
    ...protectionState,
    protectionEnabled: enabled,
  };
  const protectionSummary = formatProtectionSummary(nextProtectionState);

  if (!hasEsp32Endpoint()) {
    const canUseCloudCommand = await requireDeviceCloudRegistration(targetDevice);

    if (!canUseCloudCommand) {
      return;
    }

    if (isDeviceOfflineForCloudCommand(targetDevice, Date.now())) {
      notifyOfflineCloudCommandBlocked(targetDevice, "Protection command");
      return;
    }

    if (commandOwnerUid) {
      const connectivity = await checkFirebaseConnectivity();

      if (!connectivity.ok) {
        if (pushNotificationsEnabled) {
          addNotification({
            title: "Protection command not queued",
            message:
              connectivity.message ??
              "Firebase is not reachable from this network yet.",
            time: "Just now",
            type: "info",
            isRead: false,
          });
        }

        return;
      }

        const command = createDeviceCommand({
          uid: commandOwnerUid,
          device: targetDevice,
          requestedBy: currentUser.email,
          type: "protection",
          payload: {
            protectionEnabled: enabled,
            maxPowerW: nextProtectionState.maxPowerLimit,
            maxCurrentA: nextProtectionState.maxCurrentLimit,
          },
        });

      try {
        await saveCloudDeviceCommand(commandOwnerUid, command);
      } catch (error) {
        if (pushNotificationsEnabled) {
          addNotification({
            title: "Protection command not queued",
            message: getErrorMessage(
              error,
              `Firebase could not save the protection command for ${targetDevice.name}.`
            ),
            time: "Just now",
            type: "info",
            isRead: false,
          });
        }

        return;
      }

      if (pushNotificationsEnabled) {
        addNotification({
          title: "Protection command queued",
          message: `${targetDevice.name} will set protection to ${protectionSummary} when the Smart Plug reads Firebase.`,
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }

      addUsageLog({
        deviceId: targetDevice.id,
        deviceName: targetDevice.name,
        energy: targetDevice.energy,
        cost: targetDevice.todayCost,
        action: "protection_command_queued",
        details: `Protection ${enabled ? "enable" : "disable"} command queued in Firebase with ${protectionSummary}.`,
      });

      return;
    }

    if (pushNotificationsEnabled) {
      addNotification({
        title: "Smart Plug connection required",
        message:
          "Protection mode must be set on the Smart Plug. Configure the local Smart Plug endpoint first.",
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return;
  }

  try {
    const reading = await sendEsp32ProtectionCommand(
      targetDevice,
      enabled,
      nextProtectionState.maxPowerLimit,
      nextProtectionState.maxCurrentLimit
    );

    setDevices((prev) =>
      prev.map((device) =>
        device.id === targetDevice.id
          ? applyEsp32ReadingToDevice(
              device,
              {
                ...reading,
                ...nextProtectionState,
                protectionEnabled: reading.protectionEnabled ?? enabled,
                maxPowerLimit:
                  reading.maxPowerLimit ?? nextProtectionState.maxPowerLimit,
                maxCurrentLimit:
                  reading.maxCurrentLimit ?? nextProtectionState.maxCurrentLimit,
              },
              electricityRate.rate,
              true
            )
          : device
      )
    );
    if (pushNotificationsEnabled) {
      addNotification({
        title: `Protection ${enabled ? "enabled" : "disabled"}`,
        message: `${targetDevice.name} protection is set to ${protectionSummary} on the Smart Plug.`,
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    const energy = reading.energy ?? targetDevice.energy;
    addUsageLog({
      deviceId: targetDevice.id,
      deviceName: targetDevice.name,
      energy,
      cost: computeCost(energy, electricityRate.rate),
      action: "protection_updated",
      details: `Protection ${enabled ? "enabled" : "disabled"} with ${protectionSummary}.`,
    });
  } catch {
    if (pushNotificationsEnabled) {
      addNotification({
        title: "Protection command failed",
        message: `The app could not confirm protection mode for ${targetDevice.name} from the Smart Plug.`,
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }
  }
};

const handleFormatDeviceSdCard = async (deviceId: string) => {
  const targetDevice = displayDevices.find((device) => device.id === deviceId);

  if (!targetDevice) return false;

  if (!canManageDevice(targetDevice)) {
    if (pushNotificationsEnabled) {
      addNotification({
        title: "Owner access required",
        message: "Only the device owner can clear SD card data.",
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return false;
  }

  const canUseCloudCommand = await requireDeviceCloudRegistration(targetDevice);

  if (!canUseCloudCommand || !cloudUserId) {
    return false;
  }

  const connectivity = await checkFirebaseConnectivity();

  if (!connectivity.ok) {
    if (pushNotificationsEnabled) {
      addNotification({
        title: "SD card format not queued",
        message:
          connectivity.message ??
          "Firebase is not reachable from this network yet.",
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return false;
  }

  const command = createDeviceCommand({
    uid: cloudUserId,
    device: targetDevice,
    requestedBy: currentUser.email,
    type: "format_sd",
    payload: {
      confirm: true,
    },
  });

  try {
    await saveCloudDeviceCommand(cloudUserId, command);
  } catch (error) {
    if (pushNotificationsEnabled) {
      addNotification({
        title: "SD card format not queued",
        message: getErrorMessage(
          error,
          `Firebase could not save the SD card cleanup command for ${targetDevice.name}.`
        ),
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return false;
  }

  if (pushNotificationsEnabled) {
    addNotification({
      title: "SD card cleanup queued",
      message: `${targetDevice.name} will clear EnerTrack offline SD data when the Smart Plug reads the Firebase command.`,
      time: "Just now",
      type: "info",
      isRead: false,
    });
  }

  const queuedAt = new Date().toISOString();
  const queuedDevice: Device = {
    ...targetDevice,
    sdFormatStatus: "queued",
    sdFormatCommandId: command.id,
    sdFormatProgress: 0,
    sdFormatMessage:
      "Command queued. Waiting for the Smart Plug to start formatting the SD card.",
    sdFormatUpdatedAt: queuedAt,
  };

  setDevices((prev) =>
    prev.map((device) => (device.id === targetDevice.id ? queuedDevice : device))
  );
  writeCloud(saveCloudDevice(cloudUserId, queuedDevice));

  addUsageLog({
    deviceId: targetDevice.id,
    deviceName: targetDevice.name,
    energy: targetDevice.energy,
    cost: targetDevice.todayCost,
    action: "sd_card_format_queued",
    details:
      "SD card cleanup command queued in Firebase. Waiting for Smart Plug confirmation.",
  });

  return true;
};

useEffect(() => {
  if (!hasEsp32Endpoint()) return;

  let stopped = false;

  const syncEsp32Readings = async () => {
    await syncEsp32ReadingsNow();
    if (stopped) return;
  };

  void syncEsp32Readings();
  const interval = window.setInterval(
    syncEsp32Readings,
    LOCAL_ESP32_SYNC_INTERVAL_MS
  );

  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
  }, [syncEsp32ReadingsNow]);

  const handlePullToRefresh = async () => {
    const refreshTasks: Promise<unknown>[] = [
      resetFirestoreNetworkConnection(true),
    ];

    if (hasEsp32Endpoint()) {
      refreshTasks.push(syncEsp32ReadingsNow());
    }

    if (cloudUserId && hasPendingDevicePairings()) {
      refreshTasks.push(syncPendingDevicePairingsForRequest(true));
    }

    await Promise.allSettled(refreshTasks);
  };

useEffect(() => {
  const syncedBatches = offlineSyncBatches.filter(
    (batch) =>
      batch.status === "synced" &&
      !announcedOfflineBatchIds.current.has(batch.id)
  );

  if (syncedBatches.length === 0) return;

  let cancelled = false;

  const processSyncedBatches = async () => {
    for (const batch of syncedBatches) {
      if (cancelled) return;

      await yieldToMainThread();
      if (cancelled) return;

      const offlineLogs = buildOfflineUsageLogs(
        batch,
        devices,
        electricityRate.rate
      );
      const totalCost =
        batch.estimatedCost ?? computeCost(batch.totalEnergy, electricityRate.rate);

      offlineLogs.forEach((log) => {
        addUsageLog(log);
      });

      if (pushNotificationsEnabled) {
        addNotification({
          title: "Offline data synced",
          message: `${batch.deviceName ?? "Smart Plug"} synced ${batch.entries} offline log${batch.entries === 1 ? "" : "s"}: ${batch.totalEnergy.toFixed(3)} kWh, ₱${totalCost.toFixed(2)}.`,
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }

      setOfflineSyncDialog(batch);
      announcedOfflineBatchIds.current.add(batch.id);
    }

    scheduleLocalStorageWrite(
      "announcedOfflineBatchIds",
      JSON.stringify([...announcedOfflineBatchIds.current])
    );
  };

  void processSyncedBatches();

  return () => {
    cancelled = true;
  };
}, [cloudUserId, devices, electricityRate.rate, offlineSyncBatches, pushNotificationsEnabled]);

  const handleToggleDevice = (deviceId: string) => {
  const targetDevice = displayDevices.find((device) => device.id === deviceId);

  if (!targetDevice) return;

    void handleEsp32RelayCommand(
      targetDevice,
      !getDeviceRelayState(targetDevice)
    );
  };

  const handleSelectDevice = (deviceId: string) => {
    setHomeSelectedDeviceId(deviceId);
    setSelectedDeviceId(deviceId);
  };

  const selectedDevice = displayDevices.find(
    (device) => device.id === selectedDeviceId
  );

  const handleBackFromDeviceDetails = () => {
    setSelectedDeviceId(null);
  };

  const handleMainTabChange = (tab: Tab) => {
    setSelectedDeviceId(null);
    setActiveTab(tab);
  };

  const handleUpdateDevice = (deviceId: string, updates: Partial<Device>) => {
    const targetDevice = displayDevices.find((device) => device.id === deviceId);
    if (targetDevice && !canManageDevice(targetDevice)) {
      if (pushNotificationsEnabled) {
        addNotification({
          title: "Owner access required",
          message: "Only the owner can edit device settings and automation.",
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }

      return;
    }

    const nextDevice = targetDevice ? { ...targetDevice, ...updates } : null;
    const details = targetDevice
      ? buildDeviceChangeDetails(targetDevice, updates)
      : "";
    const scheduleChanged =
      "schedule" in updates ||
      "scheduleMode" in updates ||
      "budgetLimit" in updates ||
      "scheduleEnabled" in updates ||
      "scheduleStartTime" in updates ||
      "scheduleEndTime" in updates ||
      "scheduleBudgetLimit" in updates ||
      "scheduleBudgetKwhLimit" in updates ||
      "scheduleElectricityRate" in updates;

    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId ? { ...device, ...updates } : device
      )
    );

    if (cloudUserId && nextDevice) {
      writeCloud(saveCloudDevice(cloudUserId, nextDevice));

      if (scheduleChanged) {
        const command = createDeviceCommand({
          uid: cloudUserId,
          device: nextDevice,
          requestedBy: currentUser.email,
          type: "schedule",
          payload: buildScheduleCommandPayload(nextDevice),
        });

        writeCloud(saveCloudDeviceCommand(cloudUserId, command));
      }
    }

    if (targetDevice && details) {
      addUsageLog({
        deviceId,
        deviceName: updates.name ?? targetDevice.name,
        energy: targetDevice.energy,
        cost: targetDevice.todayCost,
        action:
          scheduleChanged ? "schedule_updated" : "device_updated",
        details,
      });
    }
  };

  const handleAcceptFamilyInvitation = async (
    invitation: FamilyInvitation
  ) => {
    if (!cloudUserId) return;

    try {
      await updateCloudFamilyInvitationStatus(invitation, "accepted", {
        uid: cloudUserId,
        email: normalizeEmail(currentUser.email),
      });
      await saveCloudDeviceSharesForInvitation(
        invitation,
        cloudUserId,
        normalizeEmail(currentUser.email)
      );

      setActiveFamilyInvitation(null);

      if (pushNotificationsEnabled) {
        addNotification({
          title: "Invitation accepted",
          message: `${invitation.ownerName} shared ${invitation.deviceNames.join(", ")} with you.`,
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }
    } catch (error) {
      if (pushNotificationsEnabled) {
        addNotification({
          title: "Invitation not accepted",
          message: getErrorMessage(
            error,
            "EnerTrack could not accept the invitation yet. Check your connection and try again."
          ),
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }
    }
  };

  const handleDeclineFamilyInvitation = async (
    invitation: FamilyInvitation
  ) => {
    if (!cloudUserId) return;

    try {
      await updateCloudFamilyInvitationStatus(invitation, "declined", {
        uid: cloudUserId,
        email: normalizeEmail(currentUser.email),
      });
      await revokeCloudDeviceSharesForInvitation(invitation);
      setActiveFamilyInvitation(null);
    } catch (error) {
      if (pushNotificationsEnabled) {
        addNotification({
          title: "Invitation not declined",
          message: getErrorMessage(
            error,
            "EnerTrack could not update the invitation yet. Check your connection and try again."
          ),
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }
    }
  };

  const handleSaveFamilyMember = (member: FamilyMember) => {
    const existingMember = familyMembers.find((item) => item.id === member.id);
    const deviceMap = new Map(devices.map((device) => [device.id, device]));
    const now = new Date().toISOString();
    const inviteId = member.inviteId ?? existingMember?.inviteId ?? createId();
    const existingInvitation = sentFamilyInvitations.find(
      (invitation) => invitation.id === inviteId
    );
    const nextMember: FamilyMember = {
      ...member,
      email: normalizeEmail(member.email),
      inviteId,
      inviteStatus: existingMember?.inviteStatus ?? member.inviteStatus ?? "pending",
      invitedAt: existingMember?.invitedAt ?? member.invitedAt ?? now,
    };
    const invitation: FamilyInvitation | null = cloudUserId
      ? {
          id: inviteId,
          ownerUid: cloudUserId,
          ownerEmail: normalizeEmail(currentUser.email),
          ownerName: currentUser.displayName || currentUser.email || "EnerTrack user",
          toEmail: normalizeEmail(member.email),
          toName: member.name,
          relationship: member.relationship,
          permission: member.permission,
          deviceIds: member.deviceIds,
          deviceNames: member.deviceIds
            .map((deviceId) => deviceMap.get(deviceId)?.name)
            .filter((name): name is string => Boolean(name)),
          electricityRate: electricityRate.rate,
          electricityRateUpdatedAt: now,
          status:
            existingInvitation?.status === "accepted" ||
            existingMember?.inviteStatus === "accepted"
              ? "accepted"
              : "pending",
          createdAt: existingMember?.invitedAt ?? now,
          updatedAt: now,
          respondedAt:
            existingInvitation?.respondedAt ?? existingMember?.acceptedAt ?? null,
          respondedByUid: existingInvitation?.respondedByUid ?? null,
          respondedByEmail: existingInvitation?.respondedByEmail ?? null,
        }
      : null;

    setFamilyMembers((prev) => {
      const exists = prev.some((item) => item.id === nextMember.id);

      return exists
        ? prev.map((item) => (item.id === nextMember.id ? nextMember : item))
        : [...prev, nextMember];
    });

    if (cloudUserId) {
      writeCloud(saveCloudFamilyMember(cloudUserId, nextMember));

      if (invitation) {
        writeCloud(saveCloudFamilyInvitation(invitation));

        if (invitation.status === "accepted" && invitation.respondedByUid) {
          writeCloud(
            revokeCloudDeviceSharesForInvitation(invitation).then(() =>
              saveCloudDeviceSharesForInvitation(
                invitation,
                invitation.respondedByUid ?? "",
                invitation.respondedByEmail ?? invitation.toEmail
              )
            )
          );
        }
      }
    }

    if (!existingMember) {
      nextMember.deviceIds.forEach((deviceId) => {
        const device = deviceMap.get(deviceId);
        if (!device) return;

        addUsageLog({
          deviceId,
          deviceName: device.name,
          energy: device.energy,
          cost: device.todayCost,
          action: "family_access_added",
          details: `${nextMember.name} was invited with ${nextMember.permission} access.`,
        });
      });

      if (pushNotificationsEnabled) {
        addNotification({
          title: "Family invitation sent",
          message: `${nextMember.name} can accept the invitation from Notifications after signing in with ${nextMember.email}.`,
          time: "Just now",
          type: "info",
          isRead: false,
        });
      }
      return;
    }

    const previousDeviceIds = new Set(existingMember.deviceIds);
    const nextDeviceIds = new Set(nextMember.deviceIds);
    const sharedDeviceIds = new Set([
      ...existingMember.deviceIds,
      ...nextMember.deviceIds,
    ]);

    sharedDeviceIds.forEach((deviceId) => {
      const device = deviceMap.get(deviceId);
      if (!device) return;

      const hadAccess = previousDeviceIds.has(deviceId);
      const hasAccess = nextDeviceIds.has(deviceId);
      const detailParts: string[] = [];
      let action: UsageLog["action"] | null = null;

      if (!hadAccess && hasAccess) {
        action = "family_access_added";
        detailParts.push(`${nextMember.name} was added with ${nextMember.permission} access.`);
      } else if (hadAccess && !hasAccess) {
        action = "family_access_removed";
        detailParts.push(`${existingMember.name} access was removed.`);
      } else if (hadAccess && hasAccess) {
        if (existingMember.name !== nextMember.name) {
          detailParts.push(`Name: ${existingMember.name} to ${nextMember.name}`);
        }

        if (existingMember.relationship !== nextMember.relationship) {
          detailParts.push(
            `Relationship: ${existingMember.relationship} to ${nextMember.relationship}`
          );
        }

        if (existingMember.permission !== nextMember.permission) {
          detailParts.push(
            `Permission: ${existingMember.permission} to ${nextMember.permission}`
          );
        }

        if (detailParts.length > 0) {
          action = "family_access_updated";
        }
      }

      if (!action || detailParts.length === 0) return;

      addUsageLog({
        deviceId,
        deviceName: device.name,
        energy: device.energy,
        cost: device.todayCost,
        action,
        details: detailParts.join("; "),
      });
    });
  };

  const handleRemoveSharedUser = (memberId: string, deviceId: string) => {
    const member = familyMembers.find((item) => item.id === memberId);
    const device = devices.find((item) => item.id === deviceId);
    const nextMember = member
      ? {
          ...member,
          deviceIds: member.deviceIds.filter((id) => id !== deviceId),
        }
      : null;

    setFamilyMembers((prev) =>
      prev
        .map((member) =>
          member.id === memberId
            ? {
                ...member,
                deviceIds: member.deviceIds.filter((id) => id !== deviceId),
              }
            : member
        )
        .filter((member) => member.isOwner || member.deviceIds.length > 0)
    );

    if (cloudUserId && nextMember) {
      writeCloud(
        nextMember.deviceIds.length > 0
          ? saveCloudFamilyMember(cloudUserId, nextMember)
          : deleteCloudFamilyMember(cloudUserId, memberId)
      );

      if (member?.inviteId) {
        const invitation = sentFamilyInvitations.find(
          (item) => item.id === member.inviteId
        );

        if (invitation && device && invitation.respondedByUid) {
          const remainingDeviceNames = nextMember.deviceIds
            .map((id) => devices.find((device) => device.id === id)?.name)
            .filter((name): name is string => Boolean(name));
          const now = new Date().toISOString();

          writeCloud(
            saveCloudNotification(invitation.respondedByUid, {
              id: createId(),
              title: "Shared device access removed",
              message:
                remainingDeviceNames.length > 0
                  ? `${currentUser.displayName || "The owner"} removed your access to ${device.name}. You still have access to ${remainingDeviceNames.join(", ")}.`
                  : `${currentUser.displayName || "The owner"} removed your access to ${device.name}.`,
              time: "Just now",
              type: "info",
              isRead: false,
              createdAt: now,
              category: "shared_device_removed",
              targetUid: invitation.respondedByUid,
              sourceUid: cloudUserId,
              familyInvitationId: invitation.id,
              deviceId,
            })
          );
        }

        if (invitation && nextMember.deviceIds.length === 0) {
          writeCloud(updateCloudFamilyInvitationStatus(invitation, "revoked"));
          writeCloud(revokeCloudDeviceSharesForInvitation(invitation));
        } else if (invitation) {
          writeCloud(
            saveCloudFamilyInvitation({
              ...invitation,
              deviceIds: nextMember.deviceIds,
              deviceNames: nextMember.deviceIds
                .map((id) => devices.find((device) => device.id === id)?.name)
                .filter((name): name is string => Boolean(name)),
              updatedAt: new Date().toISOString(),
            })
          );
        }
      }
    }

    if (member && device) {
      addUsageLog({
        deviceId,
        deviceName: device.name,
        energy: device.energy,
        cost: device.todayCost,
        action: "family_access_removed",
        details: `${member.name} access was removed from this device.`,
      });
    }
  };

  const removeDeviceIdsLocally = (deviceIds: string[]) => {
    const uniqueDeviceIds = [...new Set(deviceIds.filter(Boolean))];
    if (!uniqueDeviceIds.length) {
      return;
    }

    const deviceIdSet = new Set(uniqueDeviceIds);

    uniqueDeviceIds.forEach((deviceId) => {
      rememberRemovedDeviceId(deviceId);
      removePendingDevicePairing(deviceId);
    });

    setDevices((prev) => prev.filter((device) => !deviceIdSet.has(device.id)));
    setOfflineSyncBatches((prev) =>
      prev.filter((batch) => {
        const shouldKeep = !deviceIdSet.has(batch.deviceId);

        if (!shouldKeep) {
          announcedOfflineBatchIds.current.delete(batch.id);
        }

        return shouldKeep;
      })
    );
    scheduleLocalStorageWrite(
      "announcedOfflineBatchIds",
      JSON.stringify([...announcedOfflineBatchIds.current])
    );
    setFamilyMembers((prev) =>
      prev
        .map((member) =>
          member.isOwner
            ? member
            : {
                ...member,
                deviceIds: member.deviceIds.filter((id) => !deviceIdSet.has(id)),
              }
        )
        .filter((member) => member.isOwner || member.deviceIds.length > 0)
    );
    setHomeSelectedDeviceId((prev) => (deviceIdSet.has(prev) ? "" : prev));
    setSelectedDeviceId((prev) => (prev && deviceIdSet.has(prev) ? null : prev));
    setOfflineSyncDialog((prev) =>
      prev && deviceIdSet.has(prev.deviceId) ? null : prev
    );
  };

  const handleRemoveDevice = async (
    deviceId: string,
    devicePassword: string
  ): Promise<ActionResult> => {
    const targetDevice = displayDevices.find((device) => device.id === deviceId);
    if (!targetDevice) {
      return { ok: false, message: "Device not found." };
    }

    if (!canManageDevice(targetDevice)) {
      return {
        ok: false,
        message: "Only the owner can remove this shared device.",
      };
    }

    const pendingPairing = readPendingDevicePairings().find(
      (pairing) => pairing.device.id === deviceId
    );

    if (targetDevice.devicePasswordHash) {
      const enteredHash = await hashDevicePassword(devicePassword);

      if (enteredHash !== targetDevice.devicePasswordHash) {
        return { ok: false, message: "Incorrect device password." };
      }
    } else if (pendingPairing?.deviceAuthPassword) {
      if (pendingPairing.deviceAuthPassword !== devicePassword) {
        return { ok: false, message: "Incorrect device password." };
      }
    } else if (isFirebaseConfigured && firebasePublicConfig.apiKey) {
      const deviceAuthEmail =
        targetDevice.deviceAuthEmail ??
        (targetDevice.esp32Id ? getDeviceAuthEmail(targetDevice.esp32Id) : "");

      if (!deviceAuthEmail) {
        return {
          ok: false,
          message:
            "EnerTrack cannot verify this device password yet. Re-pair the device with the latest app build, then try again.",
        };
      }

      try {
        await verifyDeviceAuthPassword(
          firebasePublicConfig.apiKey,
          deviceAuthEmail,
          devicePassword
        );
      } catch (error) {
        return {
          ok: false,
          message: getErrorMessage(error, "Incorrect device password."),
        };
      }
    } else {
      return {
        ok: false,
        message:
          "EnerTrack cannot verify this device password without Firebase configuration.",
      };
    }

    const relatedDeviceIds = new Set([deviceId]);

    if (cloudUserId && targetDevice.esp32Id) {
      try {
        const relatedCloudDevices = await getCloudDevicesForEsp32(
          targetDevice.esp32Id
        );
        relatedCloudDevices.forEach((device) => relatedDeviceIds.add(device.id));
      } catch (error) {
        return {
          ok: false,
          message: getErrorMessage(
            error,
            "EnerTrack could not check for duplicate cloud device records yet. Check your connection and try again."
          ),
        };
      }
    }

    if (cloudUserId) {
      try {
        await Promise.all([
          cleanupCloudDevicesByIds([...relatedDeviceIds]),
          targetDevice.esp32Id
            ? deleteCloudDeviceClaim(cloudUserId, targetDevice.esp32Id)
            : Promise.resolve(),
        ]);
      } catch (error) {
        return {
          ok: false,
          message: getErrorMessage(
            error,
            "EnerTrack could not remove the device from Firebase yet. Check your connection and try again."
          ),
        };
      }
    }

    if (targetDevice.esp32Id) {
      removePendingDevicePairingsByEsp32Id(targetDevice.esp32Id);
    }

    removeDeviceIdsLocally([...relatedDeviceIds]);

    if (pushNotificationsEnabled) {
      addNotification({
        id: createId(),
        title: "Device removed",
        message: `${targetDevice.name} was removed from EnerTrack.`,
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }

    return { ok: true, message: `${targetDevice.name} was removed.` };
  };

  const handleRecordExport = (
    record: Omit<ExportRecord, "id" | "createdAt">
  ) => {
    const nextRecord = {
      ...record,
      id: createId(),
      createdAt: new Date().toISOString(),
    };

    setExportRecords((prev) => [nextRecord, ...prev]);

    if (cloudUserId) {
      writeCloud(saveCloudExportRecord(cloudUserId, nextRecord));
    }
  };

  const handleUpdateElectricityRate = (
    settings: ElectricityRateSettings
  ) => {
    setElectricityRate(settings);

    if (cloudUserId) {
      writeCloud(saveElectricityRateSettings(cloudUserId, settings));
    }
  };

  const canAddDevice =
    electricityRate.status === "verified" && electricityRate.rate > 0;

  const selectedDeviceSharedUsers = selectedDevice
    ? familyMembers.filter(
        (member) =>
          isAcceptedSharedMember(member) &&
          member.deviceIds.includes(selectedDevice.id)
      )
    : [];

  const handleDevicePairedLocally = (
    device: Device,
    deviceAuthPassword: string
  ) => {
    const now = new Date().toISOString();
    const pairedDevice: Device = {
      ...device,
      ownerUid: cloudUserId ?? device.ownerUid,
      ownerEmail: currentUser.email,
      claimedAt: device.claimedAt ?? now,
      cloudRegistrationStatus: "pending",
      cloudRegistrationError: undefined,
      updatedAt: now,
    };

    setDevices((prev) =>
      prev.some((item) => item.id === pairedDevice.id)
        ? prev.map((item) =>
            item.id === pairedDevice.id
              ? syncDeviceEnergyState(syncDeviceRelayState(pairedDevice))
              : item
          )
        : [...prev, syncDeviceEnergyState(syncDeviceRelayState(pairedDevice))]
    );

    forgetRemovedDeviceId(pairedDevice.id);
    savePendingDevicePairing({
      device: pairedDevice,
      deviceAuthPassword,
      createdAt: now,
    });

    addUsageLog({
      deviceId: pairedDevice.id,
      deviceName: pairedDevice.name,
      energy: 0,
      cost: 0,
      action: "created",
      details: `Device paired locally and queued for Firebase sync. Smart Plug ID: ${pairedDevice.esp32Id ?? "Not Set"}.`,
    });

    if (pushNotificationsEnabled) {
      addNotification({
        title: "Device paired locally",
        message:
          "Reconnect to your internet Wi-Fi and EnerTrack will finish Firebase registration.",
        time: "Just now",
        type: "info",
        isRead: false,
      });
    }
  };

  async function syncPendingDevicePairings(forceConnectivityProbe = false) {
    return syncPendingDevicePairingsForRequest(forceConnectivityProbe);
  }

  async function waitForPendingPairingSyncSlot(forceConnectivityProbe: boolean) {
    if (!forceConnectivityProbe || !pendingPairingSyncInFlight.current) {
      return !pendingPairingSyncInFlight.current;
    }

    const deadline = Date.now() + PENDING_PAIRING_IN_FLIGHT_WAIT_MS;

    while (pendingPairingSyncInFlight.current && Date.now() < deadline) {
      await waitForDelay(PENDING_PAIRING_IN_FLIGHT_STEP_MS);
    }

    return !pendingPairingSyncInFlight.current;
  }

  async function probeFirebaseConnectivityForPendingPairing(
    forceConnectivityProbe: boolean
  ) {
    let connectivity = await checkFirebaseConnectivity(
      forceConnectivityProbe ? 0 : PENDING_PAIRING_CONNECTIVITY_CACHE_MS
    );

    if (connectivity.ok || !forceConnectivityProbe) {
      return connectivity;
    }

    const deadline = Date.now() + PENDING_PAIRING_FORCE_RETRY_WINDOW_MS;

    while (!connectivity.ok && Date.now() < deadline) {
      await waitForDelay(PENDING_PAIRING_FORCE_RETRY_STEP_MS);
      connectivity = await checkFirebaseConnectivity(0);
    }

    return connectivity;
  }

  async function syncPendingDevicePairingsForRequest(
    forceConnectivityProbe = false,
    requestedDeviceId?: string
  ): Promise<CloudSyncRequestResult> {
    const requestedDeviceName =
      (requestedDeviceId &&
        devices.find((device) => device.id === requestedDeviceId)?.name) ||
      "This device";
    const noPendingResult = (
      status: CloudSyncRequestResult["status"],
      message: string,
      registeredDeviceIds: string[] = []
    ) => ({
      status,
      message,
      requestedDeviceId,
      registeredDeviceIds,
    });
    const readRelevantPendingPairings = () => {
      const removedDeviceIds = readRemovedDeviceIds();

      return readPendingDevicePairings().filter(
        (pairing) =>
          (!pairing.device.ownerUid || pairing.device.ownerUid === cloudUserId) &&
          !removedDeviceIds.has(pairing.device.id)
      );
    };

    const registerPendingPairing = async (pairing: PendingDevicePairing) => {
      const deadline = forceConnectivityProbe
        ? Date.now() + PENDING_PAIRING_FORCE_RETRY_WINDOW_MS
        : 0;
      let lastError: unknown = null;

      while (true) {
        try {
          if (!cloudUserId) {
            throw new Error(
              "EnerTrack is not ready to finish Firebase registration yet."
            );
          }

          const { device: registrationDevice, duplicateDeviceIds } =
            await resolvePairingRegistrationTarget(pairing);
          const deviceAuthAccount =
            registrationDevice.deviceAuthEmail && pairing.deviceAuthPassword
              ? await ensureDeviceAuthAccount(
                  firebasePublicConfig.apiKey,
                  registrationDevice.deviceAuthEmail,
                  pairing.deviceAuthPassword
                )
              : null;
          const syncedDevice: Device = {
            ...registrationDevice,
            deviceAuthUid:
              deviceAuthAccount?.uid ?? registrationDevice.deviceAuthUid,
            cloudRegistrationStatus: "registered",
            cloudRegistrationError: undefined,
            updatedAt: new Date().toISOString(),
          };
          const claim = createClaimForDevice(syncedDevice);

          await createDeviceDocument(cloudUserId, syncedDevice, claim);
          await cleanupCloudDevicesByIds(duplicateDeviceIds);

          return {
            syncedDevice,
            duplicateDeviceIds,
          };
        } catch (error) {
          lastError = error;

          if (
            !forceConnectivityProbe ||
            !isTransientFirebaseConnectivityError(error) ||
            Date.now() >= deadline
          ) {
            throw lastError;
          }

          await waitForDelay(PENDING_PAIRING_FORCE_RETRY_STEP_MS);
        }
      }
    };

    if (!cloudUserId || !isFirebaseConfigured || !firebasePublicConfig.apiKey) {
      return noPendingResult(
        "pending",
        "EnerTrack is not ready to finish Firebase registration yet. Check the current account and Firebase configuration, then try again."
      );
    }

    const initialPendingPairings = readRelevantPendingPairings();

    if (!initialPendingPairings.length) {
      if (
        requestedDeviceId &&
        devices.some(
          (device) =>
            device.id === requestedDeviceId &&
            device.cloudRegistrationStatus === "registered"
        )
      ) {
        return noPendingResult(
          "registered",
          `${requestedDeviceName} is already registered in Firebase.`,
          [requestedDeviceId]
        );
      }

      return noPendingResult(
        "idle",
        "There are no pending devices waiting for Firebase registration."
      );
    }

    if (
      requestedDeviceId &&
      !initialPendingPairings.some(
        (pairing) => pairing.device.id === requestedDeviceId
      )
    ) {
      if (
        devices.some(
          (device) =>
            device.id === requestedDeviceId &&
            device.cloudRegistrationStatus === "registered"
        )
      ) {
        return noPendingResult(
          "registered",
          `${requestedDeviceName} is already registered in Firebase.`,
          [requestedDeviceId]
        );
      }

      return noPendingResult(
        "idle",
        `${requestedDeviceName} is no longer waiting for Firebase registration.`
      );
    }

    if (pendingPairingSyncInFlight.current) {
      const slotAvailable = await waitForPendingPairingSyncSlot(
        forceConnectivityProbe
      );

      if (slotAvailable) {
        return syncPendingDevicePairingsForRequest(
          forceConnectivityProbe,
          requestedDeviceId
        );
      }

      return noPendingResult(
        "pending",
        "EnerTrack is still finishing the previous Firebase registration attempt. Wait a moment, then try again."
      );
    }

    pendingPairingSyncInFlight.current = true;

    try {
      const pendingPairings = readRelevantPendingPairings();
      const registeredDeviceIds: string[] = [];

      if (!pendingPairings.length) {
        if (
          requestedDeviceId &&
          devices.some(
            (device) =>
              device.id === requestedDeviceId &&
              device.cloudRegistrationStatus === "registered"
          )
        ) {
          return noPendingResult(
            "registered",
            `${requestedDeviceName} is already registered in Firebase.`,
            [requestedDeviceId]
          );
        }

        return noPendingResult(
          "idle",
          "There are no pending devices waiting for Firebase registration."
        );
      }

      const connectivity =
        await probeFirebaseConnectivityForPendingPairing(forceConnectivityProbe);

      if (!connectivity.ok) {
        const message =
          connectivity.message ??
          "Firebase is not reachable from this network yet.";
        const updatedDevices = updatePendingPairingsRegistrationState(
          pendingPairings,
          "pending",
          message
        );

        setDevices((prev) =>
          prev.map((device) => {
            const updatedDevice = updatedDevices.find(
              (item) => item.id === device.id
            );

            return updatedDevice ?? device;
          })
        );

        if (pushNotificationsEnabled) {
          updatedDevices.forEach((updatedDevice) => {
            const errorKey = `${updatedDevice.id}:${message}`;

            if (announcedPairingSyncErrors.current.has(errorKey)) return;

            announcedPairingSyncErrors.current.add(errorKey);
            addNotification({
              title: "Firebase network unavailable",
              message: `${updatedDevice.name}: ${message}`,
              time: "Just now",
              type: "info",
              isRead: false,
            });
          });
        }

        if (!forceConnectivityProbe) {
          return noPendingResult(
            "pending",
            requestedDeviceId
              ? `${requestedDeviceName}: ${message}`
              : message
          );
        }
      }

      if (forceConnectivityProbe) {
        await resetFirestoreNetworkConnection(true);
      }

      for (const pairing of pendingPairings) {
        try {
          const { syncedDevice, duplicateDeviceIds } =
            await registerPendingPairing(pairing);
          if (pairing.device.esp32Id) {
            removePendingDevicePairingsByEsp32Id(pairing.device.esp32Id);
          } else {
            removePendingDevicePairing(pairing.device.id);
          }
          forgetRemovedDeviceId(syncedDevice.id);
          registeredDeviceIds.push(syncedDevice.id);

          setDevices((prev) => {
            const duplicateDeviceIdSet = new Set(duplicateDeviceIds);
            const nextDevices = prev.filter(
              (device) => !duplicateDeviceIdSet.has(device.id)
            );

            return nextDevices.some((device) => device.id === syncedDevice.id)
              ? nextDevices.map((device) =>
                  device.id === syncedDevice.id ? syncedDevice : device
                )
              : [...nextDevices, syncedDevice];
          });

          if (pushNotificationsEnabled) {
            addNotification({
              title: "Device cloud sync complete",
              message: `${syncedDevice.name} is now registered in Firebase.`,
              time: "Just now",
              type: "info",
              isRead: false,
            });
          }
        } catch (error) {
          const isConnectivityError =
            isTransientFirebaseConnectivityError(error);
          const message = getErrorMessage(
            error,
            "Firebase registration failed. Check internet connection and Firebase Authentication settings."
          );
          const failedDevice = updatePendingPairingsRegistrationState(
            [pairing],
            isConnectivityError ? "pending" : "failed",
            message
          )[0];
          const errorKey = `${failedDevice.id}:${message}`;

          setDevices((prev) =>
            prev.some((device) => device.id === failedDevice.id)
              ? prev.map((device) =>
                  device.id === failedDevice.id ? failedDevice : device
                )
              : [...prev, failedDevice]
          );

          if (
            pushNotificationsEnabled &&
            !announcedPairingSyncErrors.current.has(errorKey)
          ) {
            announcedPairingSyncErrors.current.add(errorKey);
            addNotification({
              title: isConnectivityError
                ? "Firebase network unavailable"
                : "Device Firebase registration failed",
              message: `${failedDevice.name}: ${message}`,
              time: "Just now",
              type: "info",
              isRead: false,
            });
          }

          return noPendingResult(
            "pending",
            requestedDeviceId
              ? `${failedDevice.name}: ${message}`
              : message,
            registeredDeviceIds
          );
        }
      }

      if (requestedDeviceId) {
        if (registeredDeviceIds.includes(requestedDeviceId)) {
          return noPendingResult(
            "registered",
            `${requestedDeviceName} is now registered in Firebase.`,
            registeredDeviceIds
          );
        }

        const pendingPairing = readRelevantPendingPairings().find(
          (pairing) => pairing.device.id === requestedDeviceId
        );

        return noPendingResult(
          pendingPairing ? "pending" : "registered",
          pendingPairing
            ? pendingPairing.device.cloudRegistrationError ??
                `${requestedDeviceName} is still waiting for Firebase registration.`
            : `${requestedDeviceName} is now registered in Firebase.`,
          registeredDeviceIds
        );
      }

      return noPendingResult(
        registeredDeviceIds.length ? "registered" : "idle",
        registeredDeviceIds.length
          ? `Registered ${registeredDeviceIds.length} pending device${registeredDeviceIds.length === 1 ? "" : "s"} in Firebase.`
          : "There are no pending devices waiting for Firebase registration.",
        registeredDeviceIds
      );
    } finally {
      pendingPairingSyncInFlight.current = false;
    }
  }

  useEffect(() => {
    const triggerPendingPairingSync = () => {
      void syncPendingDevicePairings(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerPendingPairingSync();
      }
    };

    triggerPendingPairingSync();

    const interval = window.setInterval(() => {
      if (!hasPendingDevicePairings()) {
        return;
      }

      void syncPendingDevicePairings(true);
    }, PENDING_PAIRING_SYNC_INTERVAL_MS);

    window.addEventListener("online", triggerPendingPairingSync);
    window.addEventListener("focus", triggerPendingPairingSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", triggerPendingPairingSync);
      window.removeEventListener("focus", triggerPendingPairingSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cloudUserId, pushNotificationsEnabled]);

  const handleCleanupFailedDevicePairing = async (device: Device) => {
    rememberRemovedDeviceId(device.id);
    if (device.esp32Id) {
      removePendingDevicePairingsByEsp32Id(device.esp32Id);
    } else {
      removePendingDevicePairing(device.id);
    }
    setDevices((prev) => prev.filter((item) => item.id !== device.id));

    if (cloudUserId) {
      await cleanupFailedDevicePairing(cloudUserId, device);
    }
  };

  const handleRequireElectricityRate = () => {
    setSelectedDeviceId(null);
  };

  const handleEmailSignIn = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const normalizedEmail = normalizeAuthEmail(email);

    if (isFirebaseConfigured && firebaseAuth) {
      try {
        const credential = await signInWithEmailAndPassword(
          firebaseAuth,
          normalizedEmail,
          password
        );
        const profile = getProfileFromFirebaseUser(credential.user);

        setCurrentUser(profile);
        setCloudUserId(credential.user.uid);
        setIsAuthenticated(true);
        await saveUserProfile(credential.user.uid, profile);

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: getFirebaseAuthMessage(error),
        };
      }
    }

    const account = authAccounts.find(
      (item) => normalizeAuthEmail(item.email) === normalizedEmail
    );

    if (!account) {
      return {
        ok: false,
        message: "No account found. Create an account first.",
      };
    }

    if (account.password && account.password !== password) {
      return {
        ok: false,
        message: "Incorrect password.",
      };
    }

    setCurrentUser({
      displayName: account.displayName,
      email: account.email,
      provider: account.provider,
    });
    setIsAuthenticated(true);

    return { ok: true };
  };

  const handleEmailSignUp = async ({
    displayName,
    email,
    password,
  }: {
    displayName: string;
    email: string;
    password: string;
  }) => {
    const normalizedEmail = normalizeAuthEmail(email);

    if (isFirebaseConfigured && firebaseAuth) {
      try {
        const credential = await createUserWithEmailAndPassword(
          firebaseAuth,
          normalizedEmail,
          password
        );
        await updateProfile(credential.user, { displayName });

        const profile: UserProfile = {
          displayName,
          email: normalizedEmail,
          provider: "Email account",
        };

        setCurrentUser(profile);
        setCloudUserId(credential.user.uid);
        setIsAuthenticated(true);
        await saveUserProfile(credential.user.uid, profile);
        await saveElectricityRateSettings(
          credential.user.uid,
          electricityRate
        );
        await saveUserPreferences(credential.user.uid, {
          darkMode,
          pushNotificationsEnabled,
          homeSelectedDeviceId,
        });

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: getFirebaseAuthMessage(error),
        };
      }
    }

    const existingAccount = authAccounts.find(
      (account) => normalizeAuthEmail(account.email) === normalizedEmail
    );

    if (existingAccount) {
      return {
        ok: false,
        message: "This email address already has an account.",
      };
    }

    const profile: UserProfile = {
      displayName,
      email: normalizedEmail,
      provider: "Email account",
    };

    setAuthAccounts((prev) => [{ ...profile, password }, ...prev]);
    setCurrentUser(profile);
    setIsAuthenticated(true);

    return { ok: true };
  };

  const handleGoogleContinue = async () => {
    if (isFirebaseConfigured && firebaseAuth) {
      try {
        const credential = await signInWithPopup(firebaseAuth, googleProvider);
        const profile = getProfileFromFirebaseUser(credential.user);

        setCurrentUser(profile);
        setCloudUserId(credential.user.uid);
        setIsAuthenticated(true);
        await saveUserProfile(credential.user.uid, profile);

        return profile;
      } catch {
        return null;
      }
    }

    return null;
  };

  const handleUpdateProfile = async (
    profile: UserProfile
  ): Promise<ActionResult> => {
    const oldEmail = normalizeAuthEmail(currentUser.email);
    const nextEmail = normalizeAuthEmail(profile.email);
    const syncedProfile = {
      ...profile,
      email: nextEmail,
    };

    if (isFirebaseConfigured && firebaseAuth?.currentUser) {
      try {
        const user = firebaseAuth.currentUser;
        const currentEmail = normalizeAuthEmail(user.email ?? currentUser.email);

        if (nextEmail !== currentEmail) {
          if (hasGoogleProvider(user) && !hasPasswordProvider(user)) {
            return {
              ok: false,
              message: "Google account email is managed by Google.",
            };
          }

          await updateEmail(user, nextEmail);
        }

        if (syncedProfile.displayName !== user.displayName) {
          await updateProfile(user, {
            displayName: syncedProfile.displayName,
          });
        }
      } catch (error) {
        return {
          ok: false,
          message: getFirebaseAuthMessage(error),
        };
      }
    }

    setCurrentUser(syncedProfile);
    if (cloudUserId) {
      writeCloud(saveUserProfile(cloudUserId, syncedProfile));
    }

    setAuthAccounts((prev) => {
      let updated = false;
      const nextAccounts = prev.map((account) => {
        if (normalizeAuthEmail(account.email) !== oldEmail) return account;

        updated = true;
        return {
          ...account,
          displayName: syncedProfile.displayName,
          email: syncedProfile.email,
          provider: syncedProfile.provider,
        };
      });

      return updated ? nextAccounts : [syncedProfile, ...prev];
    });

    return { ok: true, message: "Profile updated successfully." };
  };

  const handleUpdatePassword = async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ActionResult> => {
    if (newPassword.length < 6) {
      return {
        ok: false,
        message: "New password must be at least 6 characters.",
      };
    }

    if (isFirebaseConfigured && firebaseAuth?.currentUser) {
      try {
        const user = firebaseAuth.currentUser;

        if (!hasPasswordProvider(user)) {
          return {
            ok: false,
            message: "Google account password is managed by Google.",
          };
        }

        await reauthenticateFirebaseUser(user, currentPassword);
        await updatePassword(user, newPassword);

        return { ok: true, message: "Password updated successfully." };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message
              ? error.message
              : getFirebaseAuthMessage(error),
        };
      }
    }

    const normalizedEmail = normalizeAuthEmail(currentUser.email);
    const account = authAccounts.find(
      (item) => normalizeAuthEmail(item.email) === normalizedEmail
    );

    if (account?.password && account.password !== currentPassword) {
      return { ok: false, message: "Current password is incorrect." };
    }

    setAuthAccounts((prev) =>
      prev.map((item) =>
        normalizeAuthEmail(item.email) === normalizedEmail
          ? { ...item, password: newPassword }
          : item
      )
    );

    return { ok: true, message: "Password updated successfully." };
  };

  const handleSendPasswordReset = async (
    email: string
  ): Promise<ActionResult> => {
    const normalizedEmail = normalizeAuthEmail(email || currentUser.email);

    if (isFirebaseConfigured && firebaseAuth) {
      try {
        await sendPasswordResetEmail(firebaseAuth, normalizedEmail);

        return {
          ok: true,
          message: `Password reset link sent to ${normalizedEmail}.`,
        };
      } catch (error) {
        return {
          ok: false,
          message: getFirebaseAuthMessage(error),
        };
      }
    }

    return {
      ok: true,
      message: `Password reset link sent to ${normalizedEmail}.`,
    };
  };

  const handleDeleteAccount = async ({
    currentPassword,
  }: {
    currentPassword: string;
  }): Promise<ActionResult> => {
    const currentAccountEmail = normalizeAuthEmail(currentUser.email);

    if (isFirebaseConfigured && firebaseAuth?.currentUser) {
      try {
        const user = firebaseAuth.currentUser;
        const uid = user.uid;
        const accountEmail = normalizeAuthEmail(user.email ?? currentUser.email);
        const nextAuthAccounts = authAccounts.filter(
          (item) => normalizeAuthEmail(item.email) !== accountEmail
        );

        await reauthenticateFirebaseUser(user, currentPassword);
        await deleteUserCloudData(uid);
        await deleteUser(user);
        resetLocalUserData(nextAuthAccounts);

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message
              ? error.message
              : getFirebaseAuthMessage(error),
        };
      }
    }

    const nextAuthAccounts = authAccounts.filter(
      (item) => normalizeAuthEmail(item.email) !== currentAccountEmail
    );
    resetLocalUserData(nextAuthAccounts);

    return { ok: true };
  };

  const handleLogout = () => {
    if (isFirebaseConfigured && firebaseAuth) {
      void signOut(firebaseAuth);
    }

    setCloudUserId(null);
    setIsAuthenticated(false);

    if (!pushNotificationsEnabled) return;

    addNotification({
      title: "Logged out",
      message: "You logged out of EnerTrack.",
      time: "Just now",
      type: "info",
      isRead: false,
    });
  };

  const handleClearUsageLogs = () => {
    setUsageLogs([]);

    if (cloudUserId) {
      writeCloud(clearCloudUsageLogs(cloudUserId));
    }
  };

  const handleRemoveExportRecord = (recordId: string) => {
    setExportRecords((prev) =>
      prev.filter((record) => record.id !== recordId)
    );

    if (cloudUserId) {
      writeCloud(deleteCloudExportRecord(cloudUserId, recordId));
    }
  };

  const handleClearExportRecords = () => {
    setExportRecords([]);

    if (cloudUserId) {
      writeCloud(clearCloudExportRecords(cloudUserId));
    }
  };

  const handleMarkAllNotificationsRead = () => {
    const nextNotifications = notifications.map((item) => ({
      ...item,
      isRead: true,
    }));

    setNotifications(nextNotifications);

    if (cloudUserId) {
      writeCloud(saveCloudNotifications(cloudUserId, nextNotifications));
    }
  };

  const handleRemoveNotification = (notificationId: string) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== notificationId)
    );

    if (cloudUserId) {
      writeCloud(deleteCloudNotification(cloudUserId, notificationId));
    }
  };

  const handleClearNotifications = () => {
    setNotifications([]);

    if (cloudUserId) {
      writeCloud(clearCloudNotifications(cloudUserId));
    }
  };

  if (!isAuthenticated) {
    return (
      <AuthScreen
        registeredEmails={
          isFirebaseConfigured
            ? []
            : authAccounts.map((account) => account.email)
        }
        onEmailSignIn={handleEmailSignIn}
        onEmailSignUp={handleEmailSignUp}
        onGoogleContinue={handleGoogleContinue}
        enableGoogleAuth={isFirebaseConfigured && Boolean(firebaseAuth)}
        onSendPasswordReset={handleSendPasswordReset}
      />
    );
  }

  const layoutUserName =
    currentUser.displayName.trim().split(/\s+/)[0] || "User";

  return (
  <div className={darkMode ? "dark" : ""}>
   <AppLayout
  activeTab={activeTab}
  onTabChange={handleMainTabChange}
  unreadCount={
    notifications.filter((n) => !n.isRead).length +
    incomingFamilyInvitations.filter((invite) => invite.status === "pending").length
  }
  onOpenNotifications={() => setShowNotifications(true)}
  onOpenSearch={() => setShowSearch(true)}
  userName={layoutUserName}
  onRefresh={isAuthenticated ? handlePullToRefresh : undefined}
  >
  
      {selectedDevice && (
        <DeviceDetailsScreen
  key={selectedDevice.id}
  device={selectedDevice}
  usageHistory={displayUsageHistory}
  usageLogs={selectedDevice.isShared ? [] : usageLogs}
  sharedUsers={selectedDeviceSharedUsers}
  onBack={handleBackFromDeviceDetails}
  onToggleDevice={handleToggleDevice}
  onFormatSdCard={handleFormatDeviceSdCard}
  onUpdateDevice={handleUpdateDevice}
  onRemoveDevice={handleRemoveDevice}
  onRemoveSharedUser={handleRemoveSharedUser}
  onExportRecord={handleRecordExport}
  electricityRate={getElectricityRateForDevice(selectedDevice)}
  isSharedDevice={Boolean(selectedDevice.isShared)}
  accessLabel={
    selectedDevice.isShared
      ? `${selectedDevice.accessPermission ?? "View Only"} access`
      : "Owner access"
  }
  canControlDevice={canControlDevice(selectedDevice)}
  canManageDevice={canManageDevice(selectedDevice)}
/>
      )}
      {!selectedDevice && (
        <>
          {activeTab === "home" && (
            <HomeScreen
              devices={displayDevices}
              usageHistory={displayUsageHistory}
              selectedDeviceId={homeSelectedDeviceId}
              onSelectedDeviceChange={setHomeSelectedDeviceId}
              onToggleDevice={handleToggleDevice}
              onSetProtectionMode={handleSetProtectionMode}
              onSelectDevice={handleSelectDevice}
              electricityRate={electricityRate.rate}
              canAddDevice={canAddDevice}
              onRequireElectricityRate={handleRequireElectricityRate}
              ownerUid={cloudUserId}
              ownerEmail={currentUser.email}
              firebaseApiKey={firebasePublicConfig.apiKey ?? ""}
              firebaseProjectId={firebasePublicConfig.projectId ?? ""}
              onPairingFailed={handleCleanupFailedDevicePairing}
              onDevicePairedLocally={handleDevicePairedLocally}
              onCloudSyncRequested={(deviceId) =>
                syncPendingDevicePairingsForRequest(true, deviceId)
              }
            />
          )}

          {activeTab === "stats" && <StatsScreen
  devices={displayDevices}
  usageHistory={displayUsageHistory}
  usageLogs={usageLogs}
  onClearLogs={handleClearUsageLogs}
  onExportRecord={handleRecordExport}
  electricityRate={electricityRate.rate}
/> }

          {activeTab === "devices" && (
            <DevicesScreen
              devices={displayDevices}
              familyMembers={familyMembers}
              sentInvitations={sentFamilyInvitations}
              onSaveFamilyMember={handleSaveFamilyMember}
              onToggleDevice={handleToggleDevice}
              onSelectDevice={handleSelectDevice}
              canAddDevice={canAddDevice}
              onRequireElectricityRate={handleRequireElectricityRate}
              ownerUid={cloudUserId}
              ownerEmail={currentUser.email}
              firebaseApiKey={firebasePublicConfig.apiKey ?? ""}
              firebaseProjectId={firebasePublicConfig.projectId ?? ""}
              onPairingFailed={handleCleanupFailedDevicePairing}
              onDevicePairedLocally={handleDevicePairedLocally}
              onCloudSyncRequested={(deviceId) =>
                syncPendingDevicePairingsForRequest(true, deviceId)
              }
            />
          )}

          {activeTab === "settings" && (
  <SettingsScreen
    profile={currentUser}
    darkMode={darkMode}
    pushNotificationsEnabled={pushNotificationsEnabled}
    electricityRate={electricityRate}
    exportRecords={exportRecords}
    onToggleDarkMode={toggleDarkMode}
    onTogglePushNotifications={handleTogglePushNotifications}
    onUpdateProfile={handleUpdateProfile}
    onUpdatePassword={handleUpdatePassword}
    onDeleteAccount={handleDeleteAccount}
    onUpdateElectricityRate={handleUpdateElectricityRate}
    onRemoveExportRecord={handleRemoveExportRecord}
    onClearExportRecords={handleClearExportRecords}
    onLogout={handleLogout}
  />
)}
        </>
      )}
      <SearchModal
  open={showSearch}
  devices={displayDevices}
  onClose={() => setShowSearch(false)}
  onSelectDevice={(id) => {
    setHomeSelectedDeviceId(id);
    setSelectedDeviceId(id);
  }}
  onGoToTab={(tab) => {
    setSelectedDeviceId(null);
    setActiveTab(tab);
  }}
/>
      <NotificationsModal
        open={showNotifications}
        notifications={notifications}
        invitations={incomingFamilyInvitations}
        onClose={() => setShowNotifications(false)}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onRemoveNotification={handleRemoveNotification}
        onClearNotifications={handleClearNotifications}
        onAcceptInvitation={handleAcceptFamilyInvitation}
        onDeclineInvitation={handleDeclineFamilyInvitation}
      />

      {activeFamilyInvitation && (
        <FamilyInvitationPrompt
          invitation={activeFamilyInvitation}
          onAccept={() => void handleAcceptFamilyInvitation(activeFamilyInvitation)}
          onDecline={() => void handleDeclineFamilyInvitation(activeFamilyInvitation)}
          onDismiss={() => setActiveFamilyInvitation(null)}
        />
      )}
      <MonthlyRateReminderDialog
        reminder={activeFamilyInvitation ? null : monthlyRateReminder}
        onDismiss={() => setMonthlyRateReminder(null)}
        onOpenSettings={() => {
          setMonthlyRateReminder(null);
          setSelectedDeviceId(null);
          setActiveTab("settings");
        }}
      />
      <OfflineSyncDialog
        batch={offlineSyncDialog}
        electricityRate={electricityRate.rate}
        onClose={() => setOfflineSyncDialog(null)}
      />
    </AppLayout>
    </div>
  );
}

function MonthlyRateReminderDialog({
  reminder,
  onDismiss,
  onOpenSettings,
}: {
  reminder: MonthlyRateReminder | null;
  onDismiss: () => void;
  onOpenSettings: () => void;
}) {
  if (!reminder) return null;

  const currentRateLabel =
    reminder.currentRate > 0
      ? `₱${reminder.currentRate.toFixed(2)} / kWh`
      : "Not set";
  const sourceLabel =
    reminder.sourceName && reminder.sourceName !== "Unavailable"
      ? reminder.sourceName
      : "Manual rate not set";
  const billingMonthLabel =
    reminder.effectiveBillingMonth &&
    reminder.effectiveBillingMonth !== "Unavailable"
      ? reminder.effectiveBillingMonth
      : "Needs review";

  return (
    <div className="fixed inset-0 z-[74] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Review Electricity Rate
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Review your electricity rate for {reminder.monthLabel} so estimated
          costs stay accurate if your provider changed rates.
        </p>

        <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950">
          <InfoLine label="Current rate" value={currentRateLabel} />
          <InfoLine label="Source" value={sourceLabel} />
          <InfoLine label="Billing month" value={billingMonthLabel} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Later
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-full bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function FamilyInvitationPrompt({
  invitation,
  onAccept,
  onDecline,
  onDismiss,
}: {
  invitation: FamilyInvitation;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Device Invitation
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {invitation.ownerName} invited you to access{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {invitation.deviceNames.join(", ") || "a smart plug"}
          </span>
          .
        </p>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950">
          <InfoLine label="Access" value={invitation.permission} />
          <InfoLine label="From" value={invitation.ownerEmail} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-full border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-full bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Accept
          </button>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 w-full rounded-full px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Keep in Notifications
        </button>
      </div>
    </div>
  );
}

function OfflineSyncDialog({
  batch,
  electricityRate,
  onClose,
}: {
  batch: OfflineSyncBatch | null;
  electricityRate: number;
  onClose: () => void;
}) {
  if (!batch) return null;

  const estimatedCost =
    batch.estimatedCost ?? computeCost(batch.totalEnergy, electricityRate);
  const previewReadings = batch.readings?.slice(0, 4) ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Offline Data Synced
        </h2>
        <p className="mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400">
          Smart Plug microSD data was added to your cloud usage history.
        </p>

        <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
          <InfoLine label="Device" value={batch.deviceName ?? batch.deviceId} />
          <InfoLine
            label="Offline period"
            value={buildOfflinePeriodLabel(batch).replace(" to ", " - ")}
          />
          <InfoLine label="Logs synced" value={String(batch.entries)} />
          <InfoLine
            label="Consumption gathered"
            value={`${batch.totalEnergy.toFixed(3)} kWh`}
          />
          <InfoLine
            label="Cost total"
            value={`₱${estimatedCost.toFixed(2)}`}
          />
        </div>

        {previewReadings.length > 0 && (
          <div className="mt-4 space-y-2">
            {previewReadings.map((reading) => (
              <div
                key={reading.id}
                className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300"
              >
                <p className="font-semibold text-slate-900 dark:text-white">
                  {formatTimestampLabel(reading.timestamp)}
                </p>
                <p className="mt-1">
                  {(reading.energyDelta ?? reading.energy ?? 0).toFixed(3)} kWh
                  {reading.power != null ? ` • ${reading.power.toFixed(1)} W` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="max-w-[11rem] text-right font-bold text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

export default App;
