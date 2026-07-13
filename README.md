# MediTrack: Smart Medicine Dispenser

## Project Overview

MediTrack is an embedded medication adherence system designed to help users take the correct medicine at the correct time. The system reminds the user, provides access to the correct medicine compartment, verifies pill removal, logs the event, and notifies a caregiver when a dose is missed.

## Main Features

- Medicine schedule management
- ESP32-based embedded control
- RTC/NTP-based time checking
- Buzzer and LED reminder
- Motorized compartment access
- Pill-removal detection
- Dashboard-based monitoring
- Taken/missed dose logging
- Caregiver missed-dose notification

## Technology Stack

- ESP32
- Arduino framework / PlatformIO
- Firebase Realtime Database
- React + Vite dashboard
- Servo motor
- IR pill-removal sensor
- Buzzer and LED alerts

## Project Timeline

| Week | Target |
|---|---|
| Week 1 | Project setup, requirements, architecture, GitHub repo |
| Week 2 | Dashboard and database setup |
| Week 3 | ESP32-Firebase connection |
| Week 4 | Scheduling, time checking, buzzer/LED, motor test |
| Week 5 | Pill-removal sensor and taken/missed logic |
| Week 6 | Notification and reliability handling |
| Week 7 | Full software + temporary hardware demo |
| Week 8-14 | Mechanical enclosure, carousel, final integration, testing, exhibition |

## Repository Structure

- `firmware/` - ESP32 firmware
- `dashboard/` - React dashboard
- `docs/` - project documentation
- `hardware/` - mechanical and wiring notes

## Status

Project started. Weekly progress will be documented in `docs/weekly-progress/`.