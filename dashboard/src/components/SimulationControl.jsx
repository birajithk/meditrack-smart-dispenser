import { useEffect, useState } from "react";
import { onValue, ref, set, update } from "firebase/database";
import { database } from "../firebase";

function SimulationControl() {
  const [control, setControl] = useState(null);

  useEffect(() => {
    const controlRef = ref(database, "devices/device001/sim/control");

    const unsubscribe = onValue(controlRef, (snapshot) => {
      setControl(snapshot.val());
    });

    return () => unsubscribe();
  }, []);

  const setAutoTake = async (value) => {
    await update(ref(database, "devices/device001/sim/control"), {
      autoTake: value,
    });
  };

  const simulatePillRemoved = async () => {
    await set(ref(database, "devices/device001/sim/control/pillRemoved"), true);
  };

  const resetPillSensor = async () => {
    await set(ref(database, "devices/device001/sim/control/pillRemoved"), false);
  };

  return (
    <div className="card">
      <h2>Simulation Control</h2>

      {control ? (
        <>
          <p>
            <strong>Auto Take:</strong> {control.autoTake ? "Enabled" : "Disabled"}
          </p>
          <p>
            <strong>Pill Removed:</strong> {control.pillRemoved ? "Yes" : "No"}
          </p>

          <button onClick={() => setAutoTake(true)}>Enable Auto Take</button>{" "}
          <button onClick={() => setAutoTake(false)}>Disable Auto Take</button>{" "}
          <button onClick={simulatePillRemoved}>Simulate Pill Removed</button>{" "}
          <button onClick={resetPillSensor}>Reset Sensor</button>
        </>
      ) : (
        <p>Simulation control not initialized yet. Start simulator first.</p>
      )}
    </div>
  );
}

export default SimulationControl;