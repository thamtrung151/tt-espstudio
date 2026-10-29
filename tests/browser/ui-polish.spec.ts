import {test,expect} from '@playwright/test';
test('light theme has light controls and readable code/log text, persists across reload',async({page})=>{
  await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await page.locator('#theme-toggle').click();await page.locator('[data-theme-choice=light]').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  const colors=await page.evaluate(()=>{
    const rgb=(value:string)=>(value.match(/\d+/g)??[]).slice(0,3).map(Number);
    return {background:rgb(getComputedStyle(document.querySelector('.segmented')!).backgroundColor),code:rgb(getComputedStyle(document.getElementById('code-render')!).color),log:rgb(getComputedStyle(document.getElementById('serial-log')!).color)};
  });
  expect(Math.min(...colors.background)).toBeGreaterThan(200);
  expect(Math.max(...colors.code)).toBeLessThan(100);expect(Math.max(...colors.log)).toBeLessThan(100);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
test('wheel animates through intermediate scales; flyout stays fixed and can create a block at large zoom',async({page})=>{
  await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await page.locator('[data-category="1"]').click();
  const block=page.locator('.blocklyFlyout .blocklyBlockCanvas [data-id] > .blocklyPath').first();
  const initial=await block.boundingBox();expect(initial).not.toBeNull();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!).workspace.blocks.blocks.length);
  await page.evaluate(()=>{
    (window as any).__zoomSamples=[];
    new MutationObserver(()=>{(window as any).__zoomSamples.push(Number(document.getElementById('workspace-minimap')!.dataset.zoom))}).observe(document.getElementById('workspace-minimap')!,{attributes:true,attributeFilter:['data-zoom']});
  });
  const board=await page.locator('#blockly').boundingBox();
  await page.mouse.move(board!.x+board!.width-100,board!.y+100);
  for(let i=0;i<4;i++)await page.mouse.wheel(0,-200);
  await expect.poll(async()=>Number(await page.locator('#workspace-minimap').getAttribute('data-zoom'))).toBeGreaterThan(2.5);
  // Wait for animation to settle before measuring hit targets.
  await expect.poll(async()=>Math.abs(Number(await page.locator('#workspace-minimap').getAttribute('data-zoom'))-1.05*Math.exp(1.12))).toBeLessThan(.002);
  expect(new Set(await page.evaluate(()=>(window as any).__zoomSamples)).size).toBeGreaterThan(4);
  const zoomed=await block.boundingBox();expect(Math.abs(zoomed!.width-initial!.width)).toBeLessThan(1);
  await page.mouse.move(zoomed!.x+12,zoomed!.y+10);await page.mouse.down();
  await page.mouse.move(board!.x+board!.width-180,board!.y+210,{steps:20});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!).workspace.blocks.blocks.length)).toBe(before+1);
});
