# System Architecture

```mermaid
flowchart TD
    A[Caregiver Dashboard] --> B[Firebase Realtime Database]
    B --> C[ESP32 Firmware / Wokwi Simulation]

    C --> D[Schedule Manager]
    C --> E[State Machine]
    C --> F[Motor Controller]
    C --> G[Alert Controller]
    C --> H[Pill Sensor Module]

    F --> I[Servo Motor]
    G --> J[LED and Buzzer]
    H --> K[IR Sensor / Virtual Button]

    C --> B
    B --> L[Notification Service]
    L --> M[Telegram Caregiver Alert]