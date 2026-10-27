import { type Device, type Driver, pwmSpec } from './config';
type Implementation = { initialize(d: Device): string[] };
const level = (on: boolean, activeLow: boolean) => on !== activeLow ? 'HIGH' : 'LOW';
export function digitalWriteCode(d: Device, on: boolean) {
  if (d.driver !== 'gpio.output') throw new Error(`${d.id}: cần GPIO output.`);
  return `digitalWrite(pin_${d.id}, ${level(on, d.activeLow)});`;
}
export function readCode(d: Device) {
  if (d.driver === 'gpio.input') return `(digitalRead(pin_${d.id}) == ${level(true, d.activeLow)} ? 1 : 0)`;
  if (d.driver === 'adc.input') return `analogRead(pin_${d.id})`;
  throw new Error(`${d.id}: cần GPIO input hoặc ADC input.`);
}
const pwmInit = (d: Device) => {
  const spec = pwmSpec(d)!;
  const outputs = d.driver === 'motor.hbridge2' ? ['in1','in2'].map(role => ({ pin: `motor_${d.id}_${role}`, channel: `motor_channel_${d.id}_${role}` })) : [{ pin: `pin_${d.id}`, channel: `channel_${d.id}` }];
  return outputs.flatMap(({ pin, channel }) => [`if (ledcSetup(${channel}, ${spec.frequency}, ${spec.bits}) == 0) {`, '  Serial.println("LEDC setup failed; stopped before attaching outputs");', '  while (true) delay(1000);', '}', `ledcWrite(${channel}, 0);`, `ledcAttachPin(${pin}, ${channel});`]);
};
export const driverRegistry: Record<Driver, Implementation> = {
  'gpio.output': { initialize(d) { if (d.driver !== 'gpio.output') throw new Error('Driver mismatch'); return [digitalWriteCode(d, false), `pinMode(pin_${d.id}, OUTPUT);`]; } },
  'gpio.input': { initialize(d) { if (d.driver !== 'gpio.input') throw new Error('Driver mismatch'); return [`pinMode(pin_${d.id}, ${{ none: 'INPUT', up: 'INPUT_PULLUP', down: 'INPUT_PULLDOWN' }[d.pull]});`]; } },
  'adc.input': { initialize(d) { if (d.driver !== 'adc.input') throw new Error('Driver mismatch'); return [`pinMode(pin_${d.id}, INPUT);`, 'analogReadResolution(12);', `analogSetPinAttenuation(pin_${d.id}, ${{ '0': 'ADC_0db', '2.5': 'ADC_2_5db', '6': 'ADC_6db', '11': 'ADC_11db' }[d.attenuation]});`]; } },
  'pwm.output': { initialize: pwmInit },
  'servo.pwm': { initialize: pwmInit },
  'motor.hbridge2': { initialize(d) { return [`digitalWrite(motor_${d.id}_in1, LOW);`, `digitalWrite(motor_${d.id}_in2, LOW);`, `pinMode(motor_${d.id}_in1, OUTPUT);`, `pinMode(motor_${d.id}_in2, OUTPUT);`, ...pwmInit(d)]; } },
};
export function motorHelpers(d: Extract<Device, { driver: 'motor.hbridge2' }>): string[] {
  return [`void stop_${d.id}() {`, `  ledcWrite(motor_channel_${d.id}_in1, 0);`, `  ledcWrite(motor_channel_${d.id}_in2, 0);`, '}', `void run_${d.id}(int power, uint32_t durationMs) {`, `  stop_${d.id}();`, `  power = constrain(power, -100, 100) * ${d.reversed ? '-1' : '1'};`, '  if (power == 0) return;', '  delayMicroseconds(50);', '  const uint32_t duty = (abs(power) * 255 + 50) / 100;', `  ledcWrite(power > 0 ? motor_channel_${d.id}_in1 : motor_channel_${d.id}_in2, duty);`, '  delay(min(durationMs, uint32_t(10000)));', `  stop_${d.id}();`, '}', ''];
}
