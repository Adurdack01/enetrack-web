import { useState } from "react";
import type { Device } from "@/types/device";

type SearchResult =
  | {
      type: "DEVICE";
      title: string;
      subtitle: string;
      action: () => void;
    }
  | {
      type: "TAB";
      title: string;
      subtitle: string;
      action: () => void;
    }
  | {
      type: "FEATURE";
      title: string;
      subtitle: string;
      action: () => void;
    };

type Props = {
  open: boolean;
  devices: Device[];
  onClose: () => void;
  onSelectDevice: (id: string) => void;
  onGoToTab: (tab: "home" | "stats" | "devices" | "settings") => void;
};

export default function SearchModal({
  open,
  devices,
  onClose,
  onSelectDevice,
  onGoToTab,
}: Props) {
  const [query, setQuery] = useState("");

  if (!open) return null;

  const q = query.toLowerCase().trim();

  const results: SearchResult[] = [
    ...devices.map((device) => ({
      type: "DEVICE" as const,
      title: device.name,
      subtitle: `${device.room} • Appliance details`,
      action: () => onSelectDevice(device.id),
    })),

    {
      type: "TAB" as const,
      title: "Home",
      subtitle: "Dashboard and live monitoring",
      action: () => onGoToTab("home"),
    },
    {
      type: "TAB" as const,
      title: "Stats",
      subtitle: "Usage logs, CSV export, and PDF export",
      action: () => onGoToTab("stats"),
    },
    {
      type: "TAB" as const,
      title: "Devices",
      subtitle: "Device list and Add Device",
      action: () => onGoToTab("devices"),
    },
    {
      type: "TAB" as const,
      title: "Settings",
      subtitle: "Dark mode and profile settings",
      action: () => onGoToTab("settings"),
    },

    {
      type: "FEATURE" as const,
      title: "Live Graph",
      subtitle: "Home tab • real-time graph for selected appliance",
      action: () => onGoToTab("home"),
    },
    {
      type: "FEATURE" as const,
      title: "Export CSV",
      subtitle: "Stats tab • download device usage as CSV",
      action: () => onGoToTab("stats"),
    },
    {
      type: "FEATURE" as const,
      title: "Export PDF",
      subtitle: "Stats tab • download device report as PDF",
      action: () => onGoToTab("stats"),
    },
    {
      type: "FEATURE" as const,
      title: "Dark Mode",
      subtitle: "Settings tab • switch app appearance",
      action: () => onGoToTab("settings"),
    },
    {
      type: "FEATURE" as const,
      title: "Add Device",
      subtitle: "Devices tab • pair a new smart plug",
      action: () => onGoToTab("devices"),
    },
  ].filter((item) => {
    if (!q) return true;

    return (
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40">
      <div className="mt-16 h-fit max-h-[75vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Search
          </h2>

          <button
            onClick={onClose}
            className="text-sm text-slate-500 dark:text-slate-400"
          >
            Close
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search devices, pages, or features"
          autoFocus
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />

        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">
              No result found for “{query}”
            </p>
          ) : (
            results.map((item, index) => (
              <button
                key={`${item.type}-${item.title}-${index}`}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                className="w-full rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800"
              >
                <p className="text-[10px] font-bold text-emerald-600">
                  {item.type}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {highlightText(item.title, query)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {highlightText(item.subtitle, query)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={index} className="rounded bg-yellow-200 px-0.5 text-black">
        {part}
      </span>
    ) : (
      part
    )
  );
}
