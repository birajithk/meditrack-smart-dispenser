import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { getDeviceTitle, isDeviceOnline, normalizeDeviceRecord } from "../utils/deviceData";

function DeviceStatus({ deviceId }) {
  const [device, setDevice] = useState(null);

  useEffect(() => {
    if (!deviceId) return;

    const deviceRef = ref(database, `devices/${deviceId}`);

    const unsubscribe = onValue(deviceRef, (snapshot) => {
      setDevice(normalizeDeviceRecord(deviceId, snapshot.val() || {}));
    });

    return () => unsubscribe();
  }, [deviceId]);

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
        <strong>Device:</strong> {getDeviceTitle(device) || deviceId}
      </p>

      {device?.description ? (
        <p>
          <strong>Description:</strong> {device.description}
        </p>
      ) : null}

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
