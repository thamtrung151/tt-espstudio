import { mkdir, writeFile } from 'node:fs/promises';
import { Blockly, initialWorkspace, readProgram, setDevices } from '../src/blocks';
import { template, platformioIni } from '../src/core/config';
import { generate } from '../src/core/program';
const config = template(); setDevices(config.devices); const workspace = new Blockly.Workspace();
try {
  Blockly.serialization.workspaces.load(initialWorkspace, workspace);
  const code = generate(config, readProgram(workspace)).code;
  await mkdir('examples/blink/src', { recursive: true });
  await writeFile('examples/blink/src/main.cpp', code);
  await writeFile('examples/blink/platformio.ini', platformioIni(config));
  await writeFile('examples/blink/board.config.json', JSON.stringify(config, null, 2) + '\n');
  console.log('Generated examples/blink from the actual Blockly workspace and config.');
} finally { workspace.dispose(); }
