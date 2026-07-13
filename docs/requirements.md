# Requirements

## Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | The system shall allow medicine schedules to be created from a dashboard. |
| FR2 | The system shall store medicine name, time, compartment number, and allowed delay. |
| FR3 | The ESP32 shall read the active medicine schedule from the database. |
| FR4 | The ESP32 shall check the current time and identify when a dose is due. |
| FR5 | The system shall activate buzzer and LED alerts when a dose is due. |
| FR6 | The motor shall move to the correct compartment position. |
| FR7 | The pill-removal sensor shall detect whether the pill was removed. |
| FR8 | The system shall update the dose status as Taken or Missed. |
| FR9 | The dashboard shall display current schedules, device status, and dose logs. |
| FR10 | The system shall notify the caregiver when a dose is missed. |

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR1 | The prototype shall be low-cost and suitable for local construction. |
| NFR2 | The system shall update the dashboard within a reasonable delay. |
| NFR3 | The system shall be modular so that mechanical changes do not require major software changes. |
| NFR4 | The system shall be tested using dummy pills only. |
| NFR5 | The firmware and dashboard source code shall be maintained using GitHub. |