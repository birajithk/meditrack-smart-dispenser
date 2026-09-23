import { get, onValue, push, ref, update } from "firebase/database";
import { database } from "./firebase.js";
import { sendTelegramMessage } from "./telegram.js";

process.env.TZ = process.env.TZ || "Asia/Colombo";

const inProgressNotifications = new Set();
const inProgressWatchdogItems = new Set();
const inProgressPresenceItems = new Set();

const DEVICE_STALE_SECONDS = 180;
const DUE_EXTRA_GRACE_SECONDS = 60;
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

  if (Number.isFinite(delaySeconds) && delaySeconds >= 1) {
    return delaySeconds;
  }

  return 30;
}

function getScheduleDelaySeconds(deviceData, schedule) {
  const scheduleDelay = Number(schedule?.allowedDelaySeconds);

  if (Number.isFinite(scheduleDelay) && scheduleDelay >= 1) {
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

function hasLogForOccurrence(deviceData, occurrence) {
  const logs = deviceData.logs || {};
  return Object.values(logs).some((log) => log.occurrence === occurrence);
}

function isFinalScheduleStatus(status) {
  const normalized = String(status || "").toLowerCase();

  return normalized === "taken" ||
         normalized === "missed" ||
         normalized === "completed";
}

function shouldNotify(log) {
  const status = String(log?.status || "").toLowerCase();
  const notificationStatus = String(log?.notificationStatus || "").toLowerCase();

  return (
    status === "missed" &&
    (notificationStatus === "pending" || notificationStatus === "failed")
  );
}

async function markNotification(deviceId, logId, payload) {
  await update(ref(database, `devices/${deviceId}/logs/${logId}`), {
    ...payload,
    notificationUpdatedAt: nowISO(),
  });
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

function formatPresenceMessage(deviceId, deviceData, online) {
  const deviceName = getDeviceName(deviceId, deviceData);

  if (online) {
    return [
      "✅ <b>MediTrack Device Online</b>",
      "",
      `<b>Device:</b> ${escapeHtml(deviceName)}`,
      `<b>Device ID:</b> ${escapeHtml(deviceId)}`,
      `<b>State:</b> ${escapeHtml(deviceData?.status?.currentState || "UNKNOWN")}`,
      `<b>Last seen:</b> ${escapeHtml(deviceData?.status?.lastSeen || "-")}`,
    ].join("\n");
  }

  return [
    "🔴 <b>MediTrack Device Offline</b>",
    "",
    `<b>Device:</b> ${escapeHtml(deviceName)}`,
    `<b>Device ID:</b> ${escapeHtml(deviceId)}`,
    `<b>Last state:</b> ${escapeHtml(deviceData?.status?.currentState || "UNKNOWN")}`,
    `<b>Last seen:</b> ${escapeHtml(deviceData?.status?.lastSeen || "-")}`,
    "",
    "Please check power, Wi-Fi, or the medicine box connection.",
  ].join("\n");
}

async function processMissedLog(deviceId, deviceData, logId, log) {
  const notificationKey = `${deviceId}/${logId}`;

  if (inProgressNotifications.has(notificationKey)) {
    return;
  }

  inProgressNotifications.add(notificationKey);

  try {
    console.log(`[NOTIFY] Sending missed-dose alert for ${notificationKey}`);

    await markNotification(deviceId, logId, {
      notificationStatus: "sending",
    });

    await sendTelegramMessage(formatMissedDoseMessage(deviceId, deviceData, logId, log));

    await markNotification(deviceId, logId, {
      notificationStatus: "sent",
      notificationChannel: "telegram",
      notificationSentAt: nowISO(),
      notificationError: "",
    });

    console.log(`[NOTIFY] Missed-dose alert sent for ${notificationKey}`);
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

function scheduleShouldBeMissedByWatchdog(deviceData, schedule) {
  if (!schedule?.enabled) return false;

  const status = String(schedule.status || "active").toLowerCase();

  if (isFinalScheduleStatus(status)) {
    return false;
  }

  const currentRun = schedule.currentRun || {};
  const runStatus = String(currentRun.status || "").toLowerCase();

  const isRunning =
    runStatus === "due" ||
    runStatus === "indicating" ||
    runStatus === "waiting" ||
    runStatus === "dispensing"; // old compatibility

  // Important:
  // The watchdog should only handle schedules the ESP32 already started.
  // It should not create missed logs for normal future schedules.
  if (!isRunning) {
    return false;
  }

  if (isDeviceOnline(deviceData)) {
    return false;
  }

  const scheduledTime = schedule.time || "";
  const occurrence = currentRun.occurrence || "";

  if (!occurrence) {
    return false;
  }

  if (schedule.lastProcessedOccurrence === occurrence) {
    return false;
  }

  if (hasLogForOccurrence(deviceData, occurrence)) {
    return false;
  }

  const delaySeconds = getScheduleDelaySeconds(deviceData, schedule);
  const dueEpoch = Number(currentRun.dueAtEpoch || currentRun.updatedAtEpoch || 0);

  if (!dueEpoch) {
    return false;
  }

  const dueAgeSeconds = nowEpoch() - dueEpoch;

  return dueAgeSeconds >= delaySeconds + DUE_EXTRA_GRACE_SECONDS;
}

async function createWatchdogMissedLog(deviceId, deviceData, scheduleId, schedule) {
  const scheduledTime = schedule.time || "-";
  const currentRun = schedule.currentRun || {};
  const occurrence = currentRun.occurrence || "";

  if (!occurrence) {
    return;
  }

  const watchdogKey = `${deviceId}/${scheduleId}/${occurrence}`;

  if (inProgressWatchdogItems.has(watchdogKey)) return;
  if (hasLogForOccurrence(deviceData, occurrence)) return;

  inProgressWatchdogItems.add(watchdogKey);

  try {
    console.log(`[WATCHDOG] Creating missed log for ${watchdogKey}`);

    await push(ref(database, `devices/${deviceId}/logs`), {
      medicineName: schedule.medicineName || "Unknown",
      scheduledTime,
      actualTime: "Device offline / no response",
      status: "missed",
      compartment: schedule.compartment || "-",
      sensor: schedule.compartment ? `IR_${schedule.compartment}` : "-",
      occurrence,
      notificationStatus: "pending",
      createdAt: nowISO(),
      createdEpoch: nowEpoch(),
      source: "watchdog",
      reason: "Device stopped responding during active dose window",
    });

    const isOneTime = schedule?.recurrence?.type === "once";

    const scheduleUpdate = {
      lastProcessedOccurrence: occurrence,
      lastProcessedDate: todayKey(),
      lastProcessedAt: nowISO(),
      lastProcessedEpoch: nowEpoch(),
      currentRun: null,
      watchdogHandled: true,
      watchdogHandledAt: nowISO(),
      updatedAt: nowISO(),
    };

    if (isOneTime) {
      scheduleUpdate.status = "missed";
      scheduleUpdate.enabled = false;
      scheduleUpdate.completedAt = nowISO();
    } else {
      scheduleUpdate.status = "active";
      scheduleUpdate.enabled = true;
      scheduleUpdate.lastDoseStatus = "missed";
    }

    await update(ref(database, `devices/${deviceId}/schedules/${scheduleId}`), scheduleUpdate);

    console.log(`[WATCHDOG] Missed log created for ${watchdogKey}`);
  } catch (error) {
    console.error(`[WATCHDOG] Failed for ${watchdogKey}:`, error.message);
  } finally {
    inProgressWatchdogItems.delete(watchdogKey);
  }
}

async function processPresence(deviceId, deviceData) {
  const online = isDeviceOnline(deviceData);
  const presence = deviceData.presenceNotification || {};
  const lastKnownState = presence.lastKnownState || "";
  const nextState = online ? "online" : "offline";

  if (lastKnownState === nextState) {
    return;
  }

  const presenceKey = `${deviceId}/${lastKnownState || "initial"}-to-${nextState}`;

  if (inProgressPresenceItems.has(presenceKey)) {
    return;
  }

  inProgressPresenceItems.add(presenceKey);

  try {
    const shouldSendNotification = lastKnownState !== "";

    if (shouldSendNotification) {
      console.log(`[PRESENCE] Sending ${nextState} alert for ${deviceId}`);
      await sendTelegramMessage(formatPresenceMessage(deviceId, deviceData, online));
      console.log(`[PRESENCE] ${nextState} alert sent for ${deviceId}`);
    } else {
      console.log(`[PRESENCE] Initial presence state saved for ${deviceId}: ${nextState}`);
    }

    await update(ref(database, `devices/${deviceId}/presenceNotification`), {
      lastKnownState: nextState,
      lastStateChangedAt: nowISO(),
      lastNotificationChannel: shouldSendNotification ? "telegram" : "none",
      lastNotificationType: shouldSendNotification ? nextState : "initial_state",
      lastNotificationError: "",
    });
  } catch (error) {
    console.error(`[PRESENCE] Failed for ${deviceId}:`, error.message);

    await update(ref(database, `devices/${deviceId}/presenceNotification`), {
      lastNotificationError: error.message,
      lastFailedAt: nowISO(),
    });
  } finally {
    inProgressPresenceItems.delete(presenceKey);
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

function scanSchedules(deviceId, deviceData) {
  const schedules = deviceData.schedules || {};

  for (const [scheduleId, schedule] of Object.entries(schedules)) {
    if (scheduleShouldBeMissedByWatchdog(deviceData, schedule)) {
      createWatchdogMissedLog(deviceId, deviceData, scheduleId, schedule);
    }
  }
}

function scanDevices(devicesData) {
  for (const [deviceId, deviceData] of Object.entries(devicesData || {})) {
    processPresence(deviceId, deviceData);
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
  console.log("[NOTIFY] Watching missed doses, LED-guided intake runs, and device presence...");
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