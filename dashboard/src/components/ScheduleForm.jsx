import { useState } from "react";
import { ref, push, set } from "firebase/database";
import { database } from "../firebase";
import {
  WEEKDAYS,
  addDays,
  formatLocalDate,
  hasSelectedWeekday,
  selectedWeekdaysToObject,
} from "../utils/dateUtils";

function ScheduleForm({ deviceId }) {
  const today = formatLocalDate();

  const [medicineName, setMedicineName] = useState("");
  const [time, setTime] = useState("");
  const [compartment, setCompartment] = useState(1);
  const [allowedDelaySeconds, setAllowedDelaySeconds] = useState(30);

  const [recurrenceType, setRecurrenceType] = useState("once");
  const [runDate, setRunDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 4));
  const [selectedWeekdays, setSelectedWeekdays] = useState([]);

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
    if (!deviceId) {
      alert("Please select a device first.");
      return false;
    }

    if (!medicineName.trim()) {
      alert("Medicine name is required.");
      return false;
    }

    if (!time) {
      alert("Time is required.");
      return false;
    }

    const compartmentNumber = Number(compartment);

    if (compartmentNumber < 1 || compartmentNumber > 3) {
      alert("Compartment must be between 1 and 3.");
      return false;
    }

    if (recurrenceType === "once" && !runDate) {
      alert("Please select the one-time date.");
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

    const scheduleRef = push(ref(database, `devices/${deviceId}/schedules`));

    await set(scheduleRef, {
      medicineName: medicineName.trim(),
      time,
      compartment: Number(compartment),
      allowedDelaySeconds: Number(allowedDelaySeconds),
      enabled: true,
      status: "pending",
      recurrence: buildRecurrence(),
      lastProcessedOccurrence: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setMedicineName("");
    setTime("");
    setCompartment(1);
    setAllowedDelaySeconds(30);
    setRecurrenceType("once");
    setRunDate(today);
    setStartDate(today);
    setEndDate(addDays(today, 4));
    setSelectedWeekdays([]);
  };

  return (
    <div className="card">
      <h2>Add Medicine Schedule</h2>

      <form onSubmit={handleSubmit}>
        <label>Medicine Name</label>
        <input
          type="text"
          value={medicineName}
          onChange={(event) => setMedicineName(event.target.value)}
          placeholder="Example: Vitamin A"
        />

        <label>Time</label>
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />

        <label>Compartment</label>
        <select
          value={compartment}
          onChange={(event) => setCompartment(event.target.value)}
        >
          <option value="1">Compartment 1</option>
          <option value="2">Compartment 2</option>
          <option value="3">Compartment 3</option>
        </select>

        <label>Allowed Delay Seconds</label>
        <input
          type="number"
          min="5"
          value={allowedDelaySeconds}
          onChange={(event) => setAllowedDelaySeconds(event.target.value)}
        />

        <label>Schedule Type</label>
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
            <label>Run Date</label>
            <input
              type="date"
              value={runDate}
              onChange={(event) => setRunDate(event.target.value)}
            />
          </>
        )}

        {(recurrenceType === "weekly" || recurrenceType === "range") && (
          <>
            <label>Select Days</label>

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
                Every Day
              </button>
              <button type="button" onClick={clearDays}>
                Clear Days
              </button>
            </div>

            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </>
        )}

        {recurrenceType === "range" && (
          <>
            <label>End Date</label>
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
              Set Next 5 Days
            </button>
          </>
        )}

        <button type="submit">Add Schedule</button>
      </form>
    </div>
  );
}

export default ScheduleForm;