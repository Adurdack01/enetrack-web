export type OfflineSyncStatus = "pending" | "syncing" | "synced" | "failed";

export type OfflineReading = {
  id: string;
  deviceId: string;
  deviceName?: string;
  batchId: string;
  timestamp: string;
  voltage?: number;
  current?: number;
  power?: number;
  powerFactor?: number | null;
  energy?: number;
  energyDelta?: number;
  cost?: number;
  relayStatus?: boolean;
};

export type OfflineSyncBatch = {
  id: string;
  deviceId: string;
  deviceName?: string;
  status: OfflineSyncStatus;
  startedAt: string;
  endedAt: string;
  syncedAt?: string;
  entries: number;
  totalEnergy: number;
  estimatedCost?: number;
  readings?: OfflineReading[];
  message?: string;
};

export type OfflineSyncOverview = {
  pendingLogs: number;
  statusText: string;
  lastSyncedAt?: string;
  latestBatch?: OfflineSyncBatch;
};
