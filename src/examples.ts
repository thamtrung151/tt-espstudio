import { type Config, emptyBoard, template } from './core/config';
import { initialWorkspace } from './blocks';
export function example(kind: string): { name: string; config: Config; workspace: Record<string, unknown> } {
  if (kind === 'empty') return { name: 'Project mới', config: emptyBoard(), workspace: {} };
  const config: Config = template();
  config.board.name = 'DOIT ESP32 DevKit · LED GPIO2';
  config.devices = [{ id: 'status_led', label: 'LED onboard IO2', driver: 'gpio.output', pin: 2, activeLow: false }];
  if (kind === 'doit-led') return { name: 'DOIT · Nháy LED GPIO2', config, workspace: structuredClone(initialWorkspace) };
  config.devices.push({ id: 'button', label: 'Nút nhấn GPIO27', driver: 'gpio.input', pin: 27, pull: 'up', activeLow: true }, { id: 'sensor', label: 'Analog GPIO34', driver: 'adc.input', pin: 34, attenuation: '11' });
  const output = (on: boolean) => ({ block: { type: 'device_write', fields: { DEVICE: 'status_led', STATE: on ? 'ON' : 'OFF' } } });
  return { name: 'Nút nhấn & ADC', config, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'robot_loop', x: 35, y: 40, inputs: { DO: { block: { type: 'device_if', fields: { DEVICE: 'button', OP: '==', VALUE: 1 }, inputs: { THEN: output(true), ELSE: output(false) }, next: { block: { type: 'device_read', fields: { DEVICE: 'sensor' }, next: { block: { type: 'robot_wait', fields: { MS: 100 } } } } } } } } }] } } };
}
