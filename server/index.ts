import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { BuildService, findPio, listPorts } from './service';
import { describeError } from '../src/core/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.ESPSTUDIO_PORT ?? 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('ESPSTUDIO_PORT must be 1024–65535.');
const token = randomBytes(32).toString('hex'); const service = new BuildService(path.join(root, '.builds'));
const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1:5173', 'localhost:5173'];
const allowedOrigins = new Set(allowedHosts.map(host => `http://${host}`));
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
  if (!allowedHosts.includes(req.headers.host ?? '')) return send(403, { error: 'Host không được phép.' });
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return send(403, { error: 'Origin không được phép.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Không cho phép truy cập cross-site.' });
  const url = new URL(req.url ?? '/', 'http://127.0.0.1:3210');
  try {
    if (url.pathname === '/api/session' && req.method === 'GET') return send(200, { token, pio: findPio(), version: '0.2.1' });
    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-studio-token'] !== token) return send(403, { error: 'Phiên làm việc hết hạn. Tải lại trang.' });
      if (url.pathname === '/api/ports' && req.method === 'GET') return send(200, await listPorts(root));
      if (url.pathname.startsWith('/api/jobs/') && req.method === 'GET') {
        const job = service.jobs.get(url.pathname.split('/').at(-1)!);
        return send(job ? 200 : 404, job ?? { error: 'Không tìm thấy tác vụ.' });
      }
      if (req.method !== 'POST') return send(404, { error: 'Không tìm thấy API.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Yêu cầu application/json.' });
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1000000) { send(413, { error: 'Request quá lớn.' }); return; } chunks.push(chunk); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (url.pathname === '/api/build') return send(202, await service.build(data));
      if (url.pathname === '/api/upload') {
        const request = z.object({ buildId: z.string().uuid(), port: z.string().min(1).max(200) }).strict().parse(data);
        return send(202, await service.upload(request.buildId, request.port));
      }
      return send(404, { error: 'Không tìm thấy API.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Method không hỗ trợ.' });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const dist = path.join(root, 'dist'); const file = path.resolve(dist, `.${relative}`);
    if (!file.startsWith(dist + path.sep)) return send(403, { error: 'Đường dẫn không hợp lệ.' });
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return send(404, { error: 'Chưa có giao diện build. Chạy npm run build trước.' });
    send(400, { error: describeError(error) });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`TT ESPStudio: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
