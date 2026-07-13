# System Architecture

```mermaid
flowchart TD
    A[Caregiver Dashboard] --> B[Firebase Realtime Database]
    B --> C[ESP32 Controller]

    C --> D[Time Service]
    C --> E[Schedule Manager]
    C --> F[State Machine]
    C --> G[Motor Controller]
    C --> H[Pill Sensor Module]
    C --> I[Alert Controller]

    G --> J[Servo Motor]
    H --> K[IR Sensor]
    I --> L[Buzzer and LED]

    C --> B
    B --> M[Caregiver Notification]