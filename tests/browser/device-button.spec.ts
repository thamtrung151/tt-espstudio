import {test,expect} from '@playwright/test';
import {mockSerial} from './serial-mock';
const port={port:'COM6',description:'Silicon Labs (COM6)',hwid:'USB VID:PID=10C4:EA60 SER=one'};
test('one browser choice resolves COM; cancelled replacement preserves selection',async({page})=>{
  await mockSerial(page);await page.route('**/api/ports',route=>route.fulfill({json:[port]}));
  await page.goto('/');await expect(page.locator('#settings')).toHaveAttribute('data-connected','true');
  await expect(page.locator('#ports,#refresh-ports')).toHaveCount(0);
  await expect(page.locator('#serial-connect')).toHaveAttribute('aria-pressed','false');
  await page.locator('#serial-connect').click();await expect(page.locator('#serial-connect-label')).toHaveText('COM6 (Silicon Labs)');
  expect(await page.evaluate(()=>(window as any).__serialTest.picks)).toBe(1);
  await page.evaluate(()=>(window as any).__serialTest.cancel=true);await page.locator('#serial-connect').click();
  await expect(page.locator('#serial-connect-label')).toHaveText('COM6 (Silicon Labs)');
  await page.locator('#serial-disconnect').click();await expect(page.locator('#serial-connect-label')).toHaveText('Chọn thiết bị');
});
test('identical USB adapters do not silently choose a COM or start a build',async({page})=>{
  await mockSerial(page);let builds=0;
  await page.route('**/api/ports',route=>route.fulfill({json:[port,{...port,port:'COM7',hwid:'USB VID:PID=10C4:EA60 SER=two'}]}));
  await page.route('**/api/build',route=>{builds++;return route.abort()});
  await page.goto('/');await expect(page.locator('#settings')).toHaveAttribute('data-connected','true');
  await page.locator('#serial-connect').click();await expect(page.locator('#notice')).toContainText('nhiều thiết bị');
  await page.locator('#build').click();await expect(page.locator('#notice')).toContainText('nhiều thiết bị');expect(builds).toBe(0);
});
test('changed hardware mapping requires a new browser selection, including on retry',async({page})=>{
  await mockSerial(page);let changed=false,builds=0;
  await page.route('**/api/ports',route=>route.fulfill({json:[changed?{...port,port:'COM7'}:port]}));
  await page.route('**/api/build',route=>{builds++;return route.abort()});
  await page.goto('/');await expect(page.locator('#settings')).toHaveAttribute('data-connected','true');
  await page.locator('#serial-connect').click();await expect(page.locator('#serial-connect-label')).toHaveText('COM6 (Silicon Labs)');
  changed=true;await page.locator('#build').click();await expect(page.locator('#notice')).toContainText('Thiết bị đã thay đổi');
  await page.locator('#build').click();await expect(page.locator('#notice')).toContainText('Thiết bị đã thay đổi');expect(builds).toBe(0);
});
