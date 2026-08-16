import { useEffect, useMemo, useState } from "react";
import { onValue, push, ref, remove, set, update } from "firebase/database";
import { database } from "../firebase";
import {
  getCompartmentOptions,
  getDeviceDropdownLabel,
  getDeviceTitle,
  normalizeDeviceRecord,
} from "../utils/deviceData";
import {
  WEEKDAYS,
  addDays,
  formatLocalDate,
  hasSelectedWeekday,
  recurrenceSummary,
  selectedWeekdaysToObject,
} from "../utils/dateUtils";

function ScheduleManagementPage({ selectedDeviceId, onSelectDevice }) {
  const today = formatLocalDate();

  const [devices, setDevices] = useState([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [editingScheduleId, setEditingScheduleId] = useState("");

  const [time, setTime] = useState("");
  const [compartment, setCompartment] = useState("");
  const [recurrenceType, setRecurrenceType] = useState("once");
  const [runDate, setRunDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 4));
  const [selectedWeekdays, setSelectedWeekdays] = useState([]);

  useEffect(() => {
    const devicesRef = ref(database, "devices");

    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val() || {};

      const deviceList = Object.entries(data)
        .map(([deviceId, value]) => normalizeDeviceRecord(deviceId, value))
        .sort((left, right) => getDeviceTitle(left).localeCompare(getDeviceTitle(right)));

      setDevices(deviceList);

      if (!selectedDeviceId && deviceList.length > 0) {
        onSelectDevice(deviceList[0].id);
      }
    });

    return () => unsubscribe();
  }, [selectedDeviceId, onSelectDevice]);

  const selectedScheduleDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId),
    [devices, selectedDeviceId]
  );

  const allSchedules = useMemo(() => {
    if (!selectedScheduleDevice) return [];

    return Object.entries(selectedScheduleDevice.schedules || {})
      .map(([id, value]) => ({ id, ...value }))
      .sort((left, right) => String(left.time).localeCompare(String(right.time)));
  }, [selectedScheduleDevice]);

  const activeSchedules = allSchedules.filter((schedule) => {
    const status = String(schedule.status || "active").toLowerCase();
    return status !== "taken" && status !== "missed" && status !== "completed";
  });

  const compartmentOptions = useMemo(
    () => getCompartmentOptions(selectedScheduleDevice),
    [selectedScheduleDevice]
  );

  const selectedCompartment = compartment || compartmentOptions[0]?.id || "";

  const resetForm = () => {
    setMode("create");
    setEditingScheduleId("");
    setTime("");
    setCompartment("");
    setRecurrenceType("once");
    setRunDate(today);
    setStartDate(today);
    setEndDate(addDays(today, 4));
    setSelectedWeekdays([]);
  };

  const getSelectedWeekdaysFromObject = (weekdayObject = {}) => {
    return WEEKDAYS.filter((day) => weekdayObject[String(day.value)] === true).map(
      (day) => day.value
    );
  };

  const isScheduleRunning = (schedule) => {
    const runStatus = String(schedule?.currentRun?.status || "").toLowerCase();
    return runStatus === "due" || runStatus === "dispensing" || runStatus === "waiting";
  };

  const hasScheduleProcessedBefore = (schedule) => {
    return Boolean(schedule?.lastProcessedOccurrence);
  };

  const openAddSchedulePopup = () => {
    if (!selectedDeviceId || !selectedScheduleDevice) {
      alert("Please select a device first.");
      return;
    }

    if (compartmentOptions.length === 0) {
      alert("Please assign at least one pill to the selected device first.");
      return;
    }

    resetForm();
    setCompartment(compartmentOptions[0].id);
    setIsPopupOpen(true);
  };

  const openEditSchedulePopup = (schedule) => {
    if (isScheduleRunning(schedule)) {
      alert("This schedule is currently being processed by the device.");
      return;
    }

    const recurrence = schedule.recurrence || {};

    setMode("edit");
    setEditingScheduleId(schedule.id);
    setTime(schedule.time || "");
    setCompartment(String(schedule.compartment || ""));
    setRecurrenceType(recurrence.type || "once");
    setRunDate(recurrence.runDate || today);
    setStartDate(recurrence.startDate || today);
    setEndDate(recurrence.endDate || addDays(today, 4));
    setSelectedWeekdays(getSelectedWeekdaysFromObject(recurrence.weekdays || {}));
    setIsPopupOpen(true);
  };

  const closePopup = () => {
    setIsPopupOpen(false);
    resetForm();
  };

  const toggleWeekday = (dayValue) => {
    setSelectedWeekdays((current) => {
      if (current.includes(dayValue)) {
        return current.filter((day) => day !== dayValue);
      }

      return [...current, dayValue].sort();
    });
  };

  const selectEveryDay = () => {
    setSelectedWeekdays(WEEKDAYS.map((day) => day.value));
  };

  const clearDays = () => {
    setSelectedWeekdays([]);
  };

  const buildRecurrence = () => {
    if (recurrenceType === "once") {
      return {
        type: "once",
        runDate,
      };
    }

    if (recurrenceType === "weekly") {
      return {
        type: "weekly",
        weekdays: selectedWeekdaysToObject(selectedWeekdays),
        startDate,
        endDate: "",
      };
    }

    return {
      type: "range",
      weekdays: selectedWeekdaysToObject(selectedWeekdays),
      startDate,
      endDate,
    };
  };

  const validateForm = () => {
    if (!selectedDeviceId || !selectedScheduleDevice) {
      alert("Please select a device first.");
      return false;
    }

    if (!time) {
      alert("Time is required.");
      return false;
    }

    if (!selectedCompartment) {
      alert("Please select a compartment pill.");
      return false;
    }

    if (recurrenceType === "once" && !runDate) {
      alert("Please select the one-time run date.");
      return false;
    }

    if (
      (recurrenceType === "weekly" || recurrenceType === "range") &&
      !hasSelectedWeekday(selectedWeekdays)
    ) {
      alert("Please select at least one day.");
      return false;
    }

    if (recurrenceType === "range" && endDate < startDate) {
      alert("End date cannot be before start date.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    const selectedOption = compartmentOptions.find(
      (option) => option.id === selectedCompartment
    );

    if (!selectedOption) {
      alert("Invalid compartment selected.");
      return;
    }

    const payload = {
      medicineName: selectedOption.pillName,
      time,
      compartment: Number(selectedOption.compartmentNumber),
      allowedDelaySeconds: Number(selectedScheduleDevice.delaySeconds) || 30,
      enabled: true,
      status: "active",
      recurrence: buildRecurrence(),
      updatedAt: new Date().toISOString(),
    };

    if (mode === "edit" && editingScheduleId) {
      await update(
        ref(database, `devices/${selectedDeviceId}/schedules/${editingScheduleId}`),
        payload
      );

      closePopup();
      return;
    }

    const scheduleRef = push(ref(database, `devices/${selectedDeviceId}/schedules`));

    await set(scheduleRef, {
      ...payload,
      lastProcessedOccurrence: "",
      currentRun: null,
      createdAt: new Date().toISOString(),
    });

    closePopup();
  };

  const toggleEnabled = async (schedule) => {
    if (isScheduleRunning(schedule)) {
      alert("This schedule is currently being processed by the device.");
      return;
    }

    await update(ref(database, `devices/${selectedDeviceId}/schedules/${schedule.id}`), {
      enabled: !schedule.enabled,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteSchedule = async (schedule) => {
    if (isScheduleRunning(schedule)) {
      alert("This schedule is currently being processed by the device.");
      return;
    }

    if (hasScheduleProcessedBefore(schedule)) {
      alert("This schedule has already been processed at least once. Disable it instead of deleting it.");
      return;
    }

    const confirmed = window.confirm("Delete this schedule? This cannot be undone.");

    if (!confirmed) return;

    await remove(ref(database, `devices/${selectedDeviceId}/schedules/${schedule.id}`));
  };

  return (
    <section className="page-card page-layout">
      <div className="card">
        <div className="section-header">
          <div>
            <h2>Schedule Management</h2>
            <p>
              Select a dispenser by device name, then manage active medicine
              schedule templates. Completed dose history is available in Logs.
            </p>
          </div>

          <div className="section-actions">
            <select
              value={selectedDeviceId}
              onChange={(event) => {
                onSelectDevice(event.target.value);
                setCompartment("");
              }}
            >
              <option value="">Select device</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {getDeviceDropdownLabel(device)}
                </option>
              ))}
            </select>

            <button type="button" onClick={openAddSchedulePopup}>
              Add new schedule
            </button>
          </div>
        </div>

        {selectedScheduleDevice ? (
          <div className="device-summary">
            <span className="badge badge--selection">
              {getDeviceTitle(selectedScheduleDevice)}
            </span>
            <span className="badge badge--muted">
              Device ID: {selectedScheduleDevice.id}
            </span>
            <span className="badge badge--muted">
              Delay: {selectedScheduleDevice.delaySeconds} seconds
            </span>
            <span className="badge badge--muted">
              {compartmentOptions.length} assigned pill compartments
            </span>
          </div>
        ) : (
          <p>Select a device to view and add schedules.</p>
        )}
      </div>

      <div className="card">
        <h2>Active Schedules</h2>

        {activeSchedules.length === 0 ? (
          <p>No active schedules for this device.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Time</th>
                <th>Compartment</th>
                <th>Recurrence</th>
                <th>Last dose</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {activeSchedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td data-label="Medicine">{schedule.medicineName}</td>
                  <td data-label="Time">{schedule.time}</td>
                  <td data-label="Compartment">{schedule.compartment}</td>
                  <td data-label="Recurrence">
                    {recurrenceSummary(schedule.recurrence)}
                  </td>
                  <td data-label="Last dose">{schedule.lastDoseStatus || "-"}</td>
                  <td data-label="Enabled">
                    <button type="button" onClick={() => toggleEnabled(schedule)}>
                      {schedule.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                  <td data-label="Actions">
                    <div className="inline-buttons">
                      <button type="button" onClick={() => openEditSchedulePopup(schedule)}>
                        Edit
                      </button>

                      <button type="button" onClick={() => deleteSchedule(schedule)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isPopupOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card">
            <div className="section-header">
              <div>
                <h2>{mode === "edit" ? "Edit schedule" : "Add new schedule"}</h2>
                <p>
                  Schedule is for{" "}
                  <strong>{getDeviceTitle(selectedScheduleDevice)}</strong>.
                </p>
              </div>

              <button type="button" onClick={closePopup}>
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="management-form management-form--schedule">
              <label>Compartment pill</label>
              <select
                value={selectedCompartment}
                onChange={(event) => setCompartment(event.target.value)}
              >
                {compartmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.pillName} - Compartment {option.compartmentNumber}
                  </option>
                ))}
              </select>

              <label>Time</label>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />

              <label>Schedule type</label>
              <select
                value={recurrenceType}
                onChange={(event) => setRecurrenceType(event.target.value)}
              >
                <option value="once">One-time dose</option>
                <option value="weekly">Repeat weekly</option>
                <option value="range">Repeat within date range</option>
              </select>

              {recurrenceType === "once" && (
                <>
                  <label>Run date</label>
                  <input
                    type="date"
                    value={runDate}
                    onChange={(event) => setRunDate(event.target.value)}
                  />
                </>
              )}

              {(recurrenceType === "weekly" || recurrenceType === "range") && (
                <>
                  <label>Select days</label>

                  <div className="day-selector">
                    {WEEKDAYS.map((day) => (
                      <button
                        type="button"
                        key={day.value}
                        className={
                          selectedWeekdays.includes(day.value) ? "selected-day" : ""
                        }
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>

                  <div className="inline-buttons">
                    <button type="button" onClick={selectEveryDay}>
                      Every day
                    </button>
                    <button type="button" onClick={clearDays}>
                      Clear days
                    </button>
                  </div>

                  <label>Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </>
              )}

              {recurrenceType === "range" && (
                <>
                  <label>End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const newToday = formatLocalDate();
                      setStartDate(newToday);
                      setEndDate(addDays(newToday, 4));
                      selectEveryDay();
                    }}
                  >
                    Set next 5 days
                  </button>
                </>
              )}

              <button type="submit">
                {mode === "edit" ? "Update schedule" : "Create schedule"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default ScheduleManagementPage;