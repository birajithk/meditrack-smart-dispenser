```md
# Test Plan

## Purpose

This test plan defines the component, subsystem, integration and reliability tests for the MediTrack smart medicine dispenser.

## Test Levels

1. Dashboard testing
2. Firebase/database testing
3. Firmware testing
4. Virtual hardware testing
5. Notification testing
6. Offline and failure testing
7. Future physical hardware testing

## Functional Test Cases

| ID | Test Case | Expected Result |
|---|---|---|
| FT01 | Add new device using Device ID | Device appears in dashboard and Firebase |
| FT02 | Add device name and compartment pills | Device configuration is stored correctly |
| FT03 | ESP32 starts with matching Device ID | ESP32 retrieves its own configuration |
| FT04 | Add one-time schedule | Schedule is stored under selected device |
| FT05 | Add weekly schedule | Selected weekdays are stored correctly |
| FT06 | Add date-range schedule | Start and end dates are stored correctly |
| FT07 | Due schedule triggers firmware | Device enters dispensing process |
| FT08 | Servo opens compartment 1 | Servo moves to 60° |
| FT09 | Servo opens compartment 2 | Servo moves to 120° |
| FT10 | Servo opens compartment 3 | Servo moves to 180° |
| FT11 | Pill-removal button is pressed | Dose is marked Taken |
| FT12 | Pill-removal timeout expires | Dose is marked Missed |
| FT13 | Dose is completed | Servo returns to home 0° |
| FT14 | Same occurrence is checked again | Dose is not processed twice |
| FT15 | Missed dose occurs | Telegram notification is sent |
| FT16 | Taken dose occurs | No Telegram notification is sent |
| FT17 | Simulation stops during Due state | Watchdog marks dose as Missed |
| FT18 | Device heartbeat becomes stale | Dashboard shows Offline |

## Performance Metrics to Measure Later

| Metric | Measurement Method |
|---|---|
| Schedule trigger delay | Difference between scheduled time and actual trigger time |
| Dashboard update latency | Time from firmware update to dashboard display |
| Servo positioning success rate | Correct angle movements / total trials |
| Pill-removal detection accuracy | Correct detections / total sensor trials |
| False detection rate | False positives / total trials |
| Missed-dose classification accuracy | Correct missed classifications / total missed trials |
| Telegram notification delay | Missed log time to Telegram received time |
| Offline detection delay | Last heartbeat time to offline display time |

## Current Test Environment

- React dashboard running locally
- Firebase Realtime Database
- Wokwi ESP32 simulation
- virtual servo
- virtual LED and buzzer
- virtual pushbutton as pill-removal sensor
- local Node.js notification service
- Telegram caregiver alert