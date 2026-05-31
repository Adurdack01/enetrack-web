import type { Device } from "@/types/device";

export type Esp32Reading = {
  deviceId?: string;
  esp32Id?: string;
  id?: string;
  timestamp?: string;
  name?: string;
  status?: boolean;
  relay?: boolean;
  relayState?: boolean | string;
  power?: number;
  watts?: number;
  voltage?: number;
  current?: number;
  amps?: number;
  powerFactor?: number;
  pf?: number;
  power_factor?: number;
  energy?: number;
  kwh?: number;
  totalEnergy?: number;
  wifiSignal?: number;
  rssi?: number;
  protectionEnabled?: boolean;
  protection?: boolean;
  maxPowerLimit?: number;
  maxPower?: number;
  maxPowerW?: number;
  powerLimit?: number;
  maxCurrentLimit?: number;
  maxCurrent?: number;
  maxCurrentA?: number;
  currentLimit?: number;
};

type Esp32Payload =
  | Esp32Reading
  | Esp32Reading[]
  | {
      device?: Esp32Reading;
      devices?: Esp32Reading[];
      reading?: Esp32Reading;
      readings?: Esp32Reading[];
    };

const esp32BaseUrl = (import.meta.env.VITE_ESP32_BASE_URL ?? "").replace(
  /\/$/,
  ""
);

export const ESP32_MAX_POWER_W = 1100;
export const ESP32_MAX_CURRENT_A = 5;

export function hasEsp32Endpoint() {
  return esp32BaseUrl.length > 0;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toStatus(reading: Esp32Reading) {
  const value = reading.status ?? reading.relay ?? reading.relayState;

  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "1", "running"].includes(normalized)) return true;
    if (["off", "false", "0", "stopped"].includes(normalized)) return false;
  }

  return undefined;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "1", "enabled", "active"].includes(normalized)) {
      return true;
    }
    if (["off", "false", "0", "disabled", "inactive"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function normalizeReading(reading: Esp32Reading): Esp32Reading {
  return {
    deviceId: reading.deviceId,
    esp32Id: reading.esp32Id,
    id: reading.id,
    timestamp:
      typeof reading.timestamp === "string" ? reading.timestamp : undefined,
    name: reading.name,
    status: toStatus(reading),
    power: toNumber(reading.power ?? reading.watts),
    voltage: toNumber(reading.voltage),
    current: toNumber(reading.current ?? reading.amps),
    powerFactor: toNumber(
      reading.powerFactor ?? reading.pf ?? reading.power_factor
    ),
    energy: toNumber(reading.energy ?? reading.kwh ?? reading.totalEnergy),
    wifiSignal: toNumber(reading.wifiSignal ?? reading.rssi),
    protectionEnabled: toBoolean(
      reading.protectionEnabled ?? reading.protection
    ),
    maxPowerLimit: toNumber(
      reading.maxPowerLimit ??
        reading.maxPower ??
        reading.maxPowerW ??
        reading.powerLimit
    ),
    maxCurrentLimit: toNumber(
      reading.maxCurrentLimit ??
        reading.maxCurrent ??
        reading.maxCurrentA ??
        reading.currentLimit
    ),
  };
}

function normalizePayload(payload: Esp32Payload): Esp32Reading[] {
  if (Array.isArray(payload)) return payload.map(normalizeReading);
  if ("devices" in payload && Array.isArray(payload.devices)) {
    return payload.devices.map(normalizeReading);
  }
  if ("readings" in payload && Array.isArray(payload.readings)) {
    return payload.readings.map(normalizeReading);
  }
  if ("device" in payload && payload.device) {
    return [normalizeReading(payload.device)];
  }
  if ("reading" in payload && payload.reading) {
    return [normalizeReading(payload.reading)];
  }

  return [normalizeReading(payload as Esp32Reading)];
}

export function readingMatchesDevice(device: Device, reading: Esp32Reading) {
  const deviceKeys = [device.id, device.esp32Id, device.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const readingKeys = [reading.deviceId, reading.esp32Id, reading.id, reading.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return readingKeys.some((key) => deviceKeys.includes(key));
}

export async function fetchEsp32Readings() {
  if (!hasEsp32Endpoint()) return [];

  const response = await fetch(`${esp32BaseUrl}/devices`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to fetch Smart Plug readings.");
  }

  return normalizePayload((await response.json()) as Esp32Payload);
}

export async function sendEsp32RelayCommand(
  device: Device,
  nextStatus: boolean
) {
  if (!hasEsp32Endpoint()) {
    throw new Error("Smart Plug endpoint is not configured.");
  }

  const deviceKey = encodeURIComponent(device.esp32Id ?? device.id);
  const response = await fetch(`${esp32BaseUrl}/devices/${deviceKey}/relay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: nextStatus }),
  });

  if (!response.ok) {
    throw new Error("Unable to send relay command to Smart Plug.");
  }

  if (response.status === 204) {
    return normalizeReading({
      deviceId: device.id,
      esp32Id: device.esp32Id,
      status: nextStatus,
    });
  }

  const payload = (await response.json()) as Esp32Payload;
  return normalizePayload(payload)[0];
}

export async function sendEsp32ProtectionCommand(
  device: Device,
  enabled: boolean,
  maxPowerLimit = ESP32_MAX_POWER_W,
  maxCurrentLimit = ESP32_MAX_CURRENT_A
) {
  if (!hasEsp32Endpoint()) {
    throw new Error("Smart Plug endpoint is not configured.");
  }

  const deviceKey = encodeURIComponent(device.esp32Id ?? device.id);
  const response = await fetch(
    `${esp32BaseUrl}/devices/${deviceKey}/protection`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled,
        maxPowerW: maxPowerLimit,
        maxCurrentA: maxCurrentLimit,
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Unable to send protection settings to Smart Plug.");
  }

  if (response.status === 204) {
    return normalizeReading({
      deviceId: device.id,
      esp32Id: device.esp32Id,
      protectionEnabled: enabled,
      maxPowerLimit,
      maxCurrentLimit,
    });
  }

  const payload = (await response.json()) as Esp32Payload;
  return normalizePayload(payload)[0];
}
