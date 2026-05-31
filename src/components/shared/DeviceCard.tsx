import type { Device } from "@/types/device";
import { getDeviceScheduleSummary } from "@/utils/schedule";

type Props = {
  device: Device;
  onSelectDevice: (deviceId: string) => void;
  sharedCount?: number;
};

function formatSharedCount(count: number) {
  return `${count} family member${count === 1 ? "" : "s"}`;
}

export default function DeviceCard({
  device,
  onSelectDevice,
  sharedCount = device.sharedWith,
}: Props) {
  const relayState = device.relayState ?? device.status;
  const scheduleSummary = getDeviceScheduleSummary(device);

  return (
    <button
      type="button"
      onClick={() => onSelectDevice(device.id)}
      className="w-full rounded-[28px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-slate-900 dark:text-white">
            {device.name}
          </p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {device.room}
          </p>
        </div>

        <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
          {device.isShared ? "Shared" : "Tap to view"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
            relayState
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {relayState ? "ON" : "OFF"}
        </span>

        <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {device.power.toFixed(0)} W
        </span>

        <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          Budget ₱{device.budgetLimit.toFixed(0)}
        </span>

        {device.isShared && (
          <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            {device.accessPermission ?? "View Only"}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Lifetime Consumption
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {device.energy.toFixed(3)} kWh
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Today Cost
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            ₱{device.todayCost.toFixed(2)}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Schedule
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {scheduleSummary}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared With
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {formatSharedCount(sharedCount)}
          </p>
        </div>
      </div>
    </button>
  );
}
