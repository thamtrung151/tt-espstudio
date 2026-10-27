import { describe, it, expect } from 'vitest';
import { parseConfig, platformioIni, template } from '../src/core/config';
import { generate, projectSchema, returnToBlocks, type Project } from '../src/core/program';
import { Blockly, initialWorkspace, readProgram, setDevices, validateWorkspace } from '../src/blocks';

describe('board configuration', () => {
  it('round-trips custom names, pins and polarity without changing meaning', () => {
    const config = template(); config.board.name = 'Robot tự thiết kế'; config.devices[0].pin = 25; config.devices[0].activeLow = true;
    expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });
  it('rejects malformed numbers and duplicate IDs but preserves owner-chosen GPIOs', () => {
    const config = template(); config.devices.push({ ...config.devices[0] });
    expect(() => parseConfig(config)).toThrow();
    for (const invalid of [-1, 2.5, 256]) { const bad = template(); bad.devices[0].pin = invalid; expect(() => parseConfig(bad)).toThrow(); }
    for (const chosen of [6, 34, 48, 54]) { const config = template(); config.devices[0].pin = chosen; config.board.exposedPins = []; expect(parseConfig(config)).toEqual(config); }
  });
  it('rejects schema drift, unknown drivers and code injection through config', () => {
    for (const value of [{ ...template(), schemaVersion: 2 }, { ...template(), extra: 1 }, { ...template(), devices: [{ ...template().devices[0], id: 'x);evil()' }] }, { ...template(), devices: [{ ...template().devices[0], driver: 'magic_motor' }] }]) expect(() => parseConfig(value)).toThrow();
  });
  it('uses target data for a second board without generator changes', () => {
    const config = template('esp32s3'); expect(platformioIni(config)).toContain('board = esp32-s3-devkitc-1');
    expect(generate(config, { setup: [], loop: [] }).code).toContain('pin_status_led = 4');
  });
});
describe('Blockly to C++', () => {
  it('serializes a real Blockly workspace and generates mapped statements', () => {
    setDevices(template().devices); const workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(initialWorkspace, workspace);
      const program = readProgram(workspace); expect(program.loop).toHaveLength(4);
      const output = generate(template(), program); expect(output.code).toContain('digitalWrite(pin_status_led, HIGH);');
      const line = output.code.split('\n')[output.ranges.led_on.start - 1]; expect(line).toContain('digitalWrite(pin_status_led, HIGH)');
      const saved = Blockly.serialization.workspaces.save(workspace); validateWorkspace(saved, template());
    } finally { workspace.dispose(); }
  });
  it('initializes active-low outputs OFF and respects logical ON', () => {
    const config = template(); config.devices[0].activeLow = true;
    const code = generate(config, { setup: [], loop: [{ kind: 'write', id: 'a', device: 'status_led', on: true }] }).code;
    expect(code).toContain('digitalWrite(pin_status_led, HIGH);\n  pinMode(pin_status_led, OUTPUT);');
    expect(code).toContain('void loop() {\n  digitalWrite(pin_status_led, LOW);');
  });
  it('rejects stale device references and invalid delay values', () => {
    expect(() => generate(template(), { setup: [], loop: [{ kind: 'write', id: 'a', device: 'deleted', on: true }] })).toThrow('deleted');
    expect(() => generate(template(), { setup: [], loop: [{ kind: 'wait', id: 'b', ms: -1 }] })).toThrow();
  });
  it('encodes serial strings without introducing C++ tokens', () => {
    const code = generate(template(), { setup: [], loop: [{ kind: 'print', id: 's', text: '");evil(); // Tiếng Việt\n' }] }).code;
    expect(code).not.toContain('Serial.println("");'); expect(code).toContain('Serial.println("\\042);evil(); //');
  });
  it('reports loose blocks instead of silently executing them', () => {
    const w = new Blockly.Workspace(); try { w.newBlock('robot_wait'); expect(() => readProgram(w)).toThrow('block rời'); } finally { w.dispose(); }
  });
  it('rejects missing imported device IDs instead of silently remapping outputs', () => {
    const config = template(); config.devices[0].id = 'different_led';
    expect(() => validateWorkspace(initialWorkspace, config)).toThrow('status_led');
  });
});
describe('source ownership and persistence', () => {
  it('preserves manual C++, its board config and the Blockly snapshot on return', () => {
    const project: Project = { schemaVersion: 1, name: 'Test', config: template(), mode: 'code', workspace: initialWorkspace, code: '// hand-edited\nvoid setup() {}\nvoid loop() {}', codeHistory: [] };
    const before = structuredClone(project); const next = returnToBlocks(project);
    expect(project).toEqual(before); expect(next.mode).toBe('blocks'); expect(next.workspace).toEqual(project.workspace);
    expect(next.codeHistory[0].code).toBe(project.code); expect(next.codeHistory[0].config).toEqual(project.config);
    expect(projectSchema.parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
});
