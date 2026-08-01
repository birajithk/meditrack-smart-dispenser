import { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { database } from "../firebase";
import { recurrenceSummary } from "../utils/dateUtils";

function ScheduleTable({ deviceId }) {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    if (!deviceId) return;

    const schedulesRef = ref(database, `devices/${deviceId}/schedules`);

    const unsubscribe = onValue(schedulesRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        setSchedules([]);
        return;
      }

      const scheduleList = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
      }));

      setSchedules(scheduleList);
    });

    return () => unsubscribe();
  }, [deviceId]);

  const toggleEnabled = async (schedule) => {
    await update(ref(database, `devices/${deviceId}/schedules/${schedule.id}`), {
      enabled: !schedule.enabled,
      updatedAt: new Date().toISOString(),
    });
  };

  if (!deviceId) {
    return (
      <div className="card">
        <h2>Medicine Schedules</h2>
        <p>Select a device to view schedules.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Medicine Schedules</h2>

      {schedules.length === 0 ? (
        <p>No schedules added yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Time</th>
              <th>Compartment</th>
              <th>Recurrence</th>
              <th>Status</th>
              <th>Enabled</th>
            </tr>
          </thead>

          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td data-label="Medicine">{schedule.medicineName}</td>
                <td data-label="Time">{schedule.time}</td>
                <td data-label="Compartment">{schedule.compartment}</td>
                <td data-label="Recurrence">
                  {recurrenceSummary(schedule.recurrence)}
                </td>
                <td data-label="Status">{schedule.status}</td>
                <td>
                  <button onClick={() => toggleEnabled(schedule)}>
                    {schedule.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ScheduleTable;