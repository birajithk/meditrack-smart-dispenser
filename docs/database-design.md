# Database Design

Firebase Realtime Database will be used to store schedules, device status, and dose logs.

## Proposed Data Structure

```json
{
  "devices": {
    "device001": {
      "status": {
        "online": true,
        "currentState": "IDLE",
        "lastSeen": "2026-07-13 10:30:00"
      },
      "schedules": {
        "dose001": {
          "medicineName": "Vitamin C",
          "time": "09:00",
          "compartment": 1,
          "allowedDelaySeconds": 120,
          "enabled": true,
          "status": "pending"
        }
      },
      "logs": {
        "log001": {
          "medicineName": "Vitamin C",
          "scheduledTime": "09:00",
          "actualTime": "09:01",
          "status": "taken",
          "compartment": 1
        }
      }
    }
  }
}