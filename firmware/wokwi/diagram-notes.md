# Wokwi Virtual ESP32 Circuit

## Components

- ESP32 DevKit
- Servo motor
- LED
- Buzzer
- Pushbutton as virtual pill-removal sensor

## Pin Mapping

| Function | ESP32 Pin |
|---|---|
| Servo signal | GPIO 18 |
| LED | GPIO 2 |
| Buzzer | GPIO 23 |
| Pill-removal button | GPIO 19 |

## Notes

The pushbutton is used as a virtual replacement for the IR pill-removal sensor. In the real prototype, the IR sensor output pin will be connected to GPIO 19. The main firmware logic will remain the same.