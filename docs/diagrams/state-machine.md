
### `docs/diagrams/state-machine.md`

```md
# Firmware State Machine

```mermaid
stateDiagram-v2
    [*] --> BOOTING
    BOOTING --> IDLE: Device config loaded
    IDLE --> DISPENSING: Schedule due
    DISPENSING --> ALERTING: Compartment reached
    ALERTING --> WAITING_FOR_REMOVAL: Alert active
    WAITING_FOR_REMOVAL --> TAKEN: Pill removed
    WAITING_FOR_REMOVAL --> MISSED: Timeout
    TAKEN --> RETURNING_HOME
    MISSED --> RETURNING_HOME
    RETURNING_HOME --> LOGGING
    LOGGING --> IDLE
    DISPENSING --> ERROR: Invalid compartment
    ERROR --> IDLE