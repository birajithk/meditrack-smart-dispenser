import {
  get,
  onValue,
  push,
  ref,
  set,
  update,
} from "firebase/database";

import { database, DEVICE_ID } from "./firebase.js";
import { currentHHMM, nowISO, todayKey } from "./utils.js";
import { SimulatedAlert } from "./drivers/SimulatedAlert.js";
import { SimulatedMotor } from "./drivers/SimulatedMotor.js";
import { SimulatedPillSensor } from "./drivers/SimulatedPillSensor.js";

const alert = new SimulatedAlert();
const motor = new SimulatedMotor();
const pillSensor = new SimulatedPillSensor(database, DEVICE_ID);

let schedules = {};
let isProcessingDose = false;

async function setDeviceStatus(currentState, online = true) {
  await update(ref(database, `devices/${DEVICE_ID}/status`), {
    online,
    currentState,
    lastSeen: nowISO(),
  });
}

async function initializeSimulationControl() {
  const controlRef = ref(database, `devices/${DEVICE_ID}/sim/control`);
  const snapshot = await get(controlRef);

  if (!snapshot.exists()) {
    await set(controlRef, {
      autoTake: true,
      pillRemoved: false,
    });
  }
}

function listenForSchedules() {
  const schedulesRef = ref(database, `devices/${DEVICE_ID}/schedules`);

  onValue(schedulesRef, (snapshot) => {
    schedules = snapshot.val() || {};
    console.log("[DATABASE] Schedules updated");
  });
}

function findDueSchedule() {
  const now = currentHHMM();
  const today = todayKey();

  for (const [scheduleId, schedule] of Object.entries(schedules)) {
    if (!schedule.enabled) continue;
    if (schedule.time !== now) continue;
    if (schedule.lastProcessedDate === today) continue;

    return {
      scheduleId,
      schedule,
    };
  }

  return null;
}

async function getAutoTakeMode() {
  const snapshot = await get(
    ref(database, `devices/${DEVICE_ID}/sim/control/autoTake`)
  );

  return snapshot.val() !== false;
}

async function writeDoseLog(schedule, status) {
  const logsRef = ref(database, `devices/${DEVICE_ID}/logs`);

  await push(logsRef, {
    medicineName: schedule.medicineName,
    scheduledTime: schedule.time,
    actualTime: currentHHMM(),
    status,
    compartment: schedule.compartment,
    createdAt: nowISO(),
  });
}

async function processDose(scheduleId, schedule) {
  isProcessingDose = true;

  const scheduleRef = ref(database, `devices/${DEVICE_ID}/schedules/${scheduleId}`);

  try {
    console.log(`\n[DOSE] Processing ${schedule.medicineName}`);

    await update(scheduleRef, {
      status: "due",
    });

    await setDeviceStatus("ALERTING");
    await alert.start();

    await setDeviceStatus("DISPENSING");
    await motor.openCompartment(Number(schedule.compartment));

    await setDeviceStatus("WAITING_FOR_REMOVAL");

    const autoTake = await getAutoTakeMode();
    const timeoutSeconds = Number(schedule.allowedDelaySeconds || 120);

    const pillRemoved = await pillSensor.waitForRemoval(timeoutSeconds, autoTake);

    const finalStatus = pillRemoved ? "taken" : "missed";

    await update(scheduleRef, {
      status: finalStatus,
      lastProcessedDate: todayKey(),
      lastProcessedAt: nowISO(),
    });

    await writeDoseLog(schedule, finalStatus);

    if (finalStatus === "missed") {
      await setDeviceStatus("MISSED");
      console.log("[NOTIFICATION] Caregiver notification will be added in Week 6");
    } else {
      await setDeviceStatus("TAKEN");
    }

    await alert.stop();
    await pillSensor.reset();

    await setDeviceStatus("IDLE");

    console.log(`[DOSE] Completed with status: ${finalStatus}\n`);
  } catch (error) {
    console.error("[ERROR] Dose processing failed:", error.message);

    await setDeviceStatus("ERROR");

    await update(scheduleRef, {
      status: "error",
      lastError: error.message,
      lastProcessedAt: nowISO(),
    });
  } finally {
    isProcessingDose = false;
  }
}

async function mainLoop() {
  if (isProcessingDose) return;

  const dueSchedule = findDueSchedule();

  if (dueSchedule) {
    await processDose(dueSchedule.scheduleId, dueSchedule.schedule);
  }
}

async function startSimulator() {
  console.log("Starting MediTrack Device Simulator...");
  console.log(`Device ID: ${DEVICE_ID}`);

  await initializeSimulationControl();
  await setDeviceStatus("IDLE", true);

  listenForSchedules();

  setInterval(() => {
    setDeviceStatus("IDLE", true).catch((error) => {
      console.error("[HEARTBEAT] Failed:", error.message);
    });
  }, 15000);

  setInterval(() => {
    mainLoop().catch((error) => {
      console.error("[MAIN LOOP] Failed:", error.message);
    });
  }, 1000);
}

startSimulator();