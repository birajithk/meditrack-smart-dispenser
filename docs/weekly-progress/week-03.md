# Week 03 Progress

## Objectives

- Implement zero-hardware device simulation
- Connect simulated device to Firebase
- Read medicine schedules from Firebase
- Simulate alert, motor movement, and pill-removal detection
- Update schedule status as Taken or Missed
- Write dose logs to Firebase
- Add dashboard controls for simulation testing

## Completed Work

- Created `simulator/` module
- Connected simulator to Firebase Realtime Database
- Implemented simulated alert driver
- Implemented simulated motor driver
- Implemented simulated pill sensor driver
- Implemented time-based schedule checking
- Implemented Taken and Missed status updates
- Implemented Firebase dose logging
- Added dashboard simulation control panel
- Tested automatic Taken scenario
- Tested manual Taken scenario
- Tested Missed scenario

## Evidence

- Simulator source code in `simulator/`
- Dashboard simulation control in `dashboard/src/components/SimulationControl.jsx`
- Firebase schedule updates
- Firebase dose logs
- GitHub commits
- Screenshot/video evidence of dashboard and simulator terminal output

## Issues / Blockers

- Real ESP32 hardware is not connected yet
- Motor and pill sensor are simulated at this stage
- Notification system is planned for a later week

## Next Week Plan

- Improve state machine structure
- Add better error handling
- Add repeated-dose prevention
- Prepare firmware folder structure for future ESP32 implementation
- Optionally start Wokwi/PlatformIO firmware skeleton without real hardware