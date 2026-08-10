# Week 07 Progress

## Objectives

- Implement caregiver notification when any medicine dose is missed
- Add notification status tracking to dose logs
- Create a separate notification service
- Send Telegram alerts for missed doses
- Prevent duplicate notifications for the same missed-dose log
- Review previous firmware and system-design todos

## Completed Work

- Created `notifications/` Node.js service
- Connected notification service to Firebase Realtime Database
- Added Telegram Bot API integration
- Updated missed-dose logs to include `notificationStatus`
- Added notification states: `pending`, `sending`, `sent`, `failed`, and `not_required`
- Implemented missed-dose scanning across all registered devices
- Included device name, Device ID, medicine name, compartment, scheduled time and recorded time in caregiver alert
- Added duplicate notification prevention using Firebase status updates
- Tested missed-dose notification flow using Wokwi and Firebase

## Testing

| Test Case | Result |
|---|---|
| Taken dose | Notification not required |
| Missed dose | Notification status set to pending |
| Notification service detects missed dose | Passed |
| Telegram message sent | Passed |
| Notification status updated to sent | Passed |
| Same missed log does not resend | Passed |
| Failed Telegram request marked as failed | Tested through invalid token/chat ID scenario |

## Todo Review

| Item | Status |
|---|---|
| Improve state machine structure | Partially completed |
| Add better error handling | Partially completed |
| Add repeated-dose prevention | Completed |
| Prepare firmware folder structure for future ESP32 implementation | Partially completed |
| Start Wokwi firmware skeleton | Completed |
| Prepare code for real ESP32 migration | Mostly completed |
| Start real wiring and purchase planning | Pending |

## Issues / Blockers

- Telegram bot token and chat ID must be kept private
- Notification service currently runs locally
- For deployment, the notification service should later be moved to Firebase Cloud Functions, a small server or another always-on environment

## Next Week Plan

- Start real hardware wiring plan
- Prepare component purchase list
- Improve formal firmware state machine structure
- Improve physical ESP32 migration folder structure
- Begin physical component testing