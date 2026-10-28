import { describe, expect, it } from 'vitest';
import { allocatePwm, configWarnings, emptyBoard, parseConfig, type Config, type Device } from '../src/core/config';
import { generate } from '../src/core/program';
import { Blockly, readProgram, setDevices, validateWorkspace } from '../src/blocks';
import { roboticsConfig, roboticsWorkspace } from './fixtures/robotics';
const withDevice = (d: Device): Config => ({ ...emptyBoard(), devices: [d] });
describe('pin capabilities and board compatibility', () => {
  it('accepts GPIO2 and warns on boot strapping without blocking build', () => {
    const c = withDevice({ id: 'led', label: 'LED', driver: 'gpio.output', pin: 2, activeLow: false });
    expect(parseConfig(c)).toEqual(c); expect(configWarnings(c).join()).toContain('strapping');
    expect(generate(c, { setup: [], loop: [] }).code).toContain('pin_led = 2');
  });
  it('supports a genuinely empty development board without any motor pins', () => {
    expect(parseConfig(emptyBoard()).devices).toEqual([]);
    const code = generate(emptyBoard(), { setup: [], loop: [] }).code;
    expect(code).not.toContain('ledc'); expect(code).not.toContain('motor_');
  });
  it('uses input-only and pull capability data as advice, never a GPIO gate', () => {
    expect(() => parseConfig(withDevice({ id: 'adc', label: 'ADC', driver: 'adc.input', pin: 34, attenuation: '11' }))).not.toThrow();
    expect(() => parseConfig(withDevice({ id: 'button', label: 'Button', driver: 'gpio.input', pin: 34, activeLow: false, pull: 'none' }))).not.toThrow();
    const input = withDevice({ id: 'button', label: 'Button', driver: 'gpio.input', pin: 34, activeLow: false, pull: 'up' });
    expect(parseConfig(input)).toEqual(input); expect(configWarnings(input).join()).toContain('pull nội');
    const output = withDevice({ id: 'led', label: 'LED', driver: 'gpio.output', pin: 34, activeLow: false });
    expect(parseConfig(output)).toEqual(output); expect(configWarnings(output).join()).toContain('input-only');
  });
  it('advises on ADC and Serial without rejecting the board owner selection', () => {
    const adc = withDevice({ id: 'adc', label: 'ADC', driver: 'adc.input', pin: 23, attenuation: '11' });
    expect(parseConfig(adc)).toEqual(adc); expect(configWarnings(adc).join()).toContain('ADC');
    const serial = withDevice({ id: 'led', label: 'LED', driver: 'gpio.output', pin: 1, activeLow: false });
    expect(parseConfig(serial)).toEqual(serial); expect(configWarnings(serial).join()).toContain('UART0');
  });
  it('checks every motor pin, including collisions within one motor', () => {
    const c = structuredClone(roboticsConfig); const d = c.devices.find(d => d.driver === 'motor.hbridge2')!;
    if (d.driver !== 'motor.hbridge2') throw Error('fixture'); d.in2 = d.in1;
    expect(parseConfig(c)).toEqual(c); expect(configWarnings(c).join()).toContain('dùng chung');
  });
  it('accepts every GPIO index 0–48 on ESP32 and S3 without a model whitelist', () => {
    for (const target of ['esp32','esp32s3','esp32s2','esp32c3'] as const) for (let pin = 0; pin <= 48; pin++) {
      const c: Config = { ...emptyBoard(target), devices: [{ id: 'led', label: 'LED', driver: 'gpio.output', pin, activeLow: false }] };
      c.board.exposedPins = [pin];
      expect(parseConfig(JSON.parse(JSON.stringify(c)))).toEqual(c);
      expect(generate(c, { setup: [], loop: [] }).code).toContain(`pin_led = ${pin};`);
    }
  });
});
describe('LEDC allocation and motion', () => {
  it('separates motor, servo and PWM timers; shares only compatible pairs', () => {
    const c = structuredClone(roboticsConfig); c.devices.push({ id: 'servo2', label: 'Servo 2', driver: 'servo.pwm', pin: 26, minUs: 1000, maxUs: 2000 });
    const allocation = allocatePwm(c);
    expect(allocation['drive:in1']).not.toBe(allocation['drive:in2']);
    expect(Math.floor(allocation['drive:in1'] / 2)).toBe(Math.floor(allocation['drive:in2'] / 2));
    expect(Math.floor(allocation.gripper / 2)).toBe(Math.floor(allocation.servo2 / 2));
    expect(Math.floor(allocation['drive:in1'] / 2)).not.toBe(Math.floor(allocation.gripper / 2));
    expect(Math.floor(allocation.dimmer / 2)).not.toBe(Math.floor(allocation.gripper / 2));
  });
  it('rejects over-allocation and reversed pulse limits', () => {
    const c = emptyBoard('esp32s3'); c.devices = [4,5,6,7,8].map((pin,i) => ({ id: `p${i}`, label: `PWM${i}`, driver: 'pwm.output', pin, frequencyHz: 1000 + i }));
    expect(() => parseConfig(c)).toThrow('Hết timer');
    expect(() => parseConfig(withDevice({ id: 'servo', label: 'Servo', driver: 'servo.pwm', pin: 18, minUs: 2000, maxUs: 1000 }))).toThrow('tối đa');
  });
  it('generates real Blockly input, ADC, mixed PWM, servo release and bounded motor C++', () => {
    validateWorkspace(roboticsWorkspace, roboticsConfig); setDevices(roboticsConfig.devices); const w = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(roboticsWorkspace, w); const code = generate(roboticsConfig, readProgram(w)).code;
      expect(code).toContain('INPUT_PULLUP'); expect(code).toContain('analogRead(pin_sensor)');
      expect(code).toContain('ledcSetup(channel_gripper, 50, 14)'); expect(code).toContain('ledcSetup(motor_channel_drive_in1, 20000, 8)');
      expect(code).toContain('ledcWrite(channel_gripper, 1229)'); expect(code).toContain('run_drive(30, 500)');
      expect(code).toContain('ledcSetup(motor_channel_drive_in2, 20000, 8)');
      expect(code).toContain('ledcWrite(motor_channel_drive_in1, 0);\n  ledcWrite(motor_channel_drive_in2, 0);');
      expect(code).toContain('power > 0 ? motor_channel_drive_in1 : motor_channel_drive_in2, duty');
      expect(code).not.toContain('pwmPin');
      expect(code).toContain('delay(min(durationMs, uint32_t(10000)));\n  stop_drive();');
      expect(code).toContain('digitalRead(pin_button) == LOW');
    } finally { w.dispose(); }
  });
  it('rejects wrong device type, invalid motion ranges and operator injection', () => {
    expect(() => generate(roboticsConfig, { setup: [], loop: [{ kind: 'servo', id: 'a', device: 'drive', angle: 90 }] })).toThrow('loại');
    expect(() => generate(roboticsConfig, { setup: [], loop: [{ kind: 'motor', id: 'a', device: 'drive', power: 120, ms: 500 }] })).toThrow('Motor');
    expect(() => generate(roboticsConfig, { setup: [], loop: [{ kind: 'if', id: 'a', device: 'button', operator: ') evil(', value: 1, then: [], otherwise: [] }] })).toThrow('so sánh');
  });
  it('blocks imported type changes instead of silently replacing block targets', () => {
    const c = structuredClone(roboticsConfig); c.devices[0] = { id: 'status_led', label: 'Changed', driver: 'gpio.input', pin: 2, pull: 'none', activeLow: false };
    expect(() => validateWorkspace(roboticsWorkspace, c)).toThrow('sai loại');
  });
  it('two-input motor rejects a third PWM pin and preserves inversion', () => {
    const d: Device = { id: 'drive', label: 'Motor', driver: 'motor.hbridge2', in1: 19, in2: 21, frequencyHz: 20000, reversed: true };
    const c = withDevice(d); expect(parseConfig(c)).toEqual(c);
    expect(generate(c, { setup: [], loop: [] }).code).toContain('constrain(power, -100, 100) * -1');
    expect(() => parseConfig({ ...c, devices: [{ ...d, pwmPin: 22 }] })).toThrow();
  });
});
