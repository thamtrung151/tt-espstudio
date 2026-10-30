import {test,expect} from '@playwright/test';
for(const mode of ['same-com','other-com','idle-loss'])test(`0.4.5 handoff with post-upload COM recovery: ${mode}`,async({page})=>{
 await page.addInitScript(()=>{
  let controller:ReadableStreamDefaultController<Uint8Array>;
  const state={picks:0,opens:0,polls:0,opened:false,reboot:false,emit:(text:string)=>controller.enqueue(new TextEncoder().encode(text)),lose:()=>controller.error(new Error('USB detached'))};
  (window as any).__cdc=state;
  const makePort=(pid:number)=>{const p:any={connected:true,readable:null,writable:null,getInfo:()=>({usbVendorId:0x303a,usbProductId:pid}),open:async()=>{state.opens++;state.opened=true;p.readable=new ReadableStream({start(c){controller=c}});p.writable=new WritableStream()},close:async()=>{state.opened=false;p.readable=null;p.writable=null}};return p};
  const old=makePort(2),fresh=makePort(0x80ab);
  Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>{state.picks++;return old},getPorts:async()=>{state.polls++;if(!state.reboot)return[old];old.connected=false;return[old,fresh]}}});
 });
 let uploaded=false,uploads=0,stillOpen=false;
 await page.route('**/api/ports',route=>route.fulfill({json:[{port:uploaded&&mode==='other-com'?'COM11':'COM10',description:uploaded?'Saola TinyUSB CDC':'USB Serial Device',hwid:uploaded?'USB VID:PID=303A:80AB SER=test':'USB VID:PID=303A:0002 SER=test'}]}));
 await page.route('**/api/build',route=>route.fulfill({json:{id:'b',kind:'build',status:'success',log:'built'}}));
 await page.route('**/api/upload',async route=>{
  stillOpen=await page.evaluate(()=>(window as any).__cdc.opened);uploads++;uploaded=true;
  expect(route.request().postDataJSON().port).toBe('COM10');
  await page.evaluate(()=>(window as any).__cdc.reboot=true);
  return route.fulfill({json:{id:'u',kind:'upload',status:'success',log:'uploaded'}});
 });
 page.on('dialog',d=>d.accept());await page.goto('/');await expect(page.locator('#settings')).toHaveAttribute('data-connected','true');await page.locator('#serial-connect').click();await expect(page.locator('#serial-connect-label')).toContainText('COM10');
 if(mode==='idle-loss'){
  await page.evaluate(()=>(window as any).__cdc.lose());await expect(page.locator('#serial-connect')).toHaveAttribute('aria-pressed','false');await page.waitForTimeout(800);
  expect(await page.evaluate(()=>(window as any).__cdc.opens)).toBe(1);expect(await page.evaluate(()=>(window as any).__cdc.polls)).toBe(0);expect(uploads).toBe(0);return;
 }
 await page.locator('#build').click();await expect.poll(()=>uploads).toBe(1);expect(stillOpen).toBe(false);
 if(mode==='same-com'){
  await expect(page.locator('#serial-connect-label')).toContainText('COM10 (Saola TinyUSB CDC)');await page.evaluate(()=>(window as any).__cdc.emit('CDC recovered'));await expect(page.locator('#serial-log')).toContainText('CDC recovered');
  await page.locator('#build').click();await expect.poll(()=>uploads).toBe(2);expect(stillOpen).toBe(false);
 }else{await expect(page.locator('#notice')).toContainText('Chưa mở lại được Serial trên COM vừa nạp',{timeout:18000});expect(await page.evaluate(()=>(window as any).__cdc.opens)).toBe(1);}
 expect(await page.evaluate(()=>(window as any).__cdc.picks)).toBe(1);
});
