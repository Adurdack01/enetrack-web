export type CloudSyncRequestResult = {
  status: "registered" | "pending" | "idle";
  message: string;
  requestedDeviceId?: string;
  registeredDeviceIds: string[];
};
