export type UsageHistoryEntry = {
  id: string;
  deviceId: string;
  deviceName: string;
  date: string;
  energy: number;
  cost: number;
  electricityRate?: number;
  source: "live" | "offline_sync";
};
