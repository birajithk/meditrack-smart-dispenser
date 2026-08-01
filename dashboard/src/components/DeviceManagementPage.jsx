import { useEffect, useState } from "react";
import { get, onValue, ref, set, update } from "firebase/database";
import { database } from "../firebase";
import {
  DEFAULT_COMPARTMENT_COUNT,
  getCompartmentLabel,
  getDeviceTitle,
  isDeviceOnline,
  normalizeDeviceRecord,
} from "../utils/deviceData";

function createEmptyCompartmentState() {
  const state = {};

  for (
    let compartmentNumber = 1;
    compartmentNumber <= DEFAULT_COMPARTMENT_COUNT;
    compartmentNumber += 1
  ) {
    state[String(compartmentNumber)] = "";
  }

  return state;
}

function createBlankFormState() {
  return {
    deviceId: "",
    deviceName: "",
    delaySeconds: 30,
    compartments: createEmptyCompartmentState(),
  };
}

function DeviceManagementPage({
  selectedDeviceId,
  onSelectDevice,
  editDeviceRequestId,
  onEditRequestConsumed,
}) {
  const [devices, setDevices] = useState([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [editingDeviceId, setEditingDeviceId] = useState("");
  const [formState, setFormState] = useState(createBlankFormState());

  useEffect(() => {
    const devicesRef = ref(database, "devices");

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val() || {};

      const deviceList = Object.entries(data)
        .map(([deviceId, value]) => normalizeDeviceRecord(deviceId, value))
        .sort((left, right) => getDeviceTitle(left).localeCompare(getDeviceTitle(right)));

      setDevices(deviceList);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!editDeviceRequestId || devices.length === 0) return;

    const requestedDevice = devices.find((device) => device.id === editDeviceRequestId);

    if (requestedDevice) {
      openEditPopup(requestedDevice);
      onEditRequestConsumed();
    }
  }, [editDeviceRequestId, devices, onEditRequestConsumed]);

  const resetForm = () => {
    setFormState(createBlankFormState());
    setMode("create");
    setEditingDeviceId("");
  };

  const openCreatePopup = () => {
    resetForm();
    setIsPopupOpen(true);
  };

  const closePopup = () => {
    setIsPopupOpen(false);
    resetForm();
  };

  const openEditPopup = (device) => {
    const nextCompartments = createEmptyCompartmentState();

    for (
      let compartmentNumber = 1;
      compartmentNumber <= DEFAULT_COMPARTMENT_COUNT;
      compartmentNumber += 1
    ) {
      nextCompartments[String(compartmentNumber)] =
        device.compartments?.[String(compartmentNumber)]?.pillName || "";
    }

    setMode("edit");
    setEditingDeviceId(device.id);
    setFormState({
      deviceId: device.id,
      deviceName: device.deviceName || "",
      delaySeconds: device.delaySeconds || 30,
      compartments: nextCompartments,
    });
    setIsPopupOpen(true);
  };

  const validateDeviceId = (deviceId) => {
    return /^[A-Za-z0-9_-]+$/.test(deviceId);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const cleanedDeviceId = formState.deviceId.trim();
    const cleanedDeviceName = formState.deviceName.trim();

    if (!cleanedDeviceId) {
      alert("Device ID is required.");
      return;
    }

    if (!validateDeviceId(cleanedDeviceId)) {
      alert("Device ID can only contain letters, numbers, underscore, and hyphen.");
      return;
    }

    if (!cleanedDeviceName) {
      alert("Device name is required.");
      return;
    }

    const cleanedCompartments = {};

    for (
      let compartmentNumber = 1;
      compartmentNumber <= DEFAULT_COMPARTMENT_COUNT;
      compartmentNumber += 1
    ) {
      cleanedCompartments[String(compartmentNumber)] = {
        pillName: formState.compartments[String(compartmentNumber)]?.trim() || "",
      };
    }

    const payload = {
      deviceName: cleanedDeviceName,
      delaySeconds: Number(formState.delaySeconds) || 30,
      compartments: cleanedCompartments,
      updatedAt: new Date().toISOString(),
    };

    if (mode === "edit" && editingDeviceId) {
      await update(ref(database, `devices/${editingDeviceId}`), payload);
      onSelectDevice(editingDeviceId);
      closePopup();
      return;
    }

    const deviceRef = ref(database, `devices/${cleanedDeviceId}`);
    const existingSnapshot = await get(deviceRef);

    if (existingSnapshot.exists()) {
      alert("A device with this ID already exists.");
      return;
    }

    await set(deviceRef, {
      ...payload,
      status: {
        online: false,
        currentState: "NOT_CONNECTED",
        lastSeen: "Not available",
        lastSeenEpoch: 0,
      },
      createdAt: new Date().toISOString(),
    });

    onSelectDevice(cleanedDeviceId);
    closePopup();
  };

  return (
    <section className="page-card page-layout">
      <div className="card">
        <div className="section-header">
          <div>
            <h2>Registered Devices</h2>
            <p>
              Add the printed device ID from the physical dispenser, then give
              it a friendly name and assign pills to compartments.
            </p>
          </div>

          <button type="button" onClick={openCreatePopup}>
            Add new device
          </button>
        </div>

        {devices.length === 0 ? (
          <p>No devices registered yet.</p>
        ) : (
          <div className="device-grid">
            {devices.map((device) => {
              const online = isDeviceOnline(device.status);
              const isSelected = selectedDeviceId === device.id;

              return (
                <div
                  key={device.id}
                  className={`device-card device-card--list ${isSelected ? "selected" : ""}`}
                >
                  <div className="device-card__header">
                    <strong>{getDeviceTitle(device)}</strong>

                    <span
                      className={`status-chip ${
                        online ? "status-chip--online" : "status-chip--offline"
                      }`}
                    >
                      {online ? "Online" : "Offline"}
                    </span>
                  </div>

                  <span>Device ID: {device.id}</span>
                  <span>Delay: {device.delaySeconds} seconds</span>
                  <span>State: {device.status.currentState || "UNKNOWN"}</span>
                  <span>Last seen: {device.status.lastSeen || "Not available"}</span>

                  <div className="device-card__meta">
                    {Object.entries(device.compartments).map(
                      ([compartmentId, compartment]) => (
                        <span key={compartmentId} className="badge badge--muted">
                          {compartment.pillName
                            ? `${compartmentId}: ${compartment.pillName}`
                            : `Compartment ${compartmentId} empty`}
                        </span>
                      )
                    )}
                  </div>

                  <div className="device-card__footer">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDevice(device.id);
                        openEditPopup(device);
                      }}
                    >
                      Edit device
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isPopupOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card">
            <div className="section-header">
              <div>
                <h2>{mode === "edit" ? "Edit device" : "Add new device"}</h2>
                <p>
                  The Device ID must match the ID programmed into the ESP32
                  sketch and printed on the dispenser.
                </p>
              </div>

              <button type="button" onClick={closePopup}>
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="management-form">
              <label>Device ID</label>
              <input
                type="text"
                value={formState.deviceId}
                disabled={mode === "edit"}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    deviceId: event.target.value,
                  }))
                }
                placeholder="Example: device001"
              />

              <label>Device name</label>
              <input
                type="text"
                value={formState.deviceName}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    deviceName: event.target.value,
                  }))
                }
                placeholder="Example: Amma's medicine dispenser"
              />

              <label>Delay seconds for this device</label>
              <input
                type="number"
                min="1"
                value={formState.delaySeconds}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    delaySeconds: event.target.value,
                  }))
                }
              />

              <div className="compartment-editor">
                <div className="compartment-editor__header">
                  <h3>Compartment pills</h3>
                  <p>
                    Only compartments with a pill name will appear in schedule
                    creation.
                  </p>
                </div>

                <div className="compartment-grid">
                  {Array.from(
                    { length: DEFAULT_COMPARTMENT_COUNT },
                    (_, index) => index + 1
                  ).map((compartmentNumber) => (
                    <label key={compartmentNumber} className="compartment-field">
                      <span>
                        {getCompartmentLabel(
                          {
                            compartments: Object.fromEntries(
                              Object.entries(formState.compartments).map(
                                ([id, pillName]) => [id, { pillName }]
                              )
                            ),
                          },
                          compartmentNumber
                        )}
                      </span>

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

              <button type="submit">
                {mode === "edit" ? "Update device" : "Create device"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default DeviceManagementPage;