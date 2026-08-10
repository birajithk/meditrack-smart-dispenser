# Week 05 Progress

## Objectives

- Improve dispenser motor behavior with a default home position
- Limit prototype to three active medicine compartments
- Add realistic alarm-clock-style scheduling
- Support one-time, weekly, and date-range schedules
- Add multi-device dashboard support
- Improve device online/offline status handling
- Update Wokwi ESP32 firmware to support the new schedule model

## Completed Work

- Updated dashboard schedule form with one-time, weekly, and date-range options
- Added weekday selection for recurring schedules
- Limited compartment selection to compartments 1, 2, and 3
- Added multi-device list with device name, state, last seen, and online/offline display
- Updated dashboard to calculate online status using heartbeat freshness
- Updated Wokwi firmware to reserve 0 degrees as home position
- Updated motor mapping: compartment 1 = 60°, compartment 2 = 120°, compartment 3 = 180°
- Updated firmware to return servo to home after Taken or Missed
- Updated firmware schedule matching for once, weekly, and date-range recurrence
- Added occurrence tracking to avoid duplicate processing

## Testing

- Tested one-time Taken schedule
- Tested one-time Missed schedule
- Tested weekly schedule for selected weekday
- Tested date-range schedule
- Tested servo return to home position
- Tested dashboard offline detection after simulator stop

## Issues / Blockers

- Wokwi Firebase communication can have some delay due to browser/internet simulation
- Real hardware may require adjusting IR sensor HIGH/LOW logic
- Physical dispenser mechanism is not implemented yet

## Next Week Plan

- Improve firmware state machine structure
- Add better error handling for invalid schedules and Firebase failures
- Prepare code for easier migration from Wokwi to real ESP32 hardware
- Start planning real wiring and component purchase