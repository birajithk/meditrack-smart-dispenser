import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";

function DoseLogs({ deviceId }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!deviceId) return;

    const logsRef = ref(database, `devices/${deviceId}/logs`);

    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        setLogs([]);
        return;
      }

      const logList = Object.entries(data)
        .map(([id, value]) => ({
          id,
          ...value,
        }))
        .reverse();

      setLogs(logList);
    });

    return () => unsubscribe();
  }, [deviceId]);

  if (!deviceId) {
    return (
      <div className="card">
        <h2>Dose Logs</h2>
        <p>Select a device to view logs.</p>
      </div>
    );
  }

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
                <td data-label="Medicine">{log.medicineName}</td>
                <td data-label="Scheduled Time">{log.scheduledTime}</td>
                <td data-label="Actual Time">{log.actualTime || "-"}</td>
                <td data-label="Status">{log.status}</td>
                <td data-label="Compartment">{log.compartment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default DoseLogs;