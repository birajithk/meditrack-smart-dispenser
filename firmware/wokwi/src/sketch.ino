#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
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
// LED compartment pins
// =====================
const int LED_COMPARTMENT_1_PIN = 2;
const int LED_COMPARTMENT_2_PIN = 4;
const int LED_COMPARTMENT_3_PIN = 5;

// =====================
// IR sensor pins
// =====================
const int IR_COMPARTMENT_1_PIN = 18;
const int IR_COMPARTMENT_2_PIN = 19;
const int IR_COMPARTMENT_3_PIN = 21;

// =====================
// IR sensor behavior
// Many obstacle avoidance IR modules output LOW when object is detected.
// If your sensor works opposite, change this to false.
// =====================
const bool IR_ACTIVE_LOW = true;

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
const unsigned long DEVICE_CONFIG_REFRESH_INTERVAL_MS = 60000;
const unsigned long TIME_RESYNC_INTERVAL_MS = 60000;

const int MIN_ALLOWED_DELAY_SECONDS = 1;
const int DEFAULT_ALLOWED_DELAY_SECONDS = 30;

// Allows schedule to still trigger if Wokwi/Firebase/browser is slightly late.
const long SCHEDULE_TRIGGER_GRACE_SECONDS = 300;

unsigned long lastScheduleCheck = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastDeviceConfigRetry = 0;
unsigned long lastDeviceConfigRefresh = 0;
unsigned long lastTimeResync = 0;

bool isProcessingDose = false;
bool isDeviceRegistered = false;

String deviceName = "";
int deviceDelaySeconds = DEFAULT_ALLOWED_DELAY_SECONDS;
String currentDeviceState = "BOOTING";

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

String readJsonString(String response, String fallback) {
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    return fallback;
  }

  const char* value = doc.as<const char*>();

  if (value == nullptr) {
    return fallback;
  }

  return String(value);
}

int readJsonInt(String response, int fallback) {
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    return fallback;
  }

  if (!doc.is<int>()) {
    return fallback;
  }

  return doc.as<int>();
}

String readCompartmentPillName(JsonVariant compartmentsVariant, int compartment) {
  String key = String(compartment);

  // Firebase REST may return numeric children as an array.
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
    String pillName = compartmentObject[key.c_str()]["pillName"] | "";

    if (pillName != "") {
      return pillName;
    }
  }

  return "";
}

bool loadDeviceConfig() {
  String deviceNameResponse;
  int nameCode = firebaseGET("/devices/" + DEVICE_ID + "/deviceName", deviceNameResponse);

  if (nameCode != 200) {
    Serial.print("[DEVICE] Failed to read device name. HTTP=");
    Serial.println(nameCode);
    return false;
  }

  if (deviceNameResponse == "null") {
    Serial.println("[DEVICE] Device ID is not registered in Firebase yet.");
    Serial.print("[DEVICE] Register this device ID from dashboard: ");
    Serial.println(DEVICE_ID);
    return false;
  }

  deviceName = readJsonString(deviceNameResponse, DEVICE_ID);

  String delayResponse;
  int delayCode = firebaseGET("/devices/" + DEVICE_ID + "/delaySeconds", delayResponse);

  if (delayCode == 200 && delayResponse != "null") {
    deviceDelaySeconds = readJsonInt(delayResponse, DEFAULT_ALLOWED_DELAY_SECONDS);
  } else {
    deviceDelaySeconds = DEFAULT_ALLOWED_DELAY_SECONDS;
  }

  if (deviceDelaySeconds < MIN_ALLOWED_DELAY_SECONDS) {
    deviceDelaySeconds = DEFAULT_ALLOWED_DELAY_SECONDS;
  }

  String compartmentsResponse;
  int compartmentsCode = firebaseGET("/devices/" + DEVICE_ID + "/compartments", compartmentsResponse);

  DynamicJsonDocument compartmentsDoc(2048);

  if (compartmentsCode == 200 && compartmentsResponse != "null") {
    deserializeJson(compartmentsDoc, compartmentsResponse);
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

  JsonVariant compartments = compartmentsDoc.as<JsonVariant>();

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

void refreshDeviceConfigIfNeeded() {
  if (!isDeviceRegistered) {
    return;
  }

  unsigned long currentMillis = millis();

  if (currentMillis - lastDeviceConfigRefresh < DEVICE_CONFIG_REFRESH_INTERVAL_MS) {
    return;
  }

  Serial.println("[DEVICE] Refreshing device config...");
  loadDeviceConfig();
  lastDeviceConfigRefresh = currentMillis;
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
// LED functions
// =====================

int getLedPinForCompartment(int compartment) {
  if (compartment == 1) return LED_COMPARTMENT_1_PIN;
  if (compartment == 2) return LED_COMPARTMENT_2_PIN;
  if (compartment == 3) return LED_COMPARTMENT_3_PIN;

  return -1;
}

void turnOffAllCompartmentLeds() {
  digitalWrite(LED_COMPARTMENT_1_PIN, LOW);
  digitalWrite(LED_COMPARTMENT_2_PIN, LOW);
  digitalWrite(LED_COMPARTMENT_3_PIN, LOW);
}

bool turnOnCompartmentLed(int compartment) {
  int ledPin = getLedPinForCompartment(compartment);

  if (ledPin == -1) {
    Serial.print("[LED] Invalid compartment: ");
    Serial.println(compartment);
    turnOffAllCompartmentLeds();
    return false;
  }

  turnOffAllCompartmentLeds();

  digitalWrite(ledPin, HIGH);

  Serial.print("[LED] Compartment ");
  Serial.print(compartment);
  Serial.println(" LED ON");

  return true;
}

// =====================
// IR sensor functions
// =====================

int getIrPinForCompartment(int compartment) {
  if (compartment == 1) return IR_COMPARTMENT_1_PIN;
  if (compartment == 2) return IR_COMPARTMENT_2_PIN;
  if (compartment == 3) return IR_COMPARTMENT_3_PIN;

  return -1;
}

bool isIrObjectDetected(int compartment) {
  int irPin = getIrPinForCompartment(compartment);

  if (irPin == -1) {
    return false;
  }

  int rawValue = digitalRead(irPin);

  if (IR_ACTIVE_LOW) {
    return rawValue == LOW;
  }

  return rawValue == HIGH;
}

bool waitForPillRemoval(int compartment, int timeoutSeconds) {
  int irPin = getIrPinForCompartment(compartment);

  if (irPin == -1) {
    Serial.print("[SENSOR] Invalid IR compartment: ");
    Serial.println(compartment);
    return false;
  }

  Serial.print("[SENSOR] Waiting for pill removal from compartment ");
  Serial.print(compartment);
  Serial.print(" for ");
  Serial.print(timeoutSeconds);
  Serial.println(" seconds");

  bool initialDetected = isIrObjectDetected(compartment);

  Serial.print("[SENSOR] Initial object detected: ");
  Serial.println(initialDetected ? "yes" : "no");

  unsigned long startTime = millis();
  unsigned long timeoutMs = (unsigned long)timeoutSeconds * 1000;
  unsigned long lastDebugPrint = 0;

  while (millis() - startTime < timeoutMs) {
    maintainHeartbeat();

    bool currentDetected = isIrObjectDetected(compartment);

    if (millis() - lastDebugPrint >= 1000) {
      Serial.print("[SENSOR] Compartment ");
      Serial.print(compartment);
      Serial.print(" object detected: ");
      Serial.println(currentDetected ? "yes" : "no");

      lastDebugPrint = millis();
    }

    // Normal logic:
    // If pill was detected at start, removal means it is no longer detected.
    if (initialDetected && !currentDetected) {
      delay(150);

      if (!isIrObjectDetected(compartment)) {
        Serial.println("[SENSOR] Pill removal detected");
        return true;
      }
    }

    // Fallback:
    // If no object was detected at start, accept clear sensor activity.
    if (!initialDetected && currentDetected) {
      delay(150);

      if (isIrObjectDetected(compartment)) {
        Serial.println("[SENSOR] Compartment activity detected");
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

int resolveAllowedDelaySeconds(JsonObject schedule) {
  // Use latest device-level delay from Firebase.
  if (deviceDelaySeconds >= MIN_ALLOWED_DELAY_SECONDS) {
    return deviceDelaySeconds;
  }

  return DEFAULT_ALLOWED_DELAY_SECONDS;
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

bool isSelectedWeekday(JsonVariant weekdaysVariant, int day) {
  if (day < 0 || day > 6) {
    return false;
  }

  // Firebase REST may return numeric keys 0..6 as an array.
  JsonArray weekdayArray = weekdaysVariant.as<JsonArray>();

  if (!weekdayArray.isNull()) {
    return weekdayArray[day] | false;
  }

  JsonObject weekdayObject = weekdaysVariant.as<JsonObject>();

  if (!weekdayObject.isNull()) {
    String sundayBasedKey = String(day);

    if (weekdayObject.containsKey(sundayBasedKey.c_str())) {
      return weekdayObject[sundayBasedKey.c_str()] | false;
    }

    // Fallback for old Monday-based versions.
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

  return runStatus == "due" ||
         runStatus == "indicating" ||
         runStatus == "waiting";
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

void updateCurrentRunStatus(String scheduleId, String runStatus) {
  String payload = "{";
  payload += "\"status\":\"" + jsonEscape(runStatus) + "\",";
  payload += "\"updatedAt\":\"" + nowISO() + "\",";
  payload += "\"updatedAtEpoch\":" + String(nowEpoch());
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/schedules/" + scheduleId + "/currentRun", payload);

  Serial.print("[FIREBASE] Current run status ");
  Serial.print(runStatus);
  Serial.print(" HTTP=");
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
  payload += "\"currentRun\":null,";
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
  payload += "\"sensor\":\"IR_" + String(compartment) + "\",";
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
  Serial.print("[DOSE] Compartment: ");
  Serial.println(compartment);
  Serial.print("[DOSE] Occurrence: ");
  Serial.println(occurrence);
  Serial.print("[DOSE] Allowed delay seconds: ");
  Serial.println(allowedDelaySeconds);
  Serial.println("=================================");

  markScheduleDue(scheduleId, occurrence);

  updateDeviceStatus("INDICATING_COMPARTMENT");
  updateCurrentRunStatus(scheduleId, "indicating");

  bool ledStarted = turnOnCompartmentLed(compartment);

  if (!ledStarted) {
    turnOffAllCompartmentLeds();
    updateScheduleError(scheduleId, "Invalid compartment number", occurrence);
    updateDeviceStatus("ERROR");
    delay(500);
    updateDeviceStatus("IDLE");
    isProcessingDose = false;
    return;
  }

  updateDeviceStatus("WAITING_FOR_REMOVAL");
  updateCurrentRunStatus(scheduleId, "waiting");

  bool removed = waitForPillRemoval(compartment, allowedDelaySeconds);

  turnOffAllCompartmentLeds();

  String finalStatus = removed ? "taken" : "missed";

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

  pinMode(LED_COMPARTMENT_1_PIN, OUTPUT);
  pinMode(LED_COMPARTMENT_2_PIN, OUTPUT);
  pinMode(LED_COMPARTMENT_3_PIN, OUTPUT);

  pinMode(IR_COMPARTMENT_1_PIN, INPUT);
  pinMode(IR_COMPARTMENT_2_PIN, INPUT);
  pinMode(IR_COMPARTMENT_3_PIN, INPUT);

  turnOffAllCompartmentLeds();

  connectWiFi();
  setupTime();

  isDeviceRegistered = loadDeviceConfig();
  lastDeviceConfigRefresh = millis();

  if (isDeviceRegistered) {
    updateDeviceStatus("IDLE");
    lastHeartbeat = millis();
  }

  Serial.println("[SYSTEM] MediTrack LED-guided medicine box started");
  Serial.println("[SYSTEM] Compartment 1 LED: GPIO 2, IR: GPIO 18");
  Serial.println("[SYSTEM] Compartment 2 LED: GPIO 4, IR: GPIO 19");
  Serial.println("[SYSTEM] Compartment 3 LED: GPIO 5, IR: GPIO 21");
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
        lastDeviceConfigRefresh = millis();
      }

      lastDeviceConfigRetry = currentMillis;
    }

    return;
  }

  maintainHeartbeat();
  refreshDeviceConfigIfNeeded();

  if (currentMillis - lastScheduleCheck >= SCHEDULE_CHECK_INTERVAL_MS) {
    checkSchedules();
    lastScheduleCheck = currentMillis;
  }
}