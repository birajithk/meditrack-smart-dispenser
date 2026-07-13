import { get, ref, set } from "firebase/database";
import { delay } from "../utils.js";

export class SimulatedPillSensor {
  constructor(database, deviceId) {
    this.database = database;
    this.deviceId = deviceId;
  }

  async reset() {
    await set(ref(this.database, `devices/${this.deviceId}/sim/control/pillRemoved`), false);
  }

  async waitForRemoval(timeoutSeconds, autoTake) {
    console.log(`[SENSOR] Waiting for pill removal for ${timeoutSeconds} seconds`);

    if (autoTake) {
      console.log("[SENSOR] Auto-take mode enabled. Simulating pill removal after 5 seconds.");
      await delay(5000);
      return true;
    }

    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const snapshot = await get(
        ref(this.database, `devices/${this.deviceId}/sim/control/pillRemoved`)
      );

      if (snapshot.val() === true) {
        console.log("[SENSOR] Pill removal detected");
        return true;
      }

      await delay(1000);
    }

    console.log("[SENSOR] Pill was not removed before timeout");
    return false;
  }
}