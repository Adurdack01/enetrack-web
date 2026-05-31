import {
  deleteCloudDevice,
  deleteCloudDeviceClaim,
  saveCloudDevice,
  saveCloudDeviceClaim,
} from "@/services/cloudStore";
import type { Device } from "@/types/device";
import type { DeviceClaimRecord } from "@/types/esp32Bridge";

export async function createDeviceDocument(
  uid: string,
  device: Device,
  claim: DeviceClaimRecord | null
) {
  await saveCloudDevice(uid, device);

  if (claim) {
    await saveCloudDeviceClaim(uid, claim);
  }
}

export async function cleanupFailedDevicePairing(uid: string, device: Device) {
  await deleteCloudDevice(uid, device.id);

  if (device.esp32Id) {
    await deleteCloudDeviceClaim(uid, device.esp32Id);
  }
}
