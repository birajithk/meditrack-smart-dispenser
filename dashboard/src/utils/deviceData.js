export const DEFAULT_COMPARTMENT_COUNT = 3;

export const COMPLETED_STATUSES = new Set(["taken", "missed", "completed"]);

export function isDeviceOnline(status, staleSeconds = 180) {
  const lastSeenEpoch = Number(status?.lastSeenEpoch);

  if (!lastSeenEpoch) return false;

  const nowEpoch = Math.floor(Date.now() / 1000);
  const ageSeconds = nowEpoch - lastSeenEpoch;

  return status?.online !== false && ageSeconds <= staleSeconds;
}

export function normalizeDeviceRecord(deviceId, value = {}) {
  const compartments = {};

  for (
    let compartmentNumber = 1;
    compartmentNumber <= DEFAULT_COMPARTMENT_COUNT;
    compartmentNumber += 1
  ) {
    const compartmentValue = value.compartments?.[String(compartmentNumber)] || {};

    compartments[String(compartmentNumber)] = {
      pillName: compartmentValue.pillName || "",
    };
  }

  return {
    id: deviceId,
    deviceName: value.deviceName || "",
    delaySeconds: Number(value.delaySeconds) || 30,
    compartments,
    status: value.status || {},
    schedules: value.schedules || {},
    logs: value.logs || {},
  };
}

export function getDeviceTitle(device) {
  if (!device) return "";

  if (typeof device === "string") return device;

  return device.deviceName?.trim() || device.id || "";
}

export function getDeviceDropdownLabel(device) {
  if (!device) return "";

  const title = getDeviceTitle(device);

  return `${title} (${device.id})`;
}

export function getCompartmentOptions(device) {
  if (!device?.compartments) return [];

  return Object.entries(device.compartments)
    .map(([compartmentId, compartment]) => ({
      id: compartmentId,
      compartmentNumber: Number(compartmentId),
      pillName: compartment?.pillName?.trim() || "",
    }))
    .filter((compartment) => compartment.pillName);
}

export function getCompartmentLabel(device, compartmentNumber) {
  const compartment = device?.compartments?.[String(compartmentNumber)];

  if (compartment?.pillName?.trim()) {
    return `Compartment ${compartmentNumber}: ${compartment.pillName.trim()}`;
  }

  return `Compartment ${compartmentNumber}`;
}

export function isCompletedSchedule(schedule) {
  return COMPLETED_STATUSES.has(String(schedule?.status || "").toLowerCase());
}

export function isFinalOneTimeSchedule(schedule) {
  return schedule?.recurrence?.type === "once" && isCompletedSchedule(schedule);
}

export function isMissedLog(log) {
  return String(log?.status || "").toLowerCase() === "missed";
}

export function getMissedDoseCount(logs = {}) {
  return Object.values(logs).filter((log) => isMissedLog(log)).length;
}