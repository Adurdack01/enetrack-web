import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock3,
  Download,
  FileText,
  HardDrive,
  KeyRound,
  Share2,
  Trash2,
  Trophy,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Device } from "@/types/device";
import type {
  ExportRecord,
  ExportRecordRow,
  ExportRecordSummaryItem,
} from "@/types/exportRecord";
import type { FamilyMember } from "@/types/family";
import type { UsageHistoryEntry } from "@/types/usageHistory";
import type { UsageLog } from "@/types/usageLog";
import {
  getDeviceScheduleSummary,
  normalizeScheduleTime,
  parseSchedule,
} from "@/utils/schedule";
import { resolveProtectionLimits } from "@/utils/protection";
import {
  getBillingDateKey,
  getBillingHour,
  getBillingMonthKey,
  getBillingWeekdayIndex,
  getBillingWeekOfMonth,
} from "@/utils/billingTime";

type TrendMode = "daily" | "weekly" | "monthly";
type LogMode = "single" | "range";
type LogFilter = "all" | "usage" | "actions";
type DetailSection = "overview" | "history" | "automation" | "maintenance";
type LogExportMetadata = {
  title: string;
  fileStem: string;
};

type UsageReportExport = {
  title: string;
  fileStem: string;
  summary: ExportRecordSummaryItem[];
  rows: ExportRecordRow[];
  notes: string[];
};

type ChartItem = {
  label: string;
  value: number;
  cost?: number;
};

type TrendResult = {
  data: ChartItem[];
  total: number;
  cost: number;
  hasEntry: boolean;
};

type Props = {
  device: Device;
  usageHistory: UsageHistoryEntry[];
  usageLogs: UsageLog[];
  onBack: () => void;
  onToggleDevice: (deviceId: string) => void;
  onFormatSdCard: (deviceId: string) => Promise<boolean> | boolean;
  onUpdateDevice: (deviceId: string, updates: Partial<Device>) => void;
  onRemoveDevice: (
    deviceId: string,
    devicePassword: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onResetDevicePassword: (
    deviceId: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  sharedUsers: FamilyMember[];
  onRemoveSharedUser: (memberId: string, deviceId: string) => void;
  onExportRecord: (record: Omit<ExportRecord, "id" | "createdAt">) => void;
  electricityRate: number;
  isSharedDevice?: boolean;
  accessLabel?: string;
  canControlDevice?: boolean;
  canManageDevice?: boolean;
};

const VISIBLE_LOG_LIMIT = 3;
const EXPORT_STATUS_TOAST_TEXT =
  "Export saved. Go to Export Status in the Settings tab.";

const trendModes: { id: TrendMode; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const detailSections: {
  id: DetailSection;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "overview", label: "Overview", icon: Zap },
  { id: "history", label: "History", icon: BarChart3 },
  { id: "automation", label: "Automation", icon: Clock3 },
  { id: "maintenance", label: "Maintenance", icon: HardDrive },
];

function getInputDate(date = new Date()) {
  return getBillingDateKey(date);
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
  fallbackRate: number,
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
  electricityRate: number,
) {
  if (!isUsageBearingLog(log)) return 0;
  if (typeof log.cost === "number" && Number.isFinite(log.cost)) {
    return Number(log.cost.toFixed(2));
  }

  return computeEstimatedCost(log.energy, log.electricityRate ?? electricityRate);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getLogExportMetadata(
  filter: LogFilter,
  deviceName: string,
): LogExportMetadata {
  const deviceSlug = slugify(deviceName) || "device";

  if (filter === "actions") {
    return {
      title: `${deviceName} Action Logs`,
      fileStem: `enertrack-${deviceSlug}-action-logs`,
    };
  }

  if (filter === "usage") {
    return {
      title: `${deviceName} Usage Logs`,
      fileStem: `enertrack-${deviceSlug}-usage-logs`,
    };
  }

  return {
    title: `${deviceName} Activity Logs`,
    fileStem: `enertrack-${deviceSlug}-activity-logs`,
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

function formatDisplayDateTime(value?: string | null) {
  if (!value) return "No sync yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(value?: number | null) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = bytes;
  let unitIndex = 0;

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }

  return `${scaled >= 10 || unitIndex === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[unitIndex]}`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function getFileName(value?: string | null) {
  if (!value) return "No archive yet";

  const parts = value.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? value;
}

function getWeekRange(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: getInputDate(start),
    end: getInputDate(end),
  };
}

function isLogInsideRange(
  entry: { date: string },
  startDate: string,
  endDate: string,
) {
  const logDate = getLogInputDate(entry.date);
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;

  return logDate >= start && logDate <= end;
}

function buildTrendData(
  mode: TrendMode,
  selectedDate: string,
  entries: UsageHistoryEntry[],
  electricityRate: number,
): TrendResult {
  if (mode === "daily") {
    const labels = ["12AM", "4AM", "8AM", "12PM", "4PM", "8PM"];
    const data = labels.map((label) => ({ label, value: 0 }));
    const costs = labels.map(() => 0);
    const dayLogs = entries.filter(
      (entry) => getLogInputDate(entry.date) === selectedDate,
    );

    dayLogs.forEach((entry) => {
      const hour = getBillingHour(entry.date) ?? 0;
      const index = Math.min(labels.length - 1, Math.floor(hour / 4));
      data[index].value += entry.energy;
      costs[index] += getUsageHistoryCost(entry, electricityRate);
    });

    const total = dayLogs.reduce((sum, entry) => sum + entry.energy, 0);
    const cost = dayLogs.reduce(
      (sum, entry) => sum + getUsageHistoryCost(entry, electricityRate),
      0,
    );
    const hasEntry = data.some((item) => item.value > 0);

    return {
      data: data.map((item, index) => ({
        ...item,
        value: roundEnergy(item.value),
        cost: Number(costs[index].toFixed(2)),
      })),
      total: roundEnergy(total),
      cost: Number(cost.toFixed(2)),
      hasEntry,
    };
  }

  if (mode === "weekly") {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const data = labels.map((label) => ({ label, value: 0 }));
    const costs = labels.map(() => 0);
    const range = getWeekRange(selectedDate);
    const weekLogs = entries.filter((entry) =>
      isLogInsideRange(entry, range.start, range.end),
    );

    weekLogs.forEach((entry) => {
      const day = getBillingWeekdayIndex(entry.date) ?? 0;
      const index = day === 0 ? 6 : day - 1;
      data[index].value += entry.energy;
      costs[index] += getUsageHistoryCost(entry, electricityRate);
    });

    const total = weekLogs.reduce((sum, entry) => sum + entry.energy, 0);
    const cost = weekLogs.reduce(
      (sum, entry) => sum + getUsageHistoryCost(entry, electricityRate),
      0,
    );
    const hasEntry = data.some((item) => item.value > 0);

    return {
      data: data.map((item, index) => ({
        ...item,
        value: roundEnergy(item.value),
        cost: Number(costs[index].toFixed(2)),
      })),
      total: roundEnergy(total),
      cost: Number(cost.toFixed(2)),
      hasEntry,
    };
  }

  const labels = ["W1", "W2", "W3", "W4"];
  const data = labels.map((label) => ({ label, value: 0 }));
  const costs = labels.map(() => 0);
  const selectedMonth = selectedDate.slice(0, 7);
  const monthLogs = entries.filter((entry) => {
    return (getBillingMonthKey(entry.date) || entry.date.slice(0, 7)) === selectedMonth;
  });

  monthLogs.forEach((entry) => {
    const index = (getBillingWeekOfMonth(entry.date) ?? 1) - 1;
    data[index].value += entry.energy;
    costs[index] += getUsageHistoryCost(entry, electricityRate);
  });

  const total = monthLogs.reduce((sum, entry) => sum + entry.energy, 0);
  const cost = monthLogs.reduce(
    (sum, entry) => sum + getUsageHistoryCost(entry, electricityRate),
    0,
  );
  const hasEntry = data.some((item) => item.value > 0);

  return {
    data: data.map((item, index) => ({
      ...item,
      value: roundEnergy(item.value),
      cost: Number(costs[index].toFixed(2)),
    })),
    total: roundEnergy(total),
    cost: Number(cost.toFixed(2)),
    hasEntry,
  };
}

function getTrendPeriodLabel(mode: TrendMode, selectedDate: string) {
  if (mode === "daily") {
    return formatDisplayDate(selectedDate);
  }

  if (mode === "weekly") {
    const range = getWeekRange(selectedDate);
    return `${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)}`;
  }

  return new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getTrendDateRange(mode: TrendMode, selectedDate: string) {
  if (mode === "daily") {
    return { start: selectedDate, end: selectedDate };
  }

  if (mode === "weekly") {
    return getWeekRange(selectedDate);
  }

  const selected = new Date(`${selectedDate}T00:00:00`);
  const start = getInputDate(
    new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const end = getInputDate(
    new Date(selected.getFullYear(), selected.getMonth() + 1, 0),
  );

  return { start, end };
}

function buildDeviceUsageReportRows(
  deviceName: string,
  periodLabel: string,
  chartData: ChartItem[],
  electricityRate: number,
): ExportRecordRow[] {
  return chartData
    .filter((item) => item.value > 0)
    .map((item) => ({
      deviceName,
      date: `${periodLabel} - ${item.label}`,
      action: "Usage Segment",
      details: item.label,
      energy: roundEnergy(item.value),
      cost: item.cost ?? computeEstimatedCost(item.value, electricityRate),
    }));
}

function buildDeviceReportTextContent(report: UsageReportExport) {
  const summaryRows = report.summary.map(
    (item) => `${item.label}: ${item.value}`,
  );
  const rows = report.rows.map(
    (row) =>
      `${row.deviceName} | ${row.date} | ${row.details ?? ""} | ${formatEnergyKwh(
        row.energy,
      )} kWh | PHP ${row.cost.toFixed(2)}`,
  );

  return [
    report.title,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    ...summaryRows,
    "",
    "Usage Breakdown",
    ...rows,
    "",
    ...report.notes,
  ].join("\n");
}

function exportDeviceUsageReportToCSV(report: UsageReportExport) {
  const summaryRows = report.summary.map((item) => [
    "Summary",
    item.label,
    item.value,
    "",
    "",
  ]);
  const headers = ["Section", "Device", "Period", "Energy (kWh)", "Cost (PHP)"];
  const usageRows = report.rows.map((row) => [
    row.details ?? "Usage Segment",
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
    ...usageRows,
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

function exportDeviceUsageReportToPDF(report: UsageReportExport) {
  const doc = new jsPDF();
  let y = 20;
  const fileName = `${report.fileStem}.pdf`;
  const content = buildDeviceReportTextContent(report);

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
  doc.text("Usage Breakdown", 14, y);
  y += 8;

  report.rows.forEach((row) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.text(row.date, 14, y);
    doc.text(`${formatEnergyKwh(row.energy)} kWh`, 138, y);
    y += 6;
    doc.setFontSize(9);
    doc.text(row.details ?? "Usage Segment", 14, y);
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

function exportLogsToCSV(
  logs: UsageLog[],
  electricityRate: number,
  metadata: LogExportMetadata,
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
  electricityRate: number,
): ExportRecordRow[] {
  return logs.map((log) => ({
    deviceName: log.deviceName,
    date: formatDisplayDate(getLogInputDate(log.date)),
    energy: roundEnergy(getUsageLogEnergy(log)),
    cost: getUsageLogCost(log, electricityRate),
    action: getActionLabel(log.action),
    details: log.details,
  }));
}

function exportLogsToPDF(
  logs: UsageLog[],
  electricityRate: number,
  metadata: LogExportMetadata,
) {
  const doc = new jsPDF();
  let y = 20;
  const fileName = `${metadata.fileStem}.pdf`;
  const content = buildLogsTextContent(logs, metadata.title, electricityRate);

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
      `${formatDisplayDate(getLogInputDate(log.date))} - ${getActionLabel(log.action)}`,
      14,
      y,
    );
    doc.text(`PHP ${getUsageLogCost(log, electricityRate).toFixed(2)}`, 138, y);

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
  electricityRate: number,
) {
  const rows = logs.map(
    (log) =>
      `${formatDisplayDate(getLogInputDate(log.date))} | ${log.deviceName} | ${getActionLabel(
        log.action,
      )} | ${log.details ?? ""} | ${formatEnergyKwh(
        getUsageLogEnergy(log),
      )} kWh | PHP ${getUsageLogCost(log, electricityRate).toFixed(2)}`,
  );

  return [
    title,
    `Generated: ${new Date().toLocaleString()}`,
    `Entries: ${logs.length}`,
    "",
    ...rows,
  ].join("\n");
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

function getScheduleModeLabel(mode: Device["scheduleMode"]) {
  if (mode === "budget") return "Budget";
  if (mode === "both") return "Both";
  return "Time";
}

export default function DeviceDetailsScreen({
  device,
  usageHistory,
  usageLogs,
  onBack,
  onToggleDevice,
  onFormatSdCard,
  onUpdateDevice,
  onRemoveDevice,
  onResetDevicePassword,
  sharedUsers,
  onRemoveSharedUser,
  onExportRecord,
  electricityRate,
  isSharedDevice = false,
  accessLabel = "Owner access",
  canControlDevice = true,
  canManageDevice = true,
}: Props) {
  const today = getInputDate();
  const weekAgo = getInputDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const initialSchedule = parseSchedule(device.schedule);

  const [trendMode, setTrendMode] = useState<TrendMode>("daily");
  const [trendDate, setTrendDate] = useState(today);
  const [selectedBar, setSelectedBar] = useState<ChartItem | null>(null);
  const [logMode, setLogMode] = useState<LogMode>("single");
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [selectedLogDate, setSelectedLogDate] = useState(today);
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [activeSection, setActiveSection] = useState<DetailSection>("overview");
  const [scheduleMode, setScheduleMode] = useState<Device["scheduleMode"]>(
    device.scheduleMode,
  );
  const [scheduleEnabled, setScheduleEnabled] = useState(
    device.scheduleEnabled ?? false,
  );
  const [turnOnTime, setTurnOnTime] = useState(initialSchedule.start);
  const [turnOffTime, setTurnOffTime] = useState(initialSchedule.end);
  const [budgetLimit, setBudgetLimit] = useState(
    device.budgetLimit > 0 ? String(device.budgetLimit) : "200",
  );
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [pendingSharedRemoval, setPendingSharedRemoval] =
    useState<FamilyMember | null>(null);
  const [showFormatSdCard, setShowFormatSdCard] = useState(false);
  const [formatSdCardBusy, setFormatSdCardBusy] = useState(false);
  const [formatSdCardTracking, setFormatSdCardTracking] = useState(false);
  const [showRemoveDevice, setShowRemoveDevice] = useState(false);
  const [devicePassword, setDevicePassword] = useState("");
  const [removeDeviceError, setRemoveDeviceError] = useState("");
  const [removeDeviceBusy, setRemoveDeviceBusy] = useState(false);
  const [showResetDevicePassword, setShowResetDevicePassword] =
    useState(false);
  const [newDevicePassword, setNewDevicePassword] = useState("");
  const [confirmDevicePassword, setConfirmDevicePassword] = useState("");
  const [resetDevicePasswordError, setResetDevicePasswordError] =
    useState("");
  const [resetDevicePasswordSuccess, setResetDevicePasswordSuccess] =
    useState("");
  const [resetDevicePasswordBusy, setResetDevicePasswordBusy] =
    useState(false);
  const [exportToast, setExportToast] = useState("");
  const exportToastTimeoutRef = useRef<number | null>(null);
  const relayState = device.relayState ?? device.status;

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

  const deviceLogs = useMemo(
    () =>
      usageLogs
        .filter((log) => log.deviceId === device.id)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    [device.id, usageLogs],
  );
  const deviceHistory = useMemo(
    () =>
      usageHistory
        .filter((entry) => entry.deviceId === device.id)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    [device.id, usageHistory],
  );

  const trend = useMemo(
    () => buildTrendData(trendMode, trendDate, deviceHistory, electricityRate),
    [deviceHistory, electricityRate, trendDate, trendMode],
  );

  const dateFilteredLogs = useMemo(
    () =>
      logMode === "single"
        ? deviceLogs.filter(
            (log) => getLogInputDate(log.date) === selectedLogDate,
          )
        : deviceLogs.filter((log) => isLogInsideRange(log, startDate, endDate)),
    [deviceLogs, endDate, logMode, selectedLogDate, startDate],
  );
  const filteredLogs = useMemo(
    () => dateFilteredLogs.filter((log) => matchesLogFilter(log, logFilter)),
    [dateFilteredLogs, logFilter],
  );

  const visibleLogs = filteredLogs.slice(0, VISIBLE_LOG_LIMIT);
  const filteredUsage = filteredLogs.reduce(
    (sum, log) => sum + getUsageLogEnergy(log),
    0,
  );
  const hasHiddenLogs = filteredLogs.length > VISIBLE_LOG_LIMIT;
  const estimatedTrendCost = trend.cost;
  const todayHistoryEnergy = deviceHistory
    .filter((entry) => getLogInputDate(entry.date) === today)
    .reduce((sum, entry) => sum + entry.energy, 0);
  const todayHistoryCost = deviceHistory
    .filter((entry) => getLogInputDate(entry.date) === today)
    .reduce(
      (sum, entry) => sum + getUsageHistoryCost(entry, electricityRate),
      0,
    );
  const currentMonth = today.slice(0, 7);
  const thisMonthHistoryEnergy = deviceHistory
    .filter((entry) => getLogInputDate(entry.date).slice(0, 7) === currentMonth)
    .reduce((sum, entry) => sum + entry.energy, 0);
  const thisMonthHistoryCost = deviceHistory
    .filter((entry) => getLogInputDate(entry.date).slice(0, 7) === currentMonth)
    .reduce(
      (sum, entry) => sum + getUsageHistoryCost(entry, electricityRate),
      0,
    );

  const todayCostText = `Today: ${formatEnergyKwh(todayHistoryEnergy)} kWh | ₱${todayHistoryCost.toFixed(2)}`;
  const topLog = [...deviceHistory].sort((a, b) => b.energy - a.energy)[0];
  const highestRecord = topLog
    ? `${formatDisplayDate(getLogInputDate(topLog.date))} - ${formatEnergyKwh(topLog.energy)} kWh`
    : "No usage record yet";
  const lifetimeConsumption = device.energy ?? 0;
  const displayedLifetimeConsumption = formatEnergyKwh(lifetimeConsumption);
  const savedLifetimeCost = deviceHistory.reduce(
    (sum, entry) => sum + getUsageHistoryCost(entry, electricityRate),
    0,
  );
  const lifetimeTotalCost =
    savedLifetimeCost > 0
      ? Number(savedLifetimeCost.toFixed(2))
      : computeEstimatedCost(lifetimeConsumption, electricityRate);
  const selectedPeriodEnergyLabel =
    trendMode === "monthly"
      ? "Selected Month kWh"
      : trendMode === "weekly"
        ? "Selected Week kWh"
        : "Selected Day kWh";
  const selectedPeriodCostLabel =
    trendMode === "monthly"
      ? "Selected Month Cost"
      : trendMode === "weekly"
        ? "Selected Week Cost"
        : "Selected Day Cost";
  const lastUpdatedText =
    device.lastSyncedAt || device.lastReadingAt
      ? formatDisplayDate(
          getLogInputDate(device.lastSyncedAt ?? device.lastReadingAt ?? ""),
        )
      : "No sync yet";
  const lastReadingText = formatDisplayDateTime(device.lastReadingAt);
  const lastCloudSyncText = formatDisplayDateTime(device.lastSyncedAt);
  const logExportMetadata = getLogExportMetadata(logFilter, device.name);
  const trendPeriodLabel = getTrendPeriodLabel(trendMode, trendDate);
  const trendRange = getTrendDateRange(trendMode, trendDate);
  const trendPeriodLogs = deviceLogs.filter((log) =>
    isLogInsideRange(log, trendRange.start, trendRange.end),
  );
  const relayActionCount = trendPeriodLogs.filter(
    (log) =>
      log.action === "turned_on" ||
      log.action === "turned_off" ||
      log.action === "relay_command_queued",
  ).length;
  const offlineSyncCount = trendPeriodLogs.filter(
    (log) => log.action === "offline_synced",
  ).length;
  const deviceReportRows = buildDeviceUsageReportRows(
    device.name,
    trendPeriodLabel,
    trend.data,
    electricityRate,
  );
  const topTrendSegment = [...trend.data]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  const deviceReportSummary: ExportRecordSummaryItem[] = [
    { label: "Device", value: device.name },
    { label: "Location", value: device.room || "No location set" },
    { label: "Period", value: trendPeriodLabel },
    { label: "View", value: trendMode },
    { label: "Total Consumption", value: `${formatEnergyKwh(trend.total)} kWh` },
    { label: "Cost Total", value: `₱${estimatedTrendCost.toFixed(2)}` },
    {
      label: "Cost Basis",
      value: "Saved historical rates; current rate only for missing data",
    },
    { label: "Relay Events", value: String(relayActionCount) },
  ];
  const deviceReport: UsageReportExport = {
    title: `${device.name} Usage Report`,
    fileStem: `enertrack-${slugify(device.name) || "device"}-${trendMode}-usage-report`,
    summary: deviceReportSummary,
    rows: deviceReportRows,
    notes: [
      topTrendSegment
        ? `Highest segment: ${topTrendSegment.label} at ${formatEnergyKwh(
            topTrendSegment.value,
          )} kWh.`
        : "No usage segment recorded for this period.",
      offlineSyncCount > 0
        ? `${offlineSyncCount} offline synced log${offlineSyncCount === 1 ? "" : "s"} included in this period.`
        : "No offline synced logs in this period.",
    ],
  };
  const handleExportDeviceReport = (format: "CSV" | "PDF") => {
    const exported =
      format === "CSV"
        ? exportDeviceUsageReportToCSV(deviceReport)
        : exportDeviceUsageReportToPDF(deviceReport);

    onExportRecord({
      title: deviceReport.title,
      source: "Device Report",
      format,
      entries: deviceReport.rows.length,
      totalUsage: trend.total,
      fileName: exported.fileName,
      mimeType: exported.mimeType,
      content: exported.content,
      rows: deviceReport.rows,
      summary: deviceReport.summary,
      notes: deviceReport.notes,
    });
    showExportStatusToast();
  };
  const currentBudgetLimit = Number(budgetLimit) || 0;
  const withinBudget =
    currentBudgetLimit === 0 || device.budgetUsed <= currentBudgetLimit;
  const telemetryStale = Boolean(device.telemetryStale);
  const hasEsp32Reading = device.readingSource === "esp32" && !telemetryStale;
  const deviceOffline =
    device.cloudRegistrationStatus !== "failed" &&
    device.cloudRegistrationStatus !== "pending" &&
    Boolean(device.esp32Id) &&
    (device.online === false || telemetryStale);
  const syncStatus =
    device.cloudRegistrationStatus === "failed"
      ? "Firebase Registration Failed"
      : device.cloudRegistrationStatus === "pending"
        ? "Firebase Registration Pending"
        : deviceOffline
          ? "Smart Plug Offline"
          : hasEsp32Reading
            ? "Smart Plug Synced"
            : "Waiting for Smart Plug";
  const wifiSignal = deviceOffline
    ? "Offline"
    : device.wifiSignal != null
      ? `${device.wifiSignal} dBm`
      : "No signal";
  const connectionBadgeTone =
    device.cloudRegistrationStatus === "failed" || deviceOffline
      ? "error"
      : device.cloudRegistrationStatus === "pending" || !hasEsp32Reading
        ? "warning"
        : "success";
  const connectionBadgeClass =
    connectionBadgeTone === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : connectionBadgeTone === "warning"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300";
  const controlStatusLabel =
    deviceOffline || wifiSignal === "Offline" || syncStatus === wifiSignal
      ? syncStatus
      : `${syncStatus} • ${wifiSignal}`;
  const powerFactorText =
    device.powerFactor != null
      ? device.powerFactor.toFixed(2)
      : deviceOffline
        ? "Offline"
        : hasEsp32Reading
          ? "Unavailable"
          : "Waiting for Smart Plug";
  const { maxPowerLimit, maxCurrentLimit } = resolveProtectionLimits(device);
  const protectionText = device.protectionEnabled
    ? `${maxPowerLimit.toFixed(0)} W / ${maxCurrentLimit.toFixed(1)} A`
    : "Off";
  const scheduleSummary = getDeviceScheduleSummary(device);
  const pendingOfflineLogs = device.pendingOfflineLogs ?? 0;
  const sdFormatStatus = device.sdFormatStatus ?? "idle";
  const sdFormatProgress = Math.min(
    100,
    Math.max(
      0,
      device.sdFormatProgress ??
        (formatSdCardBusy || formatSdCardTracking ? 0 : 0),
    ),
  );
  const sdFormatMessage =
    device.sdFormatMessage ??
    (sdFormatStatus === "completed"
      ? "SD card cleanup completed."
      : sdFormatStatus === "failed"
        ? "SD card cleanup failed."
        : sdFormatStatus === "formatting"
          ? "Clearing EnerTrack SD data..."
          : "Command queued. Waiting for the Smart Plug to start SD cleanup.");
  const sdFormatTrackingActive = formatSdCardBusy || formatSdCardTracking;
  const sdFormatCanClose =
    sdFormatStatus === "completed" || sdFormatStatus === "failed";
  const offlineLogsSynced = Math.max(
    0,
    Math.round(device.offlineLogsSynced ?? 0),
  );
  const lastOfflineSyncCount = Math.max(
    0,
    Math.round(device.lastOfflineSyncCount ?? 0),
  );
  const sdCardTotalBytes = device.sdCardTotalBytes ?? 0;
  const sdCardUsedBytes = device.sdCardUsedBytes ?? 0;
  const sdCardFreeBytes =
    device.sdCardFreeBytes ?? Math.max(0, sdCardTotalBytes - sdCardUsedBytes);
  const sdCardUsagePercent = clampPercent(
    device.sdCardUsagePercent ??
      (sdCardTotalBytes > 0 ? (sdCardUsedBytes / sdCardTotalBytes) * 100 : 0),
  );
  const sdCardFreePercent = clampPercent(100 - sdCardUsagePercent);
  const hasSdCapacityInfo = sdCardTotalBytes > 0;
  const hasSdSyncInfo =
    pendingOfflineLogs > 0 ||
    offlineLogsSynced > 0 ||
    lastOfflineSyncCount > 0 ||
    Boolean(device.lastOfflineSyncArchive);
  const hasEsp32Device =
    Boolean(device.esp32Id) || device.readingSource === "esp32";
  const shouldShowSdCardSection =
    hasEsp32Device ||
    hasSdSyncInfo ||
    hasSdCapacityInfo ||
    device.sdCardAvailable === false ||
    sdFormatTrackingActive ||
    sdFormatStatus !== "idle";
  const lastOfflineSyncText =
    lastOfflineSyncCount > 0
      ? `${lastOfflineSyncCount} log${lastOfflineSyncCount === 1 ? "" : "s"} • ${formatDisplayDateTime(device.lastOfflineSyncAt)}`
      : "No completed SD sync yet";
  const lastOfflineArchiveName = getFileName(device.lastOfflineSyncArchive);

  const handleSaveSchedule = () => {
    const nextBudgetLimit = Number(budgetLimit) || 0;
    const nextScheduleBudgetKwhLimit =
      electricityRate > 0 && nextBudgetLimit > 0
        ? Number((nextBudgetLimit / electricityRate).toFixed(4))
        : 0;
    const nextSchedule = !scheduleEnabled
      ? "Not Set"
      : scheduleMode === "budget"
        ? `Budget ₱${nextBudgetLimit}`
        : scheduleMode === "both"
          ? `${turnOnTime} - ${turnOffTime} • Budget ₱${nextBudgetLimit}`
          : `${turnOnTime} - ${turnOffTime}`;

    onUpdateDevice(device.id, {
      scheduleMode,
      schedule: nextSchedule,
      budgetLimit: nextBudgetLimit,
      scheduleEnabled,
      scheduleStartTime: turnOnTime,
      scheduleEndTime: turnOffTime,
      scheduleBudgetLimit: nextBudgetLimit,
      scheduleBudgetKwhLimit: nextScheduleBudgetKwhLimit,
      scheduleElectricityRate: electricityRate,
      scheduleManualOverride: false,
      scheduleManualOverrideUntil: null,
      scheduleBudgetReached: false,
    });
    setScheduleSaved(true);
    window.setTimeout(() => setScheduleSaved(false), 2200);
  };

  const handleConfirmRemoveSharedUser = () => {
    if (!pendingSharedRemoval) return;

    onRemoveSharedUser(pendingSharedRemoval.id, device.id);
    setPendingSharedRemoval(null);
  };

  const openResetDevicePassword = () => {
    if (resetDevicePasswordBusy) return;

    setShowRemoveDevice(false);
    setShowResetDevicePassword(true);
    setNewDevicePassword("");
    setConfirmDevicePassword("");
    setResetDevicePasswordError("");
    setResetDevicePasswordSuccess("");
  };

  const handleConfirmResetDevicePassword = async () => {
    if (resetDevicePasswordBusy) return;

    const cleanPassword = newDevicePassword.trim();

    if (cleanPassword.length < 6) {
      setResetDevicePasswordError(
        "New device password must be at least 6 characters.",
      );
      return;
    }

    if (cleanPassword !== confirmDevicePassword.trim()) {
      setResetDevicePasswordError("Device passwords do not match.");
      return;
    }

    setResetDevicePasswordBusy(true);
    setResetDevicePasswordError("");
    setResetDevicePasswordSuccess("");

    try {
      const result = await onResetDevicePassword(device.id, cleanPassword);

      if (!result.ok) {
        setResetDevicePasswordError(
          result.message ?? "Device password reset failed.",
        );
        return;
      }

      setDevicePassword("");
      setResetDevicePasswordSuccess(
        result.message ?? "Device password reset successfully.",
      );
      window.setTimeout(() => {
        setShowResetDevicePassword(false);
        setNewDevicePassword("");
        setConfirmDevicePassword("");
        setResetDevicePasswordSuccess("");
      }, 1200);
    } finally {
      setResetDevicePasswordBusy(false);
    }
  };

  const handleConfirmRemoveDevice = async () => {
    if (removeDeviceBusy) return;

    if (!devicePassword.trim()) {
      setRemoveDeviceError("Please enter the device password.");
      return;
    }

    setRemoveDeviceBusy(true);

    try {
      const result = await onRemoveDevice(device.id, devicePassword.trim());

      if (!result.ok) {
        setRemoveDeviceError(result.message ?? "Device removal failed.");
        return;
      }

      setShowRemoveDevice(false);
      setDevicePassword("");
      setRemoveDeviceError("");
    } finally {
      setRemoveDeviceBusy(false);
    }
  };

  const handleConfirmFormatSdCard = async () => {
    if (formatSdCardBusy) return;

    setFormatSdCardBusy(true);

    try {
      const queued = await onFormatSdCard(device.id);

      if (queued) {
        setFormatSdCardTracking(true);
      }
    } finally {
      setFormatSdCardBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-white">
              {device.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {device.room}
            </p>
            <p className="mt-1 text-xs font-semibold text-sky-600 dark:text-sky-300">
              {accessLabel}
              {isSharedDevice && device.sharedByName
                ? ` from ${device.sharedByName}`
                : ""}
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {syncStatus} • Last update: {lastUpdatedText}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="rounded-full px-5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <DetailSectionTabs
          activeSection={activeSection}
          onChange={setActiveSection}
        />

        {activeSection === "overview" && (
          <>
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Appliance Control
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                    {relayState ? "Running" : "Turned Off"}
                  </h2>
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {controlStatusLabel}
                  </p>
                </div>

                <Switch
                  checked={relayState}
                  disabled={!canControlDevice}
                  onCheckedChange={() => onToggleDevice(device.id)}
                  aria-label={`Turn ${device.name} ${relayState ? "off" : "on"}`}
                  className="data-checked:bg-slate-950 data-unchecked:bg-slate-200 dark:data-checked:bg-white dark:data-unchecked:bg-slate-700"
                />
              </div>
              {!canControlDevice && (
                <div className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                  This shared device is view-only. Ask the owner to enable
                  control access if you need to switch the relay.
                </div>
              )}
            </section>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Voltage"
                value={device.voltage.toFixed(1)}
                unit="V"
                icon={Zap}
              />
              <MetricCard
                label="Current"
                value={device.current.toFixed(2)}
                unit="A"
                icon={Activity}
              />
              <MetricCard
                label="Power"
                value={device.power.toFixed(1)}
                unit="W"
                icon={Activity}
              />
              <MetricCard
                label="This Month Consumption"
                value={formatEnergyKwh(thisMonthHistoryEnergy)}
                unit="kWh"
                icon={BarChart3}
              />
            </div>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Quick Summary
                </h2>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <InfoPanel title="Today" value={todayCostText} />
                <InfoPanel
                  title="This Month Cost"
                  value={`₱${thisMonthHistoryCost.toFixed(2)}`}
                />
                <InfoPanel
                  title="Lifetime Consumption"
                  value={`${displayedLifetimeConsumption} kWh`}
                />
                <InfoPanel
                  title="Lifetime Total Cost"
                  value={`₱${lifetimeTotalCost.toFixed(2)}`}
                />
                <InfoPanel title="Automation" value={scheduleSummary} />
                <InfoPanel title="Highest record" value={highestRecord} />
              </div>
            </section>
          </>
        )}

        {activeSection === "history" && (
          <>
            <EnergyTrendsCard
              mode={trendMode}
              selectedDate={trendDate}
              data={trend.data}
              hasEntry={trend.hasEntry}
              selectedBar={selectedBar}
              onModeChange={(mode) => {
                setTrendMode(mode);
                setSelectedBar(null);
              }}
              onDateChange={(value) => {
                setTrendDate(value);
                setSelectedBar(null);
              }}
              onBarClick={setSelectedBar}
              onCloseSelectedBar={() => setSelectedBar(null)}
              electricityRate={electricityRate}
            />

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label={selectedPeriodEnergyLabel}
                value={formatEnergyKwh(trend.total)}
                unit="kWh"
                icon={BarChart3}
              />
              <MetricCard
                label={selectedPeriodCostLabel}
                value={estimatedTrendCost.toFixed(2)}
                unit="PHP"
                icon={FileText}
              />
            </div>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Device Usage Report
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Export the current {trendMode} trend for this smart plug.
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {trendPeriodLabel}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => handleExportDeviceReport("CSV")}
                  disabled={deviceReportRows.length === 0}
                  variant="outline"
                  className="rounded-2xl"
                >
                  <FileText className="h-4 w-4" />
                  Report CSV
                </Button>

                <Button
                  type="button"
                  onClick={() => handleExportDeviceReport("PDF")}
                  disabled={deviceReportRows.length === 0}
                  variant="outline"
                  className="rounded-2xl"
                >
                  <Download className="h-4 w-4" />
                  Report PDF
                </Button>
              </div>
            </section>

            <UsageLogsCard
              logMode={logMode}
              logFilter={logFilter}
              selectedDate={selectedLogDate}
              startDate={startDate}
              endDate={endDate}
              totalLogCount={dateFilteredLogs.length}
              logs={filteredLogs}
              visibleLogs={visibleLogs}
              totalUsage={filteredUsage}
              hasHiddenLogs={hasHiddenLogs}
              electricityRate={electricityRate}
              exportMetadata={logExportMetadata}
              onExportRecord={onExportRecord}
              onExportCompleted={showExportStatusToast}
              onLogModeChange={setLogMode}
              onLogFilterChange={setLogFilter}
              onSelectedDateChange={setSelectedLogDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onSeeMore={() => setShowAllLogs(true)}
            />
          </>
        )}

        {activeSection === "maintenance" && (
          <>
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-sky-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Connection & Sync
                  </h2>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${connectionBadgeClass}`}
                >
                  {deviceOffline ? "Offline" : hasEsp32Reading ? "Online" : "Waiting"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DetailRow label="Smart Plug" value={syncStatus} />
                <DetailRow label="Wi-Fi Signal" value={wifiSignal} />
                <DetailRow label="Last Reading" value={lastReadingText} />
                <DetailRow label="Cloud Sync" value={lastCloudSyncText} />
              </div>

              {device.cloudRegistrationError && (
                <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {device.cloudRegistrationError}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Power & Protection
              </h2>

              <div className="mt-4 space-y-3">
                <DetailRow label="Power Factor" value={powerFactorText} />
                <DetailRow
                  label="Electricity Rate"
                  value={
                    electricityRate > 0
                      ? `₱${electricityRate.toFixed(2)}/kWh`
                      : "Not set"
                  }
                />
                <DetailRow label="Protection Limit" value={protectionText} />
              </div>
            </section>

            {shouldShowSdCardSection && (
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-orange-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    SD Card
                  </h2>
                </div>

                {hasSdCapacityInfo ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Capacity left
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {formatBytes(sdCardFreeBytes)} free of{" "}
                          {formatBytes(sdCardTotalBytes)}
                        </p>
                      </div>

                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {sdCardFreePercent.toFixed(0)}%
                      </span>
                    </div>

                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          sdCardUsagePercent >= 90
                            ? "bg-red-500"
                            : sdCardUsagePercent >= 75
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${sdCardUsagePercent}%` }}
                      />
                    </div>

                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {sdCardUsagePercent.toFixed(0)}% used
                    </p>
                  </div>
                ) : device.sdCardAvailable === false ? (
                  <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-relaxed text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    SD card is not available from the Smart Plug right now.
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Capacity left
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Waiting for Smart Plug SD card status
                        </p>
                      </div>

                      <span className="text-lg font-bold text-slate-400 dark:text-slate-500">
                        --
                      </span>
                    </div>

                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-full w-0 rounded-full bg-slate-400" />
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Pending offline logs
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pendingOfflineLogs} log
                      {pendingOfflineLogs === 1 ? "" : "s"} waiting on the SD
                      card
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Synced offline logs
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {offlineLogsSynced} uploaded total
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Latest archive
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {lastOfflineSyncText}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-400 dark:text-slate-500">
                    {lastOfflineArchiveName}
                  </p>
                </div>

                {canManageDevice && (
                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => {
                      setFormatSdCardTracking(false);
                      setShowFormatSdCard(true);
                    }}
                    className="rounded-full bg-red-50 px-5 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                  >
                    <HardDrive className="h-4 w-4" />
                    Clear SD Data
                  </Button>
                </div>
                )}
              </section>
            )}
          </>
        )}

        {activeSection === "automation" && (
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-emerald-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Scheduling
              </h2>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Automation
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {scheduleEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>

              <Switch
                checked={scheduleEnabled}
                disabled={!canManageDevice}
                onCheckedChange={setScheduleEnabled}
                aria-label={`${scheduleEnabled ? "Disable" : "Enable"} scheduling`}
                className="data-checked:bg-slate-950 data-unchecked:bg-slate-200 dark:data-checked:bg-white dark:data-unchecked:bg-slate-700"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(["time", "budget", "both"] as Device["scheduleMode"][]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={!canManageDevice}
                    onClick={() => setScheduleMode(mode)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      scheduleMode === mode
                        ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {getScheduleModeLabel(mode)}
                  </button>
                ),
              )}
            </div>

            <div className="mt-5 space-y-4">
              {(scheduleMode === "time" || scheduleMode === "both") && (
                <div className="grid grid-cols-2 gap-3">
                  <ScheduleField label="Turn ON">
                    <input
                      type="time"
                      step={1}
                      value={turnOnTime}
                      disabled={!canManageDevice}
                      onChange={(event) =>
                        setTurnOnTime(
                          normalizeScheduleTime(event.target.value, turnOnTime),
                        )
                      }
                      className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </ScheduleField>

                  <ScheduleField label="Turn OFF">
                    <input
                      type="time"
                      step={1}
                      value={turnOffTime}
                      disabled={!canManageDevice}
                      onChange={(event) =>
                        setTurnOffTime(
                          normalizeScheduleTime(
                            event.target.value,
                            turnOffTime,
                          ),
                        )
                      }
                      className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </ScheduleField>
                </div>
              )}

              {(scheduleMode === "budget" || scheduleMode === "both") && (
                <div className="grid grid-cols-2 gap-3">
                  <ScheduleField label="Budget Limit (PHP)">
                    <input
                      value={budgetLimit}
                      disabled={!canManageDevice}
                      onChange={(event) => setBudgetLimit(event.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </ScheduleField>

                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Current Usage
                    </p>
                    <p className="mt-2 text-xl font-bold leading-tight text-slate-900 dark:text-white">
                      ₱ {device.budgetUsed.toFixed(2)} / ₱{" "}
                      {currentBudgetLimit.toFixed(2)}
                    </p>
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        withinBudget ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {withinBudget ? "Within budget" : "Over budget"}
                    </p>
                  </div>
                </div>
              )}

              {(device.scheduleManualOverride ||
                device.scheduleBudgetReached) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {device.scheduleManualOverride && (
                    <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <p className="font-semibold">Manual override active</p>
                      <p className="mt-1 text-xs">
                        Resumes at the next schedule boundary.
                      </p>
                    </div>
                  )}

                  {device.scheduleBudgetReached && (
                    <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
                      <p className="font-semibold">Budget limit reached</p>
                      <p className="mt-1 text-xs">
                        Relay stays off until the rule is changed.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {scheduleSaved && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Scheduling rule saved.
                </div>
              )}

              <Button
                type="button"
                onClick={handleSaveSchedule}
                disabled={!canManageDevice}
                className="h-12 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                <Clock3 className="h-4 w-4" />
                {canManageDevice ? "Save Scheduling Rule" : "Owner Only"}
              </Button>

              {!canManageDevice && (
                <div className="rounded-2xl bg-sky-50 px-4 py-3 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                  Automation is visible for shared devices, but only the owner
                  can change schedules and budget automation.
                </div>
              )}
            </div>
          </section>
        )}

        {activeSection === "maintenance" && canManageDevice && (
          <>
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-sky-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Share With
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                {sharedUsers.map((user) => (
                  <SharedUserRow
                    key={user.id}
                    user={user}
                    onRemove={() => setPendingSharedRemoval(user)}
                  />
                ))}

                {sharedUsers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No family member has access to this device yet.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Device Password
                </h2>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Reset the owner verification password used for removal and
                protected maintenance actions. This does not change the Smart
                Plug's cloud connection.
              </p>

              <Button
                type="button"
                onClick={openResetDevicePassword}
                className="mt-4 h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                <KeyRound className="h-4 w-4" />
                Reset Device Password
              </Button>
            </section>

            <button
              type="button"
              onClick={() => {
                setShowRemoveDevice(true);
                setDevicePassword("");
                setRemoveDeviceError("");
              }}
              className="w-full rounded-full bg-red-50 px-5 py-4 text-sm font-bold text-red-500 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
            >
              Remove Device
            </button>
          </>
        )}
      </div>

      <AllLogsModal
        open={showAllLogs}
        logs={filteredLogs}
        totalUsage={filteredUsage}
        title={logExportMetadata.title}
        electricityRate={electricityRate}
        onClose={() => setShowAllLogs(false)}
      />

      <ConfirmDialog
        open={pendingSharedRemoval != null}
        title="Remove Shared User"
        onCancel={() => setPendingSharedRemoval(null)}
        onConfirm={handleConfirmRemoveSharedUser}
        confirmLabel="Remove"
      >
        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Are you sure you want to remove{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {pendingSharedRemoval?.name}
          </span>{" "}
          from{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {device.name}
          </span>
          ? This will remove access to this device. If this is the user's last
          device, they will also be removed from Family Sharing.
        </div>
      </ConfirmDialog>

      {showFormatSdCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-300">
                <HardDrive className="h-5 w-5" />
              </span>

              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {sdFormatTrackingActive
                    ? "Clearing SD Data"
                    : "Clear SD Data"}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {device.name}
                </p>
              </div>
            </div>

            {!sdFormatTrackingActive ? (
              <>
                <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-relaxed text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  This will queue a Smart Plug command to remove EnerTrack
                  offline backlog and archived sync files for{" "}
                  <span className="font-bold">{device.name}</span>. Other SD
                  card files will be left alone.
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                  Current pending offline logs:{" "}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {pendingOfflineLogs}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowFormatSdCard(false)}
                    className="h-11 rounded-full"
                  >
                    Cancel
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      void handleConfirmFormatSdCard();
                    }}
                    className="h-11 rounded-full bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                  >
                    <HardDrive className="h-4 w-4" />
                    {formatSdCardBusy ? "Queueing..." : "Start Cleanup"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {sdFormatStatus === "completed"
                        ? "Completed"
                        : sdFormatStatus === "failed"
                          ? "Failed"
                          : sdFormatStatus === "queued"
                            ? "Waiting for Smart Plug"
                            : "Formatting"}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {sdFormatProgress}%
                    </span>
                  </div>

                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        sdFormatStatus === "failed"
                          ? "bg-red-500"
                          : sdFormatStatus === "completed"
                            ? "bg-emerald-500"
                            : "bg-orange-500"
                      }`}
                      style={{ width: `${sdFormatProgress}%` }}
                    />
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {sdFormatMessage}
                  </p>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                  {sdFormatCanClose
                    ? `Pending offline logs now: ${pendingOfflineLogs}`
                    : "Please keep this window open while the Smart Plug finishes the operation."}
                </div>

                <div className="mt-5">
                  <Button
                    type="button"
                    disabled={!sdFormatCanClose}
                    onClick={() => {
                      setShowFormatSdCard(false);
                      setFormatSdCardTracking(false);
                    }}
                    className="h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
                  >
                    Okay
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showResetDevicePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <KeyRound className="h-5 w-5" />
              </span>

              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Reset Device Password
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {device.name}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              This updates the password used by the app to verify device
              removal and protected maintenance actions. It will not change the
              Smart Plug's database login or interrupt live readings.
            </div>

            <div className="mt-4 space-y-3">
              <ScheduleField label="Device">
                <input
                  readOnly
                  value={`${device.name} • ${device.room}`}
                  className="w-full cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                />
              </ScheduleField>

              <ScheduleField label="New Device Password">
                <input
                  type="password"
                  value={newDevicePassword}
                  onChange={(event) => {
                    setNewDevicePassword(event.target.value);
                    setResetDevicePasswordError("");
                    setResetDevicePasswordSuccess("");
                  }}
                  placeholder="At least 6 characters"
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </ScheduleField>

              <ScheduleField label="Confirm New Password">
                <input
                  type="password"
                  value={confirmDevicePassword}
                  onChange={(event) => {
                    setConfirmDevicePassword(event.target.value);
                    setResetDevicePasswordError("");
                    setResetDevicePasswordSuccess("");
                  }}
                  placeholder="Re-enter new password"
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </ScheduleField>

              {resetDevicePasswordError && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {resetDevicePasswordError}
                </div>
              )}

              {resetDevicePasswordSuccess && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {resetDevicePasswordSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (resetDevicePasswordBusy) return;
                    setShowResetDevicePassword(false);
                  }}
                  disabled={resetDevicePasswordBusy}
                  className="h-11 rounded-full"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={handleConfirmResetDevicePassword}
                  disabled={resetDevicePasswordBusy}
                  className="h-11 rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  {resetDevicePasswordBusy ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRemoveDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Remove Device
            </h2>

            <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold leading-relaxed text-red-500 dark:bg-red-950/40 dark:text-red-300">
              Removing this device will also remove its family access from all
              shared users. This action cannot be undone in the preview.
            </div>

            <div className="mt-4 space-y-3">
              <ScheduleField label="Device">
                <input
                  readOnly
                  value={`${device.name} • ${device.room}`}
                  className="w-full cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                />
              </ScheduleField>

              <ScheduleField label="Device Password">
                <input
                  type="password"
                  value={devicePassword}
                  onChange={(event) => {
                    setDevicePassword(event.target.value);
                    setRemoveDeviceError("");
                  }}
                  placeholder="Enter device password"
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </ScheduleField>

              <button
                type="button"
                onClick={openResetDevicePassword}
                disabled={removeDeviceBusy}
                className="text-left text-xs font-bold text-emerald-600 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-300"
              >
                Forgot device password? Reset it
              </button>

              {removeDeviceError && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {removeDeviceError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (removeDeviceBusy) return;
                    setShowRemoveDevice(false);
                  }}
                  disabled={removeDeviceBusy}
                  className="h-11 rounded-full"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={handleConfirmRemoveDevice}
                  disabled={removeDeviceBusy}
                  className="h-11 rounded-full bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                >
                  {removeDeviceBusy ? "Removing..." : "Remove"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {exportToast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-slate-950"
        >
          {exportToast}
        </div>
      )}
    </>
  );
}

function DetailSectionTabs({
  activeSection,
  onChange,
}: {
  activeSection: DetailSection;
  onChange: (section: DetailSection) => void;
}) {
  return (
    <nav
      className="-mx-1 overflow-x-auto pb-1"
      aria-label="Device detail sections"
    >
      <div className="flex min-w-max gap-2 px-1">
        {detailSections.map(({ id, label, icon: Icon }) => {
          const active = activeSection === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <p className="mt-7 text-3xl font-bold leading-none text-slate-950 dark:text-white">
        {value}{" "}
        <span className="text-base font-semibold text-slate-500 dark:text-slate-400">
          {unit}
        </span>
      </p>
    </div>
  );
}

function EnergyTrendsCard({
  mode,
  selectedDate,
  data,
  hasEntry,
  selectedBar,
  electricityRate,
  onModeChange,
  onDateChange,
  onBarClick,
  onCloseSelectedBar,
}: {
  mode: TrendMode;
  selectedDate: string;
  data: ChartItem[];
  hasEntry: boolean;
  selectedBar: ChartItem | null;
  electricityRate: number;
  onModeChange: (mode: TrendMode) => void;
  onDateChange: (date: string) => void;
  onBarClick: (item: ChartItem) => void;
  onCloseSelectedBar: () => void;
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const hasChartData = hasEntry && data.some((item) => item.value > 0);
  const selectedPeriod =
    mode === "daily"
      ? "Selected time"
      : mode === "weekly"
        ? "Selected day"
        : "Selected week";

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
        Energy Trends
      </h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {trendModes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onModeChange(item.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              mode === item.id
                ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Trend Date
        </span>
        <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none dark:text-white"
          />
          <Calendar className="h-5 w-5 shrink-0 text-slate-700 dark:text-slate-300" />
        </div>
      </label>

      <div className="mt-12 flex h-44 items-end justify-between gap-3">
        {hasChartData ? (
          data.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.value <= 0}
              onClick={() => {
                if (item.value > 0) {
                  onBarClick(item);
                }
              }}
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-3 transition active:scale-95 ${
                item.value <= 0 ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              <div
                className={`w-full rounded-t-[26px] transition ${
                  selectedBar?.label === item.label
                    ? "bg-gradient-to-t from-emerald-700 to-teal-500 shadow-md"
                    : "bg-gradient-to-t from-emerald-500 to-teal-400"
                }`}
                style={{
                  height:
                    item.value > 0
                      ? `${(item.value / maxValue) * 100}%`
                      : "6px",
                  minHeight: item.value > 0 ? "36px" : "6px",
                }}
              />
              <span
                className={`text-xs font-semibold ${
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
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              No trend entry found.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This chart will show real usage after this device records energy
              logs.
            </p>
          </div>
        )}
      </div>

      {selectedBar && hasChartData ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">
                {selectedBar.label}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedPeriod}: {selectedBar.label}
              </p>
            </div>

            <button
              type="button"
              onClick={onCloseSelectedBar}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close selected trend summary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-bold text-slate-900 dark:text-white">
                Selected date:
              </span>{" "}
              {formatDisplayDate(selectedDate)}
            </p>
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
              ₱
              {(selectedBar.cost ??
                computeEstimatedCost(selectedBar.value, electricityRate)).toFixed(2)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400">
          {hasEntry
            ? `Tap a bar to view the ${mode} energy summary.`
            : `No trend entry found for ${formatDisplayDate(selectedDate)}.`}
        </div>
      )}
    </section>
  );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function UsageLogsCard({
  logMode,
  logFilter,
  selectedDate,
  startDate,
  endDate,
  totalLogCount,
  logs,
  visibleLogs,
  totalUsage,
  hasHiddenLogs,
  electricityRate,
  exportMetadata,
  onExportRecord,
  onExportCompleted,
  onLogModeChange,
  onLogFilterChange,
  onSelectedDateChange,
  onStartDateChange,
  onEndDateChange,
  onSeeMore,
}: {
  logMode: LogMode;
  logFilter: LogFilter;
  selectedDate: string;
  startDate: string;
  endDate: string;
  totalLogCount: number;
  logs: UsageLog[];
  visibleLogs: UsageLog[];
  totalUsage: number;
  hasHiddenLogs: boolean;
  electricityRate: number;
  exportMetadata: LogExportMetadata;
  onExportRecord: (record: Omit<ExportRecord, "id" | "createdAt">) => void;
  onExportCompleted: () => void;
  onLogModeChange: (mode: LogMode) => void;
  onLogFilterChange: (filter: LogFilter) => void;
  onSelectedDateChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSeeMore: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Raw Activity Logs
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Detailed events for troubleshooting this smart plug.
          </p>
        </div>

        <div className="flex rounded-full bg-slate-100 p-1 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => onLogModeChange("single")}
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
            onClick={() => onLogModeChange("range")}
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
          <DateField
            label="Select Date"
            value={selectedDate}
            onChange={onSelectedDateChange}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Start Date"
              value={startDate}
              onChange={onStartDateChange}
            />
            <DateField
              label="End Date"
              value={endDate}
              onChange={onEndDateChange}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex rounded-full bg-slate-100 p-1 dark:bg-slate-950">
        {(
          [
            { id: "all", label: "All" },
            { id: "usage", label: "Usage" },
            { id: "actions", label: "Actions" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onLogFilterChange(option.id)}
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
        Showing {logs.length} of {totalLogCount} log entries • Total usage{" "}
        {formatEnergyKwh(totalUsage)} kWh
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button
          type="button"
          onClick={() => {
            const exported = exportLogsToCSV(
              logs,
              electricityRate,
              exportMetadata,
            );
            onExportRecord({
              title: exportMetadata.title,
              source: "Device Details",
              format: "CSV",
              entries: logs.length,
              totalUsage,
              fileName: exported.fileName,
              mimeType: exported.mimeType,
              content: exported.content,
              rows: buildExportRows(logs, electricityRate),
            });
            onExportCompleted();
          }}
          disabled={logs.length === 0}
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
              logs,
              electricityRate,
              exportMetadata,
            );
            onExportRecord({
              title: exportMetadata.title,
              source: "Device Details",
              format: "PDF",
              entries: logs.length,
              totalUsage,
              fileName: exported.fileName,
              mimeType: exported.mimeType,
              content: exported.content,
              rows: buildExportRows(logs, electricityRate),
            });
            onExportCompleted();
          }}
          disabled={logs.length === 0}
          variant="outline"
          className="rounded-2xl"
        >
          <Download className="h-4 w-4" />
          Raw PDF
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No logs found for this device.
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
          onClick={onSeeMore}
          className="mt-4 w-full rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-emerald-600 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-slate-800"
        >
          See more logs
        </button>
      )}
    </section>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
        />
      </div>
    </label>
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
          {formatDisplayDate(getLogInputDate(log.date))} •{" "}
          {getActionLabel(log.action)}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
      <span className="shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="min-w-0 max-w-[62%] break-words text-right text-sm font-bold text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function ScheduleField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function SharedUserRow({
  user,
  onRemove,
}: {
  user: FamilyMember;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900 dark:text-white">
            {user.name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {user.email}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {user.relationship}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-200">
            {user.permission}
          </span>
          {!user.isOwner && (
            <Button
              type="button"
              variant="outline"
              onClick={onRemove}
              className="rounded-full px-4"
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AllLogsModal({
  open,
  logs,
  totalUsage,
  title,
  electricityRate,
  onClose,
}: {
  open: boolean;
  logs: UsageLog[];
  totalUsage: number;
  title: string;
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
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing {logs.length} log entries • Total usage{" "}
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

function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {title}
        </h2>

        <div className="mt-4">{children}</div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 rounded-full"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={onConfirm}
            className="h-11 rounded-full bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
