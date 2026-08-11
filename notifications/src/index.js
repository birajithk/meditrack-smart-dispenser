import { onValue, push, ref, update } from "firebase/database";
import { database } from "./firebase.js";
import { sendTelegramMessage } from "./telegram.js";

const inProgressNotifications = new Set();
const inProgressWatchdogItems = new Set();

const DEVICE_STALE_SECONDS = 180;
const DUE_EXTRA_GRACE_SECONDS = 60;

function nowISO() {
  return new Date().toISOString();
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function getDeviceName(deviceId, deviceData) {
  return deviceData?.deviceName?.trim() || deviceId;
}

function isDeviceOnline(deviceData) {
  const status = deviceData?.status || {};
  const lastSeenEpoch = Number(status.lastSeenEpoch);

  if (!lastSeenEpoch) return false;

  const ageSeconds = nowEpoch() - lastSeenEpoch;

  return status.online !== false && ageSeconds <= DEVICE_STALE_SECONDS;
}

function getDeviceDelaySeconds(deviceData) {
  const delaySeconds = Number(deviceData?.delaySeconds);

  if (Number.isFinite(delaySeconds) && delaySeconds >= 10) {
    return delaySeconds;
  }

  return 30;
}

function formatMissedDoseMessage(deviceId, deviceData, logId, log) {
  const deviceName = getDeviceName(deviceId, deviceData);

  return [
    "⚠️ <b>MediTrack Missed Dose Alert</b>",
    "",
    `<b>Device:</b> ${deviceName}`,
    `<b>Device ID:</b> ${deviceId}`,
    `<b>Medicine:</b> ${log.medicineName || "Unknown"}`,
    `<b>Compartment:</b> ${log.compartment || "-"}`,
    `<b>Scheduled time:</b> ${log.scheduledTime || "-"}`,
    `<b>Recorded time:</b> ${log.actualTime || "-"}`,
    `<b>Status:</b> Missed`,
    "",
    `<b>Log ID:</b> ${logId}`,
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
    console.log(`[NOTIFY] Sending missed-dose alert for ${notificationKey}`);

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

    console.log(`[NOTIFY] Sent missed-dose alert for ${notificationKey}`);
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

function hasLogForOccurrence(deviceData, occurrence) {
  const logs = deviceData.logs || {};

  return Object.values(logs).some((log) => log.occurrence === occurrence);
}

async function createWatchdogMissedLog(deviceId, deviceData, scheduleId, schedule) {
  const occurrence = schedule.lastProcessedOccurrence || "";
  const watchdogKey = `${deviceId}/${scheduleId}/${occurrence}`;

  if (!occurrence) return;

  if (inProgressWatchdogItems.has(watchdogKey)) {
    return;
  }

  if (hasLogForOccurrence(deviceData, occurrence)) {
    return;
  }

  inProgressWatchdogItems.add(watchdogKey);

  try {
    const logsRef = ref(database, `devices/${deviceId}/logs`);

    await push(logsRef, {
      medicineName: schedule.medicineName || "Unknown",
      scheduledTime: schedule.time || "-",
      actualTime: "Device offline",
      status: "missed",
      compartment: schedule.compartment || "-",
      occurrence,
      notificationStatus: "pending",
      createdAt: nowISO(),
      createdEpoch: nowEpoch(),
      source: "watchdog",
      reason: "Device stopped responding while schedule was due",
    });

    await update(ref(database, `devices/${deviceId}/schedules/${scheduleId}`), {
      status: "missed",
      watchdogHandled: true,
      watchdogHandledAt: nowISO(),
      updatedAt: nowISO(),
    });

    console.log(`[WATCHDOG] Marked stuck due schedule as missed: ${watchdogKey}`);
  } catch (error) {
    console.error(`[WATCHDOG] Failed for ${watchdogKey}:`, error.message);
  } finally {
    inProgressWatchdogItems.delete(watchdogKey);
  }
}

function scanStuckDueSchedules(deviceId, deviceData) {
  const deviceOnline = isDeviceOnline(deviceData);

  if (deviceOnline) {
    return;
  }

  const schedules = deviceData.schedules || {};
  const deviceDelaySeconds = getDeviceDelaySeconds(deviceData);

  for (const [scheduleId, schedule] of Object.entries(schedules)) {
    const status = String(schedule?.status || "").toLowerCase();

    if (status !== "due") {
      continue;
    }

    if (schedule.watchdogHandled === true) {
      continue;
    }

    const lastProcessedEpoch = Number(schedule.lastProcessedEpoch);

    if (!lastProcessedEpoch) {
      continue;
    }

    const ageSeconds = nowEpoch() - lastProcessedEpoch;
    const allowedAgeSeconds = deviceDelaySeconds + DUE_EXTRA_GRACE_SECONDS;

    if (ageSeconds >= allowedAgeSeconds) {
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
    scanStuckDueSchedules(deviceId, deviceData);
    scanMissedLogs(deviceId, deviceData);
  }
}

function startNotificationService() {
  console.log("[NOTIFY] MediTrack notification service started");
  console.log("[NOTIFY] Watching Firebase for missed doses and stuck due schedules...");

  const devicesRef = ref(database, "devices");

  onValue(devicesRef, (snapshot) => {
    const devicesData = snapshot.val() || {};
    scanDevices(devicesData);
  });

  setInterval(() => {
    onValue(
      devicesRef,
      (snapshot) => {
        const devicesData = snapshot.val() || {};
        scanDevices(devicesData);
      },
      {
        onlyOnce: true,
      }
    );
  }, 15000);
}

startNotificationService();