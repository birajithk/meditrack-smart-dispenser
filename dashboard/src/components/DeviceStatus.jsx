import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { isDeviceOnline } from "../utils/dateUtils";

function DeviceStatus({ deviceId }) {
  const [device, setDevice] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!deviceId) return;

    const deviceRef = ref(database, `devices/${deviceId}`);

    const unsubscribe = onValue(deviceRef, (snapshot) => {
      setDevice(snapshot.val());
    });

    return () => unsubscribe();
  }, [deviceId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((value) => value + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (!deviceId) {
    return (
      <div className="card">
        <h2>Selected Device Status</h2>
        <p>Select a device to view status.</p>
      </div>
    );
  }

  const status = device?.status || {};
  const online = isDeviceOnline(status);

  return (
    <div className="card">
      <h2>Selected Device Status</h2>

      <p>
        <strong>Device Name:</strong> {device?.deviceName || deviceId}
      </p>

      <p>
        <strong>Device ID:</strong> {deviceId}
      </p>

      <p>
        <strong>Online:</strong> {online ? "Yes" : "No"}
      </p>

      <p>
        <strong>Current State:</strong> {status.currentState || "UNKNOWN"}
      </p>

      <p>
        <strong>Last Seen:</strong> {status.lastSeen || "Not available"}
      </p>
    </div>
  );
}

export default DeviceStatus;