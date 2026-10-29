import { test, expect } from '@playwright/test';
import { createAgent } from '../../server/agent';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const agentPort = Number(process.env.ESPSTUDIO_TEST_AGENT_PORT ?? 3217);

test.beforeEach(async ({ page, context, baseURL }) => {
  if (!process.env.ESPSTUDIO_TEST_WEB_URL) return;
  // Headless cannot click the browser's native permission prompt. Grant only this
  // test origin's loopback permission; never disable browser security globally.
  await context.grantPermissions(['local-network-access'], { origin: new URL(baseURL!).origin });
});

test('static web editor works offline, pairs with real agent and handles expiry', async ({ page, baseURL }) => {
  await page.goto('./');
  await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'false');
  let buildRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/build')) buildRequests++; });
  await page.locator('#build').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  expect(buildRequests).toBe(0);
  await page.locator('[data-close="settings-dialog"]').click();
  await page.locator('#code-mode').click(); await expect(page.locator('#code')).toBeEditable();
  await page.locator('#code').fill('// online editor without compiler\nvoid setup() {}\nvoid loop() {}');
  await page.reload(); await expect(page.locator('#code')).toHaveValue(/online editor without compiler/);
  let code = '';
  const root = await mkdtemp(path.join(tmpdir(), 'esp-agent-browser-'));
  const agent = createAgent({ port: agentPort, root, origins: new Set([new URL(baseURL!).origin]), ready: () => true, announce: (_, value) => { code = value; } });
  await new Promise<void>((resolve, reject) => { agent.server.once('error', reject); agent.server.listen(agentPort, '127.0.0.1', resolve); });
  try {
    await page.locator('#settings').click(); await page.locator('#agent-connect').click();
    await expect(page.locator('#agent-pair-request')).toHaveCount(0);
    await expect(page.locator('#agent-pair-form')).toBeVisible();
    expect(code).toMatch(/^\d{8}$/);
    await page.locator('#agent-pair-code').fill(code);
    await page.locator('#agent-pair-form button').click();
    await expect(page.locator('#bridge-state')).toContainText('Agent đã ghép nối');
    await expect(page.locator('#notice')).toBeHidden();
    await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'true');
    await expect(page.locator('#agent-connect')).toBeHidden();
    await expect(page.locator('#agent-unpair')).toBeVisible();
    await page.reload(); await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'true');
    await page.locator('#settings').click();
    await page.locator('#agent-unpair').click(); await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'false');
  } finally { await new Promise<void>(resolve => agent.server.close(() => resolve())); }
});

test('native pairing UI waits for local approval and reconnects without typing a code', async ({ page, baseURL }) => {
  let approve!: (value: boolean) => void;
  const root = await mkdtemp(path.join(tmpdir(), 'esp-native-browser-'));
  const agent = createAgent({ port: agentPort, root, origins: new Set([new URL(baseURL!).origin]), ready: () => true,
    announce: () => { throw new Error('Native Agent must not use a pairing code'); },
    consent: () => new Promise(resolve => { approve = resolve; }),
  });
  await new Promise<void>((resolve, reject) => { agent.server.once('error', reject); agent.server.listen(agentPort, '127.0.0.1', resolve); });
  try {
    await page.goto('./'); await page.locator('#settings').click(); await page.locator('#agent-connect').click();
    await expect(page.locator('#agent-message')).toContainText('chọn Có');
    await expect(page.locator('#agent-pair-form')).toBeHidden(); await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'false');
    approve(true);
    await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'true'); await expect(page.locator('#notice')).toBeHidden();
    await page.reload(); await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'true');
    await page.locator('#settings').click(); await page.locator('#agent-unpair').click();
    await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'false');
  } finally { await new Promise<void>(resolve => agent.server.close(() => resolve())); }
});

test('real S3 firmware builds through static web and authenticated agent; broken code fails', async ({ page, baseURL }) => {
  test.skip(process.env.ESPSTUDIO_TEST_FIRMWARE !== '1', 'Opt-in real PlatformIO compiler');
  test.setTimeout(300000);
  let code = '';
  const root = await mkdtemp(path.join(tmpdir(), 'esp-agent-firmware-'));
  const agent = createAgent({ port: agentPort, root, origins: new Set([new URL(baseURL!).origin]), ready: () => true, announce: (_, value) => { code = value; } });
  await new Promise<void>((resolve, reject) => { agent.server.once('error', reject); agent.server.listen(agentPort, '127.0.0.1', resolve); });
  try {
    await page.goto('./'); await page.locator('#settings').click(); await page.locator('#agent-connect').click();
    await expect(page.locator('#agent-pair-form')).toBeVisible();
    await page.locator('#agent-pair-code').fill(code); await page.locator('#agent-pair-form button').click();
    await expect(page.locator('#build')).toHaveAttribute('data-agent-ready', 'true');
    await page.locator('[data-close="settings-dialog"]').click(); await page.locator('[data-view="config"]').click(); await page.locator('#config-target').selectOption('esp32s3');
    await page.locator('.d-pin').fill('38'); await page.locator('#config-form button[type="submit"]').click();
    await page.locator('#build-options').click(); await page.locator('[data-build-action="build"]').click(); await page.locator('#build').click(); await expect(page.locator('#job-status')).toContainText('success', { timeout: 240000 });
    await expect(page.locator('#build-log')).toContainText('SUCCESS');
    await page.locator('[data-view="program"]').click(); await page.locator('#code-mode').click();
    await page.locator('#code').fill('#include <Arduino.h>\n#error EXPECTED_COMPILE_FAILURE\n');
    await page.locator('#build-options').click(); await page.locator('[data-build-action="build"]').click(); await page.locator('#build').click(); await expect(page.locator('#job-status')).toHaveText('Biên dịch · error', { timeout: 60000 });
    await expect(page.locator('#build-log')).toContainText('EXPECTED_COMPILE_FAILURE');
  } finally { await new Promise<void>(resolve => agent.server.close(() => resolve())); }
});
