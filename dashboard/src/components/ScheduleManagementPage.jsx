import { useEffect, useMemo, useState } from "react";
import { onValue, push, ref, set, update } from "firebase/database";
import { database } from "../firebase";
import {
  getCompartmentLabel,
  getCompartmentOptions,
  getDeviceTitle,
  isCompletedSchedule,
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
  const [time, setTime] = useState("");
  const [compartment, setCompartment] = useState("");
  const [recurrenceType, setRecurrenceType] = useState("once");
  const [runDate, setRunDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 4));
  const [selectedWeekdays, setSelectedWeekdays] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);

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

  const selectedScheduleDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId),
    [devices, selectedDeviceId]
  );

  const schedules = useMemo(() => {
    if (!selectedScheduleDevice) {
      return [];
    }

    return Object.entries(selectedScheduleDevice.schedules || {})
      .map(([id, value]) => ({ id, ...value }))
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")));
  }, [selectedScheduleDevice]);

  const activeSchedules = schedules.filter((schedule) => !isCompletedSchedule(schedule));
  const completedSchedules = schedules.filter((schedule) => isCompletedSchedule(schedule));
  const compartmentOptions = getCompartmentOptions(selectedScheduleDevice);
  const selectedCompartment = compartmentOptions.some((option) => option.id === compartment)
    ? compartment
    : "";

  const resetForm = () => {
    setTime("");
    setCompartment(compartmentOptions[0]?.id || "");
    setRecurrenceType("once");
    setRunDate(today);
    setStartDate(today);
    setEndDate(addDays(today, 4));
    setSelectedWeekdays([]);
  };

  const openAddSchedule = () => {
    if (!selectedDeviceId) {
      alert("Please select a device first.");
      return;
    }

    if (!compartmentOptions.length) {
      alert("Add pill names to the device compartments before creating schedules.");
      return;
    }

    resetForm();
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
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
    if (!selectedDeviceId) {
      alert("Please select a device first.");
      return false;
    }

    if (!time) {
      alert("Time is required.");
      return false;
    }

    if (!selectedCompartment) {
      alert("Select a compartment that already has a pill name.");
      return false;
    }

    if (recurrenceType === "once" && !runDate) {
      alert("Please select the one-time date.");
      return false;
    }

    if ((recurrenceType === "weekly" || recurrenceType === "range") && !hasSelectedWeekday(selectedWeekdays)) {
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

    const device = devices.find((entry) => entry.id === selectedDeviceId);
    const selectedOption = compartmentOptions.find((option) => option.id === selectedCompartment);
    const scheduleRef = push(ref(database, `devices/${selectedDeviceId}/schedules`));

    await set(scheduleRef, {
      medicineName: selectedOption?.pillName || getCompartmentLabel(device, selectedCompartment),
      time,
      compartment: Number(selectedCompartment),
      allowedDelaySeconds: Number(device?.delaySeconds) || 30,
      enabled: true,
      status: "pending",
      recurrence: buildRecurrence(),
      lastProcessedOccurrence: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    closeForm();
  };

  const toggleEnabled = async (schedule) => {
    await update(ref(database, `devices/${selectedDeviceId}/schedules/${schedule.id}`), {
      enabled: !schedule.enabled,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <section className="page-card page-layout">
      <div className="card">
        <div className="section-header">
          <div>
            <h2>Schedule Management</h2>
            <p>
              Select a device, then add schedules using the pill names already assigned in Device Management.
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
                  {getDeviceTitle(device)}
                </option>
              ))}
            </select>

            <button type="button" onClick={openAddSchedule}>Add new schedule</button>
          </div>
        </div>

        {selectedScheduleDevice ? (
          <div className="device-summary">
            <span className="badge badge--selection">{getDeviceTitle(selectedScheduleDevice)}</span>
            {selectedScheduleDevice.description ? (
              <span className="badge badge--muted">{selectedScheduleDevice.description}</span>
            ) : null}
            <span className="badge badge--muted">Delay: {selectedScheduleDevice.delaySeconds} seconds</span>
            <span className="badge badge--muted">
              {getCompartmentOptions(selectedScheduleDevice).length} schedulable compartments
            </span>
          </div>
        ) : (
          <p>Select a device to view and add schedules.</p>
        )}
      </div>

      <div className="card">
        <h2>Active schedules</h2>

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
                <th>Status</th>
                <th>Enabled</th>
              </tr>
            </thead>

            <tbody>
              {activeSchedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td data-label="Medicine">{schedule.medicineName}</td>
                  <td data-label="Time">{schedule.time}</td>
                  <td data-label="Compartment">{getCompartmentLabel(selectedScheduleDevice, schedule.compartment)}</td>
                  <td data-label="Recurrence">{recurrenceSummary(schedule.recurrence)}</td>
                  <td data-label="Status">{schedule.status}</td>
                  <td data-label="Enabled">
                    <button type="button" onClick={() => toggleEnabled(schedule)}>
                      {schedule.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Completed schedules</h2>

        {completedSchedules.length === 0 ? (
          <p>No completed one-time schedules for this device.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Time</th>
                <th>Compartment</th>
                <th>Recurrence</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {completedSchedules.map((schedule) => (
                <tr key={schedule.id} className={String(schedule.status).toLowerCase() === "missed" ? "row-missed" : ""}>
                  <td data-label="Medicine">{schedule.medicineName}</td>
                  <td data-label="Time">{schedule.time}</td>
                  <td data-label="Compartment">{getCompartmentLabel(selectedScheduleDevice, schedule.compartment)}</td>
                  <td data-label="Recurrence">{recurrenceSummary(schedule.recurrence)}</td>
                  <td data-label="Status">{schedule.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation" onClick={closeForm}>
          <div className="modal-card card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <h2>Add Schedule for {getDeviceTitle(selectedScheduleDevice)}</h2>
                <p>The medicine name is taken from the selected compartment pill.</p>
              </div>

              <button type="button" className="secondary-button" onClick={closeForm}>Close</button>
            </div>

            <form onSubmit={handleSubmit} className="management-form management-form--schedule">
              <label>Time</label>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />

              <label>Compartment pill</label>
              <select value={selectedCompartment} onChange={(event) => setCompartment(event.target.value)}>
                <option value="">Select allocated pill</option>
                {compartmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.pillName} - Compartment {option.compartmentNumber}
                  </option>
                ))}
              </select>

              <label>Schedule type</label>
              <select value={recurrenceType} onChange={(event) => setRecurrenceType(event.target.value)}>
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
                        className={selectedWeekdays.includes(day.value) ? "selected-day" : ""}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>

                  <div className="inline-buttons">
                    <button type="button" onClick={selectEveryDay}>Every day</button>
                    <button type="button" onClick={clearDays}>Clear days</button>
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

              <button type="submit">Add schedule</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default ScheduleManagementPage;
