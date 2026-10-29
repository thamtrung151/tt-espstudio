import {test,expect} from '@playwright/test';
test('glass canvas fills viewport, flyout drag and wheel work between floating panels',async({page})=>{
 await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
 await page.locator('#theme-toggle').click();await page.locator('[data-theme-choice=transparent]').click();
 await expect.poll(async()=>Math.round((await page.locator('#blockly').boundingBox())!.width)).toBe(1440);
 const board=(await page.locator('#blockly').boundingBox())!;expect(board.x).toBe(0);expect(board.y).toBe(0);expect(board.height).toBe(1000);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!).workspace.blocks.blocks.length);
 await page.locator('[data-category="1"]').click();const block=page.locator('.blocklyFlyout .blocklyBlockCanvas [data-id] > .blocklyPath').first();const rect=(await block.boundingBox())!;
 expect(rect.x).toBeGreaterThan((await page.locator('.sidebar').boundingBox())!.width);
 await page.mouse.move(rect.x+15,rect.y+10);await page.mouse.down();await page.mouse.move(800,420,{steps:20});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!).workspace.blocks.blocks.length)).toBe(before+1);
 await page.mouse.move(900,500);await page.mouse.wheel(0,-200);await expect.poll(async()=>Number(await page.locator('#workspace-minimap').getAttribute('data-zoom'))).toBeGreaterThan(1.2);
 await page.locator('[data-view=config]').click();await expect(page.locator('#config-name')).toBeVisible();await expect(page.locator('#blockly')).toBeHidden();
 await page.locator('[data-view=program]').click();await expect(page.locator('#blockly')).toBeVisible();
});
test('native USB choices follow target and notices stay in bottom right',async({page})=>{
 await page.goto('/');await page.locator('[data-view=config]').click();await expect(page.locator('#usb-settings')).toBeHidden();
 for(const target of ['esp32s2','esp32s3','esp32c3']){await page.locator('#config-target').selectOption(target);await expect(page.locator('#usb-settings')).toBeVisible();await page.locator('[data-transport=usb-cdc]').click();await expect(page.locator('[data-transport=usb-cdc]')).toHaveAttribute('aria-pressed','true');}
 await expect(page.locator('#usb-help')).toContainText('Serial/JTAG');await page.locator('#config-target').selectOption('esp32');await expect(page.locator('#usb-settings')).toBeHidden();await expect(page.locator('#config-serial')).toHaveValue('default');
 const toast=(await page.locator('#notice').boundingBox())!;expect(toast.x).toBeGreaterThan(950);expect(toast.y).toBeGreaterThan(750);expect(toast.x+toast.width).toBeLessThanOrEqual(1440);
 await page.locator('#notice').click();await expect(page.locator('#notice')).toBeHidden();
});
