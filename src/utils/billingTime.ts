const BILLING_TIME_ZONE = "Asia/Manila";

const billingDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const billingHourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

function toValidDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getBillingDateParts(value: string | number | Date) {
  const date = toValidDate(value);
  if (!date) return null;

  const parts = billingDateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function getBillingDateKey(value: string | number | Date = new Date()) {
  const parts = getBillingDateParts(value);
  if (!parts) return "";

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function getBillingMonthKey(value: string | number | Date = new Date()) {
  const parts = getBillingDateParts(value);
  if (!parts) return "";

  return `${parts.year}-${pad2(parts.month)}`;
}

export function getBillingYear(value: string | number | Date) {
  return getBillingDateParts(value)?.year ?? null;
}

export function getBillingDayOfMonth(value: string | number | Date) {
  return getBillingDateParts(value)?.day ?? null;
}

export function getBillingHour(value: string | number | Date) {
  const date = toValidDate(value);
  if (!date) return null;

  const hour = Number(
    billingHourFormatter
      .formatToParts(date)
      .find((part) => part.type === "hour")?.value,
  );

  return Number.isFinite(hour) ? hour : null;
}

export function getBillingWeekdayIndex(value: string | number | Date) {
  const dateKey = getBillingDateKey(value);
  if (!dateKey) return null;

  return new Date(`${dateKey}T00:00:00`).getDay();
}

export function getBillingWeekOfMonth(value: string | number | Date) {
  const day = getBillingDayOfMonth(value);
  if (day == null) return null;

  return Math.min(4, Math.max(1, Math.ceil(day / 7)));
}
