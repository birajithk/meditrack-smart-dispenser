
### `docs/diagrams/firebase-data-model.md`

```md
# Firebase Data Model

```mermaid
flowchart TD
    A[devices] --> B[device001]
    B --> C[deviceName]
    B --> D[delaySeconds]
    B --> E[compartments]
    B --> F[status]
    B --> G[schedules]
    B --> H[logs]

    E --> E1[1: pillName]
    E --> E2[2: pillName]
    E --> E3[3: pillName]

    F --> F1[online]
    F --> F2[currentState]
    F --> F3[lastSeen]
    F --> F4[lastSeenEpoch]

    G --> G1[scheduleId]
    G1 --> G2[medicineName]
    G1 --> G3[time]
    G1 --> G4[recurrence]
    G1 --> G5[status]
    G1 --> G6[lastProcessedOccurrence]

    H --> H1[logId]
    H1 --> H2[status]
    H1 --> H3[notificationStatus]