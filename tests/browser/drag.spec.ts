import { test, expect } from '@playwright/test';

for (const blockId of ['hello', 'led_on', 'wait_on']) {
test(`${blockId} can detach on first drag after reload without stealing focus`, async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await page.reload();
  await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  const block = page.locator(`.blocklyBlockCanvas [data-id="${blockId}"] > .blocklyPath`).first();
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + 14, y = box!.y + 10;
  await page.mouse.move(x, y); await page.mouse.down();
  // Selection events are dispatched asynchronously during the ongoing gesture.
  await expect(page.locator('#code-selection')).toContainText('Block →');
  await expect(page.locator('#code')).not.toBeFocused();
  await expect(page.locator('#code-highlight')).toBeVisible();
  const highlight = await page.locator('#code-highlight').boundingBox();
  expect(highlight!.height).toBeGreaterThan(0);
  await page.mouse.move(x + 170, y + 80, { steps: 20 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(id => {
    const saved = JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!);
    return saved.workspace.blocks.blocks.some((b: { id: string }) => b.id === id);
  }, blockId)).toBe(true);
  await expect(page.locator('#code-selection')).toContainText('Blockly chưa hợp lệ');
  await expect(page.locator('#code-highlight')).toBeHidden();
  await page.locator('#code-mode').click();
  await expect(page.locator('#code')).toBeEditable();
  await expect(page.locator('#notice')).toContainText('chưa phản ánh');
  await page.locator('#code').fill('// manual edit after detached block\nvoid setup() {}\nvoid loop() {}');
  await page.reload();
  await expect(page.locator('#code')).toHaveValue(/manual edit after detached block/);
  await expect(page.locator('#code')).toBeEditable();
  await page.locator('#blocks-mode').click();
  await expect(page.locator('#history-count')).toHaveText('1');
  await expect(page.locator(`.blocklyBlockCanvas [data-id="${blockId}"]`).first()).toBeVisible();
});
}
