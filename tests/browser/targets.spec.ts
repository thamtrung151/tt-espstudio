import { test, expect } from '@playwright/test';
test('S2/C3 profiles persist without rewriting GPIO selection or requiring a motor', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-view="config"]').click();
  for (const target of ['esp32s2', 'esp32c3']) {
    await page.locator('#config-target').selectOption(target);
    await page.locator('#config-pins').fill('4, 200');
    await page.locator('#config-form button[type="submit"]').click();
    await expect(page.locator('#config-errors')).toHaveText('');
    await page.reload(); await page.locator('[data-view="config"]').click();
    await expect(page.locator('#config-target')).toHaveValue(target);
    await expect(page.locator('#config-pins')).toHaveValue('4, 200');
  }
});
