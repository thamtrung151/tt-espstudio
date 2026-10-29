import { uploadDiagnostic } from '../src/core/upload-diagnostic';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseConfig, platformioIni } from '../src/core/config';
import { z } from 'zod';
import { isolatedToolchain } from './runtime';

export function findPio() {
  if (process.env.ESPSTUDIO_PIO) return process.env.ESPSTUDIO_PIO;
  const bundled = path.join(homedir(), '.platformio', 'penv', process.platform === 'win32' ? 'Scripts/pio.exe' : 'bin/pio');
  return existsSync(bundled) ? bundled : 'pio';
}
export type Job = { diagnostic?: string; id: string; kind: 'build' | 'upload'; status: 'running' | 'success' | 'error' | 'cancelled'; log: string; directory: string; target: string; exitCode: number | null };
export const buildRequest = z.object({ config: z.unknown(), code: z.string().min(1).max(200000) }).strict();
export function runProcess(args: string[], cwd: string, onData: (chunk: string) => void, timeoutMs = 300000, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return resolve(-1);
    const runtime = process.env.ESPSTUDIO_AGENT_RUNTIME;
    const command = runtime
      ? isolatedToolchain(runtime, process.env.ESPSTUDIO_AGENT_DATA ?? path.join(process.env.LOCALAPPDATA ?? homedir(), 'TTESPStudio', 'agent'))
      : { executable: findPio(), prefix: [] as string[], env: { ...process.env, PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No', PYTHONIOENCODING: 'utf-8' } };
    const child = spawn(command.executable, [...command.prefix, ...args], { cwd, shell: false, windowsHide: true, env: command.env });
    let timedOut = false;
    const stop = () => {
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      else child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; onData('\nQuá thời gian cho phép; đang dừng toolchain.\n'); stop(); }, timeoutMs);
    child.stdout.on('data', chunk => onData(chunk.toString())); child.stderr.on('data', chunk => onData(chunk.toString()));
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(error); });
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve(timedOut || signal?.aborted ? -1 : code ?? -1); });
  });
}
export async function listPorts(cwd: string) {
  let output = ''; const code = await runProcess(['device', 'list', '--json-output'], cwd, chunk => { output += chunk; }, 20000);
  if (code !== 0) throw new Error(output || 'Không đọc được danh sách cổng.');
  return z.array(z.object({ port: z.string(), description: z.string().optional(), hwid: z.string().optional() }).passthrough()).parse(JSON.parse(output));
}
export class BuildService {
  jobs = new Map<string, Job>(); busy = false;
  private controllers = new Map<string, AbortController>();
  constructor(readonly root: string) {}
  async build(input: unknown) {
    const data = buildRequest.parse(input); const config = parseConfig(data.config);
    if (this.busy) throw new Error('Một tác vụ đang chạy. Hãy chờ hoàn tất.');
    if (this.jobs.size >= 100) throw new Error('Đã đạt giới hạn tác vụ trong phiên. Khởi động lại Agent.');
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
    if (this.jobs.size >= 100) throw new Error('Đã đạt giới hạn tác vụ trong phiên. Khởi động lại Agent.');
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
    const controller = new AbortController(); this.controllers.set(job.id, controller);
    try {
      job.exitCode = await runProcess(args, job.directory, chunk => { job.log = (job.log + chunk).slice(-160000); }, 300000, controller.signal);
      const artifactExists = job.kind !== 'build' || existsSync(path.join(job.directory, '.pio', 'build', 'robot', 'firmware.bin'));
      job.status = controller.signal.aborted ? 'cancelled' : job.exitCode === 0 && artifactExists ? 'success' : 'error';
      if (job.kind === 'upload' && job.status === 'error') job.diagnostic = uploadDiagnostic(job.log);
      if (job.exitCode === 0 && !artifactExists) job.log += '\nKhông tìm thấy firmware.bin sau build.';
    }
    catch (error) { job.status = 'error'; job.log += `\n${String(error)}\nKiểm tra PlatformIO Core hoặc biến ESPSTUDIO_PIO.`; }
    finally { this.controllers.delete(job.id); this.busy = false; }
  }
  cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.kind !== 'build' || job.status !== 'running') throw new Error('Chỉ hủy tác vụ biên dịch đang chạy; không ngắt nạp firmware.');
    this.controllers.get(id)?.abort(); job.log += '\nĐã yêu cầu hủy biên dịch.\n';
  }
}

export { uploadDiagnostic } from '../src/core/upload-diagnostic';
