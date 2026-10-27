import { mkdir, writeFile } from 'node:fs/promises';
import { Blockly, setDevices, readProgram, validateWorkspace } from '../src/blocks';
import { parseConfig, platformioIni } from '../src/core/config';
import { generate } from '../src/core/program';
import { roboticsConfig, roboticsWorkspace } from '../tests/fixtures/robotics';
const config = parseConfig(roboticsConfig); validateWorkspace(roboticsWorkspace, config); setDevices(config.devices);
const workspace = new Blockly.Workspace();
try {
  Blockly.serialization.workspaces.load(roboticsWorkspace, workspace);
  const generated = generate(config, readProgram(workspace));
  const directory = 'examples/robotics'; await mkdir(`${directory}/src`, { recursive: true });
  await writeFile(`${directory}/src/main.cpp`, generated.code);
  await writeFile(`${directory}/platformio.ini`, platformioIni(config));
  await writeFile(`${directory}/board.config.json`, JSON.stringify(config, null, 2));
  await writeFile(`${directory}/espstudio-project.json`, JSON.stringify({ schemaVersion: 1, name: 'Robotics · CHECK WIRING BEFORE UPLOAD', config, mode: 'blocks', workspace: roboticsWorkspace, code: generated.code, codeHistory: [] }, null, 2));
  console.log('Generated examples/robotics from actual Blockly; includes motor and servo commands. Build only unless wiring is confirmed.');
} finally { workspace.dispose(); }
