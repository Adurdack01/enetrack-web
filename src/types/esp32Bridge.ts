export type DeviceReading = {
  id: string;
  uid?: string;
  deviceId: string;
  esp32Id?: string;
  deviceName?: string;
  timestamp: string;
  voltage?: number;
  current?: number;
  power?: number;
  powerFactor?: number | null;
  energy?: number;
  energyDelta?: number;
  cost?: number;
  relayStatus?: boolean;
  wifiSignal?: number | null;
  source: "esp32-live" | "esp32-offline-sync";
};

export type DeviceCommandType = "relay" | "protection" | "format_sd" | "schedule";

export type DeviceCommandStatus =
  | "pending"
  | "acknowledged"
  | "failed"
  | "expired";

export type DeviceCommand = {
  id: string;
  uid: string;
  deviceId: string;
  esp32Id?: string;
  deviceName: string;
  type: DeviceCommandType;
  status: DeviceCommandStatus;
  requestedAt: string;
  requestedBy: string;
  payload: {
    relayStatus?: boolean;
    protectionEnabled?: boolean;
    maxPowerW?: number;
    maxCurrentA?: number;
    confirm?: boolean;
    reason?: "manual" | "schedule" | "budget";
    scheduleEnabled?: boolean;
    scheduleMode?: "time" | "budget" | "both";
    schedule?: string;
    scheduleStartTime?: string;
    scheduleEndTime?: string;
    budgetLimit?: number;
    scheduleBudgetLimit?: number;
    scheduleBudgetKwhLimit?: number;
    scheduleElectricityRate?: number;
  };
  acknowledgedAt?: string;
  error?: string;
};

export type DeviceClaimRecord = {
  id: string;
  uid: string;
  ownerEmail: string;
  deviceId: string;
  esp32Id: string;
  deviceAuthEmail: string;
  deviceAuthUid?: string;
  deviceName: string;
  status: "claimed";
  claimedAt: string;
  readingPath: string;
  commandPath: string;
};
