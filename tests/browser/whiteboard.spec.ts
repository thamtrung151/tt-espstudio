import {test,expect} from '@playwright/test';
test('wheel zoom, middle drag and minimap move the viewport without modifying the program',async({page})=>{
  await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  const mini=page.locator('#workspace-minimap');await expect(mini).toHaveAttribute('data-zoom',/./);
  const code=await page.locator('#code').inputValue();
  const saved=await page.evaluate(()=>localStorage.getItem('tt-espstudio.project.v1'));
  const zoom=Number(await mini.getAttribute('data-zoom'));
  const board=await page.locator('#blockly').boundingBox();
  await page.mouse.move(board!.x+board!.width*.75,board!.y+board!.height*.4);await page.mouse.wheel(0,-200);
  await expect.poll(async()=>Number(await mini.getAttribute('data-zoom'))).toBeGreaterThan(zoom);
  const scroll=await mini.getAttribute('data-scroll');
  await page.mouse.down({button:'middle'});await page.mouse.move(board!.x+board!.width*.75+90,board!.y+board!.height*.4+60,{steps:10});await page.mouse.up({button:'middle'});
  await expect(mini).not.toHaveAttribute('data-scroll',scroll!);
  const moved=await mini.getAttribute('data-scroll');await mini.click({position:{x:20,y:20}});await expect(mini).not.toHaveAttribute('data-scroll',moved!);
  await expect(page.locator('#zoom-in,#zoom-out')).toHaveCount(0);
  await expect(page.locator('#code')).toHaveValue(code);
  expect(await page.evaluate(()=>localStorage.getItem('tt-espstudio.project.v1'))).toBe(saved);
  // Normal right-click still uses Blockly's context menu.
  await page.mouse.click(board!.x+board!.width*.8,board!.y+30,{button:'right'});
  await expect(page.locator('.blocklyContextMenu')).toBeVisible();
});
