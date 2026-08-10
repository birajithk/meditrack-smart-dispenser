# Week 06 Progress

## Objectives

- Improve the dashboard workflow for device-based usage
- Separate Device ID from user-friendly device name
- Improve schedule and log views for selected devices
- Prepare the system for multiple physical dispensers
- Refine firmware configuration so it can be reused across devices

## Completed Work

- Updated the device registration concept
- Used the printed Device ID as the main Firebase key
- Added friendly device names through dashboard configuration
- Removed hardcoded device name and device type from firmware
- Updated ESP32 firmware to retrieve device configuration from Firebase using Device ID
- Updated the system so only Wi-Fi details and Device ID are device-specific
- Improved dashboard navigation for home, devices, schedules and logs
- Added device-specific schedule and log views
- Added active and completed schedule separation
- Confirmed that the system can support multiple registered dispensers

## Testing

- Tested device registration using Device ID
- Tested ESP32 configuration retrieval from Firebase
- Tested device-specific schedule creation
- Tested device-specific dose logs
- Tested online/offline display using heartbeat freshness

## Issues / Blockers

- Physical ESP32 hardware is not connected yet
- Wokwi simulation can experience Firebase communication delays
- Caregiver notification system is not implemented yet

## Next Week Plan

- Implement caregiver notification for missed doses
- Add notification status tracking to missed-dose logs
- Test Telegram alert delivery
- Document notification workflow