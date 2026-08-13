import { get, onValue, push, ref, update } from "firebase/database";
import { database } from "./firebase.js";
import { sendTelegramMessage } from "./telegram.js";

process.env.TZ = process.env.TZ || "Asia/Colombo";

const inProgressNotifications = new Set();
const inProgressWatchdogItems = new Set();

const DEVICE_STALE_SECONDS = 180;
const DUE_EXTRA_GRACE_SECONDS = 60;
const SCHEDULE_OFFLINE_EXTRA_GRACE_SECONDS = 60;
const SCAN_INTERVAL_MS = 10000;

function nowISO() {
  return new Date().toISOString();
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function currentWeekday() {
  return new Date().getDay();
}

function parseHHMM(timeText) {
  if (!timeText || typeof timeText !== "string") return null;

  const [hourText, minuteText] = timeText.split(":");

  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  return { hour, minute };
}

function scheduledEpochToday(timeText) {
  const parsed = parseHHMM(timeText);

  if (!parsed) return 0;

  const date = new Date();
  date.setHours(parsed.hour, parsed.minute, 0, 0);

  return Math.floor(date.getTime() / 1000);
}

function occurrenceKeyForToday(timeText) {
  return `${todayKey()}_${timeText}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getDeviceName(deviceId, deviceData) {
  return deviceData?.deviceName?.trim() || deviceId;
}

function getDeviceDelaySeconds(deviceData) {
  const delaySeconds = Number(deviceData?.delaySeconds);

  if (Number.isFinite(delaySeconds) && delaySeconds >= 10) {
    return delaySeconds;
  }

  return 30;
}

function getScheduleDelaySeconds(deviceData, schedule) {
  const scheduleDelay = Number(schedule?.allowedDelaySeconds);

  if (Number.isFinite(scheduleDelay) && scheduleDelay >= 10) {
    return scheduleDelay;
  }

  return getDeviceDelaySeconds(deviceData);
}

function isDeviceOnline(deviceData) {
  const status = deviceData?.status || {};
  const lastSeenEpoch = Number(status.lastSeenEpoch);

  if (!lastSeenEpoch) return false;

  const ageSeconds = nowEpoch() - lastSeenEpoch;

  return status.online !== false && ageSeconds <= DEVICE_STALE_SECONDS;
}

function dateIsWithinRange(currentDate, startDate, endDate) {
  if (startDate && currentDate < startDate) return false;
  if (endDate && currentDate > endDate) return false;

  return true;
}

function isSelectedWeekday(weekdays, day) {
  return weekdays?.[String(day)] === true;
}

function recurrenceMatchesToday(schedule) {
  const recurrence = schedule?.recurrence;

  if (!recurrence) return false;

  const currentDate = todayKey();
  const day = currentWeekday();

  if (recurrence.type === "once") {
    return recurrence.runDate === currentDate;
  }

  if (recurrence.type === "weekly") {
    return (
      dateIsWithinRange(currentDate, recurrence.startDate || "", "") &&
      isSelectedWeekday(recurrence.weekdays || {}, day)
    );
  }

  if (recurrence.type === "range") {
    return (
      dateIsWithinRange(currentDate, recurrence.startDate || "", recurrence.endDate || "") &&
      isSelectedWeekday(recurrence.weekdays || {}, day)
    );
  }

  return false;
}

function hasLogForOccurrence(deviceData, occurrence) {
  const logs = deviceData.logs || {};

  return Object.values(logs).some((log) => log.occurrence === occurrence);
}

function isFinalScheduleStatus(status) {
  const normalized = String(status || "").toLowerCase();

  return normalized === "taken" || normalized === "missed" || normalized === "completed";
}

function scheduleShouldBeMissedByWatchdog(deviceData, schedule) {
  if (!schedule?.enabled) return false;

  const status = String(schedule.status || "").toLowerCase();

  if (isFinalScheduleStatus(status)) {
    return false;
  }

  const scheduledTime = schedule.time || "";
  const scheduledEpoch = scheduledEpochToday(scheduledTime);

  if (!scheduledEpoch) {
    return false;
  }

  if (!recurrenceMatchesToday(schedule)) {
    return false;
  }

  const occurrence = occurrenceKeyForToday(scheduledTime);

  if (schedule.lastProcessedOccurrence === occurrence) {
    return false;
  }

  if (hasLogForOccurrence(deviceData, occurrence)) {
    return false;
  }

  const delaySeconds = getScheduleDelaySeconds(deviceData, schedule);
  const currentEpoch = nowEpoch();

  if (status === "due") {
    const dueEpoch = Number(schedule.dueAtEpoch || schedule.lastProcessedEpoch || scheduledEpoch);
    const dueAgeSeconds = currentEpoch - dueEpoch;

    return dueAgeSeconds >= delaySeconds + DUE_EXTRA_GRACE_SECONDS;
  }

  const deviceOnline = isDeviceOnline(deviceData);

  if (deviceOnline) {
    return false;
  }

  const scheduleAgeSeconds = currentEpoch - scheduledEpoch;

  return scheduleAgeSeconds >= delaySeconds + SCHEDULE_OFFLINE_EXTRA_GRACE_SECONDS;
}

async function createWatchdogMissedLog(deviceId, deviceData, scheduleId, schedule) {
  const scheduledTime = schedule.time || "-";
  const occurrence =
    schedule.activeOccurrence ||
    occurrenceKeyForToday(scheduledTime);

  const watchdogKey = `${deviceId}/${scheduleId}/${occurrence}`;

  if (inProgressWatchdogItems.has(watchdogKey)) {
    return;
  }

  if (hasLogForOccurrence(deviceData, occurrence)) {
    return;
  }

  inProgressWatchdogItems.add(watchdogKey);

  try {
    console.log(`[WATCHDOG] Marking missed: ${watchdogKey}`);

    const logsRef = ref(database, `devices/${deviceId}/logs`);

    await push(logsRef, {
      medicineName: schedule.medicineName || "Unknown",
      scheduledTime,
      actualTime: "Device offline / no response",
      status: "missed",
      compartment: schedule.compartment || "-",
      occurrence,
      notificationStatus: "pending",
      createdAt: nowISO(),
      createdEpoch: nowEpoch(),
      source: "watchdog",
      reason: "Device did not complete the scheduled dose before timeout",
    });

    await update(ref(database, `devices/${deviceId}/schedules/${scheduleId}`), {
      status: "missed",
      lastProcessedOccurrence: occurrence,
      lastProcessedDate: todayKey(),
      lastProcessedAt: nowISO(),
      lastProcessedEpoch: nowEpoch(),
      activeOccurrence: "",
      watchdogHandled: true,
      watchdogHandledAt: nowISO(),
      updatedAt: nowISO(),
    });

    console.log(`[WATCHDOG] Missed log created for ${watchdogKey}`);
  } catch (error) {
    console.error(`[WATCHDOG] Failed for ${watchdogKey}:`, error.message);
  } finally {
    inProgressWatchdogItems.delete(watchdogKey);
  }
}

function formatMissedDoseMessage(deviceId, deviceData, logId, log) {
  const deviceName = getDeviceName(deviceId, deviceData);

  return [
    "⚠️ <b>MediTrack Missed Dose Alert</b>",
    "",
    `<b>Device:</b> ${escapeHtml(deviceName)}`,
    `<b>Device ID:</b> ${escapeHtml(deviceId)}`,
    `<b>Medicine:</b> ${escapeHtml(log.medicineName || "Unknown")}`,
    `<b>Compartment:</b> ${escapeHtml(log.compartment || "-")}`,
    `<b>Scheduled time:</b> ${escapeHtml(log.scheduledTime || "-")}`,
    `<b>Recorded time:</b> ${escapeHtml(log.actualTime || "-")}`,
    `<b>Status:</b> Missed`,
    "",
    `<b>Log ID:</b> ${escapeHtml(logId)}`,
  ].join("\n");
}

function shouldNotify(log) {
  return (
    String(log?.status || "").toLowerCase() === "missed" &&
    String(log?.notificationStatus || "").toLowerCase() === "pending"
  );
}

async function markNotification(deviceId, logId, payload) {
  await update(ref(database, `devices/${deviceId}/logs/${logId}`), {
    ...payload,
    notificationUpdatedAt: nowISO(),
  });
}

async function processMissedLog(deviceId, deviceData, logId, log) {
  const notificationKey = `${deviceId}/${logId}`;

  if (inProgressNotifications.has(notificationKey)) {
    return;
  }

  inProgressNotifications.add(notificationKey);

  try {
    console.log(`[NOTIFY] Sending Telegram alert for ${notificationKey}`);

    await markNotification(deviceId, logId, {
      notificationStatus: "sending",
    });

    const message = formatMissedDoseMessage(deviceId, deviceData, logId, log);

    await sendTelegramMessage(message);

    await markNotification(deviceId, logId, {
      notificationStatus: "sent",
      notificationChannel: "telegram",
      notificationSentAt: nowISO(),
      notificationError: "",
    });

    console.log(`[NOTIFY] Telegram alert sent for ${notificationKey}`);
  } catch (error) {
    console.error(`[NOTIFY] Failed for ${notificationKey}:`, error.message);

    await markNotification(deviceId, logId, {
      notificationStatus: "failed",
      notificationChannel: "telegram",
      notificationError: error.message,
    });
  } finally {
    inProgressNotifications.delete(notificationKey);
  }
}

function scanSchedules(deviceId, deviceData) {
  const schedules = deviceData.schedules || {};

  for (const [scheduleId, schedule] of Object.entries(schedules)) {
    if (scheduleShouldBeMissedByWatchdog(deviceData, schedule)) {
      createWatchdogMissedLog(deviceId, deviceData, scheduleId, schedule);
    }
  }
}

function scanMissedLogs(deviceId, deviceData) {
  const logs = deviceData.logs || {};

  for (const [logId, log] of Object.entries(logs)) {
    if (shouldNotify(log)) {
      processMissedLog(deviceId, deviceData, logId, log);
    }
  }
}

function scanDevices(devicesData) {
  for (const [deviceId, deviceData] of Object.entries(devicesData || {})) {
    scanSchedules(deviceId, deviceData);
    scanMissedLogs(deviceId, deviceData);
  }
}

async function scanOnce() {
  try {
    const snapshot = await get(ref(database, "devices"));
    const devicesData = snapshot.val() || {};

    scanDevices(devicesData);
  } catch (error) {
    console.error("[SCAN] Failed:", error.message);
  }
}

function startNotificationService() {
  console.log("[NOTIFY] MediTrack notification service started");
  console.log("[NOTIFY] Watching missed logs and offline schedules...");
  console.log(`[NOTIFY] Device stale threshold: ${DEVICE_STALE_SECONDS}s`);

  const devicesRef = ref(database, "devices");

  onValue(devicesRef, (snapshot) => {
    const devicesData = snapshot.val() || {};
    scanDevices(devicesData);
  });

  setInterval(scanOnce, SCAN_INTERVAL_MS);
  scanOnce();
}

startNotificationService();