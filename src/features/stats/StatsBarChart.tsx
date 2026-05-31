import { useEffect, useRef, useState } from "react";
import { Calendar, Check, X } from "lucide-react";

type ChartItem = {
  label: string;
  value: number;
  cost?: number;
};

type ChartMode = "daily" | "weekly" | "monthly" | "yearly" | "live";

type Props = {
  data: ChartItem[];
  title: string;
  modes: { id: ChartMode; label: string }[];
  selectedBar: ChartItem | null;
  chartMode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  onBarClick: (item: ChartItem) => void;
  onCloseSelectedBar: () => void;
  highestText: string;
  periodText: string;
  emptyMessage: string;
  electricityRate: number;
};

function formatEnergyKwh(value: number) {
  return Number(value.toFixed(3)).toFixed(3);
}

export default function StatsBarChart({
  data,
  title,
  modes,
  selectedBar,
  chartMode,
  onModeChange,
  onBarClick,
  onCloseSelectedBar,
  highestText,
  periodText,
  emptyMessage,
  electricityRate,
}: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const hasChartData = data.length > 0 && data.some((item) => item.value > 0);
  const usesScrollableBars = data.length > 12;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {title}
            </h2>

            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
              {modes.find((mode) => mode.id === chartMode)?.label}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Tap the calendar icon to change the chart view.
          </p>
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"
          >
            <Calendar className="h-5 w-5" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-12 z-20 w-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-950">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    onModeChange(mode.id);
                    onCloseSelectedBar();
                    setIsMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                    chartMode === mode.id
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`}
                >
                  <span>{mode.label}</span>
                  {chartMode === mode.id && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`overflow-x-auto ${usesScrollableBars ? "pb-2" : ""}`}>
        <div
          className={`flex h-36 items-end gap-2 ${
            usesScrollableBars ? "w-max min-w-full" : "justify-between"
          }`}
        >
          {hasChartData ? (
            data.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.value > 0) {
                    onBarClick(item);
                  }
                }}
                disabled={item.value <= 0}
                className={`flex flex-col items-center gap-2 transition active:scale-95 ${
                  usesScrollableBars ? "w-9 shrink-0" : "flex-1"
                } ${item.value <= 0 ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <div
                  className={`w-full rounded-t-2xl transition hover:opacity-80 ${
                    selectedBar?.label === item.label
                      ? "bg-gradient-to-t from-emerald-700 to-teal-500 shadow-md"
                      : "bg-gradient-to-t from-emerald-500 to-teal-400"
                  }`}
                  style={{
                    height: item.value > 0 ? `${(item.value / maxValue) * 100}%` : "6px",
                    minHeight: item.value > 0 ? "28px" : "6px",
                  }}
                />

                <span
                  className={`text-[10px] font-medium ${
                    selectedBar?.label === item.label
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            ))
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {emptyMessage}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {chartMode === "live"
                  ? "Turn on a device to see live usage."
                  : "Try another chart view or add usage data."}
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedBar && hasChartData ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {selectedBar.label}
              </h3>
              <p className="text-xs text-slate-500">{periodText}</p>
            </div>

            <button type="button" onClick={onCloseSelectedBar}>
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-bold text-slate-900 dark:text-white">
                kWh total usage:
              </span>{" "}
              {formatEnergyKwh(selectedBar.value)} kWh
            </p>

            <p>
              <span className="font-bold text-slate-900 dark:text-white">
                Cost total:
              </span>{" "}
              ₱{(selectedBar.cost ?? selectedBar.value * electricityRate).toFixed(2)}
            </p>

            <p>
              <span className="font-bold text-slate-900 dark:text-white">
                Highest:
              </span>{" "}
              {highestText}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
          {hasChartData
            ? `Tap a bar to view the ${
                chartMode === "live" ? "live preview" : chartMode
              } energy summary for that period.`
            : emptyMessage}
        </div>
      )}
    </div>
  );
}
