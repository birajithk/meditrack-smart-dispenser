import { delay } from "../utils.js";

export class SimulatedAlert {
  async start() {
    console.log("[ALERT] Buzzer and LED started");
    await delay(500);
  }

  async stop() {
    console.log("[ALERT] Buzzer and LED stopped");
    await delay(300);
  }
}