import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { BuildService } from '../server/service';
import { Blockly, setDevices, readProgram } from '../src/blocks';
import { generate } from '../src/core/program';
import { targets, type Config } from '../src/core/config';
import { roboticsConfig, roboticsWorkspace } from '../tests/fixtures/robotics';

// Explicit maintainer smoke test: compile only, never opens serial or uploads.
const runtime = path.resolve(process.argv[2] ?? 'release/agent');
// Old GCC subprocess command lines become too long under deeply nested folders.
const data = process.argv[3] ? path.resolve(process.argv[3]) : await mkdtemp(path.join(tmpdir(), 'ttesqa-'));
process.env.ESPSTUDIO_AGENT_RUNTIME = runtime;
process.env.ESPSTUDIO_AGENT_DATA = data;
delete process.env.ESPSTUDIO_PIO; delete process.env.ESPSTUDIO_AGENT_DEV;
// Exclude developer Node/Python/PlatformIO/Git from executable discovery.
process.env.PATH = [runtime, path.join(runtime, 'python'), path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'), process.env.SystemRoot ?? 'C:\\Windows'].join(path.delimiter);
await mkdir(data, { recursive: true });
const service = new BuildService(path.join(data, 'builds'));
for (const target of Object.keys(targets) as (keyof typeof targets)[]) {
  const config: Config = structuredClone(roboticsConfig);
  config.board.target = target; config.board.exposedPins = [...targets[target].pins];
  if (target !== 'esp32') {
    const pins = [4, 5, 1, 6, 7];
    config.devices.forEach((device, i) => { if (device.driver === 'motor.hbridge2') { device.in1 = 10; device.in2 = 11; } else device.pin = pins[i]; });
  }
  setDevices(config.devices);
  const workspace = new Blockly.Workspace();
  let code: string;
  try { Blockly.serialization.workspaces.load(roboticsWorkspace, workspace); code = generate(config, readProgram(workspace)).code; }
  finally { workspace.dispose(); }
  const job = await service.build({ config, code });
  console.log(`Compiling ${target} with private runtime; job ${job.id}`);
  let lastLength = 0;
  while (job.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (job.log.length !== lastLength) { console.log(job.log.slice(lastLength)); lastLength = job.log.length; }
  }
  await writeFile(path.join(data, `${target}-build.log`), job.log);
  if (job.status !== 'success') throw new Error(`${target} compile failed; inspect saved log.`);
  console.log(`${target}: PASS`);
}
console.log('All targets compiled with packaged Python/PlatformIO and an isolated core. No USB upload was performed.');
