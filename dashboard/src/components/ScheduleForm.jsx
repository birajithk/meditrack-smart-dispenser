import { useState } from "react";
import { ref, push, set } from "firebase/database";
import { database } from "../firebase";

function ScheduleForm() {
  const [medicineName, setMedicineName] = useState("");
  const [time, setTime] = useState("");
  const [compartment, setCompartment] = useState(1);
  const [allowedDelaySeconds, setAllowedDelaySeconds] = useState(120);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!medicineName || !time || !compartment) {
      alert("Please fill all required fields.");
      return;
    }

    const scheduleRef = push(ref(database, "devices/device001/schedules"));

    await set(scheduleRef, {
      medicineName,
      time,
      compartment: Number(compartment),
      allowedDelaySeconds: Number(allowedDelaySeconds),
      enabled: true,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    setMedicineName("");
    setTime("");
    setCompartment(1);
    setAllowedDelaySeconds(120);
  };

  return (
    <div className="card">
      <h2>Add Medicine Schedule</h2>

      <form onSubmit={handleSubmit}>
        <label>Medicine Name</label>
        <input
          type="text"
          value={medicineName}
          onChange={(e) => setMedicineName(e.target.value)}
          placeholder="Example: Vitamin C"
        />

        <label>Time</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />

        <label>Compartment</label>
        <select
          value={compartment}
          onChange={(e) => setCompartment(e.target.value)}
        >
          <option value="1">Compartment 1</option>
          <option value="2">Compartment 2</option>
          <option value="3">Compartment 3</option>
          <option value="4">Compartment 4</option>
        </select>

        <label>Allowed Delay Seconds</label>
        <input
          type="number"
          value={allowedDelaySeconds}
          onChange={(e) => setAllowedDelaySeconds(e.target.value)}
        />

        <button type="submit">Add Schedule</button>
      </form>
    </div>
  );
}

export default ScheduleForm;