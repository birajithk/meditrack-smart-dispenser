import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";

function DeviceStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const statusRef = ref(database, "devices/device001/status");

    const unsubscribe = onValue(statusRef, (snapshot) => {
      setStatus(snapshot.val());
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="card">
      <h2>Device Status</h2>

      {status ? (
        <>
          <p>
            <strong>Online:</strong> {status.online ? "Yes" : "No"}
          </p>
          <p>
            <strong>Current State:</strong> {status.currentState || "UNKNOWN"}
          </p>
          <p>
            <strong>Last Seen:</strong> {status.lastSeen || "Not available"}
          </p>
        </>
      ) : (
        <p>No device status available yet.</p>
      )}
    </div>
  );
}

export default DeviceStatus;