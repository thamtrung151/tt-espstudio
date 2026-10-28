import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentAuth } from '../server/agent-auth';
import { createAgent, parseOrigins } from '../server/agent';
import { isolatedToolchain } from '../server/runtime';
import { type Job } from '../server/service';

describe('native consent and private runtime', () => {
  const origin = 'https://owner.github.io';
  it('requires both native approval and an origin-bound claim secret; consumes the claim once', async () => {
    let approve!: (value: boolean) => void;
    const auth = new AgentAuth(new Set([origin, 'https://other.example']), () => {});
    const request = auth.requestNative(origin, () => new Promise(resolve => { approve = resolve; }));
    await Promise.resolve();
    expect(auth.pollNative(origin, request.requestId, request.claimSecret)).toEqual({ state: 'pending' });
    expect(() => auth.pollNative('https://other.example', request.requestId, request.claimSecret)).toThrow();
    expect(() => auth.pollNative(origin, request.requestId, '0'.repeat(64))).toThrow();
    expect(() => auth.requestNative(origin, async () => true)).toThrow();
    approve(true); await new Promise(resolve => setImmediate(resolve));
    const result = auth.pollNative(origin, request.requestId, request.claimSecret);
    expect(result.state).toBe('approved');
    if (result.state !== 'approved') throw new Error('Expected approved claim');
    expect(auth.valid(origin, result.token)).toBe(true);
    expect(auth.valid('https://other.example', result.token)).toBe(false);
    expect(() => auth.pollNative(origin, request.requestId, request.claimSecret)).toThrow();
  });
  it('fails closed on denial, dialog failure, cancellation and late approval', async () => {
    let now = 1000;
    const auth = new AgentAuth(new Set([origin]), () => {}, () => now);
    for (const approve of [async () => false, async (): Promise<boolean> => { throw new Error('No desktop'); }]) {
      const request = auth.requestNative(origin, approve);
      await new Promise(resolve => setImmediate(resolve));
      expect(auth.pollNative(origin, request.requestId, request.claimSecret)).toEqual({ state: 'denied' });
      now += 30001;
    }
    let finish!: (allowed: boolean) => void;
    const cancelled = auth.requestNative(origin, () => new Promise(resolve => { finish = resolve; }));
    await Promise.resolve();
    auth.cancelNative(origin, cancelled.requestId, cancelled.claimSecret);
    finish(true); await new Promise(resolve => setImmediate(resolve));
    expect(() => auth.pollNative(origin, cancelled.requestId, cancelled.claimSecret)).toThrow();
    now += 30001;
    const expired = auth.requestNative(origin, () => new Promise(resolve => { finish = resolve; }));
    await Promise.resolve(); now += 300001;
    finish(true); await new Promise(resolve => setImmediate(resolve));
    expect(() => auth.pollNative(origin, expired.requestId, expired.claimSecret)).toThrow();
  });
  it('uses bundled Python and private directories, discarding inherited compiler overrides', () => {
    const runtime = path.resolve('private-runtime'); const data = path.resolve('private-data');
    const inherited = { PATH: 'existing-path', PLATFORMIO_CORE_DIR: 'global-core', PLATFORMIO_BUILD_FLAGS: '-include private', PYTHONPATH: 'global-python', PIP_INDEX_URL: 'https://untrusted.invalid', VIRTUAL_ENV: 'other-venv' };
    const result = isolatedToolchain(runtime, data, inherited);
    expect(result.executable).toBe(path.join(runtime, 'python', 'python.exe'));
    expect(result.prefix).toEqual(['-I', '-X', 'utf8', '-m', 'platformio']);
    expect(result.env.PLATFORMIO_CORE_DIR).toBe(path.join(data, 'platformio'));
    for (const name of ['PLATFORMIO_BUILD_FLAGS', 'PYTHONPATH', 'PIP_INDEX_URL', 'VIRTUAL_ENV']) expect(result.env[name]).toBeUndefined();
    expect(inherited.PLATFORMIO_CORE_DIR).toBe('global-core');
    expect(() => isolatedToolchain('relative', data)).toThrow();
  });
});

it('HTTP native pairing cannot downgrade to a code; upload denial or revoked session never starts a flash', async () => {
  const { createServer } = await import('node:net'); const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = 'https://owner.github.io';
  let uploadConsent: () => Promise<boolean> = async () => false;
  let resolveConsent: (allowed: boolean) => void = () => {};
  const scratch = await mkdtemp(path.join(tmpdir(), 'esp-native-http-'));
  const agent = createAgent({ port, root: scratch, origins: new Set([origin]), ready: () => true, announce: () => { throw new Error('Must not use code flow'); }, consent: request => request.kind === 'pair' ? Promise.resolve(true) : uploadConsent() });
  const upload = vi.spyOn(agent.service, 'upload').mockRejectedValue(new Error('Unexpected upload; hardware calls are disabled in this test'));
  await new Promise<void>(resolve => agent.server.listen(port, '127.0.0.1', resolve));
  const call = (route: string, body: unknown, token = '') => fetch(`http://127.0.0.1:${port}/api/${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Studio-Token': token }, body: JSON.stringify(body) });
  try {
    expect((await call('pair/request', {})).status).toBe(409);
    const request = await (await call('pair/native', {})).json();
    expect((await call('pair/status', { ...request, expiresAt: undefined, claimSecret: '0'.repeat(64) })).status).toBe(400);
    const session = await (await call('pair/status', { requestId: request.requestId, claimSecret: request.claimSecret })).json();
    expect(session.state).toBe('approved');
    // Seed ownership with a mocked build; no compiler or USB calls.
    const build: Job = { id: '00000000-0000-4000-8000-000000000001', kind: 'build', status: 'success', log: '', directory: '', target: 'esp32', exitCode: 0 };
    agent.service.jobs.set(build.id, build);
    vi.spyOn(agent.service, 'build').mockResolvedValue(build);
    expect((await call('build', {}, session.token)).status).toBe(202);
    expect((await call('upload', { buildId: build.id, port: 'COM6' }, session.token)).status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    let approve!: (value: boolean) => void;
    let seen!: () => void; const prompted = new Promise<void>(resolve => { seen = resolve; });
    uploadConsent = () => new Promise(resolve => { approve = resolve; resolveConsent = resolve; seen(); });
    const pending = call('upload', { buildId: build.id, port: 'COM6' }, session.token);
    await prompted;
    expect(agent.isBusy()).toBe(true);
    expect((await call('upload', { buildId: build.id, port: 'COM6' }, session.token)).status).toBe(409);
    await call('unpair', {}, session.token);
    approve(true);
    expect((await pending).status).toBe(401);
    expect(upload).not.toHaveBeenCalled();
    expect(agent.isBusy()).toBe(false);
  } finally {
    resolveConsent(false);
    await new Promise<void>(resolve => agent.server.close(() => resolve()));
    await rm(scratch, { recursive: true, force: true }); vi.restoreAllMocks();
  }
});

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
