import { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { database } from "../firebase";

function ScheduleTable() {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    const schedulesRef = ref(database, "devices/device001/schedules");

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
  }, []);

  const toggleEnabled = async (schedule) => {
    await update(ref(database, `devices/device001/schedules/${schedule.id}`), {
      enabled: !schedule.enabled,
    });
  };

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
              <th>Status</th>
              <th>Enabled</th>
            </tr>
          </thead>

          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td>{schedule.medicineName}</td>
                <td>{schedule.time}</td>
                <td>{schedule.compartment}</td>
                <td>{schedule.status}</td>
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