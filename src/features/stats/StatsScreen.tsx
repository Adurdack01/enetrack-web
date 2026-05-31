import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Trophy,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import StatsBarChart from "@/features/stats/StatsBarChart";
import type { Device } from "@/types/device";
import type {
  ExportRecord,
  ExportRecordRow,
  ExportRecordSummaryItem,
} from "@/types/exportRecord";
import type { UsageHistoryEntry } from "@/types/usageHistory";
import type { UsageLog } from "@/types/usageLog";
import {
  getBillingDateKey,
  getBillingDayOfMonth,
  getBillingMonthKey,
  getBillingYear,
} from "@/utils/billingTime";

type Props = {
  devices: Device[];
  usageHistory: UsageHistoryEntry[];
  usageLogs: UsageLog[];
  onClearLogs: () => void;
  onExportRecord: (record: Omit<ExportRecord, "id" | "createdAt">) => void;
  electricityRate: number;
};

type ChartItem = {
  label: string;
  value: number;
  cost?: number;
};

type DeviceUsageAggregate = {
  deviceId: string;
  deviceName: string;
  energy: number;
  cost: number;
  latestDate: string;
};

type ChartMode = "daily" | "weekly" | "monthly" | "yearly" | "live";
type LogMode = "single" | "range";
type LogFilter = "all" | "usage" | "actions";
type StatsScope = "this_month" | "pick_month" | "lifetime";
type LogExportMetadata = {
  title: string;
  fileStem: string;
};

type CalendarDeviceBreakdown = {
  deviceId: string;
  deviceName: string;
  energy: number;
  cost: number;
};

type CalendarDayAggregate = {
  date: string;
  day: number;
  energy: number;
  cost: number;
  usageCount: number;
  actionCount: number;
  offlineSyncCount: number;
  deviceBreakdown: CalendarDeviceBreakdown[];
  logs: UsageLog[];
};

type UsageReportExport = {
  title: string;
  fileStem: string;
  summary: ExportRecordSummaryItem[];
  rows: ExportRecordRow[];
  notes: string[];
};

const VISIBLE_LOG_LIMIT = 3;
const EXPORT_STATUS_TOAST_TEXT =
  "Export saved. Go to Export Status in the Settings tab.";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_SCOPED_MODES: { id: ChartMode; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "live", label: "Live Preview" },
];

const LIFETIME_MODES: { id: ChartMode; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
  { id: "live", label: "Live Preview" },
];

function getInputDate(date = new Date()) {
  return getBillingDateKey(date);
}

function getMonthInput(date = new Date()) {
  return getBillingMonthKey(date);
}

function getEntryInputDate(value: string) {
  return getBillingDateKey(value) || value.slice(0, 10);
}

function getLogInputDate(logDate: string) {
  return getBillingDateKey(logDate) || logDate.slice(0, 10);
}

function roundEnergy(value: number) {
  return Number(value.toFixed(3));
}

function formatEnergyKwh(value: number) {
  return roundEnergy(value).toFixed(3);
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

function isUsageBearingLog(log: Pick<UsageLog, "action">) {
  return log.action === "energy_reading" || log.action === "offline_synced";
}

function matchesLogFilter(log: UsageLog, filter: LogFilter) {
  if (filter === "usage") return isUsageBearingLog(log);
  if (filter === "actions") return !isUsageBearingLog(log);
  return true;
}

function getUsageLogEnergy(log: Pick<UsageLog, "action" | "energy">) {
  return isUsageBearingLog(log) ? log.energy : 0;
}

function getUsageLogCost(
  log: Pick<UsageLog, "action" | "energy" | "cost" | "electricityRate">,
  electricityRate: number
) {
  if (!isUsageBearingLog(log)) return 0;
  if (typeof log.cost === "number" && Number.isFinite(log.cost)) {
    return Number(log.cost.toFixed(2));
  }

  return computeEstimatedCost(log.energy, log.electricityRate ?? electricityRate);
}

function formatMonthLabel(value: string) {
  const [yearValue, monthValue] = value.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;
  const date = new Date(year, monthIndex, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getPreviousMonthInput(value: string) {
  const [yearValue, monthValue] = value.split("-");
  const date = new Date(Number(yearValue), Number(monthValue) - 1, 1);
  date.setMonth(date.getMonth() - 1);

  return getMonthInput(date);
}

function getNextMonthInput(value: string) {
  const [yearValue, monthValue] = value.split("-");
  const date = new Date(Number(yearValue), Number(monthValue) - 1, 1);
  date.setMonth(date.getMonth() + 1);

  return getMonthInput(date);
}

function isEntryInMonth(entry: UsageHistoryEntry, monthValue: string) {
  return (getBillingMonthKey(entry.date) || entry.date.slice(0, 7)) === monthValue;
}

function getDaysInMonth(monthValue: string) {
  const [yearValue, monthIndexValue] = monthValue.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthIndexValue) - 1;

  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildMonthDailyChartData(
  entries: UsageHistoryEntry[],
  monthValue: string,
  electricityRate: number
): ChartItem[] {
  const dayCount = getDaysInMonth(monthValue);
  const totals = Array.from({ length: dayCount }, () => 0);
  const costs = Array.from({ length: dayCount }, () => 0);

  entries.forEach((entry) => {
    if (!isEntryInMonth(entry, monthValue)) return;

    const day = getBillingDayOfMonth(entry.date);
    if (day == null) return;

    const dayIndex = day - 1;
    totals[dayIndex] += entry.energy;
    costs[dayIndex] += getUsageHistoryCost(entry, electricityRate);
  });

  return totals.map((value, index) => ({
    label: String(index + 1),
    value: roundEnergy(value),
    cost: Number(costs[index].toFixed(2)),
  }));
}

function buildMonthWeeklyChartData(
  entries: UsageHistoryEntry[],
  monthValue: string,
  electricityRate: number
): ChartItem[] {
  const weekCount = Math.ceil(getDaysInMonth(monthValue) / 7);
  const totals = Array.from({ length: weekCount }, () => 0);
  const costs = Array.from({ length: weekCount }, () => 0);

  entries.forEach((entry) => {
    if (!isEntryInMonth(entry, monthValue)) return;

    const day = getBillingDayOfMonth(entry.date);
    if (day == null) return;

    const weekIndex = Math.floor((day - 1) / 7);
    totals[weekIndex] += entry.energy;
    costs[weekIndex] += getUsageHistoryCost(entry, electricityRate);
  });

  return totals.map((value, index) => ({
    label: `W${index + 1}`,
    value: roundEnergy(value),
    cost: Number(costs[index].toFixed(2)),
  }));
}

function buildCalendarMonthDays(
  entries: UsageHistoryEntry[],
  logs: UsageLog[],
  monthValue: string,
  electricityRate: number
) {
  const dayCount = getDaysInMonth(monthValue);
  const dayBuilders = new Map<
    string,
    CalendarDayAggregate & {
      deviceTotals: Map<string, CalendarDeviceBreakdown>;
    }
  >();

  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${monthValue}-${String(day).padStart(2, "0")}`;
    dayBuilders.set(date, {
      date,
      day,
      energy: 0,
      cost: 0,
      usageCount: 0,
      actionCount: 0,
      offlineSyncCount: 0,
      deviceBreakdown: [],
      logs: [],
      deviceTotals: new Map(),
    });
  }

  entries.forEach((entry) => {
    const date = getEntryInputDate(entry.date);
    if (!date.startsWith(monthValue)) return;

    const day = dayBuilders.get(date);
    if (!day) return;

    const entryCost = getUsageHistoryCost(entry, electricityRate);
    const existingDevice = day.deviceTotals.get(entry.deviceId);

    day.energy += entry.energy;
    day.cost += entryCost;
    day.usageCount += 1;
    if (entry.source === "offline_sync") day.offlineSyncCount += 1;

    day.deviceTotals.set(entry.deviceId, {
      deviceId: entry.deviceId,
      deviceName: entry.deviceName,
      energy: (existingDevice?.energy ?? 0) + entry.energy,
      cost: (existingDevice?.cost ?? 0) + entryCost,
    });
  });

  logs.forEach((log) => {
    const date = getLogInputDate(log.date);
    if (!date.startsWith(monthValue)) return;

    const day = dayBuilders.get(date);
    if (!day) return;

    day.logs.push(log);
    if (!isUsageBearingLog(log)) {
      day.actionCount += 1;
    }
  });

  const days = [...dayBuilders.values()].map(({ deviceTotals, ...day }) => ({
    ...day,
    energy: roundEnergy(day.energy),
    cost: Number(day.cost.toFixed(2)),
    deviceBreakdown: [...deviceTotals.values()]
      .map((device) => ({
        ...device,
        energy: roundEnergy(device.energy),
        cost: Number(device.cost.toFixed(2)),
      }))
      .sort((a, b) => b.energy - a.energy),
    logs: [...day.logs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
  }));

  const leadingBlankDays = new Date(`${monthValue}-01T00:00:00`).getDay();
  const cells: (CalendarDayAggregate | null)[] = [
    ...Array.from({ length: leadingBlankDays }, () => null),
    ...days,
  ];

  return {
    cells,
    days,
    monthEnergy: roundEnergy(days.reduce((sum, day) => sum + day.energy, 0)),
    monthCost: Number(days.reduce((sum, day) => sum + day.cost, 0).toFixed(2)),
    maxDayEnergy: Math.max(...days.map((day) => day.energy), 0),
  };
}

function buildLastTwelveMonthsChartData(
  entries: UsageHistoryEntry[],
  anchorDate = new Date(),
  electricityRate = 0
): ChartItem[] {
  const months: string[] = [];
  const totals = new Map<string, number>();
  const costs = new Map<string, number>();
  const [anchorYear, anchorMonth] = getMonthInput(anchorDate)
    .split("-")
    .map(Number);
  const end = new Date(anchorYear, anchorMonth - 1, 1);

  for (let offset = 11; offset >= 0; offset -= 1) {
    const monthDate = new Date(end.getFullYear(), end.getMonth() - offset, 1);
    const monthKey = getMonthInput(monthDate);
    months.push(monthKey);
    totals.set(monthKey, 0);
    costs.set(monthKey, 0);
  }

  entries.forEach((entry) => {
    const monthKey = getBillingMonthKey(entry.date) || entry.date.slice(0, 7);
    if (!totals.has(monthKey)) return;

    totals.set(monthKey, (totals.get(monthKey) ?? 0) + entry.energy);
    costs.set(
      monthKey,
      (costs.get(monthKey) ?? 0) + getUsageHistoryCost(entry, electricityRate)
    );
  });

  return months.map((monthKey) => ({
    label: new Date(`${monthKey}-01T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    value: roundEnergy(totals.get(monthKey) ?? 0),
    cost: Number((costs.get(monthKey) ?? 0).toFixed(2)),
  }));
}

function buildLifetimeYearlyChartData(
  entries: UsageHistoryEntry[],
  electricityRate: number
): ChartItem[] {
  const totals = new Map<number, number>();
  const costs = new Map<number, number>();

  entries.forEach((entry) => {
    const year = getBillingYear(entry.date);
    if (year == null) return;

    totals.set(year, (totals.get(year) ?? 0) + entry.energy);
    costs.set(year, (costs.get(year) ?? 0) + getUsageHistoryCost(entry, electricityRate));
  });

  return [...totals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, value]) => ({
      label: String(year),
      value: roundEnergy(value),
      cost: Number((costs.get(year) ?? 0).toFixed(2)),
    }));
}

function filterHistoryByScope(
  entries: UsageHistoryEntry[],
  scope: StatsScope,
  currentMonth: string,
  selectedMonth: string
) {
  if (scope === "lifetime") {
    return entries;
  }

  const targetMonth = scope === "this_month" ? currentMonth : selectedMonth;
  return entries.filter((entry) => isEntryInMonth(entry, targetMonth));
}

function getUniqueHistoryMonths(entries: UsageHistoryEntry[]) {
  return [
    ...new Set(
      entries
        .map((entry) => getBillingMonthKey(entry.date) || entry.date.slice(0, 7))
        .filter(Boolean),
    ),
  ].sort();
}

function buildDeviceUsageAggregates(
  entries: UsageHistoryEntry[],
  electricityRate: number
) {
  const aggregates = new Map<string, DeviceUsageAggregate>();

  entries.forEach((entry) => {
    const existing = aggregates.get(entry.deviceId);

    if (!existing) {
      aggregates.set(entry.deviceId, {
        deviceId: entry.deviceId,
        deviceName: entry.deviceName,
        energy: entry.energy,
        cost:
          entry.cost ??
          getUsageHistoryCost(entry, electricityRate),
        latestDate: entry.date,
      });
      return;
    }

    aggregates.set(entry.deviceId, {
      ...existing,
      deviceName:
        new Date(entry.date).getTime() >= new Date(existing.latestDate).getTime()
          ? entry.deviceName
          : existing.deviceName,
      energy: existing.energy + entry.energy,
      cost:
        existing.cost +
        (entry.cost ??
          getUsageHistoryCost(entry, electricityRate)),
      latestDate:
        new Date(entry.date).getTime() >= new Date(existing.latestDate).getTime()
          ? entry.date
          : existing.latestDate,
    });
  });

  return [...aggregates.values()].map((entry) => ({
    ...entry,
    energy: roundEnergy(entry.energy),
    cost: Number(entry.cost.toFixed(2)),
  }));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getUsageShareText(energy: number, totalEnergy: number) {
  if (totalEnergy <= 0) return "0% of total";
  return `${Math.round((energy / totalEnergy) * 100)}% of total`;
}

function buildUsageReportRows(
  devices: DeviceUsageAggregate[],
  periodLabel: string,
  totalEnergy: number
): ExportRecordRow[] {
  return devices
    .filter((device) => device.energy > 0)
    .sort((a, b) => b.energy - a.energy)
    .map((device) => ({
      deviceName: device.deviceName,
      date: periodLabel,
      action: "Device Usage",
      details: getUsageShareText(device.energy, totalEnergy),
      energy: roundEnergy(device.energy),
      cost: Number(device.cost.toFixed(2)),
    }));
}

function buildReportTextContent(report: UsageReportExport) {
  const summaryRows = report.summary.map(
    (item) => `${item.label}: ${item.value}`
  );
  const rows = report.rows.map(
    (row) =>
      `${row.deviceName} | ${row.date} | ${row.details ?? ""} | ${formatEnergyKwh(
        row.energy
      )} kWh | PHP ${row.cost.toFixed(2)}`
  );

  return [
    report.title,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    ...summaryRows,
    "",
    "Device Breakdown",
    ...rows,
    "",
    ...report.notes,
  ].join("\n");
}

function exportUsageReportToCSV(report: UsageReportExport) {
  const summaryRows = report.summary.map((item) => [
    "Summary",
    item.label,
    item.value,
    "",
    "",
  ]);
  const headers = ["Section", "Device", "Period", "Energy (kWh)", "Cost (PHP)"];
  const deviceRows = report.rows.map((row) => [
    row.details ?? "Device Usage",
    row.deviceName,
    row.date,
    formatEnergyKwh(row.energy),
    row.cost.toFixed(2),
  ]);
  const noteRows = report.notes.map((note) => ["Note", note, "", "", ""]);
  const csvContent = [
    [report.title, "", "", "", ""],
    [`Generated: ${new Date().toLocaleString()}`, "", "", "", ""],
    ...summaryRows,
    headers,
    ...deviceRows,
    ...noteRows,
  ]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `${report.fileStem}.csv`;

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  return {
    content: csvContent,
    fileName,
    mimeType: "text/csv;charset=utf-8;",
  };
}

function exportUsageReportToPDF(report: UsageReportExport) {
  const doc = new jsPDF();
  let y = 20;
  const fileName = `${report.fileStem}.pdf`;
  const content = buildReportTextContent(report);

  doc.setFontSize(16);
  doc.text(report.title, 14, y);
  y += 10;

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 12;

  report.summary.forEach((item) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }

    doc.text(`${item.label}: ${item.value}`.slice(0, 95), 14, y);
    y += 6;
  });

  y += 8;
  doc.setFontSize(12);
  doc.text("Device Breakdown", 14, y);
  y += 8;

  report.rows.forEach((row) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.text(row.deviceName, 14, y);
    doc.text(`${formatEnergyKwh(row.energy)} kWh`, 138, y);
    y += 6;
    doc.setFontSize(9);
    doc.text(`${row.date} - ${row.details ?? "Device Usage"}`, 14, y);
    doc.text(`PHP ${row.cost.toFixed(2)}`, 138, y);
    y += 10;
  });

  if (report.notes.length > 0) {
    y += 4;
    doc.setFontSize(10);
    report.notes.forEach((note) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      doc.text(note.slice(0, 95), 14, y);
      y += 6;
    });
  }

  doc.save(fileName);

  return {
    content,
    fileName,
    mimeType: "application/pdf",
  };
}

function formatDisplayDate(value: string) {
  if (!value) return "Select date";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isLogInsideRange(log: UsageLog, startDate: string, endDate: string) {
  const logDate = getLogInputDate(log.date);
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;

  return logDate >= start && logDate <= end;
}

function getActionLabel(action: UsageLog["action"]) {
  if (action === "turned_on") return "Turned On";
  if (action === "turned_off") return "Turned Off";
  if (action === "budget_alert") return "Budget Alert";
  if (action === "schedule_updated") return "Schedule Updated";
  if (action === "device_updated") return "Device Updated";
  if (action === "family_access_added") return "Family Access Added";
  if (action === "family_access_updated") return "Family Access Updated";
  if (action === "family_access_removed") return "Family Access Removed";
  if (action === "protection_updated") return "Protection Updated";
  if (action === "relay_command_queued") return "Relay Command Queued";
  if (action === "protection_command_queued") {
    return "Protection Command Queued";
  }
  if (action === "sd_card_format_queued") {
    return "SD Card Format Queued";
  }
  if (action === "energy_reading") return "Interval Usage";
  if (action === "offline_synced") return "Offline Usage Synced";
  return "Created";
}

function getLogExportMetadata(filter: LogFilter): LogExportMetadata {
  if (filter === "actions") {
    return {
      title: "EnerTrack Action Logs",
      fileStem: "enertrack-action-logs",
    };
  }

  if (filter === "usage") {
    return {
      title: "EnerTrack Usage Logs",
      fileStem: "enertrack-usage-logs",
    };
  }

  return {
    title: "EnerTrack Activity Logs",
    fileStem: "enertrack-activity-logs",
  };
}

function exportLogsToCSV(
  logs: UsageLog[],
  electricityRate: number,
  metadata: LogExportMetadata
) {
  const headers = [
    "Device",
    "Date",
    "Action",
    "Changes",
    "Energy (kWh)",
    "Cost (PHP)",
  ];
  const rows = logs.map((log) => [
    log.deviceName,
    formatDisplayDate(getLogInputDate(log.date)),
    getActionLabel(log.action),
    log.details ?? "",
    formatEnergyKwh(getUsageLogEnergy(log)),
    getUsageLogCost(log, electricityRate).toFixed(2),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `${metadata.fileStem}.csv`;

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);

  return {
    content: csvContent,
    fileName,
    mimeType: "text/csv;charset=utf-8;",
  };
}

function buildExportRows(
  logs: UsageLog[],
  electricityRate: number
): ExportRecordRow[] {
  return logs.map((log) => ({
    deviceName: log.deviceName,
    date: formatDisplayDate(getLogInputDate(log.date)),
    action: getActionLabel(log.action),
    details: log.details,
    energy: roundEnergy(getUsageLogEnergy(log)),
    cost: getUsageLogCost(log, electricityRate),
  }));
}

function exportLogsToPDF(
  logs: UsageLog[],
  electricityRate: number,
  metadata: LogExportMetadata
) {
  const doc = new jsPDF();
  let y = 20;
  const fileName = `${metadata.fileStem}.pdf`;
  const content = buildLogsTextContent(
    logs,
    metadata.title,
    electricityRate
  );

  doc.setFontSize(16);
  doc.text(metadata.title, 14, y);

  y += 10;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);

  y += 12;

  logs.forEach((log) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.text(log.deviceName, 14, y);
    doc.text(`${formatEnergyKwh(getUsageLogEnergy(log))} kWh`, 138, y);

    y += 6;
    doc.setFontSize(9);
    doc.text(
      `${formatDisplayDate(getLogInputDate(log.date))} - ${getActionLabel(
        log.action
      )}`,
      14,
      y
    );
    doc.text(
      `PHP ${getUsageLogCost(log, electricityRate).toFixed(2)}`,
      138,
      y
    );

    if (log.details) {
      y += 5;
      doc.text(log.details.slice(0, 90), 14, y);
    }

    y += 10;
  });

  doc.save(fileName);

  return {
    content,
    fileName,
    mimeType: "application/pdf",
  };
}

function buildLogsTextContent(
  logs: UsageLog[],
  title: string,
  electricityRate: number
) {
  const rows = logs.map(
    (log) =>
      `${formatDisplayDate(getLogInputDate(log.date))} | ${log.deviceName} | ${getActionLabel(
        log.action
      )} | ${log.details ?? ""} | ${formatEnergyKwh(
        getUsageLogEnergy(log)
      )} kWh | PHP ${getUsageLogCost(log, electricityRate).toFixed(2)}`
  );

  return [
    title,
    `Generated: ${new Date().toLocaleString()}`,
    `Entries: ${logs.length}`,
    "",
    ...rows,
  ].join("\n");
}

export default function StatsScreen({
  devices,
  usageHistory,
  usageLogs,
  onClearLogs,
  onExportRecord,
  electricityRate,
}: Props) {
  const today = getInputDate();
  const currentMonth = getMonthInput();
  const weekAgo = getInputDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

  const [scope, setScope] = useState<StatsScope>("this_month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [chartMode, setChartMode] = useState<ChartMode>("weekly");
  const [selectedBar, setSelectedBar] = useState<ChartItem | null>(null);
  const [logMode, setLogMode] = useState<LogMode>("single");
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(currentMonth);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(today);
  const [exportToast, setExportToast] = useState("");
  const exportToastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportToastTimeoutRef.current != null) {
        window.clearTimeout(exportToastTimeoutRef.current);
      }
    };
  }, []);

  const showExportStatusToast = () => {
    if (exportToastTimeoutRef.current != null) {
      window.clearTimeout(exportToastTimeoutRef.current);
    }

    setExportToast(EXPORT_STATUS_TOAST_TEXT);
    exportToastTimeoutRef.current = window.setTimeout(() => {
      setExportToast("");
      exportToastTimeoutRef.current = null;
    }, 3500);
  };

  const availableChartModes = scope === "lifetime" ? LIFETIME_MODES : MONTH_SCOPED_MODES;
  const activeMonth = scope === "this_month" ? currentMonth : selectedMonth;
  const selectedPeriodLabel =
    scope === "this_month"
      ? "This Month"
      : scope === "pick_month"
        ? formatMonthLabel(selectedMonth)
        : "Lifetime";
  const selectedPeriodUsageHistory = useMemo(
    () => filterHistoryByScope(usageHistory, scope, currentMonth, selectedMonth),
    [currentMonth, scope, selectedMonth, usageHistory]
  );
  const selectedPeriodUsageByDevice = useMemo(
    () => buildDeviceUsageAggregates(selectedPeriodUsageHistory, electricityRate),
    [electricityRate, selectedPeriodUsageHistory]
  );
  const totalEnergy = roundEnergy(selectedPeriodUsageHistory.reduce(
    (sum, entry) => sum + entry.energy,
    0
  ));
  const totalCost = Number(
    selectedPeriodUsageHistory
      .reduce(
        (sum, entry) =>
          sum + getUsageHistoryCost(entry, electricityRate),
        0
      )
      .toFixed(2)
  );
  const totalPower = devices.reduce((sum, device) => sum + device.power, 0);
  const activeDevices = devices.filter(
    (device) => device.relayState ?? device.status
  ).length;
  const liveDevices = devices.filter((device) => device.energy > 0);

  const liveChartData: ChartItem[] = liveDevices.map((device, index) => ({
    label: `D${index + 1}`,
    value: roundEnergy(device.energy),
    cost: computeEstimatedCost(
      device.energy,
      device.isShared && device.sharedElectricityRate
        ? device.sharedElectricityRate
        : electricityRate
    ),
  }));

  const chartDataMap: Record<ChartMode, ChartItem[]> = {
    daily:
      scope === "lifetime"
        ? []
        : buildMonthDailyChartData(
            selectedPeriodUsageHistory,
            activeMonth,
            electricityRate
          ),
    weekly:
      scope === "lifetime"
        ? []
        : buildMonthWeeklyChartData(
            selectedPeriodUsageHistory,
            activeMonth,
            electricityRate
          ),
    monthly: buildLastTwelveMonthsChartData(
      usageHistory,
      new Date(),
      electricityRate
    ),
    yearly: buildLifetimeYearlyChartData(usageHistory, electricityRate),
    live: liveChartData,
  };

  const chartTitleMap: Record<ChartMode, string> = {
    daily: `${selectedPeriodLabel} Daily Usage`,
    weekly: `${selectedPeriodLabel} Weekly Usage`,
    monthly: "Last 12 Months",
    yearly: "Yearly Usage",
    live: "Live Preview",
  };

  const chartData = chartDataMap[chartMode];
  const chartTitle = chartTitleMap[chartMode];
  const emptyMessage =
    chartMode === "live" && devices.length > 0 && liveDevices.length === 0
      ? "No live energy usage right now."
      : scope === "lifetime"
        ? "No saved lifetime energy history yet."
        : `No saved energy history for ${selectedPeriodLabel}.`;

  const selectedLiveDevice =
    chartMode === "live" && selectedBar
      ? liveDevices[Number(selectedBar.label.replace("D", "")) - 1]
      : null;

  const barPeriodText = selectedBar
    ? chartMode === "daily"
      ? `${formatMonthLabel(activeMonth)} ${selectedBar.label}`
      : chartMode === "weekly"
        ? `${selectedBar.label} of ${formatMonthLabel(activeMonth)}`
        : chartMode === "monthly"
          ? `Selected month: ${selectedBar.label}`
          : chartMode === "yearly"
            ? `Selected year: ${selectedBar.label}`
            : `Live device: ${selectedLiveDevice?.name ?? selectedBar.label}`
    : "";

  const liveTopDevice = [...liveDevices].sort((a, b) => b.energy - a.energy)[0];
  const historicalTopDevice = [...selectedPeriodUsageByDevice].sort(
    (a, b) => b.energy - a.energy
  )[0];

  const highestTotal =
    chartMode === "live"
      ? liveDevices.reduce((sum, device) => sum + device.energy, 0)
      : selectedPeriodUsageByDevice.reduce((sum, device) => sum + device.energy, 0);

  const highlightedEnergy =
    chartMode === "live"
      ? liveTopDevice?.energy ?? 0
      : historicalTopDevice?.energy ?? 0;

  const highestPercent =
    highestTotal > 0
      ? Math.round((highlightedEnergy / highestTotal) * 100)
      : 0;

  const highestText =
    chartMode === "live"
      ? liveTopDevice
        ? `${liveTopDevice.name} (${highestPercent}%) ${formatEnergyKwh(
            liveTopDevice.energy
          )} kWh | ₱${computeEstimatedCost(
            liveTopDevice.energy,
            liveTopDevice.isShared && liveTopDevice.sharedElectricityRate
              ? liveTopDevice.sharedElectricityRate
              : electricityRate
          ).toFixed(2)}`
        : "No device data"
      : historicalTopDevice
        ? `${historicalTopDevice.deviceName} (${highestPercent}%) ${formatEnergyKwh(
            historicalTopDevice.energy
          )} kWh | ₱${historicalTopDevice.cost.toFixed(2)}`
        : "No device data";

  const rankedDevices = [...selectedPeriodUsageByDevice]
    .filter((device) => device.energy > 0)
    .sort((a, b) => b.energy - a.energy);
  const leaderboardTotal = rankedDevices.reduce(
    (sum, device) => sum + device.energy,
    0
  );
  const previousMonth = getPreviousMonthInput(activeMonth);
  const previousMonthEnergy = usageHistory
    .filter((entry) => isEntryInMonth(entry, previousMonth))
    .reduce((sum, entry) => sum + entry.energy, 0);
  const comparisonPercent =
    previousMonthEnergy > 0
      ? Math.round(((totalEnergy - previousMonthEnergy) / previousMonthEnergy) * 100)
      : 0;
  const lifetimeMonths = getUniqueHistoryMonths(usageHistory);
  const comparisonText =
    scope === "lifetime"
      ? lifetimeMonths.length > 0
        ? `Tracking ${lifetimeMonths.length} month${lifetimeMonths.length === 1 ? "" : "s"} from ${formatMonthLabel(lifetimeMonths[0])} to ${formatMonthLabel(lifetimeMonths[lifetimeMonths.length - 1])}.`
        : "No lifetime energy history yet."
      : previousMonthEnergy > 0
        ? `You used ${Math.abs(comparisonPercent)}% ${
            comparisonPercent >= 0 ? "more" : "less"
          } than ${formatMonthLabel(previousMonth)}.`
        : `No saved data for ${formatMonthLabel(previousMonth)} yet.`;
  const comparisonDetail =
    scope === "lifetime"
      ? lifetimeMonths.length > 0
        ? `Average monthly usage is ${formatEnergyKwh(
            usageHistory.reduce((sum, entry) => sum + entry.energy, 0) /
              lifetimeMonths.length
          )} kWh.`
        : "Use your devices to build a usage trend."
      : rankedDevices[0]?.deviceName
        ? `${rankedDevices[0].deviceName} contributed the most in ${selectedPeriodLabel.toLowerCase()}.`
        : "Use your devices to build a usage trend.";
  const usageReportTitle =
    scope === "lifetime"
      ? "EnerTrack Lifetime Usage Report"
      : `${formatMonthLabel(activeMonth)} Usage Report`;
  const usageReportFileStem =
    scope === "lifetime"
      ? "enertrack-lifetime-usage-report"
      : `enertrack-${activeMonth}-monthly-usage-report`;
  const usageReportRows = buildUsageReportRows(
    selectedPeriodUsageByDevice,
    selectedPeriodLabel,
    totalEnergy
  );
  const usageReportSummary: ExportRecordSummaryItem[] = [
    { label: "Period", value: selectedPeriodLabel },
    { label: "Total Consumption", value: `${formatEnergyKwh(totalEnergy)} kWh` },
    { label: "Cost Total", value: `₱${totalCost.toFixed(2)}` },
    {
      label: "Cost Basis",
      value: "Saved historical rates; current rate only for missing data",
    },
    { label: "Devices Included", value: String(usageReportRows.length) },
    {
      label: "Top Device",
      value: rankedDevices[0]
        ? `${rankedDevices[0].deviceName} - ${formatEnergyKwh(
            rankedDevices[0].energy
          )} kWh`
        : "No device data",
    },
  ];
  const usageReportNotes = [comparisonText, comparisonDetail].filter(Boolean);
  const usageReport: UsageReportExport = {
    title: usageReportTitle,
    fileStem: slugify(usageReportFileStem) || "enertrack-usage-report",
    summary: usageReportSummary,
    rows: usageReportRows,
    notes: usageReportNotes,
  };

  const handleExportUsageReport = (format: "CSV" | "PDF") => {
    const exported =
      format === "CSV"
        ? exportUsageReportToCSV(usageReport)
        : exportUsageReportToPDF(usageReport);

    onExportRecord({
      title: usageReport.title,
      source: scope === "lifetime" ? "Lifetime Report" : "Monthly Report",
      format,
      entries: usageReport.rows.length,
      totalUsage: totalEnergy,
      fileName: exported.fileName,
      mimeType: exported.mimeType,
      content: exported.content,
      rows: usageReport.rows,
      summary: usageReport.summary,
      notes: usageReport.notes,
    });
    showExportStatusToast();
  };

  const handleOpenCalendarDialog = () => {
    const month = scope === "lifetime" ? currentMonth : activeMonth;

    setCalendarMonth(month);
    setSelectedCalendarDate(month === currentMonth ? today : `${month}-01`);
    setShowCalendarDialog(true);
  };

  const dateFilteredLogs =
    logMode === "single"
      ? usageLogs.filter((log) => getLogInputDate(log.date) === selectedDate)
      : usageLogs.filter((log) =>
          isLogInsideRange(log, startDate, endDate)
        );
  const filteredLogs = dateFilteredLogs.filter((log) =>
    matchesLogFilter(log, logFilter)
  );
  const logExportMetadata = getLogExportMetadata(logFilter);

  const filteredUsage = filteredLogs.reduce(
    (sum, log) => sum + getUsageLogEnergy(log),
    0
  );
  const visibleLogs = filteredLogs.slice(0, VISIBLE_LOG_LIMIT);
  const hasHiddenLogs = filteredLogs.length > VISIBLE_LOG_LIMIT;

  useEffect(() => {
    if (availableChartModes.some((mode) => mode.id === chartMode)) {
      return;
    }

    setChartMode(availableChartModes[0].id);
    setSelectedBar(null);
  }, [availableChartModes, chartMode]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Energy Trends
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review this month, pick another month, or switch to lifetime analytics
        </p>
      </div>

      <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: "this_month", label: "This Month" },
            { id: "pick_month", label: "Pick Month" },
            { id: "lifetime", label: "Lifetime" },
          ] as const).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setScope(option.id);
                setSelectedBar(null);
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                scope === option.id
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {selectedPeriodLabel}
          </div>

          {scope === "pick_month" && (
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setSelectedBar(null);
                }}
                className="bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
              />
            </label>
          )}

          <Button
            type="button"
            onClick={handleOpenCalendarDialog}
            variant="outline"
            className="rounded-full"
          >
            <Calendar className="h-4 w-4" />
            Energy Calendar
          </Button>
        </div>
      </div>

      <StatsBarChart
        title={chartTitle}
        data={chartData}
        modes={availableChartModes}
        selectedBar={selectedBar}
        chartMode={chartMode}
        onModeChange={(mode) => {
          setChartMode(mode);
          setSelectedBar(null);
        }}
        onBarClick={setSelectedBar}
        onCloseSelectedBar={() => setSelectedBar(null)}
        highestText={highestText}
        periodText={barPeriodText}
        emptyMessage={emptyMessage}
        electricityRate={electricityRate}
      />

      {chartMode === "live" && liveDevices.length > 0 && (
        <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Live Device Labels
          </h2>

          <div className="mt-3 space-y-2">
            {liveDevices.map((device, index) => (
              <div
                key={device.id}
                className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    D{index + 1} - {device.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {device.room}
                  </p>
                </div>

                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  {formatEnergyKwh(device.energy)} kWh
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatsCard
          label={
            scope === "lifetime"
              ? "Lifetime Total Consumption"
              : scope === "this_month"
                ? `${formatMonthLabel(currentMonth)} Total Consumption`
                : `${formatMonthLabel(selectedMonth)} Total Consumption`
          }
          value={`${formatEnergyKwh(totalEnergy)} kWh`}
        />
        <StatsCard
          label={
            scope === "lifetime"
              ? "Lifetime Cost"
              : scope === "this_month"
                ? "This Month Cost"
                : `${formatMonthLabel(selectedMonth)} Cost`
          }
          value={`₱${totalCost.toFixed(2)}`}
        />
        <StatsCard label="Live Total Power" value={`${totalPower.toFixed(1)} W`} />
        <StatsCard label="Active Devices" value={`${activeDevices} unit(s)`} />
      </div>

      <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {scope === "lifetime" ? "Lifetime Usage Report" : "Monthly Usage Report"}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Clean summary for billing checks, device comparison, and saved records.
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {selectedPeriodLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            type="button"
            onClick={() => handleExportUsageReport("CSV")}
            disabled={usageReportRows.length === 0}
            variant="outline"
            className="rounded-2xl"
          >
            <FileText className="h-4 w-4" />
            Report CSV
          </Button>

          <Button
            type="button"
            onClick={() => handleExportUsageReport("PDF")}
            disabled={usageReportRows.length === 0}
            variant="outline"
            className="rounded-2xl"
          >
            <Download className="h-4 w-4" />
            Report PDF
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Insights & Leaderboard
          </h2>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {scope === "lifetime"
                ? "Highest lifetime device"
                : `Highest consumption in ${selectedPeriodLabel.toLowerCase()}`}
            </p>
            <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {rankedDevices[0]
                ? `${rankedDevices[0].deviceName} - ${formatEnergyKwh(
                    rankedDevices[0].energy
                  )} kWh`
                : "No device data yet"}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Usage comparison
            </p>
            <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {comparisonText}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {comparisonDetail}
            </p>
          </div>

          {rankedDevices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leaderboard will appear after devices record energy usage for the selected period.
              </p>
            </div>
          ) : (
            rankedDevices.slice(0, 4).map((device, index) => {
              const percent =
                leaderboardTotal > 0
                  ? Math.round((device.energy / leaderboardTotal) * 100)
                  : 0;

              return (
                <div
                  key={device.deviceId}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {device.deviceName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Top consuming appliance
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {formatEnergyKwh(device.energy)} kWh
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {percent}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Raw Activity Logs
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Detailed events for troubleshooting and audit trails.
            </p>
          </div>

          <div className="flex rounded-full bg-slate-100 p-1 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setLogMode("single")}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                logMode === "single"
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Single Date
            </button>

            <button
              type="button"
              onClick={() => setLogMode("range")}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                logMode === "range"
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Date Range
            </button>
          </div>
        </div>

        <div className="mt-4">
          {logMode === "single" ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Select Date
              </span>
              <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
                />
              </div>
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Start Date
                </span>
                <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  End Date
                </span>
                <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
                  />
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="mt-4 flex rounded-full bg-slate-100 p-1 dark:bg-slate-950">
          {([
            { id: "all", label: "All" },
            { id: "usage", label: "Usage" },
            { id: "actions", label: "Actions" },
          ] as const).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setLogFilter(option.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                logFilter === option.id
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-medium text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          Showing {filteredLogs.length} of {dateFilteredLogs.length} log entries
          - Total usage{" "}
          {formatEnergyKwh(filteredUsage)} kWh
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button
            type="button"
            onClick={() => {
              const exported = exportLogsToCSV(
                filteredLogs,
                electricityRate,
                logExportMetadata
              );
              onExportRecord({
                title: logExportMetadata.title,
                source: "Stats",
                format: "CSV",
                entries: filteredLogs.length,
                totalUsage: filteredUsage,
                fileName: exported.fileName,
                mimeType: exported.mimeType,
                content: exported.content,
                rows: buildExportRows(filteredLogs, electricityRate),
              });
              showExportStatusToast();
            }}
            disabled={filteredLogs.length === 0}
            variant="outline"
            className="rounded-2xl"
          >
            <FileText className="h-4 w-4" />
            Raw CSV
          </Button>

          <Button
            type="button"
            onClick={() => {
              const exported = exportLogsToPDF(
                filteredLogs,
                electricityRate,
                logExportMetadata
              );
              onExportRecord({
                title: logExportMetadata.title,
                source: "Stats",
                format: "PDF",
                entries: filteredLogs.length,
                totalUsage: filteredUsage,
                fileName: exported.fileName,
                mimeType: exported.mimeType,
                content: exported.content,
                rows: buildExportRows(filteredLogs, electricityRate),
              });
              showExportStatusToast();
            }}
            disabled={filteredLogs.length === 0}
            variant="outline"
            className="rounded-2xl"
          >
            <Download className="h-4 w-4" />
            Raw PDF
          </Button>
        </div>

        {usageLogs.length > 0 && (
          <button
            type="button"
            onClick={onClearLogs}
            className="mt-3 text-xs font-medium text-red-500"
          >
            Clear all logs
          </button>
        )}

        <div className="mt-4 space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No logs found for this selection.
              </p>
            </div>
          ) : (
            visibleLogs.map((log) => (
              <UsageLogRow
                key={log.id}
                log={log}
                electricityRate={electricityRate}
              />
            ))
          )}
        </div>

        {hasHiddenLogs && (
          <button
            type="button"
            onClick={() => setShowAllLogs(true)}
            className="mt-4 w-full rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-emerald-600 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-slate-800"
          >
            See more logs
          </button>
        )}
      </div>

      <AllLogsModal
        open={showAllLogs}
        logs={filteredLogs}
        totalUsage={filteredUsage}
        electricityRate={electricityRate}
        onClose={() => setShowAllLogs(false)}
      />

      <EnergyCalendarDialog
        open={showCalendarDialog}
        monthValue={calendarMonth}
        selectedDate={selectedCalendarDate}
        usageHistory={usageHistory}
        usageLogs={usageLogs}
        electricityRate={electricityRate}
        onMonthChange={(month) => {
          setCalendarMonth(month);
          setSelectedCalendarDate(
            month === currentMonth ? today : `${month}-01`
          );
        }}
        onSelectedDateChange={setSelectedCalendarDate}
        onClose={() => setShowCalendarDialog(false)}
      />

      {exportToast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-slate-950"
        >
          {exportToast}
        </div>
      )}
    </div>
  );
}

function EnergyCalendarDialog({
  open,
  monthValue,
  selectedDate,
  usageHistory,
  usageLogs,
  electricityRate,
  onMonthChange,
  onSelectedDateChange,
  onClose,
}: {
  open: boolean;
  monthValue: string;
  selectedDate: string;
  usageHistory: UsageHistoryEntry[];
  usageLogs: UsageLog[];
  electricityRate: number;
  onMonthChange: (month: string) => void;
  onSelectedDateChange: (date: string) => void;
  onClose: () => void;
}) {
  const calendarData = useMemo(
    () =>
      buildCalendarMonthDays(
        usageHistory,
        usageLogs,
        monthValue,
        electricityRate
      ),
    [electricityRate, monthValue, usageHistory, usageLogs]
  );
  const selectedDay =
    calendarData.days.find((day) => day.date === selectedDate) ??
    calendarData.days[0];

  if (!open) return null;

  const getDayClasses = (day: CalendarDayAggregate) => {
    const isSelected = selectedDay?.date === day.date;
    const intensity =
      calendarData.maxDayEnergy > 0 ? day.energy / calendarData.maxDayEnergy : 0;
    const usageClasses =
      day.energy > 0
        ? intensity >= 0.66
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          : intensity >= 0.33
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
        : day.actionCount > 0
          ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100"
          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400";

    return `${usageClasses} ${
      isSelected ? "ring-2 ring-slate-950 dark:ring-white" : ""
    }`;
  };

  const getDayStatus = (day: CalendarDayAggregate) => {
    if (day.offlineSyncCount > 0) return "Offline sync";
    if (day.energy > 0) return "Usage";
    if (day.actionCount > 0) return "Actions";
    return "No usage";
  };

  const selectedLogs = selectedDay?.logs ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/45 px-3 py-8">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-xl dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Energy Calendar
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Daily consumption, cost, and activity for each date.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close energy calendar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onMonthChange(getPreviousMonthInput(monthValue))}
              className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <label className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="month"
                value={monthValue}
                onChange={(event) => onMonthChange(event.target.value)}
                className="min-w-0 bg-transparent text-center text-sm font-bold text-slate-900 outline-none dark:text-white"
              />
            </label>

            <button
              type="button"
              onClick={() => onMonthChange(getNextMonthInput(monthValue))}
              className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatsCard
              label={`${formatMonthLabel(monthValue)} Consumption`}
              value={`${formatEnergyKwh(calendarData.monthEnergy)} kWh`}
            />
            <StatsCard
              label={`${formatMonthLabel(monthValue)} Cost`}
              value={`₱${calendarData.monthCost.toFixed(2)}`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarData.cells.map((day, index) =>
              day ? (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectedDateChange(day.date)}
                  className={`min-h-[84px] rounded-2xl border p-2 text-left transition ${getDayClasses(
                    day
                  )}`}
                >
                  <span className="text-xs font-bold">{day.day}</span>
                  <span className="mt-1 block text-[11px] font-semibold">
                    {day.energy > 0
                      ? `${formatEnergyKwh(day.energy)} kWh`
                      : getDayStatus(day)}
                  </span>
                  <span className="mt-1 block text-[10px] opacity-80">
                    {day.energy > 0 ? `₱${day.cost.toFixed(2)}` : " "}
                  </span>
                </button>
              ) : (
                <div key={`blank-${index}`} className="min-h-[84px]" />
              )
            )}
          </div>

          {selectedDay && (
            <div className="mt-5 rounded-[24px] bg-slate-50 p-4 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Selected day
                  </p>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {formatDisplayDate(selectedDay.date)}
                  </h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {getDayStatus(selectedDay)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-3 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Consumption
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    {formatEnergyKwh(selectedDay.energy)} kWh
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cost
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    ₱{selectedDay.cost.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Devices
                </p>
                {selectedDay.deviceBreakdown.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No device usage recorded for this day.
                  </p>
                ) : (
                  selectedDay.deviceBreakdown.map((device) => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between rounded-2xl bg-white p-3 dark:bg-slate-900"
                    >
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {device.deviceName}
                      </p>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {formatEnergyKwh(device.energy)} kWh
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          ₱{device.cost.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Activity
                </p>
                {selectedLogs.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No action logs for this day.
                  </p>
                ) : (
                  selectedLogs.slice(0, 5).map((log) => (
                    <UsageLogRow
                      key={log.id}
                      log={log}
                      electricityRate={electricityRate}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function UsageLogRow({
  log,
  electricityRate,
}: {
  log: UsageLog;
  electricityRate: number;
}) {
  const hasUsage = isUsageBearingLog(log);
  const usageEnergy = getUsageLogEnergy(log);
  const estimatedCost = getUsageLogCost(log, electricityRate);

  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
          {log.deviceName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatDisplayDate(getLogInputDate(log.date))} - {getActionLabel(log.action)}
        </p>
        {log.details && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">
            {log.details}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-bold ${
            hasUsage
              ? "text-slate-900 dark:text-white"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {hasUsage ? `${formatEnergyKwh(usageEnergy)} kWh` : "Action log"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {hasUsage ? `₱${estimatedCost.toFixed(2)}` : "No usage"}
        </p>
      </div>
    </div>
  );
}

function AllLogsModal({
  open,
  logs,
  totalUsage,
  electricityRate,
  onClose,
}: {
  open: boolean;
  logs: UsageLog[];
  totalUsage: number;
  electricityRate: number;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/45 px-4 py-10">
      <div className="flex max-h-full w-full max-w-md flex-col rounded-[28px] bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              All Usage Logs
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing {logs.length} log entries - Total usage{" "}
              {formatEnergyKwh(totalUsage)} kWh
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close all logs"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No logs found for this selection.
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <UsageLogRow
                key={log.id}
                log={log}
                electricityRate={electricityRate}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
