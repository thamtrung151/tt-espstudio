import { test, expect } from '@playwright/test';

test('missing PWM selection clears its error when corrected; rejected motor replacement cannot build old config', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await page.evaluate(() => {
    const key = 'tt-espstudio.project.v1';
    const project = JSON.parse(localStorage.getItem(key)!);
    project.config.devices.push({ id: 'm1', label: 'PWM output', driver: 'pwm.output', pin: 4, frequencyHz: 20000 });
    project.workspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_loop', id: 'loop', x: 40, y: 40, inputs: { DO: { block: { type: 'device_pwm', id: 'pwm', fields: { DEVICE: '__missing__', PERCENT: 50 } } } } }] } };
    localStorage.setItem(key, JSON.stringify(project));
  });
  await page.reload();
  await expect(page.locator('#notice')).toContainText('Block chưa chọn thiết bị');
  await expect(page.locator('#build')).toBeDisabled();
  await page.locator('.blocklyBlockCanvas [data-id="pwm"] .blocklyDropdownText').click();
  await page.locator('.blocklyDropdownMenu').getByText('PWM output (m1)', { exact: true }).click();
  await expect(page.locator('#code')).toHaveValue(/ledcWrite\(channel_m1, 128\)/);
  await expect(page.locator('#notice')).toBeHidden();
  await expect(page.locator('#build')).toBeEnabled();
  await page.locator('[data-view="config"]').click();
  const original = JSON.parse(await page.locator('#config-json').inputValue());
  const replacement = structuredClone(original);
  replacement.devices = replacement.devices.filter((d: { id: string }) => d.id !== 'm1');
  replacement.devices.push({ id: 'device_1', label: 'Motor', driver: 'motor.hbridge2', in1: 2, in2: 4, frequencyHz: 20000, reversed: false });
  await page.locator('#config-json').fill(JSON.stringify(replacement));
  await expect(page.locator('#build')).toBeDisabled();
  await page.locator('#apply-json').click();
  await expect(page.locator('#config-errors')).toContainText('m1');
  await expect(page.locator('#build')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!).config)).toEqual(original);
  await page.locator('#discard-config').click();
  await expect(page.locator('#build')).toBeEnabled();
  // Adding a separate motor is valid; existing PWM references remain intact.
  original.devices.push(replacement.devices.at(-1));
  await page.locator('#config-json').fill(JSON.stringify(original));
  await page.locator('#apply-json').click();
  await expect(page.locator('#config-errors')).toBeEmpty();
  await expect(page.locator('#code')).toHaveValue(/motor_device_1_in1/);
  await expect(page.locator('#code')).toHaveValue(/ledcWrite\(channel_m1, 128\)/);
  await expect(page.locator('#build')).toBeEnabled();
});
