export const DEFAULT_COMPARTMENT_COUNT = 3;

export const COMPLETED_STATUSES = new Set(["taken", "missed", "completed"]);

export function isDeviceOnline(status, staleSeconds = 60) {
  if (!status?.online) return false;

  const lastSeenEpoch = Number(status.lastSeenEpoch);

  if (!lastSeenEpoch) return false;

  const nowEpoch = Math.floor(Date.now() / 1000);
  const ageSeconds = nowEpoch - lastSeenEpoch;

  return ageSeconds <= staleSeconds;
}

export function normalizeDeviceRecord(deviceId, value = {}) {
  const compartments = {};

  for (let compartmentNumber = 1; compartmentNumber <= DEFAULT_COMPARTMENT_COUNT; compartmentNumber += 1) {
    const compartmentValue = value.compartments?.[String(compartmentNumber)] || {};

    compartments[String(compartmentNumber)] = {
      pillName: compartmentValue.pillName || "",
    };
  }

  return {
    id: deviceId,
    deviceName: deviceId,
    description: value.description || "",
    delaySeconds: Number(value.delaySeconds) || 30,
    compartments,
    status: value.status || {},
    schedules: value.schedules || {},
    logs: value.logs || {},
  };
}

export function getDeviceTitle(device) {
  if (!device) {
    return "";
  }

  if (typeof device === "string") {
    return device;
  }

  return device.id || "";
}

export function getCompartmentOptions(device) {
  if (!device?.compartments) {
    return [];
  }

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
    return `${compartmentNumber}: ${compartment.pillName.trim()}`;
  }

  return `Compartment ${compartmentNumber}`;
}

export function isCompletedSchedule(schedule) {
  const status = String(schedule?.status || "").toLowerCase();
  const recurrenceType = String(schedule?.recurrence?.type || "").toLowerCase();

  // A recurring schedule should stay active after today's dose is taken/missed,
  // because it can still run on future occurrences.
  if (recurrenceType === "weekly" || recurrenceType === "range") {
    return false;
  }

  return COMPLETED_STATUSES.has(status);
}

export function isMissedLog(log) {
  return String(log?.status || "").toLowerCase() === "missed";
}

export function getMissedDoseCount(logs = {}) {
  return Object.values(logs).filter((log) => isMissedLog(log)).length;
}

export function getNextDeviceId(devices = []) {
  const usedNumbers = devices
    .map((device) => String(device.id || "").match(/^device(\d+)$/i))
    .filter(Boolean)
    .map((match) => Number(match[1]));

  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;

  return `device${String(nextNumber).padStart(3, "0")}`;
}
