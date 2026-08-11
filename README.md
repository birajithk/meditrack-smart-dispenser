# MediTrack: Smart Medicine Dispenser

MediTrack is an embedded medication adherence and caregiver monitoring system. It helps a patient take the correct medicine at the correct time and allows a caregiver to remotely monitor dose events.

## Project Scope

The system supports:

- device registration using a unique printed Device ID
- caregiver-friendly device names
- medicine assignment to 3 compartments
- one-time, weekly, and date-range schedules
- ESP32-based device control
- servo-based compartment positioning
- LED and buzzer alerts
- pill-removal detection
- Taken/Missed dose classification
- Firebase Realtime Database synchronisation
- web dashboard monitoring
- Telegram caregiver notification for missed doses

## Current Implementation Status

The project is currently in the software and virtual embedded simulation stage.

Completed so far:

- project proposal
- GitHub repository setup
- React dashboard
- Firebase Realtime Database
- multi-device dashboard workflow
- device registration using Device ID
- schedule management
- dose logs
- Wokwi ESP32 simulation
- servo/LED/buzzer/pill-sensor simulation
- Taken/Missed classification
- device heartbeat
- offline detection
- caregiver Telegram notification service
- stuck Due schedule watchdog

## System Architecture

```mermaid
flowchart TD
    A[Caregiver Dashboard] --> B[Firebase Realtime Database]
    B --> C[ESP32 / Wokwi Firmware]
    C --> D[Servo Motor]
    C --> E[LED and Buzzer]
    C --> F[Pill Removal Sensor]
    C --> B
    B --> G[Notification Service]
    G --> H[Telegram Caregiver Alert]```

Device Identity Model

Each physical dispenser has a unique Device ID printed on it.

Example:

device001

The same Device ID is programmed into the ESP32 firmware.

The caregiver enters this Device ID in the dashboard and assigns:

device name
medicine in compartment 1
medicine in compartment 2
medicine in compartment 3
pill-removal delay seconds

Only these values are device-specific in firmware:

Wi-Fi SSID
Wi-Fi password
Device ID
Firmware Motor Mapping
Position	Angle
Home / default	0°
Compartment 1	60°
Compartment 2	120°
Compartment 3	180°

The dispenser returns to the home position after each Taken or Missed dose.

Repository Structure
dashboard/       React caregiver dashboard
firmware/wokwi/  Wokwi ESP32 virtual firmware
notifications/   Telegram missed-dose notification service
docs/            Documentation, diagrams, test plans and weekly progress
hardware/        Wiring and purchase planning
Main Technologies
ESP32
Wokwi
Arduino framework
React + Vite
Firebase Realtime Database
Telegram Bot API
GitHub
Weekly Progress
Week 1: Project proposal and initial planning
Week 2: Dashboard and Firebase setup
Week 3: Zero-hardware simulator and Wokwi start
Week 4: Recurrence scheduling and multi-device workflow
Week 5: Device ID model and dashboard workflow improvements
Week 6: Firmware configuration retrieval and system refinement
Week 7: Caregiver missed-dose notification and watchdog handling
Safety Notice

This project is an academic prototype using dummy pills. It is not a certified medical device

