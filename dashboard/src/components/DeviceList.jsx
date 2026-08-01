import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { database } from "../firebase";
import { isDeviceOnline } from "../utils/dateUtils";

function DeviceList({ selectedDeviceId, onSelectDevice }) {
  const [devices, setDevices] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const devicesRef = ref(database, "devices");

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val() || {};

      const deviceList = Object.entries(data).map(([id, value]) => ({
        id,
        deviceName: value.deviceName || id,
        deviceType: value.deviceType || "unknown",
        status: value.status || {},
      }));

      setDevices(deviceList);

      if (!selectedDeviceId && deviceList.length > 0) {
        onSelectDevice(deviceList[0].id);
      }
    });

    return () => unsubscribe();
  }, [selectedDeviceId, onSelectDevice]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((value) => value + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card">
      <h2>Devices</h2>

      {devices.length === 0 ? (
        <p>No devices registered yet.</p>
      ) : (
        <div className="device-grid">
          {devices.map((device) => {
            const online = isDeviceOnline(device.status);
            const isSelected = selectedDeviceId === device.id;

            return (
              <button
                key={device.id}
                className={`device-card ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectDevice(device.id)}
              >
                <strong>{device.deviceName}</strong>
                <span>{device.id}</span>
                <span>{online ? "Online" : "Offline"}</span>
                <span>State: {device.status.currentState || "UNKNOWN"}</span>
                <span>Last seen: {device.status.lastSeen || "Not available"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DeviceList;