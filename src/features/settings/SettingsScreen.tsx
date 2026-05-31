import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  Download,
  Eye,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import type {
  ExportFormat,
  ExportRecord,
  ExportRecordRow,
} from "@/types/exportRecord";
import type {
  ElectricityRateSettings,
  UserProfile,
} from "@/types/settings";
import { showNativeNotification } from "@/services/nativeNotifications";

type Props = {
  profile: UserProfile;
  darkMode: boolean;
  pushNotificationsEnabled: boolean;
  electricityRate: ElectricityRateSettings;
  exportRecords: ExportRecord[];
  onToggleDarkMode: () => void;
  onTogglePushNotifications: () => void;
  onUpdateProfile: (profile: UserProfile) => Promise<ActionResult>;
  onUpdatePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<ActionResult>;
  onDeleteAccount: (payload: {
    currentPassword: string;
  }) => Promise<ActionResult>;
  onUpdateElectricityRate: (settings: ElectricityRateSettings) => void;
  onRemoveExportRecord: (recordId: string) => void;
  onClearExportRecords: () => void;
  onLogout: () => void;
};

type SettingsView = "main" | "profile";
type StatusTone = "success" | "warning" | "error";

type ActionResult = {
  ok: boolean;
  message?: string;
};

const VISIBLE_EXPORT_LIMIT = 3;
const NATIVE_EXPORT_SAVE_LOCATION = "Documents/EnerTrack";

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "DC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function formatDateTime(value: string) {
  if (!value) return "Unavailable";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getExportRecordFileStem(record: ExportRecord) {
  const sourceName = record.fileName ?? record.title;
  const withoutExtension = sourceName.replace(/\.(csv|pdf)$/i, "");
  const normalized = withoutExtension.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return normalized.replace(/(^-|-$)/g, "") || "enertrack-export";
}

function getExportRecordFileName(record: ExportRecord) {
  return `${getExportRecordFileStem(record)}.${record.format.toLowerCase()}`;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  cells.push(value);
  return cells;
}

function getExportRows(record: ExportRecord): ExportRecordRow[] {
  if (record.rows?.length) return record.rows;
  if (!record.content) return [];

  const lines = record.content.split(/\r?\n/).filter(Boolean);
  const firstLine = lines[0] ?? "";

  if (
    firstLine.includes("Device") &&
    firstLine.includes("Date") &&
    firstLine.includes(",")
  ) {
    const headers = parseCsvLine(lines[0] ?? "");

    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      const getIndex = (names: string[]) =>
        headers.findIndex((header) => names.includes(header));
      const deviceIndex = getIndex(["Device"]);
      const dateIndex = getIndex(["Date"]);
      const actionIndex = getIndex(["Action"]);
      const detailsIndex = getIndex(["Changes", "Details"]);
      const energyIndex = getIndex(["Energy (kWh)"]);
      const costIndex = getIndex(["Cost (PHP)"]);

      return {
        deviceName:
          cells[deviceIndex >= 0 ? deviceIndex : 0] ?? "Exported item",
        date: cells[dateIndex >= 0 ? dateIndex : 1] ?? formatDateTime(record.createdAt),
        action: actionIndex >= 0 ? cells[actionIndex] : undefined,
        details: detailsIndex >= 0 ? cells[detailsIndex] : undefined,
        energy: Number(cells[energyIndex >= 0 ? energyIndex : 2]) || 0,
        cost: Number(cells[costIndex >= 0 ? costIndex : 3]) || 0,
      };
    });
  }

  return lines
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= 4)
    .map((parts) => {
      const hasDetails = parts.length >= 6;
      const hasAction = parts.length >= 5;

      return {
        date: parts[0] ?? formatDateTime(record.createdAt),
        deviceName: parts[1] ?? "Exported item",
        action: hasAction ? parts[2] : undefined,
        details: hasDetails ? parts[3] : undefined,
        energy:
          Number(
            (hasDetails ? parts[4] : hasAction ? parts[3] : parts[2]).replace(
              /[^\d.]/g,
              ""
            )
          ) || 0,
        cost:
          Number(
            (hasDetails ? parts[5] : hasAction ? parts[4] : parts[3]).replace(
              /[^\d.]/g,
              ""
            )
          ) || 0,
      };
    });
}

function getCsvContent(record: ExportRecord) {
  if (record.format === "CSV" && record.content) return record.content;

  const rows = getExportRows(record);
  const includeChanges = rows.some((row) => row.action || row.details);
  const headers = includeChanges
    ? ["Device", "Date", "Action", "Changes", "Energy (kWh)", "Cost (PHP)"]
    : ["Device", "Date", "Energy (kWh)", "Cost (PHP)"];
  const csvRows = rows.map((row) =>
    includeChanges
      ? [
          row.deviceName,
          row.date,
          row.action ?? "",
          row.details ?? "",
          row.energy.toFixed(3),
          row.cost.toFixed(2),
        ]
      : [
          row.deviceName,
          row.date,
          row.energy.toFixed(3),
          row.cost.toFixed(2),
        ]
  );

  return [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");
}

function getGeneratedDateTime(record: ExportRecord) {
  return new Date(record.createdAt).toLocaleString("en-US");
}

function getReportTitle(record: ExportRecord) {
  return record.title;
}

function writeReportPdf(record: ExportRecord) {
  const doc = new jsPDF();
  const rows = getExportRows(record);
  let y = 20;

  doc.setFontSize(16);
  doc.text(getReportTitle(record), 14, y);

  y += 10;
  doc.setFontSize(10);
  doc.text(`Generated: ${getGeneratedDateTime(record)}`, 14, y);

  y += 12;

  if (record.summary?.length) {
    record.summary.forEach((item) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(10);
      doc.text(`${item.label}: ${item.value}`.slice(0, 95), 14, y);
      y += 6;
    });

    y += 8;
  } else {
    y += 6;
  }

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.text("No exported log entries found.", 14, y);
    return doc;
  }

  rows.forEach((row) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.text(row.deviceName, 14, y);
    doc.text(`${row.energy.toFixed(3)} kWh`, 138, y);

    y += 6;
    doc.setFontSize(9);
    doc.text(row.action ? `${row.date} - ${row.action}` : row.date, 14, y);
    doc.text(`PHP ${row.cost.toFixed(2)}`, 138, y);

    if (row.details) {
      y += 5;
      doc.text(row.details.slice(0, 90), 14, y);
    }

    y += 12;
  });

  if (record.notes?.length) {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }

    y += 4;
    doc.setFontSize(10);
    record.notes.forEach((note) => {
      doc.text(note.slice(0, 95), 14, y);
      y += 6;
    });
  }

  return doc;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function ensureFileDownloadPermission() {
  const current = await Filesystem.checkPermissions();
  if (current.publicStorage === "granted") return true;

  const requested = await Filesystem.requestPermissions();
  return requested.publicStorage === "granted";
}

async function saveNativeExportFile(
  fileName: string,
  data: string,
  encoding?: Encoding
) {
  const allowed = await ensureFileDownloadPermission();
  if (!allowed) {
    throw new Error("Storage permission was denied.");
  }

  await Filesystem.writeFile({
    path: `EnerTrack/${fileName}`,
    data,
    directory: Directory.Documents,
    encoding,
    recursive: true,
  });
}

async function notifyExportSaved(fileName: string, location: string) {
  const message = `Saved to ${location}/${fileName}`;

  if (Capacitor.isNativePlatform()) {
    try {
      await showNativeNotification({
        id: `export-saved-${Date.now()}`,
        title: "Export Saved",
        message,
        time: "Just now",
        type: "info",
        isRead: false,
        createdAt: new Date().toISOString(),
        category: "export_saved",
      });
    } catch (error) {
      console.error("Export saved notification failed", error);
    }
  }

  return message;
}

async function downloadExportRecord(record: ExportRecord) {
  const fileName = getExportRecordFileName(record);

  try {
    if (record.format === "PDF") {
      const doc = writeReportPdf(record);

      if (Capacitor.isNativePlatform()) {
        const dataUri = doc.output("datauristring");
        const base64 = dataUri.split(",")[1] ?? "";
        await saveNativeExportFile(fileName, base64);
        return await notifyExportSaved(fileName, NATIVE_EXPORT_SAVE_LOCATION);
      }

      downloadBlob(doc.output("blob"), fileName);
      return await notifyExportSaved(fileName, "Downloads");
    }

    const csvContent = getCsvContent(record);

    if (Capacitor.isNativePlatform()) {
      await saveNativeExportFile(fileName, csvContent, Encoding.UTF8);
      return await notifyExportSaved(fileName, NATIVE_EXPORT_SAVE_LOCATION);
    }

    downloadBlob(
      new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      }),
      fileName
    );
    return await notifyExportSaved(fileName, "Downloads");
  } catch (error) {
    console.error("Export download failed", error);
    window.alert(
      "Export download failed. Please allow storage access and try again."
    );
    return null;
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function makeRateSettings(
  base: ElectricityRateSettings,
  updates: Partial<ElectricityRateSettings>
): ElectricityRateSettings {
  return {
    ...base,
    ...updates,
    lastChecked: updates.lastChecked ?? new Date().toISOString(),
  };
}

export default function SettingsScreen({
  profile,
  darkMode,
  pushNotificationsEnabled,
  electricityRate,
  exportRecords,
  onToggleDarkMode,
  onTogglePushNotifications,
  onUpdateProfile,
  onUpdatePassword,
  onDeleteAccount,
  onUpdateElectricityRate,
  onRemoveExportRecord,
  onClearExportRecords,
  onLogout,
}: Props) {
  const [view, setView] = useState<SettingsView>("main");

  if (view === "profile") {
    return (
      <ProfileSettingsView
        profile={profile}
        onBack={() => setView("main")}
        onUpdateProfile={onUpdateProfile}
        onUpdatePassword={onUpdatePassword}
        onDeleteAccount={onDeleteAccount}
      />
    );
  }

  return (
    <MainSettingsView
      profile={profile}
      darkMode={darkMode}
      pushNotificationsEnabled={pushNotificationsEnabled}
      electricityRate={electricityRate}
      exportRecords={exportRecords}
      onOpenProfile={() => setView("profile")}
      onToggleDarkMode={onToggleDarkMode}
      onTogglePushNotifications={onTogglePushNotifications}
      onUpdateElectricityRate={onUpdateElectricityRate}
      onRemoveExportRecord={onRemoveExportRecord}
      onClearExportRecords={onClearExportRecords}
      onLogout={onLogout}
    />
  );
}

function MainSettingsView({
  profile,
  darkMode,
  pushNotificationsEnabled,
  electricityRate,
  exportRecords,
  onOpenProfile,
  onToggleDarkMode,
  onTogglePushNotifications,
  onUpdateElectricityRate,
  onRemoveExportRecord,
  onClearExportRecords,
  onLogout,
}: Omit<
  Props,
  "onUpdateProfile" | "onUpdatePassword" | "onDeleteAccount"
> & {
  onOpenProfile: () => void;
}) {
  const [manualRate, setManualRate] = useState(
    electricityRate.status === "unset" ? "" : String(electricityRate.rate)
  );
  const [status, setStatus] = useState<{
    tone: StatusTone;
    message: string;
  } | null>(null);
  const [logoutMessage, setLogoutMessage] = useState("");

  useEffect(() => {
    setManualRate(
      electricityRate.status === "unset" ? "" : String(electricityRate.rate)
    );
  }, [electricityRate]);

  const handleSaveManualRate = () => {
    const nextRate = Number(manualRate);

    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      setStatus({
        tone: "error",
        message: "Please enter a valid electricity rate.",
      });
      return;
    }

    onUpdateElectricityRate(
      makeRateSettings(electricityRate, {
        mode: "manual",
        rate: nextRate,
        previousRate: electricityRate.rate,
        providerUrl: "",
        sourceName: "Manual",
        status: "verified",
        statusMessage: "Verified rate",
        effectiveBillingMonth: "Manual entry",
        difference: nextRate - electricityRate.rate,
      })
    );
    setStatus({
      tone: "success",
      message: "Manual electricity rate saved.",
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Device, account, export, and theme options
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenProfile}
        className="w-full rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
          <div className="flex items-center gap-4">
            <Avatar initials={getInitials(profile.displayName)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-slate-900 dark:text-white">
                {profile.displayName}
              </p>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                {profile.email}
              </p>
            </div>
            <ShieldCheck className="h-6 w-6 shrink-0 text-slate-500 dark:text-slate-400" />
          </div>
        </div>
      </button>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <ElectricityRatePanel
          manualRate={manualRate}
          electricityRate={electricityRate}
          onManualRateChange={setManualRate}
          onSaveManualRate={handleSaveManualRate}
        />

        {status && (
          <StatusMessage tone={status.tone}>{status.message}</StatusMessage>
        )}
      </section>

      <SettingsActionRow
        title="Dark Mode"
        description="Switch app theme"
        icon={
          darkMode ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )
        }
        active={darkMode}
        onClick={onToggleDarkMode}
      />

      <SettingsActionRow
        title="Push Notifications"
        description="Receive alerts for overload, budget, connection, and pairing updates"
        icon={
          pushNotificationsEnabled ? (
            <Bell className="h-5 w-5" />
          ) : (
            <BellOff className="h-5 w-5" />
          )
        }
        active={pushNotificationsEnabled}
        onClick={onTogglePushNotifications}
      />

      <ExportedDataCard
        records={exportRecords}
        onRemoveExportRecord={onRemoveExportRecord}
        onClearExportRecords={onClearExportRecords}
      />

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <LogOut className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Account
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            onLogout();
            setLogoutMessage("Logged out in preview mode.");
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-red-50 px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>

        {logoutMessage && (
          <StatusMessage tone="success">{logoutMessage}</StatusMessage>
        )}
      </section>
    </div>
  );
}

function ProfileSettingsView({
  profile,
  onBack,
  onUpdateProfile,
  onUpdatePassword,
  onDeleteAccount,
}: {
  profile: UserProfile;
  onBack: () => void;
  onUpdateProfile: (profile: UserProfile) => Promise<ActionResult>;
  onUpdatePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<ActionResult>;
  onDeleteAccount: (payload: {
    currentPassword: string;
  }) => Promise<ActionResult>;
}) {
  const [name, setName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<{
    tone: StatusTone;
    message: string;
  } | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);
  const isGoogleAccount = profile.provider.toLowerCase().includes("google");

  useEffect(() => {
    setName(profile.displayName);
    setEmail(profile.email);
  }, [profile]);

  useEffect(() => {
    const clearSavedPasswordFill = () => {
      setCurrentPassword("");
      setNewPassword("");

      if (currentPasswordInputRef.current) {
        currentPasswordInputRef.current.value = "";
      }

      if (newPasswordInputRef.current) {
        newPasswordInputRef.current.value = "";
      }
    };

    clearSavedPasswordFill();
    const timeouts = [150, 500, 1000].map((delay) =>
      window.setTimeout(clearSavedPasswordFill, delay)
    );

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [profile.email]);

  const hasChanges =
    name.trim() !== profile.displayName || email.trim() !== profile.email;

  const handleBack = () => {
    if (hasChanges) {
      setShowUnsavedDialog(true);
      return;
    }

    onBack();
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      setStatus({ tone: "error", message: "Please enter your name." });
      return;
    }

    if (isGoogleAccount && email.trim() !== profile.email) {
      setStatus({
        tone: "warning",
        message: "Google account email is managed by Google.",
      });
      return;
    }

    if (!isValidEmail(email)) {
      setStatus({ tone: "error", message: "Please enter a valid email address." });
      return;
    }

    setIsSavingProfile(true);
    const result = await onUpdateProfile({
      ...profile,
      displayName: name.trim(),
      email: email.trim(),
    });
    setIsSavingProfile(false);
    setStatus({
      tone: result.ok ? "success" : "error",
      message:
        result.message ??
        (result.ok
          ? "Profile updated successfully."
          : "Unable to update profile."),
    });
  };

  const handleUpdatePassword = async () => {
    if (isGoogleAccount) {
      setStatus({
        tone: "warning",
        message: "Google account password is managed by Google.",
      });
      return;
    }

    if (!currentPassword.trim()) {
      setStatus({
        tone: "error",
        message: "Please enter your current password.",
      });
      return;
    }

    if (!newPassword.trim()) {
      setStatus({ tone: "warning", message: "Please enter your new password." });
      return;
    }

    if (newPassword.length < 6) {
      setStatus({
        tone: "error",
        message: "New password must be at least 6 characters.",
      });
      return;
    }

    setIsSavingPassword(true);
    const result = await onUpdatePassword({
      currentPassword,
      newPassword,
    });
    setIsSavingPassword(false);

    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }

    setStatus({
      tone: result.ok ? "success" : "error",
      message:
        result.message ??
        (result.ok
          ? "Password updated successfully."
          : "Unable to update password."),
    });
  };

  const handleConfirmDelete = async () => {
    if (deleteText !== "CONFIRM") return;

    if (!isGoogleAccount && !deletePassword.trim()) {
      setStatus({
        tone: "error",
        message: "Please enter your current password to delete the account.",
      });
      return;
    }

    setIsDeletingAccount(true);
    const result = await onDeleteAccount({
      currentPassword: deletePassword,
    });
    setIsDeletingAccount(false);

    if (!result.ok) {
      setStatus({
        tone: "error",
        message: result.message ?? "Unable to delete account.",
      });
      return;
    }

    setShowDeleteDialog(false);
    setDeleteText("");
    setDeletePassword("");
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Profile Settings
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage your profile, password, and account
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="rounded-full px-5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <Avatar initials={getInitials(name)} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-slate-900 dark:text-white">
                {name || profile.displayName}
              </p>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                {email || profile.email}
              </p>
              <span className="mt-2 inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                {profile.provider}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Edit Profile
            </h2>
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setStatus(null);
              }}
              placeholder="Full name"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <input
              value={email}
              readOnly={isGoogleAccount}
              onChange={(event) => {
                setEmail(event.target.value);
                setStatus(null);
              }}
              placeholder="Email address"
              className={`w-full rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:text-white ${
                isGoogleAccount
                  ? "cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-950 dark:text-slate-400"
                  : "bg-white dark:bg-slate-950"
              }`}
            />

            {isGoogleAccount && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                Your email is managed by your Google account.
              </div>
            )}

            {hasChanges && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                You have unsaved profile changes.
              </div>
            )}

            <Button
              type="button"
              disabled={!hasChanges || isSavingProfile}
              onClick={handleSaveProfile}
              className="h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-400 dark:bg-white dark:text-slate-950 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
            >
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Password
            </h2>
          </div>

          <div className="mt-4 space-y-3">
            <input
              ref={currentPasswordInputRef}
              type="password"
              name="enertrack-profile-current-password"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              value={currentPassword}
              disabled={isGoogleAccount}
              onFocus={(event) => {
                if (!currentPassword) {
                  event.currentTarget.value = "";
                }
              }}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setStatus(null);
              }}
              placeholder="Current password"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <input
              ref={newPasswordInputRef}
              type="password"
              name="enertrack-profile-new-password"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              value={newPassword}
              disabled={isGoogleAccount}
              onFocus={(event) => {
                if (!newPassword) {
                  event.currentTarget.value = "";
                }
              }}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setStatus(null);
              }}
              placeholder="New password"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />

            {isGoogleAccount && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                Password changes for Google accounts are handled in Google
                Account settings.
              </div>
            )}

            <Button
              type="button"
              disabled={isGoogleAccount || isSavingPassword}
              onClick={handleUpdatePassword}
              className="h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              {isSavingPassword ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Danger Zone
            </h2>
          </div>

          <p className="mt-4 text-sm leading-snug text-slate-500 dark:text-slate-400">
            Deleting your account removes your Firebase account and EnerTrack
            cloud data.
          </p>

          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="mt-4 w-full rounded-full bg-red-50 px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
          >
            Delete Account
          </button>
        </section>

        {status && (
          <StatusMessage tone={status.tone} centered>
            {status.message}
          </StatusMessage>
        )}
      </div>

      <SimpleDialog
        open={showUnsavedDialog}
        title="Unsaved Changes"
        onCancel={() => setShowUnsavedDialog(false)}
        onConfirm={() => {
          setShowUnsavedDialog(false);
          onBack();
        }}
        cancelLabel="Stay"
        confirmLabel="Leave"
      >
        You changed your profile information but have not saved it yet. Leave
        without saving?
      </SimpleDialog>

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Confirm Account Deletion
            </h2>
            <p className="mt-3 text-sm leading-snug text-slate-500 dark:text-slate-400">
              This action is permanent. Type{" "}
              <span className="font-bold text-slate-700 dark:text-slate-200">
                CONFIRM
              </span>{" "}
              to continue.
            </p>

            <input
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              placeholder="Type CONFIRM"
              className="mt-4 w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-red-300 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />

            {!isGoogleAccount && (
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Current password"
                className="mt-3 w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-red-300 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteText("");
                  setDeletePassword("");
                }}
                className="h-11 rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  deleteText !== "CONFIRM" ||
                  (!isGoogleAccount && !deletePassword.trim()) ||
                  isDeletingAccount
                }
                onClick={handleConfirmDelete}
                className="h-11 rounded-full bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300"
              >
                {isDeletingAccount ? "Deleting..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ElectricityRatePanel({
  manualRate,
  electricityRate,
  onManualRateChange,
  onSaveManualRate,
}: {
  manualRate: string;
  electricityRate: ElectricityRateSettings;
  onManualRateChange: (value: string) => void;
  onSaveManualRate: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Electricity Rate
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Set the PHP per kWh rate used for estimated cost calculations.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Using: {electricityRate.status === "unset" ? "Not Set" : "Manual"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <FormField label="Manual Rate (PHP per kWh)">
          <input
            value={manualRate}
            onChange={(event) => onManualRateChange(event.target.value)}
            inputMode="decimal"
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
          />
        </FormField>
        <Button
          type="button"
          onClick={onSaveManualRate}
          className="h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Save Manual Rate
        </Button>
      </div>

      <RateInfoCard settings={electricityRate} />
    </div>
  );
}

function RateInfoCard({ settings }: { settings: ElectricityRateSettings }) {
  const isUnset = settings.status !== "verified";
  const hasIncrease = settings.previousRate > 0 && settings.difference > 0;

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 dark:bg-slate-900">
      {isUnset ? (
        <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
          <InfoLine label="Current rate in use" value="Unavailable" />
          <InfoLine label="Source" value="Not set" />
          <InfoLine label="Effective billing month" value="Unavailable" />
          <InfoLine label="Last checked" value="Unavailable" />
          <p className="font-bold text-slate-900 dark:text-white">
            Status: No electricity rate set
          </p>
          <p className="leading-snug">
            Enter a manual electricity rate to start calculating estimated
            costs.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              M
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    Manual
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Manual electricity rate
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Verified
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
            <InfoLine
              label="Current rate in use"
              value={`₱ ${settings.rate.toFixed(4)} / kWh`}
            />
            <p>Effective billing month: {settings.effectiveBillingMonth}</p>
            <p>Last checked: {formatDateTime(settings.lastChecked)}</p>
            <p>Status: Manual rate in use</p>
            {hasIncrease && (
              <p className="font-semibold text-amber-600 dark:text-amber-300">
                Rate increased by ₱{settings.difference.toFixed(4)} compared
                to the previous rate.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ExportedDataCard({
  records,
  onRemoveExportRecord,
  onClearExportRecords,
}: {
  records: ExportRecord[];
  onRemoveExportRecord: (recordId: string) => void;
  onClearExportRecords: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("CSV");
  const [showAll, setShowAll] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ExportRecord | null>(
    null
  );
  const [downloadToast, setDownloadToast] = useState("");
  const toastTimeoutRef = useRef<number | null>(null);
  const filteredRecords = records.filter((record) => record.format === format);
  const visibleRecords = filteredRecords.slice(0, VISIBLE_EXPORT_LIMIT);
  const hasHiddenRecords = filteredRecords.length > VISIBLE_EXPORT_LIMIT;

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current != null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showDownloadToast = (message: string) => {
    if (toastTimeoutRef.current != null) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setDownloadToast(`Download successful. ${message}`);
    toastTimeoutRef.current = window.setTimeout(() => {
      setDownloadToast("");
      toastTimeoutRef.current = null;
    }, 3500);
  };

  const handleDownloadRecord = async (record: ExportRecord) => {
    const savedMessage = await downloadExportRecord(record);
    if (savedMessage) {
      showDownloadToast(savedMessage);
    }
  };

  return (
    <>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-sky-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Export Status
            </h2>
          </div>

          {records.length > 0 && (
            <button
              type="button"
              onClick={onClearExportRecords}
              className="text-xs font-bold text-red-500"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="mt-4 flex rounded-full bg-slate-100 p-1 dark:bg-slate-950">
          {(["CSV", "PDF"] as ExportFormat[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFormat(item)}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold ${
                format === item
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {filteredRecords.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              No export action yet.
            </div>
          ) : (
            visibleRecords.map((record) => (
              <ExportRecordRow
                key={record.id}
                record={record}
                onView={() => setSelectedRecord(record)}
                onDownload={() => void handleDownloadRecord(record)}
                onRemove={() => onRemoveExportRecord(record.id)}
              />
            ))
          )}
        </div>

        {hasHiddenRecords && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-4 w-full rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-emerald-600 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-slate-800"
          >
            See more export status
          </button>
        )}
      </section>

      <ExportRecordsModal
        open={showAll}
        records={filteredRecords}
        format={format}
        onClose={() => setShowAll(false)}
        onViewRecord={setSelectedRecord}
        onDownloadRecord={(record) => void handleDownloadRecord(record)}
        onRemoveExportRecord={onRemoveExportRecord}
      />

      <ExportViewModal
        record={selectedRecord}
        onDownloadRecord={(record) => void handleDownloadRecord(record)}
        onClose={() => setSelectedRecord(null)}
      />

      {downloadToast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-slate-950"
        >
          {downloadToast}
        </div>
      )}
    </>
  );
}

function ExportRecordRow({
  record,
  onView,
  onDownload,
  onRemove,
}: {
  record: ExportRecord;
  onView: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
          {record.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {record.source} • {record.entries} entries
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {formatDateTime(record.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onView}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label={`View ${record.title}`}
          title="View"
        >
          <Eye className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:bg-slate-900 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          aria-label={`Download ${record.title}`}
          title={`Download ${record.format}`}
        >
          <Download className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 transition hover:bg-red-50 hover:text-red-500 dark:bg-slate-900 dark:hover:bg-red-950/40"
          aria-label={`Remove ${record.title}`}
          title="Remove"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ExportRecordsModal({
  open,
  records,
  format,
  onClose,
  onViewRecord,
  onDownloadRecord,
  onRemoveExportRecord,
}: {
  open: boolean;
  records: ExportRecord[];
  format: ExportFormat;
  onClose: () => void;
  onViewRecord: (record: ExportRecord) => void;
  onDownloadRecord: (record: ExportRecord) => void;
  onRemoveExportRecord: (recordId: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/45 px-4 py-10">
      <div className="flex max-h-full w-full max-w-md flex-col rounded-[28px] bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {format} Export Status
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing {records.length} exported item
              {records.length === 1 ? "" : "s"}.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close export status"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {records.map((record) => (
            <ExportRecordRow
              key={record.id}
              record={record}
              onView={() => onViewRecord(record)}
              onDownload={() => onDownloadRecord(record)}
              onRemove={() => onRemoveExportRecord(record.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportViewModal({
  record,
  onDownloadRecord,
  onClose,
}: {
  record: ExportRecord | null;
  onDownloadRecord: (record: ExportRecord) => void;
  onClose: () => void;
}) {
  if (!record) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/45 px-4 py-10">
      <div className="flex max-h-full w-full max-w-md flex-col rounded-[28px] bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
              {record.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {record.format} • {formatDateTime(record.createdAt)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onDownloadRecord(record)}
              className="rounded-full p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
              aria-label="Download export"
              title={`Download ${record.format}`}
            >
              <Download className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close export preview"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <ExportReportPreview record={record} />
      </div>
    </div>
  );
}

function ExportReportPreview({ record }: { record: ExportRecord }) {
  const rows = getExportRows(record);

  return (
    <div className="mt-4 flex-1 overflow-auto rounded-2xl bg-white p-6 text-slate-950 ring-1 ring-slate-200 dark:ring-slate-800">
      <h3 className="text-xl font-semibold">{getReportTitle(record)}</h3>
      <p className="mt-4 text-xs">
        Generated: {getGeneratedDateTime(record)}
      </p>

      {record.summary?.length ? (
        <div className="mt-5 grid gap-2">
          {record.summary.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"
            >
              <span className="font-medium text-slate-500">{item.label}</span>
              <span className="text-right font-semibold text-slate-950">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-7 space-y-5">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            No exported log entries found.
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${row.deviceName}-${row.date}-${index}`}
              className="flex items-start justify-between gap-6"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-medium">
                  {row.deviceName}
                </p>
                <p className="mt-1 text-xs">
                  {row.action ? `${row.date} - ${row.action}` : row.date}
                </p>
                {row.details && (
                  <p className="mt-1 max-w-[12rem] text-xs text-slate-500">
                    {row.details}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-medium">
                  {row.energy.toFixed(3)} kWh
                </p>
                <p className="mt-1 text-xs">PHP {row.cost.toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {record.notes?.length ? (
        <div className="mt-6 space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
          {record.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SettingsActionRow({
  title,
  description,
  icon,
  active,
  onClick,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClick}
            aria-label={`${active ? "Turn off" : "Turn on"} ${title}`}
            aria-pressed={active}
            title={title}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${
              active
                ? "bg-emerald-200 text-emerald-800 shadow-sm ring-1 ring-emerald-300 hover:bg-emerald-300 dark:bg-emerald-300 dark:text-emerald-950 dark:ring-emerald-200 dark:hover:bg-emerald-200"
                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200 dark:hover:bg-emerald-800"
            }`}
          >
            {icon}
          </button>
        </div>
      </div>
    </section>
  );
}

function Avatar({
  initials,
  size = "default",
}: {
  initials: string;
  size?: "default" | "lg";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[22px] bg-emerald-100 font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ${
        size === "lg" ? "h-20 w-20 text-2xl" : "h-16 w-16 text-lg"
      }`}
    >
      {initials}
    </span>
  );
}

function FormField({
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-right font-bold text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function StatusMessage({
  tone,
  centered,
  children,
}: {
  tone: StatusTone;
  centered?: boolean;
  children: ReactNode;
}) {
  const toneClasses = {
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    warning:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    error: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300",
  };

  return (
    <div
      className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${toneClasses[tone]} ${
        centered ? "text-center" : ""
      }`}
    >
      {children}
    </div>
  );
}

function SimpleDialog({
  open,
  title,
  children,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  cancelLabel: string;
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
        <p className="mt-3 text-sm leading-snug text-slate-500 dark:text-slate-400">
          {children}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 rounded-full"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="h-11 rounded-full bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
