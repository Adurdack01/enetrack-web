import type { Device } from "@/types/device";

export type PendingDevicePairing = {
  device: Device;
  deviceAuthPassword: string;
  createdAt: string;
};

const pendingPairingsKey = "pendingDevicePairings";

export function readPendingDevicePairings(): PendingDevicePairing[] {
  const saved = localStorage.getItem(pendingPairingsKey);

  if (!saved) {
    return [];
  }

  try {
    return (JSON.parse(saved) as PendingDevicePairing[]).map((pairing) => ({
      ...pairing,
      device: {
        ...pairing.device,
        cloudRegistrationStatus:
          pairing.device.cloudRegistrationStatus ?? "pending",
      },
    }));
  } catch {
    return [];
  }
}

export function savePendingDevicePairing(pairing: PendingDevicePairing) {
  const pairingEsp32Id = pairing.device.esp32Id;
  const existing = readPendingDevicePairings().filter(
    (item) =>
      item.device.id !== pairing.device.id &&
      (!pairingEsp32Id || item.device.esp32Id !== pairingEsp32Id)
  );

  localStorage.setItem(
    pendingPairingsKey,
    JSON.stringify([pairing, ...existing])
  );
}

export function removePendingDevicePairing(deviceId: string) {
  localStorage.setItem(
    pendingPairingsKey,
    JSON.stringify(
      readPendingDevicePairings().filter((item) => item.device.id !== deviceId)
    )
  );
}

export function removePendingDevicePairingsByEsp32Id(esp32Id: string) {
  localStorage.setItem(
    pendingPairingsKey,
    JSON.stringify(
      readPendingDevicePairings().filter((item) => item.device.esp32Id !== esp32Id)
    )
  );
}

export function clearPendingDevicePairings() {
  localStorage.removeItem(pendingPairingsKey);
}

export function hasPendingDevicePairings() {
  return readPendingDevicePairings().length > 0;
}
