import {test,expect} from '@playwright/test';
for(const ambiguous of [false,true])test(`CDC returns as a new authorized port; ambiguous=${ambiguous}`,async({page})=>{
 await page.addInitScript(({ambiguous})=>{
  let controller:ReadableStreamDefaultController<Uint8Array>;
  const state={picks:0,polls:0,opens:0,reboot:false,emit:(text:string)=>controller.enqueue(new TextEncoder().encode(text))};
  (window as any).__cdc=state;
  const makePort=()=>{const p:any={readable:null,writable:null,getInfo:()=>({usbVendorId:0x303a,usbProductId:0x80ab}),open:async()=>{state.opens++;p.readable=new ReadableStream({start(c){controller=c}});p.writable=new WritableStream()},close:async()=>{p.readable=null;p.writable=null}};return p};
  const old=makePort(),fresh=makePort(),other=makePort();
  Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>{state.picks++;return old},getPorts:async()=>{state.polls++;if(!state.reboot)return[old];old.connected=false;if(state.polls<3)return[old];return ambiguous?[old,fresh,other]:[old,fresh]}}});
 },{ambiguous});
 await page.route('**/api/ports',route=>route.fulfill({json:[{port:'COM10',description:'Saola TinyUSB CDC',hwid:'USB VID:PID=303A:80AB SER=test'}]}));
 await page.route('**/api/build',route=>route.fulfill({json:{id:'b',kind:'build',status:'success',log:'built'}}));
 await page.route('**/api/upload',async route=>{await page.evaluate(()=>(window as any).__cdc.reboot=true);return route.fulfill({json:{id:'u',kind:'upload',status:'error',log:'Hash of data verified.\nLeaving...\nHard resetting with a watchdog...\nCannot configure port'}})});
 page.on('dialog',d=>d.accept());await page.goto('/');await expect(page.locator('#settings')).toHaveAttribute('data-connected','true');await page.locator('#serial-connect').click();await expect(page.locator('#serial-connect-label')).toContainText('COM10');
 await page.locator('#build').click();
 if(ambiguous){await expect(page.locator('#notice')).toContainText('nhiều cổng');expect(await page.evaluate(()=>(window as any).__cdc.opens)).toBe(1);}
 else{await expect.poll(()=>page.evaluate(()=>(window as any).__cdc.opens)).toBe(2);await expect(page.locator('#serial-connect-label')).toContainText('COM10');await page.evaluate(()=>(window as any).__cdc.emit('CDC recovered'));await expect(page.locator('#serial-log')).toContainText('CDC recovered');await expect(page.locator('#build-state')).toContainText('bước kết thúc/reset');}
 expect(await page.evaluate(()=>(window as any).__cdc.picks)).toBe(1);
});
