import { createServer, type IncomingMessage } from 'node:http';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AgentAuth, AGENT_API_VERSION, AGENT_VERSION } from './agent-auth';
import { BuildService, listPorts, runProcess, type Job } from './service';
import { describeError } from '../src/core/config';

export function parseOrigins(value: string): Set<string> {
  const origins = value.split(',').map(s => s.trim()).filter(Boolean);
  if (origins.length > 10) throw new Error('Tối đa 10 website được phép.');
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error(`Origin không hợp lệ: ${origin}`);
  }
  return new Set(origins);
}
async function json(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Yêu cầu JSON.');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; if (size > 1000000) throw new Error('Request quá lớn.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createAgent(options: { port: number; root: string; origins: Set<string>; announce: (origin: string, code: string) => void; ready: () => boolean }) {
  const service = new BuildService(path.join(options.root, 'builds'));
  const auth = new AgentAuth(options.origins, options.announce);
  const owners = new Map<string, string>();
  let portsTask: ReturnType<typeof listPorts> | undefined;
  let portsExpire = 0;
  const publicJob = (job: Job) => ({ id: job.id, kind: job.kind, status: job.status, log: job.log.split(options.root).join('[Agent data]'), target: job.target, exitCode: job.exitCode });
  const server = createServer(async (req, res) => {
    const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== `127.0.0.1:${options.port}`) return send(403, { error: 'Host không được phép.' });
    const origin = req.headers.origin ?? '';
    if (!options.origins.has(origin)) return send(403, { error: 'Website không được phép. Cấu hình origin tại Agent.' });
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      const requested = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (!['GET','POST'].includes(String(req.headers['access-control-request-method'])) || requested.some(h => !['content-type','x-studio-token'].includes(h))) return send(403, { error: 'Preflight không được phép.' });
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Token');
      if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204); return res.end();
    }
    const route = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    try {
      if (route === '/api/health' && req.method === 'GET') return send(200, { apiVersion: AGENT_API_VERSION, version: AGENT_VERSION, setup: options.ready() ? 'ready' : 'required', busy: service.busy });
      if (route === '/api/pair/request' && req.method === 'POST') { z.object({}).strict().parse(await json(req)); return send(200, auth.request(origin)); }
      if (route === '/api/pair/confirm' && req.method === 'POST') {
        const data = z.object({ requestId: z.string().uuid(), code: z.string().max(16) }).strict().parse(await json(req));
        return send(200, auth.confirm(origin, data.requestId, data.code));
      }
      const token = String(req.headers['x-studio-token'] ?? '');
      if (!auth.valid(origin, token)) return send(401, { error: 'Cần ghép nối website với Agent. Phiên có hiệu lực 8 giờ.' });
      if (route === '/api/session' && req.method === 'GET') return send(200, { apiVersion: AGENT_API_VERSION, version: AGENT_VERSION, setup: options.ready() ? 'ready' : 'required' });
      if (route === '/api/unpair' && req.method === 'POST') { auth.revoke(token); return send(200, { ok: true }); }
      if (route.startsWith('/api/jobs/') && req.method === 'GET') {
        const id = route.split('/').at(-1)!; const job = owners.get(id) === token ? service.jobs.get(id) : undefined;
        return send(job ? 200 : 404, job ? publicJob(job) : { error: 'Không tìm thấy tác vụ trong phiên này.' });
      }
      if (!options.ready()) return send(503, { error: 'Agent chưa có toolchain. Hoàn tất thiết lập trên máy này.' });
      if (route === '/api/ports' && req.method === 'GET') {
        if (service.busy) return send(409, { error: 'Chờ build/nạp kết thúc trước khi quét cổng.' });
        if (!portsTask || Date.now() >= portsExpire) {
          portsExpire = Infinity;
          portsTask = listPorts(options.root).finally(() => { portsExpire = Date.now() + 5000; });
        }
        return send(200, await portsTask);
      }
      if (req.method !== 'POST') return send(404, { error: 'Không tìm thấy API.' });
      const data = await json(req);
      if (route === '/api/build') {
        // Limit persisted workspaces across restarts; never accept paths/build scripts from web.
        await mkdir(service.root, { recursive: true });
        if ((await readdir(service.root)).length >= 30) return send(409, { error: 'Đã đạt 30 workspace. Đóng Agent và dọn thư mục builds trong dữ liệu Agent trước khi tiếp tục.' });
        const job = await service.build(data); owners.set(job.id, token); return send(202, publicJob(job));
      }
      if (route === '/api/cancel') {
        const { jobId } = z.object({ jobId: z.string().uuid() }).strict().parse(data);
        if (owners.get(jobId) !== token) return send(404, { error: 'Không tìm thấy tác vụ.' });
        service.cancel(jobId); return send(202, { ok: true });
      }
      if (route === '/api/upload') {
        const { buildId, port } = z.object({ buildId: z.string().uuid(), port: z.string().min(1).max(200) }).strict().parse(data);
        if (owners.get(buildId) !== token) return send(404, { error: 'Không tìm thấy bản build trong phiên này.' });
        const job = await service.upload(buildId, port); owners.set(job.id, token); return send(202, publicJob(job));
      }
      return send(404, { error: 'Không tìm thấy API.' });
    } catch (error) { send(400, { error: describeError(error) }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, service };
}

export async function startAgent() {
  const port = Number(process.env.ESPSTUDIO_AGENT_PORT ?? 3217);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Agent port không hợp lệ.');
  const root = process.env.ESPSTUDIO_AGENT_DATA ?? path.join(process.env.LOCALAPPDATA ?? process.cwd(), 'TTESPStudio', 'agent');
  await mkdir(root, { recursive: true });
  // Production runtime must be isolated. Existing developer PlatformIO is opt-in only.
  if (process.env.ESPSTUDIO_AGENT_DEV !== '1') {
    process.env.PLATFORMIO_CORE_DIR = path.join(root, 'platformio');
    process.env.ESPSTUDIO_PIO = path.join(root, 'python', 'Scripts', 'pio.exe');
  }
  const origins = parseOrigins(process.env.ESPSTUDIO_AGENT_ORIGINS ?? 'http://127.0.0.1:5173,http://127.0.0.1:3210');
  let ready = false;
  const agent = createAgent({ port, root, origins, ready: () => ready, announce: (origin, code) => {
    console.log(`\nWebsite yêu cầu ghép nối: ${origin}\nChỉ nhập mã sau vào website nếu CHÍNH BẠN vừa yêu cầu: ${code}\nMã hết hạn sau 5 phút. Không chia sẻ mã.\n`);
  } });
  agent.server.on('error', error => { console.error('Không mở được Agent (có thể cổng đang bận):', error.message); process.exitCode = 1; });
  agent.server.listen(port, '127.0.0.1', () => console.log(`TT ESPStudio Agent ${AGENT_VERSION} · API v1 · http://127.0.0.1:${port}\nWebsites: ${[...origins].join(', ')}\nCtrl+C để thoát. Chế độ preview, chưa phải bộ cài người dùng cuối.`));
  try { ready = await runProcess(['--version'], root, () => {}, 15000) === 0; } catch { ready = false; }
  console.log(ready ? 'PlatformIO sẵn sàng; gói target sẽ được kiểm tra khi build.' : 'Setup required: chưa tìm thấy PlatformIO trong môi trường Agent.');
  return agent;
}
