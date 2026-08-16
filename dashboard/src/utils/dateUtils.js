export const WEEKDAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
];

export function formatLocalDate(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function selectedWeekdaysToObject(selectedWeekdays) {
  const normalizedSelectedDays = selectedWeekdays.map((day) => Number(day));

  const result = {};

  WEEKDAYS.forEach((day) => {
    result[String(day.value)] = normalizedSelectedDays.includes(day.value);
  });

  return result;
}

export function hasSelectedWeekday(selectedWeekdays) {
  return selectedWeekdays.length > 0;
}

export function recurrenceSummary(recurrence) {
  if (!recurrence) return "No recurrence data";

  if (recurrence.type === "once") {
    return `Once on ${recurrence.runDate}`;
  }

  const selectedDays = WEEKDAYS.filter(
    (day) => recurrence.weekdays?.[String(day.value)] === true
  ).map((day) => day.short);

  const dayText = selectedDays.length > 0 ? selectedDays.join(", ") : "No days";

  if (recurrence.type === "weekly") {
    return `Repeats weekly on ${dayText}`;
  }

  if (recurrence.type === "range") {
    return `${dayText} from ${recurrence.startDate} to ${recurrence.endDate}`;
  }

  return "Unknown recurrence";
}