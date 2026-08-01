import { useEffect, useState } from "react";
import { get, onValue, ref, set, update } from "firebase/database";
import { database } from "../firebase";
import {
  DEFAULT_COMPARTMENT_COUNT,
  getCompartmentLabel,
  getDeviceTitle,
  getNextDeviceId,
  isDeviceOnline,
  normalizeDeviceRecord,
} from "../utils/deviceData";

function createEmptyCompartmentState() {
  const state = {};

  for (let compartmentNumber = 1; compartmentNumber <= DEFAULT_COMPARTMENT_COUNT; compartmentNumber += 1) {
    state[String(compartmentNumber)] = "";
  }

  return state;
}

function createBlankFormState(nextDeviceId = "device001") {
  return {
    deviceId: nextDeviceId,
    description: "",
    delaySeconds: 30,
    compartments: createEmptyCompartmentState(),
  };
}

function isValidDeviceId(deviceId) {
  return /^[A-Za-z0-9_-]+$/.test(deviceId);
}

function DeviceManagementPage({ selectedDeviceId, onSelectDevice, onOpenSchedules }) {
  const [devices, setDevices] = useState([]);
  const [mode, setMode] = useState("create");
  const [editingDeviceId, setEditingDeviceId] = useState("");
  const [formState, setFormState] = useState(createBlankFormState());
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    const devicesRef = ref(database, "devices");

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val() || {};

      const deviceList = Object.entries(data)
        .map(([deviceId, value]) => normalizeDeviceRecord(deviceId, value))
        .sort((left, right) => left.id.localeCompare(right.id));

      setDevices(deviceList);
    });

    return () => unsubscribe();
  }, []);

  const closeForm = () => {
    setIsFormOpen(false);
    setMode("create");
    setEditingDeviceId("");
  };

  const loadDeviceIntoForm = (device) => {
    const nextCompartments = createEmptyCompartmentState();

    for (let compartmentNumber = 1; compartmentNumber <= DEFAULT_COMPARTMENT_COUNT; compartmentNumber += 1) {
      nextCompartments[String(compartmentNumber)] = device.compartments?.[String(compartmentNumber)]?.pillName || "";
    }

    setMode("edit");
    setEditingDeviceId(device.id);
    setFormState({
      deviceId: device.id,
      description: device.description || "",
      delaySeconds: device.delaySeconds || 30,
      compartments: nextCompartments,
    });
    setIsFormOpen(true);
  };

  const startNewDevice = () => {
    setMode("create");
    setEditingDeviceId("");
    setFormState(createBlankFormState(getNextDeviceId(devices)));
    setIsFormOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const cleanedDeviceId = formState.deviceId.trim();

    if (!cleanedDeviceId) {
      alert("Device ID is required.");
      return;
    }

    if (!isValidDeviceId(cleanedDeviceId)) {
      alert("Use only letters, numbers, hyphen, or underscore in the device ID.");
      return;
    }

    if (mode === "create") {
      const snapshot = await get(ref(database, `devices/${cleanedDeviceId}`));

      if (snapshot.exists()) {
        alert("This device ID already exists. Use another ID such as device002.");
        return;
      }
    }

    const cleanedCompartments = {};

    for (let compartmentNumber = 1; compartmentNumber <= DEFAULT_COMPARTMENT_COUNT; compartmentNumber += 1) {
      cleanedCompartments[String(compartmentNumber)] = {
        pillName: formState.compartments[String(compartmentNumber)]?.trim() || "",
      };
    }

    const previousDevice = devices.find((device) => device.id === editingDeviceId);

    const payload = {
      description: formState.description.trim(),
      delaySeconds: Number(formState.delaySeconds) || 30,
      compartments: cleanedCompartments,
      status: previousDevice?.status || {
        online: false,
        currentState: "NOT_CONNECTED",
        lastSeen: "Not connected yet",
        lastSeenEpoch: 0,
      },
      updatedAt: new Date().toISOString(),
    };

    if (mode === "edit" && editingDeviceId) {
      await update(ref(database, `devices/${editingDeviceId}`), payload);
      onSelectDevice(editingDeviceId);
      closeForm();
      return;
    }

    await set(ref(database, `devices/${cleanedDeviceId}`), {
      ...payload,
      createdAt: new Date().toISOString(),
    });

    onSelectDevice(cleanedDeviceId);
    closeForm();
  };

  return (
    <section className="page-card page-layout">
      <div className="card">
        <div className="section-header">
          <div>
            <h2>Registered Devices</h2>
            <p>
              Manage dispenser IDs, descriptions, default delay time, and the pill allocated to each of the three compartments.
            </p>
          </div>

          <button type="button" onClick={startNewDevice}>Add new device</button>
        </div>

        {devices.length === 0 ? (
          <p>No devices registered yet. Press Add new device to create one.</p>
        ) : (
          <div className="device-grid">
            {devices.map((device) => {
              const online = isDeviceOnline(device.status);
              const isSelected = selectedDeviceId === device.id;

              return (
                <div key={device.id} className={`device-card device-card--list ${isSelected ? "selected" : ""}`}>
                  <div className="device-card__header">
                    <strong>{getDeviceTitle(device)}</strong>
                    <span className={`status-chip ${online ? "status-chip--online" : "status-chip--offline"}`}>
                      {online ? "Online" : "Offline"}
                    </span>
                  </div>

                  {device.description ? <span>{device.description}</span> : <span>No description added</span>}
                  <span>Delay: {device.delaySeconds} seconds</span>
                  <span>State: {device.status.currentState || "UNKNOWN"}</span>
                  <span>Last seen: {device.status.lastSeen || "Not available"}</span>

                  <div className="device-card__meta">
                    {Object.entries(device.compartments).map(([compartmentId, compartment]) => (
                      <span key={compartmentId} className="badge badge--muted">
                        {compartment.pillName ? `${compartmentId}: ${compartment.pillName}` : `Compartment ${compartmentId} empty`}
                      </span>
                    ))}
                  </div>

                  <div className="device-card__actions">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDevice(device.id);
                        loadDeviceIntoForm(device);
                      }}
                    >
                      Edit device
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDevice(device.id);
                        onOpenSchedules(device.id);
                      }}
                    >
                      Manage schedules
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation" onClick={closeForm}>
          <div className="modal-card card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <h2>{mode === "edit" ? `Edit ${editingDeviceId}` : "Add New Device"}</h2>
                <p>
                  The device ID is also the Firebase device key. Program the ESP32 with the same ID so it writes to this device record.
                </p>
              </div>

              <button type="button" className="secondary-button" onClick={closeForm}>Close</button>
            </div>

            <form onSubmit={handleSubmit} className="management-form">
              <label>Device ID</label>
              <input
                type="text"
                value={formState.deviceId}
                disabled={mode === "edit"}
                onChange={(event) => setFormState((current) => ({ ...current, deviceId: event.target.value }))}
                placeholder="Example: device002"
              />

              <label>Device description</label>
              <input
                type="text"
                value={formState.description}
                onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                placeholder="Example: Boarding room dispenser"
              />

              <label>Delay seconds for this device</label>
              <input
                type="number"
                min="1"
                value={formState.delaySeconds}
                onChange={(event) => setFormState((current) => ({ ...current, delaySeconds: event.target.value }))}
              />

              <div className="compartment-editor">
                <div className="compartment-editor__header">
                  <h3>Compartment pills</h3>
                  <p>Schedule creation will use these pill names. Empty compartments will not be schedulable.</p>
                </div>

                <div className="compartment-grid">
                  {Array.from({ length: DEFAULT_COMPARTMENT_COUNT }, (_, index) => index + 1).map((compartmentNumber) => (
                    <label key={compartmentNumber} className="compartment-field">
                      <span>{getCompartmentLabel({ compartments: formState.compartments }, compartmentNumber)}</span>
                      <input
                        type="text"
                        value={formState.compartments[String(compartmentNumber)] || ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setFormState((current) => ({
                            ...current,
                            compartments: {
                              ...current.compartments,
                              [String(compartmentNumber)]: value,
                            },
                          }));
                        }}
                        placeholder={`Compartment ${compartmentNumber} pill name`}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {mode === "create" && (
                <div className="help-box">
                  <strong>ESP32 connection step</strong>
                  <p>
                    After creating this device, set the same ID in the ESP32 firmware:
                  </p>
                  <code>{`const String DEVICE_ID = "${formState.deviceId.trim() || "device002"}";`}</code>
                </div>
              )}

              <button type="submit">{mode === "edit" ? "Update device" : "Create device"}</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default DeviceManagementPage;
