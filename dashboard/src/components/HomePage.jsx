import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { database } from "../firebase";
import {
  getDeviceTitle,
  getMissedDoseCount,
  isDeviceOnline,
  normalizeDeviceRecord,
} from "../utils/deviceData";

function HomePage({ selectedDeviceId, onSelectDevice, onOpenDevices, onOpenSchedules, onOpenLogs }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    const devicesRef = ref(database, "devices");

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val() || {};

      const deviceList = Object.entries(data)
        .map(([deviceId, value]) => normalizeDeviceRecord(deviceId, value))
        .sort((left, right) => left.id.localeCompare(right.id));

      setDevices(deviceList);

      if (!selectedDeviceId && deviceList.length > 0) {
        onSelectDevice(deviceList[0].id);
      }
    });

    return () => unsubscribe();
  }, [selectedDeviceId, onSelectDevice]);

  return (
    <section className="card page-card">
      <div className="section-header">
        <div>
          <h2>Current Device Statuses</h2>
          <p>
            Select a dispenser to edit its compartments, manage its schedules, or review its dose logs.
            Offline devices and missed doses are highlighted.
          </p>
        </div>
      </div>

      {devices.length === 0 ? (
        <p>No devices registered yet. Open the Devices page to add one.</p>
      ) : (
        <div className="device-grid device-grid--home">
          {devices.map((device) => {
            const online = isDeviceOnline(device.status);
            const missedDoseCount = getMissedDoseCount(device.logs);
            const isSelected = selectedDeviceId === device.id;

            return (
              <div
                key={device.id}
                className={`device-card device-card--home ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectDevice(device.id)}
              >
                <div className="device-card__header">
                  <strong>{getDeviceTitle(device)}</strong>
                  <span className={`status-chip ${online ? "status-chip--online" : "status-chip--offline"}`}>
                    {online ? "Online" : "Offline"}
                  </span>
                </div>

                {device.description ? <span>{device.description}</span> : <span>No description added</span>}

                <div className="device-card__meta">
                  <span>State: {device.status.currentState || "UNKNOWN"}</span>
                  <span>Last seen: {device.status.lastSeen || "Not available"}</span>
                </div>

                <div className="device-card__footer">
                  <span className="badge badge--selection">Missed doses: {missedDoseCount}</span>
                  <span className="badge badge--muted">Delay: {device.delaySeconds} seconds</span>
                </div>

                <div className="device-card__actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => onOpenDevices(device.id)}>
                    Edit device
                  </button>
                  <button type="button" onClick={() => onOpenSchedules(device.id)}>
                    Manage schedules
                  </button>
                  <button type="button" className="secondary-button" onClick={() => onOpenLogs(device.id)}>
                    View logs
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default HomePage;
