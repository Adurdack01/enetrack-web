import type { Device } from "@/types/device";

type ScheduleSummaryDevice = Pick<
  Device,
  | "budgetLimit"
  | "schedule"
  | "scheduleBudgetLimit"
  | "scheduleEnabled"
  | "scheduleEndTime"
  | "scheduleMode"
  | "scheduleStartTime"
>;

export function normalizeScheduleTime(
  value?: string | null,
  fallback = "00:00:00",
) {
  const candidate = (value ?? "").replace(/^Time:\s*/i, "").trim();
  const match = candidate.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i,
  );

  if (!match) return fallback;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  const meridiem = match[4]?.toUpperCase();

  if (meridiem) {
    hours %= 12;

    if (meridiem === "PM") {
      hours += 12;
    }
  }

  if (hours > 23 || minutes > 59 || seconds > 59) return fallback;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function parseSchedule(schedule?: string | null) {
  if (!schedule?.includes(" - ")) {
    return {
      start: "08:00:00",
      end: "22:00:00",
    };
  }

  const [start, endSegment] = schedule.split(" - ");
  const end = endSegment.split("•")[0].trim();

  return {
    start: normalizeScheduleTime(start, "08:00:00"),
    end: normalizeScheduleTime(end, "22:00:00"),
  };
}

export function formatScheduleTimeLabel(value?: string | null) {
  const [hourText = "0", minuteText = "0", secondText = "0"] =
    normalizeScheduleTime(value, "00:00:00").split(":");
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  const seconds = Number(secondText);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = String(minutes).padStart(2, "0");

  if (seconds > 0) {
    return `${displayHours}:${displayMinutes}:${String(seconds).padStart(2, "0")} ${period}`;
  }

  return `${displayHours}:${displayMinutes} ${period}`;
}

export function getDeviceScheduleSummary(device: ScheduleSummaryDevice) {
  if (!device.scheduleEnabled) {
    return "Automation off";
  }

  const parsedSchedule = parseSchedule(device.schedule);
  const startTime = formatScheduleTimeLabel(
    normalizeScheduleTime(
      device.scheduleStartTime ?? parsedSchedule.start,
      parsedSchedule.start,
    ),
  );
  const endTime = formatScheduleTimeLabel(
    normalizeScheduleTime(
      device.scheduleEndTime ?? parsedSchedule.end,
      parsedSchedule.end,
    ),
  );
  const budgetLimit =
    typeof device.scheduleBudgetLimit === "number" &&
    Number.isFinite(device.scheduleBudgetLimit) &&
    device.scheduleBudgetLimit > 0
      ? device.scheduleBudgetLimit
      : device.budgetLimit;
  const budgetText =
    Number.isFinite(budgetLimit) && budgetLimit > 0
      ? `₱${budgetLimit.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })}`
      : "Not set";

  if (device.scheduleMode === "budget") {
    return `Budget: ${budgetText}`;
  }

  if (device.scheduleMode === "both") {
    return `Time: ${startTime} - ${endTime} • Budget: ${budgetText}`;
  }

  return `Time: ${startTime} - ${endTime}`;
}
