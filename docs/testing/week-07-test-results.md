# Week 07 Test Results

## Test Summary

| Test | Status | Notes |
|---|---|---|
| Device registration | Passed | Device added using printed Device ID |
| Device config retrieval | Passed | ESP32 reads deviceName, delaySeconds and compartments from Firebase |
| One-time schedule | Passed | Schedule triggers in Wokwi |
| Taken dose | Passed | Button press marks dose as Taken |
| Missed dose | Passed | Timeout marks dose as Missed |
| Servo return home | Passed | Servo returns to 0° after dose process |
| Duplicate prevention | Passed | Same occurrence does not trigger repeatedly |
| Telegram notification | Passed | Missed dose sends caregiver alert |
| Taken dose notification suppression | Passed | Taken dose does not send alert |
| Offline detection | Under testing | Dashboard uses heartbeat freshness |
| Stuck Due watchdog | Under testing | Notification service marks offline Due schedule as Missed |

## Observed Issues

- Wokwi time and Firebase communication can lag during long browser sessions.
- Device status may appear offline if heartbeat threshold is too strict.
- Physical IR sensor HIGH/LOW logic must be tested later.

## Fixes Applied

- Heartbeat interval reduced.
- Heartbeat maintained during pill-removal waiting.
- Dashboard stale threshold increased.
- Firmware trigger window added for late schedule checks.
- Notification service watchdog added for stuck Due schedules.