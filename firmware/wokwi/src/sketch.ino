#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <time.h>

// =====================
// Wi-Fi config
// Only Wi-Fi details and DEVICE_ID change between devices.
// =====================
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// =====================
// Device config
// Print this ID on the physical dispenser.
// Caregiver adds the same ID in the dashboard.
// =====================
const String DEVICE_ID = "device001";

// =====================
// Firebase config
// =====================
const String FIREBASE_URL = "https://meditrack-smart-dispenser-default-rtdb.firebaseio.com";

// =====================
// Pin config
// =====================
const int SERVO_PIN = 18;
const int LED_PIN = 2;
const int BUZZER_PIN = 23;
const int PILL_SENSOR_PIN = 19;

// =====================
// Pill sensor config
// Wokwi pushbutton with INPUT_PULLUP:
// not pressed = HIGH
// pressed = LOW
// =====================
const bool PILL_SENSOR_ACTIVE_LOW = true;

// =====================
// Motor angle config
// 0 degrees is home/default.
// No pill compartment is assigned to 0 degrees.
// =====================
const int HOME_ANGLE = 0;
const int COMPARTMENT_1_ANGLE = 60;
const int COMPARTMENT_2_ANGLE = 120;
const int COMPARTMENT_3_ANGLE = 180;

// =====================
// Time config
// Sri Lanka = UTC + 5:30
// =====================
const long GMT_OFFSET_SECONDS = 5 * 3600 + 30 * 60;
const int DAYLIGHT_OFFSET_SECONDS = 0;

// =====================
// Runtime config
// =====================
const unsigned long SCHEDULE_CHECK_INTERVAL_MS = 3000;
const unsigned long HEARTBEAT_INTERVAL_MS = 10000;
const unsigned long DEVICE_CONFIG_RETRY_INTERVAL_MS = 10000;
const unsigned long TIME_RESYNC_INTERVAL_MS = 60000;
const unsigned long DEVICE_CONFIG_REFRESH_INTERVAL_MS = 60000;

const int MIN_ALLOWED_DELAY_SECONDS = 1;
const int DEFAULT_ALLOWED_DELAY_SECONDS = 30;
unsigned long lastDeviceConfigRefresh = 0;

// Helps Wokwi/Firebase if schedule check is late.
const long SCHEDULE_TRIGGER_GRACE_SECONDS = 300;

unsigned long lastScheduleCheck = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastDeviceConfigRetry = 0;
unsigned long lastTimeResync = 0;

bool isProcessingDose = false;
bool isDeviceRegistered = false;

String deviceName = "";
int deviceDelaySeconds = DEFAULT_ALLOWED_DELAY_SECONDS;
String currentDeviceState = "BOOTING";

Servo compartmentServo;

// =====================
// Utility helpers
// =====================

String firebasePath(String path) {
  return FIREBASE_URL + path + ".json";
}

String jsonEscape(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", "\\n");
  value.replace("\r", "\\r");
  return value;
}

String nowISO() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo, 1000)) {
    return "TIME_NOT_AVAILABLE";
  }

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", &timeinfo);
  return String(buffer);
}

long nowEpoch() {
  time_t now;
  time(&now);
  return (long)now;
}

String currentHHMM() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo, 1000)) {
    return "";
  }

  char buffer[6];
  strftime(buffer, sizeof(buffer), "%H:%M", &timeinfo);
  return String(buffer);
}

String todayKey() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo, 1000)) {
    return "";
  }

  char buffer[11];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d", &timeinfo);
  return String(buffer);
}

int currentWeekday() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo, 1000)) {
    return -1;
  }

  char buffer[2];
  strftime(buffer, sizeof(buffer), "%w", &timeinfo);
  return String(buffer).toInt();
}

String occurrenceKey(String scheduledTime) {
  return todayKey() + "_" + scheduledTime;
}

bool parseHHMM(String timeText, int& hour, int& minute) {
  if (timeText.length() != 5) return false;
  if (timeText.charAt(2) != ':') return false;

  hour = timeText.substring(0, 2).toInt();
  minute = timeText.substring(3, 5).toInt();

  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;

  return true;
}

long scheduledEpochToday(String scheduledTime) {
  int hour = 0;
  int minute = 0;

  if (!parseHHMM(scheduledTime, hour, minute)) {
    return 0;
  }

  struct tm timeinfo;

  if (!getLocalTime(&timeinfo, 1000)) {
    return 0;
  }

  timeinfo.tm_hour = hour;
  timeinfo.tm_min = minute;
  timeinfo.tm_sec = 0;

  return (long)mktime(&timeinfo);
}

int resolveAllowedDelaySeconds(JsonObject schedule) {
  if (deviceDelaySeconds >= MIN_ALLOWED_DELAY_SECONDS) {
    return deviceDelaySeconds;
  }

  return DEFAULT_ALLOWED_DELAY_SECONDS;
}

// =====================
// Firebase HTTP functions
// =====================

int firebaseGET(String path, String& response) {
  HTTPClient http;
  String url = firebasePath(path);

  http.begin(url);
  http.setTimeout(4000);

  int httpCode = http.GET();

  if (httpCode > 0) {
    response = http.getString();
  } else {
    response = "";
  }

  http.end();
  return httpCode;
}

int firebasePATCH(String path, String jsonPayload) {
  HTTPClient http;
  String url = firebasePath(path);

  http.begin(url);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.sendRequest("PATCH", jsonPayload);

  http.end();
  return httpCode;
}

int firebasePOST(String path, String jsonPayload) {
  HTTPClient http;
  String url = firebasePath(path);

  http.begin(url);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);

  http.end();
  return httpCode;
}

// =====================
// Time sync
// =====================

void setupTime() {
  configTime(GMT_OFFSET_SECONDS, DAYLIGHT_OFFSET_SECONDS, "pool.ntp.org", "time.nist.gov");

  Serial.print("[TIME] Waiting for NTP time");

  struct tm timeinfo;

  while (!getLocalTime(&timeinfo, 1000)) {
    delay(500);
    Serial.print(".");
  }

  lastTimeResync = millis();

  Serial.println();
  Serial.print("[TIME] Current time: ");
  Serial.println(currentHHMM());
}

void resyncTimeIfNeeded() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastTimeResync < TIME_RESYNC_INTERVAL_MS) {
    return;
  }

  configTime(GMT_OFFSET_SECONDS, DAYLIGHT_OFFSET_SECONDS, "pool.ntp.org", "time.nist.gov");

  struct tm timeinfo;

  if (getLocalTime(&timeinfo, 1000)) {
    lastTimeResync = currentMillis;
    Serial.print("[TIME] Resynced time: ");
    Serial.println(currentHHMM());
  } else {
    Serial.println("[TIME] Resync failed");
  }
}

// =====================
// Wi-Fi
// =====================

void connectWiFi() {
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("[WIFI] Connected");
  Serial.print("[WIFI] IP: ");
  Serial.println(WiFi.localIP());
}

// =====================
// Device config from Firebase
// =====================

String readCompartmentPillName(JsonVariant compartmentsVariant, int compartment) {
  String key = String(compartment);

  // Firebase REST sometimes returns numeric children as an array.
  JsonArray compartmentArray = compartmentsVariant.as<JsonArray>();

  if (!compartmentArray.isNull()) {
    String pillName = compartmentArray[compartment]["pillName"] | "";

    if (pillName != "") {
      return pillName;
    }
  }

  // Normal object format:
  // compartments: { "1": { "pillName": "Vitamin A" } }
  JsonObject compartmentObject = compartmentsVariant.as<JsonObject>();

  if (!compartmentObject.isNull()) {
    String pillName = compartmentObject[key]["pillName"] | "";

    if (pillName != "") {
      return pillName;
    }
  }

  return "";
}

bool loadDeviceConfig() {
  String response;
  int code = firebaseGET("/devices/" + DEVICE_ID, response);

  if (code != 200) {
    Serial.print("[DEVICE] Failed to read device config. HTTP=");
    Serial.println(code);
    return false;
  }

  if (response == "null") {
    Serial.println("[DEVICE] Device ID is not registered in Firebase yet.");
    Serial.print("[DEVICE] Register this device ID from dashboard: ");
    Serial.println(DEVICE_ID);
    return false;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("[DEVICE] Failed to parse device config: ");
    Serial.println(error.c_str());
    return false;
  }

  deviceName = doc["deviceName"] | DEVICE_ID;
  deviceDelaySeconds = doc["delaySeconds"] | DEFAULT_ALLOWED_DELAY_SECONDS;

  if (deviceDelaySeconds < MIN_ALLOWED_DELAY_SECONDS) {
    deviceDelaySeconds = DEFAULT_ALLOWED_DELAY_SECONDS;
  }

  Serial.println();
  Serial.println("=================================");
  Serial.println("[DEVICE] Device config loaded");
  Serial.print("[DEVICE] Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("[DEVICE] Device name: ");
  Serial.println(deviceName);
  Serial.print("[DEVICE] Default delay seconds: ");
  Serial.println(deviceDelaySeconds);

  JsonVariant compartments = doc["compartments"];

  for (int compartment = 1; compartment <= 3; compartment++) {
    String pillName = readCompartmentPillName(compartments, compartment);

    Serial.print("[DEVICE] Compartment ");
    Serial.print(compartment);
    Serial.print(": ");
    Serial.println(pillName == "" ? "Empty" : pillName);
  }

  Serial.println("=================================");
  Serial.println();

  return true;
}

// =====================
// Device status / heartbeat
// =====================

void updateDeviceStatus(String state) {
  currentDeviceState = state;

  String payload = "{";
  payload += "\"online\":true,";
  payload += "\"currentState\":\"" + jsonEscape(state) + "\",";
  payload += "\"lastSeen\":\"" + nowISO() + "\",";
  payload += "\"lastSeenEpoch\":" + String(nowEpoch());
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/status", payload);

  Serial.print("[FIREBASE] Status update ");
  Serial.print(state);
  Serial.print(" HTTP=");
  Serial.println(code);
}

void maintainHeartbeat() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    updateDeviceStatus(currentDeviceState);
    lastHeartbeat = currentMillis;
  }
}

// =====================
// Alert functions
// =====================

void startAlert() {
  digitalWrite(LED_PIN, HIGH);

  // Do not use tone() here.
  // tone() can interfere with ESP32Servo PWM/LEDC in Wokwi and sometimes real ESP32.
  digitalWrite(BUZZER_PIN, HIGH);

  Serial.println("[ALERT] LED and buzzer ON");
}

void stopAlert() {
  digitalWrite(LED_PIN, LOW);

  // Do not use noTone() because we are not using tone().
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("[ALERT] LED and buzzer OFF");
}

// =====================
// Motor functions
// =====================

int compartmentToAngle(int compartment) {
  if (compartment == 1) return COMPARTMENT_1_ANGLE;
  if (compartment == 2) return COMPARTMENT_2_ANGLE;
  if (compartment == 3) return COMPARTMENT_3_ANGLE;

  return HOME_ANGLE;
}

void returnToHome() {
  Serial.println("[MOTOR] Returning to home position at 0 degrees");
  compartmentServo.write(HOME_ANGLE);
  delay(1000);
  maintainHeartbeat();
}

bool openCompartment(int compartment) {
  if (compartment < 1 || compartment > 3) {
    Serial.print("[MOTOR] Invalid compartment: ");
    Serial.println(compartment);
    returnToHome();
    return false;
  }

  int angle = compartmentToAngle(compartment);

  Serial.print("[MOTOR] Opening compartment ");
  Serial.print(compartment);
  Serial.print(" at angle ");
  Serial.println(angle);

  compartmentServo.write(angle);
  delay(1200);
  maintainHeartbeat();

  Serial.println("[MOTOR] Compartment position reached");
  return true;
}

// =====================
// Pill sensor functions
// =====================

bool isPillSensorActive() {
  int rawValue = digitalRead(PILL_SENSOR_PIN);

  if (PILL_SENSOR_ACTIVE_LOW) {
    return rawValue == LOW;
  }

  return rawValue == HIGH;
}

bool waitForPillRemoval(int timeoutSeconds) {
  Serial.print("[SENSOR] Waiting for pill removal for ");
  Serial.print(timeoutSeconds);
  Serial.println(" seconds");

  Serial.println("[SENSOR] Press the button now to simulate pill removal.");

  unsigned long startTime = millis();
  unsigned long timeoutMs = (unsigned long)timeoutSeconds * 1000;
  unsigned long lastDebugPrint = 0;

  int previousRawValue = digitalRead(PILL_SENSOR_PIN);

  Serial.print("[SENSOR] Initial raw value: ");
  Serial.println(previousRawValue);

  while (millis() - startTime < timeoutMs) {
    maintainHeartbeat();

    int rawValue = digitalRead(PILL_SENSOR_PIN);

    if (rawValue != previousRawValue) {
      Serial.print("[SENSOR] Raw value changed: ");
      Serial.println(rawValue);
      previousRawValue = rawValue;
    }

    if (millis() - lastDebugPrint >= 1000) {
      Serial.print("[SENSOR] Current raw value: ");
      Serial.print(rawValue);
      Serial.print(" active=");
      Serial.println(isPillSensorActive() ? "yes" : "no");

      lastDebugPrint = millis();
    }

    if (isPillSensorActive()) {
      delay(120);

      if (isPillSensorActive()) {
        Serial.println("[SENSOR] Pill removal detected");
        return true;
      }
    }

    delay(100);
  }

  Serial.println("[SENSOR] Pill not removed before timeout");
  return false;
}

// =====================
// Schedule matching
// =====================

bool isSelectedWeekday(JsonVariant weekdaysVariant, int day) {
  if (day < 0 || day > 6) {
    return false;
  }

  // Firebase REST may return numeric keys 0..6 as a JSON array.
  JsonArray weekdayArray = weekdaysVariant.as<JsonArray>();

  if (!weekdayArray.isNull()) {
    return weekdayArray[day] | false;
  }

  // Normal object format:
  // "weekdays": { "0": true, "1": true, ... }
  JsonObject weekdayObject = weekdaysVariant.as<JsonObject>();

  if (!weekdayObject.isNull()) {
    String sundayBasedKey = String(day);

    if (weekdayObject.containsKey(sundayBasedKey.c_str())) {
      return weekdayObject[sundayBasedKey.c_str()] | false;
    }

    // Fallback for old Monday-based schedules.
    int mondayBasedDay = (day + 6) % 7;
    String mondayBasedKey = String(mondayBasedDay);

    if (weekdayObject.containsKey(mondayBasedKey.c_str())) {
      bool selected = weekdayObject[mondayBasedKey.c_str()] | false;

      if (selected) {
        Serial.println("[SCHEDULE] Weekday matched using fallback numbering");
        return true;
      }
    }

    const char* shortNames[] = {"sun", "mon", "tue", "wed", "thu", "fri", "sat"};
    const char* longNames[] = {
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday"
    };

    if (weekdayObject.containsKey(shortNames[day])) {
      return weekdayObject[shortNames[day]] | false;
    }

    if (weekdayObject.containsKey(longNames[day])) {
      return weekdayObject[longNames[day]] | false;
    }
  }

  return false;
}

bool dateIsWithinRange(String today, String startDate, String endDate) {
  if (startDate != "" && today < startDate) {
    return false;
  }

  if (endDate != "" && today > endDate) {
    return false;
  }

  return true;
}

bool recurrenceMatchesToday(JsonObject schedule) {
  String today = todayKey();
  int day = currentWeekday();

  JsonObject recurrence = schedule["recurrence"].as<JsonObject>();

  if (recurrence.isNull()) {
    return false;
  }

  String type = recurrence["type"] | "";

  if (type == "once") {
    String runDate = recurrence["runDate"] | "";
    return today == runDate;
  }

  if (type == "weekly") {
    String startDate = recurrence["startDate"] | "";
    JsonVariant weekdays = recurrence["weekdays"];

    bool withinRange = dateIsWithinRange(today, startDate, "");
    bool weekdaySelected = isSelectedWeekday(weekdays, day);

    return withinRange && weekdaySelected;
  }

  if (type == "range") {
    String startDate = recurrence["startDate"] | "";
    String endDate = recurrence["endDate"] | "";
    JsonVariant weekdays = recurrence["weekdays"];

    bool withinRange = dateIsWithinRange(today, startDate, endDate);
    bool weekdaySelected = isSelectedWeekday(weekdays, day);

    return withinRange && weekdaySelected;
  }

  return false;
}

bool scheduleIsDueNow(JsonObject schedule, int allowedDelaySeconds) {
  String scheduledTime = schedule["time"] | "";

  if (!recurrenceMatchesToday(schedule)) {
    return false;
  }

  long scheduledEpoch = scheduledEpochToday(scheduledTime);
  long currentEpoch = nowEpoch();

  if (scheduledEpoch <= 0 || currentEpoch <= 0) {
    return false;
  }

  if (currentEpoch < scheduledEpoch) {
    return false;
  }

  long graceWindow = SCHEDULE_TRIGGER_GRACE_SECONDS;

  if (allowedDelaySeconds + 120 > graceWindow) {
    graceWindow = allowedDelaySeconds + 120;
  }

  if (currentEpoch > scheduledEpoch + graceWindow) {
    return false;
  }

  return true;
}

// =====================
// helper for schedules
// =====================

bool isOneTimeSchedule(JsonObject schedule) {
  JsonObject recurrence = schedule["recurrence"].as<JsonObject>();

  if (recurrence.isNull()) {
    return false;
  }

  String type = recurrence["type"] | "";
  return type == "once";
}

bool isScheduleCurrentlyRunning(JsonObject schedule) {
  JsonObject currentRun = schedule["currentRun"].as<JsonObject>();

  if (currentRun.isNull()) {
    return false;
  }

  String runStatus = currentRun["status"] | "";
  return runStatus == "due" || runStatus == "dispensing" || runStatus == "waiting";
}

void updateCurrentRunStatus(String scheduleId, String runStatus) {
  String payload = "{";
  payload += "\"currentRun\":{";
  payload += "\"status\":\"" + jsonEscape(runStatus) + "\",";
  payload += "\"updatedAt\":\"" + nowISO() + "\",";
  payload += "\"updatedAtEpoch\":" + String(nowEpoch());
  payload += "},";
  payload += "\"updatedAt\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/schedules/" + scheduleId, payload);

  Serial.print("[FIREBASE] Current run status ");
  Serial.print(runStatus);
  Serial.print(" HTTP=");
  Serial.println(code);
}

// =====================
// Schedule and log updates
// =====================

void markScheduleDue(String scheduleId, String occurrence) {
  String payload = "{";
  payload += "\"status\":\"active\",";
  payload += "\"currentRun\":{";
  payload += "\"status\":\"due\",";
  payload += "\"occurrence\":\"" + jsonEscape(occurrence) + "\",";
  payload += "\"dueAt\":\"" + nowISO() + "\",";
  payload += "\"dueAtEpoch\":" + String(nowEpoch());
  payload += "},";
  payload += "\"watchdogHandled\":false,";
  payload += "\"updatedAt\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/schedules/" + scheduleId, payload);

  Serial.print("[FIREBASE] Schedule ");
  Serial.print(scheduleId);
  Serial.print(" marked due HTTP=");
  Serial.println(code);
}

void finalizeScheduleStatus(String scheduleId, JsonObject schedule, String finalStatus, String occurrence) {
  bool oneTime = isOneTimeSchedule(schedule);

  String payload = "{";

  if (oneTime) {
    payload += "\"status\":\"" + jsonEscape(finalStatus) + "\",";
    payload += "\"enabled\":false,";
    payload += "\"completedAt\":\"" + nowISO() + "\",";
  } else {
    payload += "\"status\":\"active\",";
    payload += "\"enabled\":true,";
    payload += "\"lastDoseStatus\":\"" + jsonEscape(finalStatus) + "\",";
  }

  payload += "\"lastProcessedOccurrence\":\"" + jsonEscape(occurrence) + "\",";
  payload += "\"lastProcessedDate\":\"" + todayKey() + "\",";
  payload += "\"lastProcessedAt\":\"" + nowISO() + "\",";
  payload += "\"lastProcessedEpoch\":" + String(nowEpoch()) + ",";
  payload += "\"currentRun\":null,";
  payload += "\"watchdogHandled\":false,";
  payload += "\"updatedAt\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/schedules/" + scheduleId, payload);

  Serial.print("[FIREBASE] Schedule ");
  Serial.print(scheduleId);
  Serial.print(" finalized as ");
  Serial.print(finalStatus);
  Serial.print(" HTTP=");
  Serial.println(code);
}

void updateScheduleError(String scheduleId, String message, String occurrence) {
  String payload = "{";
  payload += "\"status\":\"error\",";
  payload += "\"lastError\":\"" + jsonEscape(message) + "\",";
  payload += "\"lastProcessedOccurrence\":\"" + jsonEscape(occurrence) + "\",";
  payload += "\"lastProcessedAt\":\"" + nowISO() + "\",";
  payload += "\"lastProcessedEpoch\":" + String(nowEpoch()) + ",";
  payload += "\"activeOccurrence\":\"\",";
  payload += "\"updatedAt\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/schedules/" + scheduleId, payload);

  Serial.print("[FIREBASE] Schedule error HTTP=");
  Serial.println(code);
}

void writeDoseLog(
  String medicineName,
  String scheduledTime,
  String actualTime,
  String status,
  int compartment,
  String occurrence
) {
  String notificationStatus = "not_required";

  if (status == "missed") {
    notificationStatus = "pending";
  }

  String payload = "{";
  payload += "\"medicineName\":\"" + jsonEscape(medicineName) + "\",";
  payload += "\"scheduledTime\":\"" + jsonEscape(scheduledTime) + "\",";
  payload += "\"actualTime\":\"" + jsonEscape(actualTime) + "\",";
  payload += "\"status\":\"" + jsonEscape(status) + "\",";
  payload += "\"compartment\":" + String(compartment) + ",";
  payload += "\"occurrence\":\"" + jsonEscape(occurrence) + "\",";
  payload += "\"notificationStatus\":\"" + notificationStatus + "\",";
  payload += "\"createdAt\":\"" + nowISO() + "\",";
  payload += "\"createdEpoch\":" + String(nowEpoch());
  payload += "}";

  int code = firebasePOST("/devices/" + DEVICE_ID + "/logs", payload);

  Serial.print("[FIREBASE] Dose log HTTP=");
  Serial.println(code);
}

// =====================
// Main dose process
// =====================

void processDose(String scheduleId, JsonObject schedule, String occurrence) {
  isProcessingDose = true;

  String medicineName = schedule["medicineName"] | "Unknown";
  String scheduledTime = schedule["time"] | "";
  int compartment = schedule["compartment"] | 1;
  int allowedDelaySeconds = resolveAllowedDelaySeconds(schedule);

  Serial.println();
  Serial.println("=================================");
  Serial.print("[DOSE] Device: ");
  Serial.println(deviceName);
  Serial.print("[DOSE] Processing: ");
  Serial.println(medicineName);
  Serial.print("[DOSE] Occurrence: ");
  Serial.println(occurrence);
  Serial.print("[DOSE] Allowed delay seconds: ");
  Serial.println(allowedDelaySeconds);
  Serial.println("=================================");

  markScheduleDue(scheduleId, occurrence);

  updateDeviceStatus("DISPENSING");
  updateCurrentRunStatus(scheduleId, "dispensing");

  bool compartmentOpened = openCompartment(compartment);

  if (!compartmentOpened) {
    stopAlert();
    returnToHome();
    updateScheduleError(scheduleId, "Invalid compartment number", occurrence);
    updateDeviceStatus("ERROR");
    delay(500);
    updateDeviceStatus("IDLE");
    isProcessingDose = false;
    return;
  }

  updateDeviceStatus("ALERTING");
  startAlert();

  updateDeviceStatus("WAITING_FOR_REMOVAL");
  updateCurrentRunStatus(scheduleId, "waiting");

  bool removed = waitForPillRemoval(allowedDelaySeconds);

  String finalStatus = removed ? "taken" : "missed";

  stopAlert();

  updateDeviceStatus("RETURNING_HOME");
  returnToHome();

  finalizeScheduleStatus(scheduleId, schedule, finalStatus, occurrence);
  writeDoseLog(medicineName, scheduledTime, currentHHMM(), finalStatus, compartment, occurrence);

  if (finalStatus == "missed") {
    updateDeviceStatus("MISSED");
  } else {
    updateDeviceStatus("TAKEN");
  }

  delay(500);
  updateDeviceStatus("IDLE");

  Serial.print("[DOSE] Completed with status: ");
  Serial.println(finalStatus);
  Serial.println();

  isProcessingDose = false;
}

// =====================
// Schedule checker
// =====================

void checkSchedules() {
  if (isProcessingDose || !isDeviceRegistered) {
    return;
  }

  resyncTimeIfNeeded();

  Serial.print("[SCHEDULE] Checking device schedules at ");
  Serial.println(currentHHMM());

  String response;
  int code = firebaseGET("/devices/" + DEVICE_ID + "/schedules", response);

  if (code != 200) {
    Serial.print("[FIREBASE] Failed to read schedules. HTTP=");
    Serial.println(code);
    return;
  }

  if (response == "null") {
    return;
  }

  DynamicJsonDocument doc(8192);
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("[JSON] Failed to parse schedules: ");
    Serial.println(error.c_str());
    return;
  }

  JsonObject schedules = doc.as<JsonObject>();

  for (JsonPair item : schedules) {
    String scheduleId = item.key().c_str();
    JsonObject schedule = item.value().as<JsonObject>();

    bool enabled = schedule["enabled"] | false;
    String status = schedule["status"] | "active";

    if (!enabled) {
      continue;
    }

    if (status == "taken" || status == "missed" || status == "completed") {
      continue;
    }

    String scheduledTime = schedule["time"] | "";
    String lastProcessedOccurrence = schedule["lastProcessedOccurrence"] | "";

    int allowedDelaySeconds = resolveAllowedDelaySeconds(schedule);
    String occurrence = occurrenceKey(scheduledTime);

    if (isScheduleCurrentlyRunning(schedule)) {
      continue;
    }

    if (lastProcessedOccurrence == occurrence) {
      continue;
    }

    if (!scheduleIsDueNow(schedule, allowedDelaySeconds)) {
      continue;
    }

    Serial.println();
    Serial.println("[SCHEDULE] Due schedule found");
    Serial.print("[SCHEDULE] Schedule ID: ");
    Serial.println(scheduleId);
    Serial.print("[SCHEDULE] Medicine: ");
    Serial.println(schedule["medicineName"] | "Unknown");
    Serial.print("[SCHEDULE] Time: ");
    Serial.println(scheduledTime);
    Serial.print("[SCHEDULE] Occurrence: ");
    Serial.println(occurrence);

    processDose(scheduleId, schedule, occurrence);
    return;
  }
}

// =====================
// Arduino setup and loop
// =====================

void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(PILL_SENSOR_PIN, INPUT_PULLUP);

  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  compartmentServo.attach(SERVO_PIN);
  compartmentServo.write(HOME_ANGLE);

  connectWiFi();
  setupTime();

  isDeviceRegistered = loadDeviceConfig();
  lastDeviceConfigRefresh = millis();

  if (isDeviceRegistered) {
    updateDeviceStatus("IDLE");
    lastHeartbeat = millis();
  }

  Serial.println("[SYSTEM] MediTrack virtual ESP32 started");
  Serial.println("[SYSTEM] Home angle: 0 degrees");
  Serial.println("[SYSTEM] Compartment 1: 60 degrees");
  Serial.println("[SYSTEM] Compartment 2: 120 degrees");
  Serial.println("[SYSTEM] Compartment 3: 180 degrees");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long currentMillis = millis();

  if (!isDeviceRegistered) {
    if (currentMillis - lastDeviceConfigRetry >= DEVICE_CONFIG_RETRY_INTERVAL_MS) {
      Serial.println("[DEVICE] Retrying device registration lookup...");
      isDeviceRegistered = loadDeviceConfig();

      if (isDeviceRegistered) {
        updateDeviceStatus("IDLE");
        lastHeartbeat = millis();
      }

      lastDeviceConfigRetry = currentMillis;
    }

    return;
  }

  maintainHeartbeat();
  // refreshDeviceConfigIfNeeded();

  if (currentMillis - lastScheduleCheck >= SCHEDULE_CHECK_INTERVAL_MS) {
    checkSchedules();
    lastScheduleCheck = currentMillis;
  }
}