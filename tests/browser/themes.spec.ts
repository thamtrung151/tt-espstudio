import {test,expect} from '@playwright/test';
test('three themes preserve source, whiteboard and saved preference',async({page})=>{
 await page.goto('/');await expect(page.locator('#code')).toHaveValue(/digitalWrite/);
 const code=await page.locator('#code').inputValue();
 for(const theme of ['light','transparent','dark']){
  await page.locator('#theme-toggle').click();await page.locator(`[data-theme-choice=${theme}]`).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('#theme-menu')).toBeHidden();
  const colors=await page.evaluate(()=>({white:getComputedStyle(document.documentElement).getPropertyValue('--whiteboard').trim(),blur:getComputedStyle(document.querySelector('.toolbar')!).backdropFilter,bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()}));
  expect(colors.white).toBe('#f8fbfa');if(theme==='transparent')expect(colors.blur).toContain('blur');if(theme==='dark')expect(colors.bg).toBe('#080808');
  await expect(page.locator('#code')).toHaveValue(code);await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 }
 await page.locator('#theme-toggle').click();await page.locator('#theme-menu button').first().focus();await page.keyboard.press('Escape');await expect(page.locator('#theme-menu')).toBeHidden();await expect(page.locator('#theme-toggle')).toBeFocused();
});
