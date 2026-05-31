type ConnectivityResult = {
  ok: boolean;
  message?: string;
};

const probeUrl = "https://firestore.googleapis.com";
let lastProbeAt = 0;
let lastProbeResult: ConnectivityResult | null = null;

function getConnectivityErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("resolve host") ||
    normalized.includes("no address associated") ||
    normalized.includes("unknownhost")
  ) {
    return "Android cannot resolve firestore.googleapis.com. Reconnect to your internet Wi-Fi, then disable Private DNS/VPN temporarily if it still fails.";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("aborted") ||
    normalized.includes("network request failed")
  ) {
    return "Firebase is not reachable yet. Wait for the phone to finish switching from the Smart Plug setup Wi-Fi to an internet Wi-Fi, then try again.";
  }

  return "Firebase is not reachable from this network yet.";
}

export async function checkFirebaseConnectivity(
  cacheMs = 5000
): Promise<ConnectivityResult> {
  if (!navigator.onLine) {
    return {
      ok: false,
      message:
        "Android reports that this device is offline. Reconnect to your internet Wi-Fi first.",
    };
  }

  const now = Date.now();
  if (lastProbeResult && now - lastProbeAt < cacheMs) {
    return lastProbeResult;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);

  try {
    await fetch(probeUrl, {
      method: "HEAD",
      cache: "no-store",
      mode: "no-cors",
      signal: controller.signal,
    });

    lastProbeResult = { ok: true };
    return lastProbeResult;
  } catch (error) {
    lastProbeResult = {
      ok: false,
      message: getConnectivityErrorMessage(error),
    };
    return lastProbeResult;
  } finally {
    lastProbeAt = Date.now();
    window.clearTimeout(timeout);
  }
}
