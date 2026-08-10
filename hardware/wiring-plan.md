# Wiring Plan

## ESP32 Pin Mapping

| Component | ESP32 Pin | Notes |
|---|---|---|
| Servo signal | GPIO 18 | Servo powered separately using 5V |
| LED | GPIO 2 | Use resistor |
| Buzzer | GPIO 23 | Active buzzer preferred |
| IR sensor output | GPIO 19 | Replaces Wokwi pushbutton |
| IR sensor VCC | 3.3V or 5V | Depends on sensor module |
| IR sensor GND | GND | Common ground required |

## Power Notes

- Servo should not be powered directly from ESP32 3.3V.
- Use external 5V supply for servo.
- ESP32 ground and external power ground must be connected together.
- Sensor HIGH/LOW logic must be tested before final mounting.