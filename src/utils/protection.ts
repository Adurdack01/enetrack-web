import { ESP32_MAX_CURRENT_A, ESP32_MAX_POWER_W } from "@/services/esp32";

type ProtectionLimitSource = {
  protectionEnabled?: boolean;
  maxPowerLimit?: number | null;
  maxCurrentLimit?: number | null;
};

const LEGACY_MAX_POWER_LIMIT_W = 2000;
const LEGACY_MAX_CURRENT_LIMIT_A = 10;

function normalizeProtectionLimit(
  value: number | null | undefined,
  fallback: number,
  legacyDefault: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value === legacyDefault ? fallback : value;
}

export function resolveProtectionLimits(source?: ProtectionLimitSource) {
  return {
    maxPowerLimit: normalizeProtectionLimit(
      source?.maxPowerLimit,
      ESP32_MAX_POWER_W,
      LEGACY_MAX_POWER_LIMIT_W,
    ),
    maxCurrentLimit: normalizeProtectionLimit(
      source?.maxCurrentLimit,
      ESP32_MAX_CURRENT_A,
      LEGACY_MAX_CURRENT_LIMIT_A,
    ),
  };
}

export function resolveProtectionState(source?: ProtectionLimitSource) {
  return {
    protectionEnabled: source?.protectionEnabled ?? false,
    ...resolveProtectionLimits(source),
  };
}

export function formatProtectionSummary(source?: ProtectionLimitSource) {
  const protectionState = resolveProtectionState(source);

  return `${protectionState.maxPowerLimit.toFixed(0)} W / ${protectionState.maxCurrentLimit.toFixed(1)} A`;
}
