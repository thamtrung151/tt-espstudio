import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseConfig, platformioIni } from '../src/core/config';
import { z } from 'zod';

export function findPio() {
  if (process.env.ESPSTUDIO_PIO) return process.env.ESPSTUDIO_PIO;
  const bundled = path.join(homedir(), '.platformio', 'penv', process.platform === 'win32' ? 'Scripts/pio.exe' : 'bin/pio');
  return existsSync(bundled) ? bundled : 'pio';
}
export type Job = { id: string; kind: 'build' | 'upload'; status: 'running' | 'success' | 'error'; log: string; directory: string; target: string; exitCode: number | null };
export const buildRequest = z.object({ config: z.unknown(), code: z.string().min(1).max(200000) }).strict();
export function runProcess(args: string[], cwd: string, onData: (chunk: string) => void, timeoutMs = 300000): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(findPio(), args, { cwd, shell: false, windowsHide: true, env: { ...process.env, PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No', PYTHONIOENCODING: 'utf-8' } });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true; onData('\nQuá thời gian cho phép; đang dừng toolchain.\n');
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', chunk => onData(chunk.toString())); child.stderr.on('data', chunk => onData(chunk.toString()));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve(timedOut ? -1 : code ?? -1); });
  });
}
export async function listPorts(cwd: string) {
  let output = ''; const code = await runProcess(['device', 'list', '--json-output'], cwd, chunk => { output += chunk; }, 20000);
  if (code !== 0) throw new Error(output || 'Không đọc được danh sách cổng.');
  return z.array(z.object({ port: z.string(), description: z.string().optional(), hwid: z.string().optional() }).passthrough()).parse(JSON.parse(output));
}
export class BuildService {
  jobs = new Map<string, Job>(); busy = false;
  constructor(readonly root: string) {}
  async build(input: unknown) {
    const data = buildRequest.parse(input); const config = parseConfig(data.config);
    if (this.busy) throw new Error('Một tác vụ đang chạy. Hãy chờ hoàn tất.');
    this.busy = true;
    try {
      const id = randomUUID(); const directory = path.join(this.root, id);
      await mkdir(path.join(directory, 'src'), { recursive: true });
      await writeFile(path.join(directory, 'platformio.ini'), platformioIni(config));
      await writeFile(path.join(directory, 'src', 'main.cpp'), data.code);
      await writeFile(path.join(directory, 'config.json'), JSON.stringify(config, null, 2));
      const job: Job = { id, kind: 'build', status: 'running', log: 'Bắt đầu biên dịch firmware…\n', directory, target: config.board.target, exitCode: null };
      this.jobs.set(id, job); void this.execute(job, ['run', '-e', 'robot']); return job;
    } catch (error) { this.busy = false; throw error; }
  }
  async upload(id: string, port: string) {
    if (this.busy) throw new Error('Một tác vụ đang chạy. Hãy chờ hoàn tất.');
    const build = this.jobs.get(id);
    if (!build || build.kind !== 'build' || build.status !== 'success') throw new Error('Cần bản build thành công trong phiên này trước khi nạp.');
    this.busy = true;
    try {
      const ports = await listPorts(path.dirname(this.root));
      if (!ports.some(p => p.port === port)) throw new Error('Cổng đã chọn không còn kết nối.');
      const job: Job = { ...build, id: randomUUID(), kind: 'upload', status: 'running', log: `Nạp firmware vào ${port}…\n`, exitCode: null };
      this.jobs.set(job.id, job); void this.execute(job, ['run', '-e', 'robot', '-t', 'upload', '--upload-port', port]); return job;
    } catch (error) { this.busy = false; throw error; }
  }
  private async execute(job: Job, args: string[]) {
    try { job.exitCode = await runProcess(args, job.directory, chunk => { job.log = (job.log + chunk).slice(-160000); }); job.status = job.exitCode === 0 ? 'success' : 'error'; }
    catch (error) { job.status = 'error'; job.log += `\n${String(error)}\nKiểm tra PlatformIO Core hoặc biến ESPSTUDIO_PIO.`; }
    finally { this.busy = false; }
  }
}
