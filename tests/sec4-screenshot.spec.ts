import { test, expect } from '@playwright/test';

test('SEC3-SEC4 구간 스크린샷', async ({ page }) => {
  await page.goto('/?mode=marble&players=9&pickMode=last');
  
  // racing 시작 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    return s && s.phase === 'racing';
  }, { timeout: 15000 });

  // 구슬이 SEC3(y>760) 진입할 때까지 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    if (!s) return false;
    return s.marbles.some((m: any) => m.y > 900 && !m.retired);
  }, { timeout: 120000 });

  await page.screenshot({ path: 'screenshots/sec3-entry.png', fullPage: false });
  console.log('SEC3 진입 캡처 완료');

  // SEC4(y>1230) 진입까지 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    if (!s) return false;
    return s.marbles.some((m: any) => m.y > 1290 && !m.retired);
  }, { timeout: 180000 });

  await page.screenshot({ path: 'screenshots/sec4-entry.png', fullPage: false });
  console.log('SEC4 진입 캡처 완료');

  // FAST/SAFE 분기 구간(y>1450) 진입까지
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    if (!s) return false;
    return s.marbles.some((m: any) => m.y > 1450 && !m.retired);
  }, { timeout: 180000 });

  await page.screenshot({ path: 'screenshots/sec4-split.png', fullPage: false });
  
  const state = await page.evaluate(() => (window as any).__MARBLE_STATE__);
  console.log('[SEC4] 구슬 위치:', state.marbles.map((m: any) => `${m.name}:y=${Math.round(m.y)}`).join(', '));
  
  expect(state).not.toBeNull();
});
