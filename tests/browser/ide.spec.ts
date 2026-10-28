import {test,expect,type Page} from '@playwright/test';

test('C++ header changes ownership and pane priority; returning preserves history',async({page})=>{
  await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  const before=await page.locator('.code-pane').boundingBox();
  await page.locator('#code-mode').click();await expect(page.locator('#code')).toBeEditable();
  expect((await page.locator('.code-pane').boundingBox())!.width).toBeGreaterThan(before!.width);
  const source='// preserved <script>alert(1)</script>\nvoid setup(){}\nvoid loop(){}';
  await page.locator('#code').fill(source);await page.locator('#locale-en').click();
  await expect(page.locator('[data-view=config]')).toHaveText('Configuration');
  await expect(page.locator('#code')).toHaveValue(source);await expect(page.locator('#code-render script')).toHaveCount(0);
  await page.locator('#blocks-mode').click();await expect(page.locator('#code')).not.toBeEditable();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tt-espstudio.project.v1')!));
  expect(saved.codeHistory.at(-1).code).toBe(source);expect(saved.mode).toBe('blocks');
  await page.locator('#locale-vi').click();await expect(page.locator('[data-view=config]')).toHaveText('Cấu hình');
  await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
});

test('splitters, drawer and locale do not change project; Blockly drag still works after resize',async({page})=>{
  await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  const getProject=()=>page.evaluate(()=>localStorage.getItem('tt-espstudio.project.v1'));
  const saved=await getProject();
  const divider=await page.locator('#pane-divider').boundingBox();
  await page.mouse.move(divider!.x+5,divider!.y+70);await page.mouse.down();await page.mouse.move(divider!.x-140,divider!.y+70,{steps:10});await page.mouse.up();
  await page.locator('#monitor-toggle').click();await expect(page.locator('#monitor-content')).toBeHidden();
  await page.locator('#locale-en').click();await expect(page.locator('#build-label')).toHaveText('Build & upload');
  await expect(page.locator('#usb-state')).toContainText('Not connected');
  expect(await getProject()).toBe(saved);
  await page.reload();await expect(page.locator('#monitor-content')).toBeHidden();await expect(page.locator('#locale-en')).toHaveAttribute('aria-pressed','true');
  await page.locator('#locale-vi').click();
  const box=await page.locator('.blocklyBlockCanvas [data-id="led_on"] > .blocklyPath').first().boundingBox();
  await page.mouse.move(box!.x+14,box!.y+10);await page.mouse.down();await page.mouse.move(box!.x+170,box!.y+80,{steps:20});await page.mouse.up();
  await expect(page.locator('#notice')).toContainText('block rời');await expect(page.locator('#build')).toBeDisabled();
});

test('real palette search creates usable flyout blocks; placeholders are explicit',async({page})=>{
  await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  await page.locator('#block-search').fill('servo');await expect(page.locator('.category-button:visible')).toHaveCount(1);
  await expect(page.locator('.blocklyFlyout:visible .blocklyDraggable').first()).toBeVisible();
  await page.locator('#block-search').fill('no-such-block');await expect(page.locator('#search-empty')).toBeVisible();
  await page.locator('#ai-tutor').click();await expect(page.locator('#info-text')).toContainText('phiên bản sau');await page.locator('[data-close=info-dialog]').click();
  await page.locator('#account').click();await expect(page.locator('#info-text')).toContainText('Chưa đăng nhập');
});

async function mockedCompiler(page:Page, result:'success'|'error'='success', pending=false){
  let builds=0,uploads=0,finished=!pending;const events:string[]=[];
  await page.route('**/api/ports',route=>route.fulfill({json:[{port:'COM_TEST',description:'Test-only mock'},{port:'COM_OTHER'}]}));
  await page.route('**/api/build',route=>{builds++;events.push('build');return route.fulfill({json:{id:'test-build',kind:'build',status:'running',log:'test build'}})});
  await page.route('**/api/jobs/test-build',route=>route.fulfill({json:{id:'test-build',kind:'build',status:finished?result:'running',log:finished?result:'test build'}}));
  await page.route('**/api/upload',route=>{uploads++;events.push('upload');return route.fulfill({json:{id:'test-upload',kind:'upload',status:'success',log:'test upload'}})});
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('/');await expect(page.locator('#build')).toHaveAttribute('data-agent-ready','true');
  await page.locator('#refresh-ports').click();await page.locator('#ports').selectOption('COM_TEST');
  return {builds:()=>builds,uploads:()=>uploads,events,finish:()=>{finished=true}};
}
test('build only never uploads; build and upload waits for success',async({page})=>{
  const service=await mockedCompiler(page);await expect(page.locator('#build-menu')).toBeHidden();
  await page.locator('#build-options').click();await page.locator('[data-build-action=build]').click();await page.locator('#build').click();
  await expect(page.locator('#job-status')).toContainText('success');expect(service.builds()).toBe(1);expect(service.uploads()).toBe(0);
  await page.locator('#build-options').click();await page.locator('[data-build-action=upload]').click();await page.locator('#build').click();
  await expect.poll(service.uploads).toBe(1);expect(service.events).toEqual(['build','build','upload']);
});
test('failed builds cannot upload',async({page})=>{
  const service=await mockedCompiler(page,'error');await page.locator('#build').click();
  await expect(page.locator('#job-status')).toContainText('error');expect(service.uploads()).toBe(0);await expect(page.locator('#upload')).toBeDisabled();
});
test('changes while building cannot upload stale firmware',async({page})=>{
  const service=await mockedCompiler(page,'success',true);await page.locator('#build').click();await expect.poll(service.builds).toBe(1);
  await page.locator('#code-mode').click();await page.locator('#code').fill('// changed during build\nvoid setup(){}\nvoid loop(){}');service.finish();
  await expect(page.locator('#notice')).toContainText('đã thay đổi');expect(service.uploads()).toBe(0);await expect(page.locator('#upload')).toBeDisabled();
});
test('changing the selected port during build cannot redirect an upload',async({page})=>{
  const service=await mockedCompiler(page,'success',true);await page.locator('#build').click();await expect.poll(service.builds).toBe(1);
  await page.locator('#ports').selectOption('COM_OTHER');service.finish();await expect(page.locator('#notice')).toContainText('cổng đã thay đổi');expect(service.uploads()).toBe(0);
});
test('serial display, send, pause, save and upload port release use real API state',async({page})=>{
  await page.addInitScript(()=>{
    let controller:ReadableStreamDefaultController<Uint8Array>;const state={opened:false,closed:false,sent:'',emit:(text:string)=>controller.enqueue(new TextEncoder().encode(text))};
    (window as any).__serialTest=state;
    Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>({readable:new ReadableStream<Uint8Array>({start(c){controller=c}}),writable:new WritableStream<Uint8Array>({write(data){state.sent+=new TextDecoder().decode(data)}}),open:async()=>{state.opened=true},close:async()=>{state.closed=true}})}});
  });
  const service=await mockedCompiler(page);await page.locator('#serial-connect').click();await expect(page.locator('#usb-state')).toContainText('Serial đã kết nối');
  await page.evaluate(()=>(window as any).__serialTest.emit('first\n'));await expect(page.locator('#serial-log')).toContainText('first');
  await page.locator('#serial-pause').click();await page.evaluate(()=>(window as any).__serialTest.emit('second\n'));await expect(page.locator('#serial-log')).not.toContainText('second');
  await page.locator('#serial-pause').click();await expect(page.locator('#serial-log')).toContainText('second');
  await page.locator('#serial-command').fill('test');await page.locator('#serial-send').click();expect(await page.evaluate(()=>(window as any).__serialTest.sent)).toBe('test\n');
  const download=page.waitForEvent('download');await page.locator('#serial-save').click();expect((await download).suggestedFilename()).toBe('espstudio-serial.log');
  await page.locator('#build').click();await expect.poll(service.uploads).toBe(1);expect(await page.evaluate(()=>(window as any).__serialTest.closed)).toBe(true);await expect(page.locator('#usb-state')).toContainText('Chưa kết nối');
});
for(const [width,height]of [[1920,1080],[1728,891],[1440,900],[1366,768],[390,844]])test(`viewport ${width}x${height} stays inside the IDE`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
  expect(await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}))).toEqual({w:width,h:height});
  for(const selector of ['#build','#serial-connect','#settings','#account','#ai-tutor'])await expect(page.locator(selector)).toBeInViewport();
  const svg=await page.locator('.blocklySvg').first().boundingBox();expect(svg!.width).toBeGreaterThan(200);expect(svg!.height).toBeGreaterThan(200);
});
