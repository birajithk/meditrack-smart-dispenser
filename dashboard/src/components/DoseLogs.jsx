import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";

function DoseLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const logsRef = ref(database, "devices/device001/logs");

    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        setLogs([]);
        return;
      }

      const logList = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
      }));

      setLogs(logList.reverse());
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="card">
      <h2>Dose Logs</h2>

      {logs.length === 0 ? (
        <p>No dose logs yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Scheduled Time</th>
              <th>Actual Time</th>
              <th>Status</th>
              <th>Compartment</th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.medicineName}</td>
                <td>{log.scheduledTime}</td>
                <td>{log.actualTime || "-"}</td>
                <td>{log.status}</td>
                <td>{log.compartment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default DoseLogs;