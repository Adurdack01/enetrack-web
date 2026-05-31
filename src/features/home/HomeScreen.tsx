import { useEffect, useState, type ElementType } from "react";
import {
  Activity,
  BarChart3,
  ChevronDown,
  Gauge,
  ShieldCheck,
  Signal,
  Wifi,
  Zap,
} from "lucide-react";
import AddDeviceModal from "@/components/modals/AddDeviceModal";
import EmptyDeviceCard from "@/features/home/EmptyDeviceCard";
import PowerLineChart from "@/components/shared/PowerLineChart";
import { Switch } from "@/components/ui/switch";
import type { Device } from "@/types/device";
import type { CloudSyncRequestResult } from "@/types/pairing";
import type { UsageHistoryEntry } from "@/types/usageHistory";
import { getBillingMonthKey } from "@/utils/billingTime";
import { resolveProtectionLimits } from "@/utils/protection";

const PZEM_VALID_VOLTAGE_RANGE_TEXT = "80-300 V";

function getMonthKey(date = new Date()) {
  return getBillingMonthKey(date);
}

function getHistoryMonthKey(value: string) {
  return getBillingMonthKey(value) || value.slice(0, 7);
}

function roundEnergy(value: number) {
  return Number(value.toFixed(3));
}

function computeEstimatedCost(energy: number, electricityRate: number) {
  return Number((roundEnergy(energy) * electricityRate).toFixed(2));
}

function getUsageHistoryCost(
  entry: Pick<UsageHistoryEntry, "energy" | "cost" | "electricityRate">,
  fallbackRate: number
) {
  return typeof entry.cost === "number" && Number.isFinite(entry.cost)
    ? entry.cost
    : computeEstimatedCost(entry.energy, entry.electricityRate ?? fallbackRate);
}

type Props = {
  devices: Device[];
  usageHistory: UsageHistoryEntry[];
  selectedDeviceId: string;
  onSelectedDeviceChange: (deviceId: string) => void;
  onToggleDevice: (deviceId: string) => void;
  onSetProtectionMode: (deviceId: string, enabled: boolean) => void;
  onSelectDevice: (deviceId: string) => void;
  electricityRate: number;
  canAddDevice: boolean;
  onRequireElectricityRate: () => void;
  ownerUid: string | null;
  ownerEmail: string;
  firebaseApiKey: string;
  firebaseProjectId: string;
  onPairingFailed: (device: Device) => Promise<void> | void;
  onDevicePairedLocally: (
    device: Device,
    deviceAuthPassword: string
  ) => void;
  onCloudSyncRequested: (
    deviceId?: string
  ) => Promise<CloudSyncRequestResult> | CloudSyncRequestResult;
};

export default function HomeScreen({
  devices,
  usageHistory,
  selectedDeviceId,
  onSelectedDeviceChange,
  onToggleDevice,
  onSetProtectionMode,
  electricityRate,
  canAddDevice,
  onRequireElectricityRate,
  ownerUid,
  ownerEmail,
  firebaseApiKey,
  firebaseProjectId,
  onPairingFailed,
  onDevicePairedLocally,
  onCloudSyncRequested,
}: Props) {
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [ratePrompt, setRatePrompt] = useState("");
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [graphMode, setGraphMode] = useState<"power" | "current" | "voltage">(
    "power"
  );
  const [timeWindow, setTimeWindow] = useState(12);

  const hasDevices = devices.length > 0;
  const selectedDevice =
    devices.find((device) => device.id === selectedDeviceId) || devices[0];
  const selectedDeviceRelayState =
    selectedDevice?.relayState ?? selectedDevice?.status ?? false;
  const telemetryStale = Boolean(selectedDevice?.telemetryStale);
  const hasEsp32Reading =
    selectedDevice?.readingSource === "esp32" && !telemetryStale;
  const registrationStatus = selectedDevice?.cloudRegistrationStatus;
  const deviceOffline =
    registrationStatus !== "failed" &&
    registrationStatus !== "pending" &&
    Boolean(selectedDevice?.esp32Id) &&
    (selectedDevice?.online === false || telemetryStale);
  const syncStatus =
    registrationStatus === "failed"
      ? "Firebase Registration Failed"
        : registrationStatus === "pending"
          ? "Firebase Registration Pending"
          : deviceOffline
            ? "Smart Plug Offline"
            : hasEsp32Reading
              ? "Smart Plug Synced"
              : "Waiting for Smart Plug";
  const connectionLabel =
    registrationStatus === "failed"
      ? "Reg failed"
      : registrationStatus === "pending"
        ? "Registering"
        : deviceOffline
          ? "Offline"
        : hasEsp32Reading
          ? "Online"
          : "Waiting";
  const protectionEnabled = Boolean(selectedDevice?.protectionEnabled);
  const { maxPowerLimit, maxCurrentLimit } =
    resolveProtectionLimits(selectedDevice);
  const canControlSelectedDevice =
    !selectedDevice?.isShared ||
    selectedDevice.accessPermission === "View + Control" ||
    selectedDevice.accessPermission === "Full Access";
  const canManageSelectedDevice = !selectedDevice?.isShared;
  const wifiSignal =
    deviceOffline
      ? "Offline"
      : selectedDevice?.wifiSignal != null
      ? `${selectedDevice.wifiSignal} dBm`
      : "No signal";
  const powerFactorText =
    selectedDevice?.powerFactor != null
      ? selectedDevice.powerFactor.toFixed(2)
      : deviceOffline
        ? "Offline"
        : hasEsp32Reading
          ? "Unavailable"
          : "Waiting for Smart Plug";

  useEffect(() => {
    if (canAddDevice) {
      setRatePrompt("");
    }
  }, [canAddDevice]);

  const handleOpenAddDevice = () => {
    if (!canAddDevice) {
      setRatePrompt(
        "Please add your local electricity rate first. Go to Settings > Electricity Rate, enter a manual PHP per kWh rate, then save it before adding a device."
      );
      onRequireElectricityRate();
      return;
    }

    setShowAddDevice(true);
  };

  const voltage = selectedDevice?.voltage ?? 0;
  const current = selectedDevice?.current ?? 0;
  const power = selectedDevice?.power ?? 0;
  const selectedElectricityRate =
    selectedDevice?.isShared &&
    typeof selectedDevice.sharedElectricityRate === "number"
      ? selectedDevice.sharedElectricityRate
      : electricityRate;
  const currentMonthKey = getMonthKey();
  const selectedDeviceHistory = usageHistory.filter(
    (entry) => entry.deviceId === selectedDevice?.id
  );
  const selectedDeviceThisMonthHistory = selectedDeviceHistory.filter(
    (entry) => getHistoryMonthKey(entry.date) === currentMonthKey
  );
  const thisMonthConsumption = roundEnergy(
    selectedDeviceThisMonthHistory.reduce((sum, entry) => sum + entry.energy, 0)
  );
  const thisMonthCost = Number(
    selectedDeviceThisMonthHistory
      .reduce(
        (sum, entry) => sum + getUsageHistoryCost(entry, selectedElectricityRate),
        0
      )
      .toFixed(2)
  );
  const lifetimeConsumption = roundEnergy(selectedDevice?.energy ?? 0);
  const savedLifetimeTotalCost = selectedDeviceHistory.reduce(
    (sum, entry) => sum + getUsageHistoryCost(entry, selectedElectricityRate),
    0
  );
  const lifetimeTotalCost =
    savedLifetimeTotalCost > 0
      ? Number(savedLifetimeTotalCost.toFixed(2))
      : computeEstimatedCost(lifetimeConsumption, selectedElectricityRate);

  const graphValue =
    graphMode === "power" ? power : graphMode === "current" ? current : voltage;

  const graphUnit =
    graphMode === "power" ? "W" : graphMode === "current" ? "A" : "V";
  const graphThresholdLabel =
    graphMode === "voltage" ? "Valid Range" : "Threshold";
  const graphThresholdValue =
    graphMode === "current"
      ? `${maxCurrentLimit.toFixed(1)} A`
      : graphMode === "voltage"
        ? PZEM_VALID_VOLTAGE_RANGE_TEXT
        : `${maxPowerLimit.toFixed(0)} W`;

  const windowLabel =
    timeWindow === 12 ? "30s" : timeWindow === 30 ? "1m" : "2m";

  return (
    <>
      <div className="space-y-5">
        {!hasDevices && (
          <>
            <div className="rounded-[32px] bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white shadow-xl">
              <p className="text-xs text-white/80">Smart Plug Monitor</p>
              <h2 className="mt-1 text-2xl font-bold">Smart Plug Dashboard</h2>
              <p className="mt-2 text-xs text-white/80">
                Add your first device to start monitoring energy usage.
              </p>
            </div>

            <EmptyDeviceCard onAddDevice={handleOpenAddDevice} />

            {ratePrompt && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold leading-snug text-red-600 dark:bg-red-950/40 dark:text-red-300">
                {ratePrompt}
              </div>
            )}
          </>
        )}

        {hasDevices && (
          <>
            <div className="rounded-[32px] bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-white/80">Smart Plug Monitor</p>
                  <h2 className="mt-1 text-2xl font-bold leading-tight">
                    Smart Plug
                    <br />
                    Dashboard
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-2 text-xs">
                  <div className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
                    <Wifi className="h-3 w-3" />
                    {connectionLabel}
                  </div>

                  <div className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
                    <Signal className="h-3 w-3" />
                    {wifiSignal}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-white/80">Current Appliance</p>

                <div className="relative mt-2">
                  <select
                    value={selectedDevice?.id ?? ""}
                    onChange={(e) => onSelectedDeviceChange(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-white/20 bg-white/20 px-4 py-3 pr-10 text-sm font-semibold text-white outline-none"
                  >
                    {devices.map((device) => (
                      <option
                        key={device.id}
                        value={device.id}
                        className="text-slate-900"
                      >
                        {device.name}
                      </option>
                    ))}
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white" />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-white/80">
                    Location: {selectedDevice?.room}
                  </p>

                  <div className="text-right">
                    <p className="text-xs text-white/80">Relay</p>
                    <p className="text-sm font-bold">
                      {selectedDeviceRelayState ? "ON" : "OFF"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl bg-white/10 p-3">
                  <div>
                    <p className="text-sm font-medium">Remote Control</p>
                    <p className="text-xs text-white/70">
                      {canControlSelectedDevice
                        ? "Tap switch to control selected appliance"
                        : "View-only shared access"}
                    </p>
                  </div>

                  <Switch
                    checked={selectedDeviceRelayState}
                    disabled={!canControlSelectedDevice}
                    onCheckedChange={() => {
                      if (selectedDevice) {
                        onToggleDevice(selectedDevice.id);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {protectionEnabled
                        ? "Protection Active"
                        : "Protection Off"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Limit: {maxPowerLimit.toFixed(0)} W /{" "}
                      {maxCurrentLimit.toFixed(1)} A
                    </p>
                  </div>
                </div>

                <Switch
                  checked={protectionEnabled}
                  disabled={!canManageSelectedDevice}
                  onCheckedChange={(checked) => {
                    if (selectedDevice) {
                      onSetProtectionMode(selectedDevice.id, checked);
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <HomeMetricCard
                label="Voltage"
                value={voltage.toFixed(1)}
                suffix="V"
                icon={Zap}
              />
              <HomeMetricCard
                label="Current"
                value={current.toFixed(2)}
                suffix="A"
                icon={Activity}
              />
              <HomeMetricCard
                label="Power"
                value={power.toFixed(1)}
                suffix="W"
                icon={Gauge}
              />
              <HomeMetricCard
                label="This Month Consumption"
                value={thisMonthConsumption.toFixed(3)}
                suffix="kWh"
                icon={BarChart3}
              />
            </div>

            <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Live {graphMode.charAt(0).toUpperCase() + graphMode.slice(1)}{" "}
                    Graph
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Same telemetry source as live cards • updates every second
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {liveEnabled ? "Live" : "Paused"}
                  </span>
                  <Switch
                    checked={liveEnabled}
                    onCheckedChange={setLiveEnabled}
                  />
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                {(["power", "current", "voltage"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setGraphMode(mode)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      graphMode === mode
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-slate-500">Window: {windowLabel}</p>

                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(Number(e.target.value))}
                  className="rounded-xl border bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value={12}>30s</option>
                  <option value={30}>1m</option>
                  <option value={60}>2m</option>
                </select>
              </div>

              <div className="mt-4">
                <PowerLineChart
                  sourceId={selectedDevice?.id ?? "none"}
                  value={graphValue}
                  liveEnabled={liveEnabled}
                  timeWindow={timeWindow}
                  unit={graphUnit}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <GraphStat label="Peak" value={`${graphValue.toFixed(1)} ${graphUnit}`} />
                <GraphStat label="Min" value={`0.0 ${graphUnit}`} />
                <GraphStat
                  label={graphThresholdLabel}
                  value={graphThresholdValue}
                />
              </div>
            </div>

            <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Electrical Details
                </h2>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Selected Device
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <DetailRow label="Power Factor" value={powerFactorText} />
                <DetailRow
                  label="Lifetime Total Consumption"
                  value={`${lifetimeConsumption.toFixed(3)} kWh`}
                />
                <DetailRow
                  label="Lifetime Total Cost"
                  value={`₱${lifetimeTotalCost.toFixed(2)}`}
                />
                <DetailRow
                  label="This Month Cost"
                  value={`₱${thisMonthCost.toFixed(2)}`}
                />
                <DetailRow
                  label="Rate Used"
                  value={
                    selectedElectricityRate > 0
                      ? `₱${selectedElectricityRate.toFixed(2)} / kWh`
                      : "Not set"
                  }
                />
                <DetailRow label="Sync Status" value={syncStatus} />
                <DetailRow label="WiFi Signal" value={wifiSignal} />
                {selectedDevice?.cloudRegistrationError && (
                  <DetailRow
                    label="Registration Error"
                    value={selectedDevice.cloudRegistrationError}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AddDeviceModal
        open={showAddDevice}
        onClose={() => setShowAddDevice(false)}
        existingEsp32Ids={devices.flatMap((device) =>
          device.esp32Id ? [device.esp32Id] : []
        )}
        ownerUid={ownerUid}
        ownerEmail={ownerEmail}
        firebaseApiKey={firebaseApiKey}
        firebaseProjectId={firebaseProjectId}
        onPairingFailed={onPairingFailed}
        onDevicePairedLocally={onDevicePairedLocally}
        onCloudSyncRequested={onCloudSyncRequested}
      />
    </>
  );
}

function HomeMetricCard({
  label,
  value,
  suffix,
  icon: Icon,
}: {
  label: string;
  value: string;
  suffix: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>

        <div className="rounded-full bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
        <span className="ml-1 text-sm font-medium text-slate-500">
          {suffix}
        </span>
      </p>
    </div>
  );
}

function GraphStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-xs font-semibold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0 flex-1 text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="max-w-[48%] shrink-0 break-words text-right font-semibold text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}
