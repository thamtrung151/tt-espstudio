import { test, expect } from '@playwright/test';

test('account UI preserves local projects, escapes profile text, restores session and signs out (mock provider)', async ({ page }) => {
  await page.route('http://127.0.0.1:3217/**', route => route.abort());
  await page.route('**/assets/google-*.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: [
      'export function parseAuthConfig() { return {}; }',
      'export function authError() { return "Test login failed"; }',
      'export function createGoogleAccount() {',
      'let next; const key="test.account";',
      'const user={displayName:"<img src=x onerror=alert(1)>",email:"test@example.invalid"};',
      'return {',
      'observe(cb) { next=cb; queueMicrotask(()=>cb(sessionStorage.getItem(key)?user:null)); },',
      'async login() { sessionStorage.setItem(key,"yes"); next(user); await new Promise(r=>setTimeout(r,300)); },',
      'async logout() { sessionStorage.removeItem(key); next(null); }',
      '}; }',
    ].join('\n'),
  }));
  await page.goto('/');
  await page.locator('#locale-vi').click();
  await page.locator('#account').click();
  await expect(page.locator('#account-action')).toBeEnabled();
  const project = await page.evaluate(() => localStorage.getItem('tt-espstudio.project.v1'));
  await page.locator('#account-action').click();
  await expect(page.locator('#account-name')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#account-name img')).toHaveCount(0);
  await expect(page.locator('#account-action')).toHaveText('Đăng xuất');
  await page.reload();
  await page.locator('#account').click();
  await expect(page.locator('#account-email')).toHaveText('test@example.invalid');
  await page.locator('#account-action').click();
  await expect(page.locator('#account-action')).toHaveText('Đăng nhập bằng Google');
  await expect(page.locator('#account-email')).toBeEmpty();
  expect(await page.evaluate(() => localStorage.getItem('tt-espstudio.project.v1'))).toBe(project);
});
