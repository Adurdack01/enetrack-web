export type UserProfile = {
  displayName: string;
  email: string;
  provider: string;
};

export type ElectricityRateSettings = {
  mode: "manual" | "automatic";
  rate: number;
  previousRate: number;
  providerUrl: string;
  sourceName: string;
  status: "unset" | "verified" | "failed";
  statusMessage: string;
  effectiveBillingMonth: string;
  lastChecked: string;
  difference: number;
};
