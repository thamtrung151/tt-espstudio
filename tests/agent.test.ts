import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentAuth } from '../server/agent-auth';
import { createAgent, parseOrigins } from '../server/agent';

describe('agent pairing boundary', () => {
  it('binds token to exact origin, expires, revokes, limits guesses and never exposes code in API', () => {
    let now = 100; let code = '';
    const auth = new AgentAuth(new Set(['https://owner.github.io', 'http://127.0.0.1:5173']), (_, value) => { code = value; }, () => now);
    expect(() => auth.request('https://evil.example')).toThrow();
    const request = auth.request('https://owner.github.io');
    expect(JSON.stringify(request)).not.toContain(code);
    expect(auth.request('https://owner.github.io')).toEqual(request);
    const session = auth.confirm('https://owner.github.io', request.requestId, code);
    expect(auth.valid('https://owner.github.io', session.token)).toBe(true);
    expect(auth.valid('http://127.0.0.1:5173', session.token)).toBe(false);
    now = session.expiresAt; expect(auth.valid('https://owner.github.io', session.token)).toBe(false);
    const next = auth.request('https://owner.github.io');
    for (let i = 0; i < 5; i++) expect(() => auth.confirm('https://owner.github.io', next.requestId, '00000000')).toThrow();
    expect(() => auth.confirm('https://owner.github.io', next.requestId, code)).toThrow();
    now += 300001;
    const third = auth.request('https://owner.github.io'); const valid = auth.confirm('https://owner.github.io', third.requestId, code);
    auth.revoke(valid.token); expect(auth.valid('https://owner.github.io', valid.token)).toBe(false);
  });
  it('does not accept wildcard, paths, credentials or remote plain HTTP origins', () => {
    for (const origin of ['*', 'http://evil.example', 'https://user.github.io/repo/', 'https://user:pass@example.com', 'null']) expect(() => parseOrigins(origin)).toThrow();
    expect(parseOrigins('https://owner.github.io,http://localhost:5173').size).toBe(2);
  });
});

describe('real loopback agent HTTP API', () => {
  let root: string; let base: string; let agent: ReturnType<typeof createAgent>; let code = '';
  const origin = 'https://owner.github.io';
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'esp-agent-test-'));
    // Reserve a local ephemeral port before creating the Host allowlist.
    const { createServer } = await import('node:net'); const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    agent = createAgent({ port, root, origins: new Set([origin]), ready: () => true, announce: (_, value) => { code = value; } });
    await new Promise<void>(resolve => agent.server.listen(port, '127.0.0.1', resolve)); base = `http://127.0.0.1:${port}/api/`;
  });
  afterAll(async () => { await new Promise<void>(resolve => agent.server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const call = (route: string, body?: unknown, token = '', extra: Record<string, string> = {}) => fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Studio-Token': token, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  it('checks Host, Origin, preflight and authenticated access; rejects shell/config injection', async () => {
    expect((await call('health', undefined, '', { Origin: 'https://evil.example' })).status).toBe(403);
    const { get } = await import('node:http');
    const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => { get(base + 'health', { headers: { Origin: origin, Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
    expect(wrongHostStatus).toBe(403);
    expect((await fetch(base + 'health')).status).toBe(403);
    const preflight = await fetch(base + 'build', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-studio-token', 'Access-Control-Request-Private-Network': 'true' } });
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect((await call('build', {})).status).toBe(401);
    const health = await (await call('health')).json(); expect(health.apiVersion).toBe(1); expect(health.token).toBeUndefined();
    const request = await (await call('pair/request', {})).json();
    const session = await (await call('pair/confirm', { requestId: request.requestId, code })).json();
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await call('build', { config: {}, code: 'x', command: 'cmd.exe' }, session.token)).status).toBe(400);
    expect(agent.service.jobs.size).toBe(0);
    expect((await call('upload', { buildId: '00000000-0000-4000-8000-000000000000', port: 'COM6' }, session.token)).status).toBe(404);
    expect((await call('jobs/00000000-0000-4000-8000-000000000000', undefined, session.token)).status).toBe(404);
    expect((await call('unpair', {}, session.token)).status).toBe(200);
    expect((await call('session', undefined, session.token)).status).toBe(401);
  });
});
