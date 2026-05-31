import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type Esp32DeviceInfo = {
  esp32Id: string;
  ssid: string;
  paired: boolean;
  deviceType: "smart_plug";
  firmwareVersion?: string;
  setupIp?: string;
};

export type Esp32LoginResult = {
  success: boolean;
  message: string;
  pairingToken?: string;
};

export type Esp32PairDevicePayload = {
  pairingToken?: string;
  ownerUid: string;
  deviceDocId: string;
  esp32Id: string;
  deviceName: string;
  deviceLocation: string;
  wifiSsid: string;
  wifiPassword: string;
  newDevicePassword: string;
  firebaseApiKey: string;
  firebaseProjectId: string;
  deviceAuthEmail: string;
  deviceAuthPassword: string;
};

export type Esp32PairDeviceResult = {
  success: boolean;
  message: string;
};

export type Esp32WifiNetwork = {
  ssid: string;
  rssi: number;
  secure: boolean;
};

export type Esp32WifiNetworksResult = {
  success: boolean;
  networks: Esp32WifiNetwork[];
};

const requestTimeoutMs = 15000;
const unreachableMessage =
  "EnerTrack cannot reach the Smart Plug setup server at 192.168.4.1. Connect this phone to the Smart Plug hotspot first. If you are already connected, reset or reflash the firmware because the hotspot is up but its HTTP setup API is not answering.";

export function normalizeEsp32BaseUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol === "https:" && isPlainHttpEsp32Host(url.hostname)) {
      url.protocol = "http:";

      if (url.port === "443") {
        url.port = "";
      }
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return withProtocol.replace(/^https:\/\//i, "http://").replace(/\/$/, "");
  }
}

export async function getEsp32DeviceInfo(baseUrl: string) {
  return requestEsp32<Esp32DeviceInfo>(baseUrl, "/api/device-info");
}

export async function verifyEsp32Login(
  baseUrl: string,
  credentials: { username: string; password: string }
) {
  return requestEsp32<Esp32LoginResult>(baseUrl, "/api/verify-login", {
    method: "POST",
    body: credentials,
  });
}

export async function scanEsp32WifiNetworks(baseUrl: string) {
  return requestEsp32<Esp32WifiNetworksResult>(baseUrl, "/api/wifi-networks");
}

export async function pairEsp32Device(
  baseUrl: string,
  payload: Esp32PairDevicePayload
) {
  return requestEsp32<Esp32PairDeviceResult>(baseUrl, "/api/pair-device", {
    method: "POST",
    body: payload,
  });
}

async function requestEsp32<T>(
  baseUrl: string,
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}
) {
  const endpoint = normalizeEsp32BaseUrl(baseUrl);

  if (!endpoint) {
    throw new Error("Enter the Smart Plug local address first.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  const url = shouldUseLocalDevProxy()
    ? `/api/esp32-proxy?baseUrl=${encodeURIComponent(endpoint)}&path=${encodeURIComponent(path)}`
    : `${endpoint}${path}`;

  try {
    if (Capacitor.isNativePlatform()) {
      return await requestEsp32Native<T>(url, options);
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as T & {
      message?: string;
    };

    if (!response.ok) {
      throw new Error(payload.message ?? "The Smart Plug rejected the request.");
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(unreachableMessage);
    }

    if (error instanceof TypeError) {
      throw new Error(unreachableMessage);
    }

    if (isEsp32NetworkError(error)) {
      throw new Error(unreachableMessage);
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestEsp32Native<T>(
  url: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> }
) {
  const response = await CapacitorHttp.request({
    url,
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
    },
    data: options.body,
    connectTimeout: requestTimeoutMs,
    readTimeout: requestTimeoutMs,
    responseType: "json",
  });
  const payload = normalizeNativePayload<T>(response.data);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(payload.message ?? "The Smart Plug rejected the request.");
  }

  return payload as T;
}

function normalizeNativePayload<T>(data: unknown) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T & { message?: string };
    } catch {
      return {} as T & { message?: string };
    }
  }

  if (data && typeof data === "object") {
    return data as T & { message?: string };
  }

  return {} as T & { message?: string };
}

function shouldUseLocalDevProxy() {
  return (
    !Capacitor.isNativePlatform() &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  );
}

function isEsp32NetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return /timeout|timed out|failed to connect|connection refused|socket|network/i.test(
    error.message
  );
}

function isPlainHttpEsp32Host(hostname: string) {
  const host = hostname.toLowerCase();

  return (
    host === "192.168.4.1" ||
    host.endsWith(".local") ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}
