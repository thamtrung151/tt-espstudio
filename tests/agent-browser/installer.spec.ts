import { test, expect } from '@playwright/test';

const installer = 'https://github.com/thamtrung151/tt-espstudio/releases/download/v0.4.9/TTESPStudio-Agent-0.4.9-win-x64.exe';

test('new computer gets a nonmodal installer link without auto launch or download', async ({ page, context }) => {
  let downloads = 0, launches = 0;
  await context.route(installer, route => { downloads++; return route.fulfill({ status: 200, body: 'Test installer link only' }); });
  await page.route('**/api/health', route => route.abort('connectionrefused'));
  await page.exposeFunction('recordLaunch', () => launches++);
  await page.addInitScript(() => document.addEventListener('click', event => {
    if ((event.target as Element).closest('a[href="ttespstudio://connect"]')) {
      event.preventDefault(); (window as any).recordLaunch();
    }
  }, true));
  await page.goto('./');
  await expect(page.locator('#compiler-install-guide')).toBeVisible();
  await expect(page.locator('#compiler-install-title')).toHaveText('Chưa kết nối Compiler');
  await expect(page.locator('#compiler-download')).toHaveAttribute('href', installer);
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
  expect(downloads).toBe(0); expect(launches).toBe(0);
  await page.locator('#code-mode').click(); await expect(page.locator('#code')).toBeEditable();
  const popupPromise = context.waitForEvent('page');
  await page.locator('#compiler-download').click();
  const popup = await popupPromise;
  await expect.poll(() => downloads).toBe(1); await popup.close();
  await page.locator('#compiler-install-close').click(); await expect(page.locator('#compiler-install-guide')).toBeHidden();
  await page.locator('#help').click(); await expect(page.locator('#help-agent-download')).toHaveAttribute('href', installer);
});

test('installed reachable Agent does not show installation guidance', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { apiVersion: 1, version: '0.4.9', setup: 'ready' } }));
  await page.goto('./'); await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await page.waitForTimeout(500);
  await expect(page.locator('#compiler-install-guide')).toBeHidden();
});

test('connect from install guidance pairs in one step and hides guidance', async ({ page }) => {
  let reachable = false, pairs = 0;
  await page.route('**/api/health', route => reachable ? route.fulfill({ json: { apiVersion: 1, version: '0.4.9', setup: 'ready', capabilities: { nativePairing: true, nativeUploadConsent: true, usbConfiguration: true } } }) : route.abort('connectionrefused'));
  await page.route('**/api/pair/native', route => { pairs++; return route.fulfill({ json: { requestId: 'test', claimSecret: 'local-consent', expiresAt: Date.now() + 60000 } }); });
  await page.route('**/api/pair/status', route => route.fulfill({ json: { state: 'approved', apiVersion: 1, token: 'a'.repeat(64) } }));
  await page.route('**/api/session', route => route.fulfill({ json: { apiVersion: 1, version: '0.4.9', setup: 'ready' } }));
  await page.goto('./'); await expect(page.locator('#compiler-install-guide')).toBeVisible();
  reachable = true;
  await page.locator('#compiler-install-connect').click();
  await expect(page.locator('#settings')).toHaveAttribute('aria-pressed', 'true');
  expect(pairs).toBe(1);
  await expect(page.locator('#compiler-install-guide')).toBeHidden();
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
});
