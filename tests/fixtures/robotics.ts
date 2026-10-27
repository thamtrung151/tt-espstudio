import { template, type Config } from '../../src/core/config';
export const roboticsConfig: Config = {
  ...template(), board: { ...template().board, name: 'DOIT · Robotics compile fixture (check wiring)' },
  devices: [
    { id: 'status_led', label: 'Onboard LED', driver: 'gpio.output', pin: 2, activeLow: false },
    { id: 'button', label: 'Button', driver: 'gpio.input', pin: 27, pull: 'up', activeLow: true },
    { id: 'sensor', label: 'Analog', driver: 'adc.input', pin: 34, attenuation: '11' },
    { id: 'dimmer', label: 'PWM', driver: 'pwm.output', pin: 25, frequencyHz: 1000 },
    { id: 'gripper', label: 'Servo', driver: 'servo.pwm', pin: 18, minUs: 1000, maxUs: 2000 },
    { id: 'drive', label: 'Motor', driver: 'motor.hbridge2', in1: 19, in2: 21, frequencyHz: 20000, reversed: false },
  ],
};
export const roboticsWorkspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_loop', id: 'loop', x: 35, y: 40, inputs: { DO: { block: {
  type: 'device_if', id: 'condition', fields: { DEVICE: 'button', OP: '==', VALUE: 1 }, inputs: {
    THEN: { block: { type: 'device_write', fields: { DEVICE: 'status_led', STATE: 'ON' } } },
    ELSE: { block: { type: 'device_write', fields: { DEVICE: 'status_led', STATE: 'OFF' } } },
  }, next: { block: { type: 'device_read', id: 'read_sensor', fields: { DEVICE: 'sensor' }, next: { block: {
    type: 'device_pwm', fields: { DEVICE: 'dimmer', PERCENT: 25 }, next: { block: {
      type: 'device_servo', fields: { DEVICE: 'gripper', ANGLE: 90 }, next: { block: {
        type: 'robot_wait', fields: { MS: 500 }, next: { block: {
          type: 'device_servo_release', fields: { DEVICE: 'gripper' }, next: { block: {
            type: 'device_motor', fields: { DEVICE: 'drive', POWER: 30, MS: 500 }, next: { block: {
              type: 'device_motor_stop', fields: { DEVICE: 'drive' }, next: { block: { type: 'robot_wait', fields: { MS: 500 } } },
            } },
          } },
        } },
      } },
    } },
  } } } },
} } } }] } };
