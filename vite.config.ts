import path from "path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const execFileAsync = promisify(execFile);

type SystemWifiNetwork = {
  ssid: string;
  signal: number | null;
  secure: boolean;
  band: string | null;
};

type SystemWifiStatus = {
  ssid: string;
  state: string;
  band: string | null;
  connected: boolean;
};

function windowsWifiPlugin() {
  return {
    name: "enertrack-windows-wifi",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/system-wifi/networks", async (_, response) => {
        try {
          ensureWindowsWifiAvailable();
          const { stdout } = await execFileAsync(
            "netsh",
            ["wlan", "show", "networks", "mode=bssid"],
            { windowsHide: true }
          );

          sendJson(response, 200, { success: true, networks: parseNetworks(stdout) });
        } catch (error) {
          sendJson(response, 500, {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Unable to scan Windows Wi-Fi networks.",
          });
        }
      });

      server.middlewares.use("/api/system-wifi/current", async (_, response) => {
        try {
          ensureWindowsWifiAvailable();
          const { stdout } = await execFileAsync(
            "netsh",
            ["wlan", "show", "interfaces"],
            { windowsHide: true }
          );

          sendJson(response, 200, {
            success: true,
            current: parseCurrentWifi(stdout),
          });
        } catch (error) {
          sendJson(response, 500, {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Unable to read current Windows Wi-Fi connection.",
          });
        }
      });

      server.middlewares.use(
        "/api/system-wifi/connect",
        async (request, response) => {
          if (request.method !== "POST") {
            sendJson(response, 405, {
              success: false,
              message: "Use POST to connect to a Wi-Fi network.",
            });
            return;
          }

          try {
            ensureWindowsWifiAvailable();
            const body = (await readJsonBody(request)) as {
              ssid?: string;
              password?: string;
            };
            const ssid = body.ssid?.trim() ?? "";
            const password = body.password?.trim() ?? "";

            if (!ssid) {
              sendJson(response, 400, {
                success: false,
                message: "Choose a Wi-Fi network first.",
              });
              return;
            }

            if (!password) {
              sendJson(response, 400, {
                success: false,
                message: "Enter the Wi-Fi password first.",
              });
              return;
            }

            await connectWindowsWifi(ssid, password);
            sendJson(response, 200, {
              success: true,
              message: `Windows is connecting to ${ssid}.`,
            });
          } catch (error) {
            sendJson(response, 500, {
              success: false,
              message: getCommandFailureMessage(
                error,
                "Unable to connect to the selected Wi-Fi network."
              ),
            });
          }
        }
      );

      server.middlewares.use(
        "/api/esp32-proxy",
        async (request, response) => {
          try {
            const requestUrl = new URL(request.url ?? "", "http://localhost");
            const baseUrl = requestUrl.searchParams.get("baseUrl")?.trim() ?? "";
            const apiPath = requestUrl.searchParams.get("path")?.trim() ?? "";

            if (!baseUrl || !apiPath.startsWith("/api/")) {
              sendJson(response, 400, {
                success: false,
                message: "Missing ESP32 baseUrl or API path.",
              });
              return;
            }

            const body = request.method === "POST" ? await readRawBody(request) : undefined;
            const esp32Response = await fetch(`${baseUrl}${apiPath}`, {
              method: request.method,
              headers: {
                "Content-Type": "application/json",
              },
              body,
              signal: AbortSignal.timeout(15000),
            });
            const text = await esp32Response.text();

            response.statusCode = esp32Response.status;
            response.setHeader("Content-Type", "application/json");
            response.end(text || "{}");
          } catch (error) {
            sendJson(response, 504, {
              success: false,
              message: getEsp32ProxyFailureMessage(error),
            });
          }
        }
      );
    },
  };
}

function ensureWindowsWifiAvailable() {
  if (process.platform !== "win32") {
    throw new Error("Local Wi-Fi scan is only available on Windows dev mode.");
  }
}

function parseNetworks(output: string): SystemWifiNetwork[] {
  const networks = new Map<string, SystemWifiNetwork>();
  let currentSsid = "";
  let currentAuthentication = "";

  for (const line of output.split(/\r?\n/)) {
    const ssidMatch = line.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/);
    const authenticationMatch = line.match(/^\s*Authentication\s*:\s*(.*)$/);
    const signalMatch = line.match(/^\s*Signal\s*:\s*(\d+)%/);
    const bandMatch = line.match(/^\s*Band\s*:\s*(.*)$/);

    if (ssidMatch) {
      currentSsid = ssidMatch[1].trim();
      currentAuthentication = "";

      if (currentSsid && !networks.has(currentSsid)) {
        networks.set(currentSsid, {
          ssid: currentSsid,
          signal: null,
          secure: true,
          band: null,
        });
      }
      continue;
    }

    if (!currentSsid) continue;

    const current = networks.get(currentSsid);
    if (!current) continue;

    if (authenticationMatch) {
      currentAuthentication = authenticationMatch[1].trim();
      current.secure = !/open/i.test(currentAuthentication);
      continue;
    }

    if (signalMatch) {
      const signal = Number(signalMatch[1]);
      current.signal = Math.max(current.signal ?? 0, signal);
      continue;
    }

    if (bandMatch && !current.band) {
      current.band = bandMatch[1].trim();
    }
  }

  return [...networks.values()]
    .filter((network) => network.ssid)
    .sort((left, right) => (right.signal ?? 0) - (left.signal ?? 0));
}

function parseCurrentWifi(output: string): SystemWifiStatus {
  let ssid = "";
  let state = "disconnected";
  let band: string | null = null;

  for (const line of output.split(/\r?\n/)) {
    const stateMatch = line.match(/^\s*State\s*:\s*(.*)$/);
    const ssidMatch = line.match(/^\s*SSID\s*:\s*(.*)$/);
    const bandMatch = line.match(/^\s*Band\s*:\s*(.*)$/);

    if (stateMatch) {
      state = stateMatch[1].trim();
    } else if (ssidMatch) {
      ssid = ssidMatch[1].trim();
    } else if (bandMatch) {
      band = bandMatch[1].trim();
    }
  }

  return {
    ssid,
    state,
    band,
    connected: /connected/i.test(state) && Boolean(ssid),
  };
}

async function connectWindowsWifi(ssid: string, password: string) {
  if (await hasWindowsWifiProfile(ssid)) {
    await runNetsh(["wlan", "delete", "profile", `name=${ssid}`]);
  }

  await createWindowsWifiProfile(ssid, password);
  await runNetsh(["wlan", "connect", `name=${ssid}`, `ssid=${ssid}`]);
}

async function hasWindowsWifiProfile(ssid: string) {
  try {
    await runNetsh(["wlan", "show", "profiles", `name=${ssid}`]);
    return true;
  } catch {
    return false;
  }
}

async function createWindowsWifiProfile(ssid: string, password: string) {
  const profilePath = path.join(tmpdir(), `enertrack-wifi-${randomUUID()}.xml`);

  try {
    await writeFile(profilePath, buildWifiProfileXml(ssid, password), "utf8");
    await runNetsh(["wlan", "add", "profile", `filename=${profilePath}`]);
  } finally {
    await unlink(profilePath).catch(() => undefined);
  }
}

async function runNetsh(args: string[]) {
  return execFileAsync("netsh", args, { windowsHide: true });
}

function buildWifiProfileXml(ssid: string, password: string) {
  const escapedSsid = escapeXml(ssid);
  const escapedPassword = escapeXml(password);

  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapedSsid}</name>
  <SSIDConfig>
    <SSID>
      <name>${escapedSsid}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2PSK</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>${escapedPassword}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function readJsonBody(request: IncomingMessage) {
  const rawBody = await readRawBody(request);

  return rawBody ? JSON.parse(rawBody) : {};
}

async function readRawBody(request: IncomingMessage) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
  }

  return rawBody;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function getCommandFailureMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;

  const commandError = error as {
    message?: string;
    stdout?: string;
    stderr?: string;
  };
  const details = [commandError.stderr, commandError.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();

  return details || commandError.message || fallback;
}

function getEsp32ProxyFailureMessage(error: unknown) {
  const message = getCommandFailureMessage(
    error,
    "The ESP32 local API is not reachable from this device."
  );

  if (/fetch failed|terminated|timeout|timed out/i.test(message)) {
    return "The ESP32 local API is not reachable. Connect this device to the ESP32 setup Wi-Fi such as SP-2200-ET, wait a few seconds, then tap Verify Device Login again.";
  }

  return message;
}

export default defineConfig({
  plugins: [windowsWifiPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
