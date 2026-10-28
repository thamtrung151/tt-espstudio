import * as Blockly from 'blockly';
import * as Vi from 'blockly/msg/vi';
import * as En from 'blockly/msg/en';
import { getLocale, t } from './ui/i18n';
import type { Config, Driver } from './core/config';
import type { Program, Statement } from './core/program';

const { default: _defaultLocale, ...locale } = Vi;
Blockly.setLocale(locale);
let currentDevices: Config['devices'] = [];
export function setDevices(devices: Config['devices']) { currentDevices = devices; }
export const deviceBlocks: Record<string, Driver[]> = {
  device_write: ['gpio.output'], device_read: ['gpio.input','adc.input'], device_if: ['gpio.input','adc.input'],
  device_pwm: ['pwm.output'], device_servo: ['servo.pwm'], device_servo_release: ['servo.pwm'], device_motor: ['motor.hbridge2'], device_motor_stop: ['motor.hbridge2'],
};
function deviceField(type: string) {
  return new Blockly.FieldDropdown(() => {
    const devices = currentDevices.filter(d => deviceBlocks[type].includes(d.driver));
    return [[t('Chọn thiết bị…'), '__missing__'], ...devices.map(d => [`${d.label} (${d.id})`, d.id])] as [string, string][];
  });
}
Blockly.Blocks['device_write'] = { init(this: Blockly.Block) {
  this.appendDummyInput().appendField('Đặt').appendField(deviceField('device_write'), 'DEVICE').appendField(new Blockly.FieldDropdown([['BẬT', 'ON'], ['TẮT', 'OFF']]), 'STATE');
  this.setPreviousStatement(true); this.setNextStatement(true); this.setColour('#2385ed');
  this.setTooltip('Điều khiển mức logic bật/tắt. Chân và cực tính lấy từ Configuration.');
} };
for (const [type, label] of Object.entries({ device_read: 'Gửi giá trị Serial', device_pwm: 'PWM', device_servo: 'Servo', device_servo_release: 'Ngừng xung servo', device_motor: 'Motor', device_motor_stop: 'Dừng motor', device_if: 'Nếu' })) {
  Blockly.Blocks[type] = { init(this: Blockly.Block) {
    const input = this.appendDummyInput().appendField(label).appendField(deviceField(type), 'DEVICE');
    if (type === 'device_pwm') input.appendField(new Blockly.FieldNumber(50, 0, 100, 1), 'PERCENT').appendField('%');
    if (type === 'device_servo') input.appendField(new Blockly.FieldNumber(90, 0, 180, 1), 'ANGLE').appendField('độ');
    if (type === 'device_motor') input.appendField(new Blockly.FieldNumber(30, -100, 100, 1), 'POWER').appendField('% trong').appendField(new Blockly.FieldNumber(500, 1, 10000, 1), 'MS').appendField('ms rồi dừng');
    if (type === 'device_if') {
      input.appendField(new Blockly.FieldDropdown([['=', '=='], ['≠', '!='], ['>', '>'], ['<', '<'], ['≥', '>='], ['≤', '<=']]), 'OP').appendField(new Blockly.FieldNumber(1, 0, 4095, 1), 'VALUE');
      this.appendStatementInput('THEN').appendField('thì'); this.appendStatementInput('ELSE').appendField('nếu không');
    }
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(type === 'device_if' ? '#d9951b' : type === 'device_read' ? '#467bf1' : '#2385ed');
  } };
}
Blockly.defineBlocksWithJsonArray([
  { type: 'robot_setup', message0: 'Khi khởi động %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], colour: '#d9951b', tooltip: 'Chạy một lần khi ESP32 khởi động.' },
  { type: 'robot_loop', message0: 'Lặp mãi %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], colour: '#d9951b', tooltip: 'Chạy lặp lại trong loop().' },
  { type: 'robot_wait', message0: 'Chờ %1 mili giây', args0: [{ type: 'field_number', name: 'MS', value: 500, min: 0, max: 60000, precision: 1 }], previousStatement: null, nextStatement: null, colour: '#20ab63' },
  { type: 'robot_print', message0: 'Gửi Serial %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Xin chào ESP32' }], previousStatement: null, nextStatement: null, colour: '#467bf1' },
  { type: 'robot_repeat', message0: 'Lặp %1 lần %2 %3', args0: [{ type: 'field_number', name: 'COUNT', value: 3, min: 1, max: 1000, precision: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: '#d9951b' },
]);
export const toolbox = { kind: 'categoryToolbox', contents: [
  { kind: 'category', name: 'Chương trình', colour: '#d9951b', contents: ['robot_setup','robot_loop','robot_wait','robot_repeat'].map(type => ({ kind: 'block', type })) },
  { kind: 'category', name: 'GPIO & cảm biến', colour: '#2385ed', contents: ['device_write','device_read','device_if'].map(type => ({ kind: 'block', type })) },
  { kind: 'category', name: 'PWM & chuyển động', colour: '#2385ed', contents: ['device_pwm','device_servo','device_servo_release','device_motor','device_motor_stop'].map(type => ({ kind: 'block', type })) },
  { kind: 'category', name: 'Serial', colour: '#467bf1', contents: [{ kind: 'block', type: 'robot_print' }, { kind: 'block', type: 'device_read' }] },
] };
export const initialWorkspace = { blocks: { languageVersion: 0, blocks: [
  { type: 'robot_setup', id: 'setup', x: 35, y: 40, inputs: { DO: { block: { type: 'robot_print', id: 'hello', fields: { TEXT: 'TT ESPStudio ready' } } } } },
  { type: 'robot_loop', id: 'loop', x: 35, y: 170, inputs: { DO: { block: { type: 'device_write', id: 'led_on', fields: { DEVICE: 'status_led', STATE: 'ON' }, next: { block: { type: 'robot_wait', id: 'wait_on', fields: { MS: 500 }, next: { block: { type: 'device_write', id: 'led_off', fields: { DEVICE: 'status_led', STATE: 'OFF' }, next: { block: { type: 'robot_wait', id: 'wait_off', fields: { MS: 500 } } } } } } } } } } },
] } };
export function readProgram(workspace: Blockly.Workspace): Program {
  const program: Program = { setup: [], loop: [] }; const seen = new Set<string>();
  if (workspace.getAllBlocks(false).length > 500) throw new Error('Tối đa 500 block trong bản thử nghiệm.');
  function chain(first: Blockly.Block | null, depth = 0): Statement[] {
    if (depth > 12) throw new Error('Vòng lặp lồng nhau quá sâu.');
    const result: Statement[] = [];
    for (let b = first; b; b = b.getNextBlock()) {
      if (!b.isEnabled()) continue;
      switch (b.type) {
        case 'device_write': result.push({ kind: 'write', id: b.id, device: b.getFieldValue('DEVICE'), on: b.getFieldValue('STATE') === 'ON' }); break;
        case 'device_read': result.push({ kind: 'read', id: b.id, device: b.getFieldValue('DEVICE') }); break;
        case 'device_pwm': result.push({ kind: 'pwm', id: b.id, device: b.getFieldValue('DEVICE'), percent: Number(b.getFieldValue('PERCENT')) }); break;
        case 'device_servo': result.push({ kind: 'servo', id: b.id, device: b.getFieldValue('DEVICE'), angle: Number(b.getFieldValue('ANGLE')) }); break;
        case 'device_servo_release': result.push({ kind: 'servo_release', id: b.id, device: b.getFieldValue('DEVICE') }); break;
        case 'device_motor': result.push({ kind: 'motor', id: b.id, device: b.getFieldValue('DEVICE'), power: Number(b.getFieldValue('POWER')), ms: Number(b.getFieldValue('MS')) }); break;
        case 'device_motor_stop': result.push({ kind: 'motor_stop', id: b.id, device: b.getFieldValue('DEVICE') }); break;
        case 'device_if': result.push({ kind: 'if', id: b.id, device: b.getFieldValue('DEVICE'), operator: b.getFieldValue('OP'), value: Number(b.getFieldValue('VALUE')), then: chain(b.getInputTargetBlock('THEN'), depth + 1), otherwise: chain(b.getInputTargetBlock('ELSE'), depth + 1) }); break;
        case 'robot_wait': result.push({ kind: 'wait', id: b.id, ms: Number(b.getFieldValue('MS')) }); break;
        case 'robot_print': result.push({ kind: 'print', id: b.id, text: b.getFieldValue('TEXT') }); break;
        case 'robot_repeat': result.push({ kind: 'repeat', id: b.id, count: Number(b.getFieldValue('COUNT')), body: chain(b.getInputTargetBlock('DO'), depth + 1) }); break;
        default: throw new Error(`Block không hỗ trợ: ${b.type}`);
      }
    }
    return result;
  }
  for (const b of workspace.getTopBlocks(true)) {
    if (!b.isEnabled()) continue;
    if (b.type !== 'robot_setup' && b.type !== 'robot_loop') throw new Error('Hãy nối các block rời vào “Khi khởi động” hoặc “Lặp mãi”.');
    if (seen.has(b.type)) throw new Error('Chỉ dùng một block “Khi khởi động” và một block “Lặp mãi”.');
    seen.add(b.type); program[b.type === 'robot_setup' ? 'setup' : 'loop'] = chain(b.getInputTargetBlock('DO'));
  }
  return program;
}
export function validateWorkspace(state: Record<string, unknown>, config: Config) {
  // Blockly dropdowns otherwise replace an unknown saved ID with their first option.
  function checkReferences(value: unknown, depth = 0) {
    if (depth > 100) throw new Error('Dữ liệu Blockly lồng nhau quá sâu.');
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (typeof item.type === 'string' && deviceBlocks[item.type]) {
      const id = (item.fields as Record<string, unknown> | undefined)?.DEVICE;
      if (id !== '__missing__' && (typeof id !== 'string' || !config.devices.some(d => d.id === id && deviceBlocks[item.type as string].includes(d.driver)))) throw new Error(`Snapshot Blockly tham chiếu thiết bị không có hoặc sai loại: ${String(id)}`);
    }
    for (const nested of Object.values(value)) checkReferences(nested, depth + 1);
  }
  checkReferences(state);
  setDevices(config.devices); const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, workspace);
    if (workspace.getAllBlocks(false).length > 500) throw new Error('Tối đa 500 block trong bản thử nghiệm.');
  }
  finally { workspace.dispose(); }
}
export { Blockly };

const originalLabels = new WeakMap<Blockly.Field, string>();
export function localizeBlocks(workspace: Blockly.Workspace) {
  const { default: ignored, ...messages } = getLocale() === 'en' ? En : Vi;
  Blockly.setLocale(messages);
  Blockly.Events.disable();
  try {
    for (const block of workspace.getAllBlocks(false)) {
      for (const input of block.inputList) for (const field of input.fieldRow) {
        // User text, device IDs, numbers and serialization remain unchanged.
        if (field instanceof Blockly.FieldLabel) {
          if (!originalLabels.has(field)) originalLabels.set(field, field.getText());
          field.setValue(t(originalLabels.get(field)!));
        }
      }
      if (block.type === 'device_write') {
        const field = block.getField('STATE') as Blockly.FieldDropdown;
        const value = field.getValue();
        field.setOptions([[t('BẬT'),'ON'],[t('TẮT'),'OFF']]); field.setValue(value);
      }
    }
  } finally { Blockly.Events.enable(); }
}
