import { delay } from "../utils.js";

export class SimulatedMotor {
  constructor() {
    this.positions = {
      1: 0,
      2: 90,
      3: 180,
      4: 270,
    };
  }

  async openCompartment(compartment) {
    const angle = this.positions[compartment];

    if (angle === undefined) {
      throw new Error(`Invalid compartment: ${compartment}`);
    }

    console.log(`[MOTOR] Moving to compartment ${compartment} at ${angle} degrees`);
    await delay(1500);
    console.log(`[MOTOR] Compartment ${compartment} is now accessible`);
  }
}