export type UsageLog = {
  id: string;
  deviceId: string;
  deviceName: string;
  date: string;
  energy: number;
  cost: number;
  electricityRate?: number;
  action:
    | "created"
    | "turned_on"
    | "turned_off"
    | "budget_alert"
    | "schedule_updated"
    | "device_updated"
    | "family_access_added"
    | "family_access_updated"
    | "family_access_removed"
    | "protection_updated"
    | "relay_command_queued"
    | "protection_command_queued"
    | "sd_card_format_queued"
    | "energy_reading"
    | "offline_synced";
  details?: string;
};
