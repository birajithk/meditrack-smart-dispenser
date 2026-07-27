#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// =====================
// Wi-Fi config for Wokwi
// =====================
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// =====================
// Firebase config
// =====================
const String FIREBASE_URL = "https://meditrack-smart-dispenser-default-rtdb.firebaseio.com";
const String DEVICE_ID = "device001";

// =====================
// Pin config
// =====================
const int SERVO_PIN = 18;
const int LED_PIN = 2;
const int BUZZER_PIN = 23;
const int PILL_SENSOR_PIN = 19;

// =====================
// Time config
// Sri Lanka = UTC + 5:30
// =====================
const long GMT_OFFSET_SECONDS = 5 * 3600 + 30 * 60;
const int DAYLIGHT_OFFSET_SECONDS = 0;

// =====================
// Runtime config
// =====================
const unsigned long SCHEDULE_CHECK_INTERVAL_MS = 5000;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;

unsigned long lastScheduleCheck = 0;
unsigned long lastHeartbeat = 0;
bool isProcessingDose = false;

Servo compartmentServo;

// =====================
// Helper functions
// =====================

String firebasePath(String path) {
  return FIREBASE_URL + path + ".json";
}

String nowISO() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo)) {
    return "TIME_NOT_AVAILABLE";
  }

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", &timeinfo);
  return String(buffer);
}

String currentHHMM() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo)) {
    return "";
  }

  char buffer[6];
  strftime(buffer, sizeof(buffer), "%H:%M", &timeinfo);
  return String(buffer);
}

String todayKey() {
  struct tm timeinfo;

  if (!getLocalTime(&timeinfo)) {
    return "";
  }

  char buffer[11];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d", &timeinfo);
  return String(buffer);
}

int firebaseGET(String path, String& response) {
  HTTPClient http;
  String url = firebasePath(path);

  http.begin(url);
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
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.sendRequest("PATCH", jsonPayload);

  http.end();
  return httpCode;
}

int firebasePOST(String path, String jsonPayload) {
  HTTPClient http;
  String url = firebasePath(path);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);

  http.end();
  return httpCode;
}

void updateDeviceStatus(String state) {
  String payload = "{";
  payload += "\"online\":true,";
  payload += "\"currentState\":\"" + state + "\",";
  payload += "\"lastSeen\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/status", payload);

  Serial.print("[FIREBASE] Status update ");
  Serial.print(state);
  Serial.print(" HTTP=");
  Serial.println(code);
}

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

void setupTime() {
  configTime(GMT_OFFSET_SECONDS, DAYLIGHT_OFFSET_SECONDS, "pool.ntp.org", "time.nist.gov");

  Serial.print("[TIME] Waiting for NTP time");

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("[TIME] Current time: ");
  Serial.println(currentHHMM());
}

void startAlert() {
  digitalWrite(LED_PIN, HIGH);
  tone(BUZZER_PIN, 1000);
  Serial.println("[ALERT] LED and buzzer ON");
}

void stopAlert() {
  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);
  Serial.println("[ALERT] LED and buzzer OFF");
}

int compartmentToAngle(int compartment) {
  if (compartment == 1) return 0;
  if (compartment == 2) return 60;
  if (compartment == 3) return 120;
  if (compartment == 4) return 180;

  return 0;
}

void openCompartment(int compartment) {
  int angle = compartmentToAngle(compartment);

  Serial.print("[MOTOR] Opening compartment ");
  Serial.print(compartment);
  Serial.print(" at angle ");
  Serial.println(angle);

  compartmentServo.write(angle);
  delay(1500);

  Serial.println("[MOTOR] Compartment position reached");
}

bool isPillRemoved() {
  // Button pressed = LOW because INPUT_PULLUP is used
  return digitalRead(PILL_SENSOR_PIN) == LOW;
}

bool waitForPillRemoval(int timeoutSeconds) {
  Serial.print("[SENSOR] Waiting for pill removal for ");
  Serial.print(timeoutSeconds);
  Serial.println(" seconds");

  unsigned long startTime = millis();
  unsigned long timeoutMs = (unsigned long)timeoutSeconds * 1000;

  while (millis() - startTime < timeoutMs) {
    if (isPillRemoved()) {
      Serial.println("[SENSOR] Pill removal detected");
      return true;
    }

    delay(250);
  }

  Serial.println("[SENSOR] Pill not removed before timeout");
  return false;
}

void writeDoseLog(String medicineName, String scheduledTime, String actualTime, String status, int compartment) {
  String payload = "{";
  payload += "\"medicineName\":\"" + medicineName + "\",";
  payload += "\"scheduledTime\":\"" + scheduledTime + "\",";
  payload += "\"actualTime\":\"" + actualTime + "\",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"compartment\":" + String(compartment) + ",";
  payload += "\"createdAt\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePOST("/devices/" + DEVICE_ID + "/logs", payload);

  Serial.print("[FIREBASE] Dose log HTTP=");
  Serial.println(code);
}

void updateScheduleStatus(String scheduleId, String status) {
  String payload = "{";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"lastProcessedDate\":\"" + todayKey() + "\",";
  payload += "\"lastProcessedAt\":\"" + nowISO() + "\"";
  payload += "}";

  int code = firebasePATCH("/devices/" + DEVICE_ID + "/schedules/" + scheduleId, payload);

  Serial.print("[FIREBASE] Schedule ");
  Serial.print(scheduleId);
  Serial.print(" status=");
  Serial.print(status);
  Serial.print(" HTTP=");
  Serial.println(code);
}

void processDose(String scheduleId, JsonObject schedule) {
  isProcessingDose = true;

  String medicineName = schedule["medicineName"] | "Unknown";
  String scheduledTime = schedule["time"] | "";
  int compartment = schedule["compartment"] | 1;
  int allowedDelaySeconds = schedule["allowedDelaySeconds"] | 30;

  Serial.println();
  Serial.println("=================================");
  Serial.print("[DOSE] Processing: ");
  Serial.println(medicineName);
  Serial.println("=================================");

  updateScheduleStatus(scheduleId, "due");

  updateDeviceStatus("ALERTING");
  startAlert();

  updateDeviceStatus("DISPENSING");
  openCompartment(compartment);

  updateDeviceStatus("WAITING_FOR_REMOVAL");
  bool removed = waitForPillRemoval(allowedDelaySeconds);

  String finalStatus = removed ? "taken" : "missed";

  updateScheduleStatus(scheduleId, finalStatus);
  writeDoseLog(medicineName, scheduledTime, currentHHMM(), finalStatus, compartment);

  if (finalStatus == "missed") {
    updateDeviceStatus("MISSED");
  } else {
    updateDeviceStatus("TAKEN");
  }

  stopAlert();

  delay(1000);
  updateDeviceStatus("IDLE");

  Serial.print("[DOSE] Completed with status: ");
  Serial.println(finalStatus);
  Serial.println();

  isProcessingDose = false;
}

void checkSchedules() {
  if (isProcessingDose) {
    return;
  }

  String response;
  int code = firebaseGET("/devices/" + DEVICE_ID + "/schedules", response);

  if (code != 200) {
    Serial.print("[FIREBASE] Failed to read schedules. HTTP=");
    Serial.println(code);
    return;
  }

  if (response == "null") {
    Serial.println("[SCHEDULE] No schedules found");
    return;
  }

  DynamicJsonDocument doc(8192);
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("[JSON] Failed to parse schedules: ");
    Serial.println(error.c_str());
    return;
  }

  String now = currentHHMM();
  String today = todayKey();

  Serial.print("[SCHEDULE] Checking schedules at ");
  Serial.println(now);

  JsonObject schedules = doc.as<JsonObject>();

  for (JsonPair item : schedules) {
    String scheduleId = item.key().c_str();
    JsonObject schedule = item.value().as<JsonObject>();

    bool enabled = schedule["enabled"] | false;
    String scheduledTime = schedule["time"] | "";
    String lastProcessedDate = schedule["lastProcessedDate"] | "";

    if (!enabled) {
      continue;
    }

    if (scheduledTime != now) {
      continue;
    }

    if (lastProcessedDate == today) {
      Serial.print("[SCHEDULE] Already processed today: ");
      Serial.println(scheduleId);
      continue;
    }

    processDose(scheduleId, schedule);
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
  noTone(BUZZER_PIN);

  compartmentServo.attach(SERVO_PIN);
  compartmentServo.write(0);

  connectWiFi();
  setupTime();

  updateDeviceStatus("IDLE");

  Serial.println("[SYSTEM] MediTrack virtual ESP32 started");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    updateDeviceStatus("IDLE");
    lastHeartbeat = now;
  }

  if (now - lastScheduleCheck >= SCHEDULE_CHECK_INTERVAL_MS) {
    checkSchedules();
    lastScheduleCheck = now;
  }
}