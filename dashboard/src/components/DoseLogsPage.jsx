import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { database } from "../firebase";
import {
  getDeviceDropdownLabel,
  getDeviceTitle,
  isMissedLog,
  normalizeDeviceRecord,
} from "../utils/deviceData";

function formatLogDate(log) {
  if (log.createdEpoch) {
    return new Date(Number(log.createdEpoch) * 1000).toLocaleDateString();
  }

  if (log.createdAt) {
    return new Date(log.createdAt).toLocaleDateString();
  }

  return "-";
}

function formatLogTime(log) {
  if (log.createdEpoch) {
    return new Date(Number(log.createdEpoch) * 1000).toLocaleTimeString();
  }

  if (log.createdAt) {
    return new Date(log.createdAt).toLocaleTimeString();
  }

  return log.actualTime || "-";
}

function DoseLogsPage({ selectedDeviceId, onSelectDevice }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    const devicesRef = ref(database, "devices");

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val() || {};

      const deviceList = Object.entries(data)
        .map(([id, value]) => normalizeDeviceRecord(id, value))
        .sort((left, right) => getDeviceTitle(left).localeCompare(getDeviceTitle(right)));

      setDevices(deviceList);

      if (!selectedDeviceId && deviceList.length > 0) {
        onSelectDevice(deviceList[0].id);
      }
    });

    return () => unsubscribe();
  }, [selectedDeviceId, onSelectDevice]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId),
    [devices, selectedDeviceId]
  );

  const logs = useMemo(() => {
    if (!selectedDevice?.logs) return [];

    return Object.entries(selectedDevice.logs)
      .map(([id, value]) => ({ id, ...value }))
      .sort((left, right) => {
        const rightValue = Number(right.createdEpoch || 0);
        const leftValue = Number(left.createdEpoch || 0);

        if (rightValue !== leftValue) {
          return rightValue - leftValue;
        }

        return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
      });
  }, [selectedDevice]);

  return (
    <section className="page-card page-layout">
      <div className="card">
        <div className="section-header">
          <div>
            <h2>Dose Logs</h2>
            <p>
              Select a dispenser by device name to inspect dose history. Missed
              doses are highlighted.
            </p>
          </div>

          <div className="section-actions">
            <select
              value={selectedDeviceId}
              onChange={(event) => onSelectDevice(event.target.value)}
            >
              <option value="">Select device</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {getDeviceDropdownLabel(device)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedDevice ? (
          <div className="device-summary">
            <span className="badge badge--selection">
              {getDeviceTitle(selectedDevice)}
            </span>
            <span className="badge badge--muted">
              Device ID: {selectedDevice.id}
            </span>
          </div>
        ) : (
          <p>Select a device to view logs.</p>
        )}
      </div>

      <div className="card">
        <h2>Log entries</h2>

        {logs.length === 0 ? (
          <p>No dose logs yet for this device.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Log time</th>
                <th>Medicine</th>
                <th>Scheduled time</th>
                <th>Actual time</th>
                <th>Status</th>
                <th>Compartment</th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className={isMissedLog(log) ? "row-missed" : ""}>
                  <td data-label="Date">{formatLogDate(log)}</td>
                  <td data-label="Log time">{formatLogTime(log)}</td>
                  <td data-label="Medicine">{log.medicineName}</td>
                  <td data-label="Scheduled time">{log.scheduledTime}</td>
                  <td data-label="Actual time">{log.actualTime || "-"}</td>
                  <td data-label="Status">{log.status}</td>
                  <td data-label="Compartment">{log.compartment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default DoseLogsPage;