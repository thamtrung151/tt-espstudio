import {test,expect} from '@playwright/test';
import {mockSerial} from '../browser/serial-mock';
test('upload shows pending native approval until Agent returns the upload job',async({page})=>{
  await mockSerial(page);
  await page.addInitScript(()=>sessionStorage.setItem('tt-espstudio.agent-session.v1','a'.repeat(64)));
  const session={apiVersion:1,version:'0.4.1',setup:'ready',targets:['esp32'],capabilities:{nativePairing:true,nativeUploadConsent:true,usbConfiguration:true}};
  await page.route('**/api/health',r=>r.fulfill({json:session}));await page.route('**/api/session',r=>r.fulfill({json:session}));
  await page.route('**/api/ports',r=>r.fulfill({json:[{port:'COM6',description:'CP210x',hwid:'USB VID:PID=10C4:EA60'}]}));
  await page.route('**/api/build',r=>r.fulfill({json:{id:'build',status:'success',kind:'build',log:'success'}}));
  let approve!:()=>void;
  await page.route('**/api/upload',async r=>{await new Promise<void>(resolve=>{approve=resolve});await r.fulfill({json:{id:'upload',status:'success',kind:'upload',log:'success'}})});
  await page.goto('./');await expect(page.locator('#settings')).toHaveAttribute('data-connected','true');
  await page.locator('#serial-connect').click();await expect(page.locator('#serial-connect-label')).toContainText('COM6');
  await page.locator('#build').click();await expect(page.locator('#upload-consent-status')).toBeVisible();
  await expect(page.locator('#build-label')).toHaveText('Chờ xác nhận trên Agent…');await expect(page.locator('#serial-connect')).toBeDisabled();
  await expect.poll(()=>typeof approve).toBe('function');approve();
  await expect(page.locator('#upload-consent-status')).toBeHidden();await expect(page.locator('#job-status')).toContainText('success');
  expect(await page.evaluate(()=>(window as any).__serialTest.picks)).toBe(1);
});
