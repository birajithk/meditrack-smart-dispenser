{
  "devices": {
    "device001": {
      "deviceName": "MediTrack Wokwi Device 01",
      "deviceType": "wokwi-esp32",
      "status": {
        "online": true,
        "currentState": "IDLE",
        "lastSeen": "2026-08-01T11:20:00",
        "lastSeenEpoch": 1785563400
      },
      "schedules": {
        "schedule001": {
          "medicineName": "Vitamin A",
          "time": "08:00",
          "compartment": 1,
          "allowedDelaySeconds": 30,
          "enabled": true,
          "status": "pending",
          "recurrence": {
            "type": "weekly",
            "weekdays": {
              "0": false,
              "1": true,
              "2": false,
              "3": false,
              "4": false,
              "5": false,
              "6": false
            },
            "startDate": "2026-08-01",
            "endDate": ""
          },
          "lastProcessedOccurrence": ""
        }
      },
      "logs": {}
    }
  }
}