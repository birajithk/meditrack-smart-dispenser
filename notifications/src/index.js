import { onValue, ref, update } from "firebase/database";
import { database } from "./firebase.js";
import { sendTelegramMessage } from "./telegram.js";

const inProgressNotifications = new Set();

function getDeviceName(deviceId, deviceData) {
  return deviceData?.deviceName?.trim() || deviceId;
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
    notificationUpdatedAt: new Date().toISOString(),
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
      notificationSentAt: new Date().toISOString(),
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

function scanDevices(devicesData) {
  for (const [deviceId, deviceData] of Object.entries(devicesData || {})) {
    const logs = deviceData.logs || {};

    for (const [logId, log] of Object.entries(logs)) {
      if (shouldNotify(log)) {
        processMissedLog(deviceId, deviceData, logId, log);
      }
    }
  }
}

function startNotificationService() {
  console.log("[NOTIFY] MediTrack notification service started");
  console.log("[NOTIFY] Watching Firebase for missed doses...");

  const devicesRef = ref(database, "devices");

  onValue(devicesRef, (snapshot) => {
    const devicesData = snapshot.val() || {};
    scanDevices(devicesData);
  });
}

startNotificationService();