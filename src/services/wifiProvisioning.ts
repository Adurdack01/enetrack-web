import { Capacitor } from "@capacitor/core";
import { Wifi, SpecialSsid, type WifiEntry } from "@codext/capacitor-wifi";

export type WifiProvisioningMode = "capacitor-native" | "local-dev" | "manual";

export type WifiProvisioningNetwork = {
  ssid: string;
  signal: number | null;
  secure: boolean;
  band: string | null;
};

export type WifiProvisioningStatus = {
  ssid: string;
  state: string;
  band: string | null;
  connected: boolean;
};

export type WifiProvisioningSnapshot = {
  mode: WifiProvisioningMode;
  networks: WifiProvisioningNetwork[];
  current: WifiProvisioningStatus | null;
  message: string;
};

type NativeWifiPluginError = {
  message?: unknown;
  data?: {
    errorCode?: unknown;
  };
};

type LocalWifiNetworksPayload = {
  networks: WifiProvisioningNetwork[];
};

type LocalWifiCurrentPayload = {
  current: WifiProvisioningStatus;
};

const localDevHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export function isNativeWifiProvisioning() {
  return Capacitor.isNativePlatform();
}

export async function scanProvisioningWifi(): Promise<WifiProvisioningSnapshot> {
  if (isNativeWifiProvisioning()) {
    return scanNativeWifi();
  }

  if (hasLocalDevWifiHelper()) {
    return scanLocalDevWifi();
  }

  return {
    mode: "manual",
    networks: [],
    current: null,
    message:
      "This browser cannot scan Wi-Fi. In the Android/iOS app, EnerTrack will use native Wi-Fi permissions.",
  };
}

export async function getCurrentProvisioningWifi() {
  if (isNativeWifiProvisioning()) {
    const result = await Wifi.getCurrentWifi();
    return normalizeNativeCurrentWifi(result.currentWifi);
  }

  if (hasLocalDevWifiHelper()) {
    const response = await fetch("/api/system-wifi/current", {
      cache: "no-store",
    });
    const payload = await readProvisioningResponse<LocalWifiCurrentPayload>(
      response
    );

    return payload.current;
  }

  return null;
}

export async function connectProvisioningWifi(
  ssid: string,
  password: string
) {
  if (isNativeWifiProvisioning()) {
    await ensureNativeWifiPermissions();
    await releaseProvisioningWifiBinding();

    try {
      const result = await Wifi.connectToWifiBySsidAndPassword({
        ssid,
        password,
      });

      if (!result.wasSuccess) {
        throw createNativeWifiConnectionError(ssid);
      }

      return {
        message: `Connecting to ${ssid}.`,
        mode: "capacitor-native" as const,
      };
    } catch (error) {
      await releaseProvisioningWifiBinding();
      throw createNativeWifiConnectionError(ssid, error);
    }
  }

  if (hasLocalDevWifiHelper()) {
    const response = await fetch("/api/system-wifi/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ssid, password }),
    });
    const payload = await readProvisioningResponse<{ message: string }>(
      response
    );

    return {
      message: payload.message,
      mode: "local-dev" as const,
    };
  }

  throw new Error(
    "This browser cannot switch Wi-Fi. Use the Android/iOS app build or connect to the Smart Plug hotspot in system Wi-Fi settings."
  );
}

export async function releaseProvisioningWifiBinding() {
  if (!isNativeWifiProvisioning()) {
    return;
  }

  await Wifi.disconnectAndForget().catch(() => undefined);
}

export function getProvisioningWifiErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const nativeError = error as NativeWifiPluginError;
  const codeCandidate = nativeError.data?.errorCode;

  if (typeof codeCandidate === "string" && codeCandidate.trim()) {
    return codeCandidate;
  }

  if (typeof nativeError.message === "string" && nativeError.message.trim()) {
    return nativeError.message;
  }

  return null;
}

async function scanNativeWifi(): Promise<WifiProvisioningSnapshot> {
  await ensureNativeWifiPermissions();

  const [scanResult, currentResult] = await Promise.all([
    Wifi.scanWifi(),
    Wifi.getCurrentWifi(),
  ]);

  return {
    mode: "capacitor-native",
    networks: scanResult.wifis
      .map(normalizeNativeWifiNetwork)
      .filter((network): network is WifiProvisioningNetwork => Boolean(network))
      .sort((left, right) => (right.signal ?? 0) - (left.signal ?? 0)),
    current: normalizeNativeCurrentWifi(currentResult.currentWifi),
    message: "",
  };
}

async function scanLocalDevWifi(): Promise<WifiProvisioningSnapshot> {
  const [networksResponse, currentResponse] = await Promise.all([
    fetch("/api/system-wifi/networks", { cache: "no-store" }),
    fetch("/api/system-wifi/current", { cache: "no-store" }),
  ]);
  const networksPayload =
    await readProvisioningResponse<LocalWifiNetworksPayload>(networksResponse);
  const currentPayload =
    await readProvisioningResponse<LocalWifiCurrentPayload>(currentResponse);

  return {
    mode: "local-dev",
    networks: networksPayload.networks ?? [],
    current: currentPayload.current,
    message: "",
  };
}

async function ensureNativeWifiPermissions() {
  const permissions = await Wifi.checkPermissions().catch(() => null);

  if (permissions?.LOCATION === "granted" && permissions.NETWORK === "granted") {
    return;
  }

  const requested = await Wifi.requestPermissions();

  if (requested.LOCATION !== "granted" || requested.NETWORK !== "granted") {
    throw new Error(
      "Allow Wi-Fi and location permissions to scan Smart Plug devices."
    );
  }
}

function createNativeWifiConnectionError(ssid: string, error?: unknown) {
  const code = getProvisioningWifiErrorCode(error);
  const message =
    code === "FAILED_TO_ENABLE_NETWORK"
      ? `Android could not switch this phone to ${ssid} automatically. Reconnect to ${ssid} from Android Wi-Fi settings, then return to EnerTrack.`
      : `Unable to connect to ${ssid}.`;
  const connectionError = new Error(message) as Error & { code?: string };

  if (code) {
    connectionError.code = code;
  }

  return connectionError;
}

function normalizeNativeWifiNetwork(
  entry: WifiEntry
): WifiProvisioningNetwork | null {
  if (!entry.ssid || entry.ssid === SpecialSsid.HIDDEN) {
    return null;
  }

  return {
    ssid: entry.ssid,
    signal: normalizeNativeSignal(entry.level),
    secure: entry.capabilities.length > 0,
    band: null,
  };
}

function normalizeNativeCurrentWifi(
  entry: WifiEntry | undefined
): WifiProvisioningStatus | null {
  if (!entry?.ssid || entry.ssid === SpecialSsid.HIDDEN) {
    return null;
  }

  return {
    ssid: entry.ssid,
    state: "connected",
    band: null,
    connected: true,
  };
}

function normalizeNativeSignal(level: number) {
  if (!Number.isFinite(level)) return null;

  if (level >= 0 && level <= 100) {
    return Math.round(level);
  }

  return Math.max(0, Math.min(100, Math.round(2 * (level + 100))));
}

function hasLocalDevWifiHelper() {
  return localDevHosts.has(window.location.hostname);
}

async function readProvisioningResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
  } & T;

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "The Wi-Fi provisioning helper failed.");
  }

  return payload;
}
