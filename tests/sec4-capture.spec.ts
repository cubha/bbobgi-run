import { test, expect } from '@playwright/test';

// SEC3-SEC4 구간 정밀 캡처
test('SEC4 구조 캡처', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  const page = await context.newPage();

  await page.goto('/?mode=marble&players=9&pickMode=last');

  // racing 시작 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    return s && s.phase === 'racing';
  }, { timeout: 20000 });

  await page.screenshot({ path: 'screenshots/sec4-t0.png' });

  // SEC3 구간(y>900) 진입 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    return s?.marbles?.some((m: any) => m.y > 900 && !m.retired);
  }, { timeout: 120000 });
  await page.screenshot({ path: 'screenshots/sec4-at-sec3.png' });

  // SEC3 출구(y>1250) 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    return s?.marbles?.some((m: any) => m.y > 1250 && !m.retired);
  }, { timeout: 180000 });
  await page.screenshot({ path: 'screenshots/sec4-at-exit.png' });

  // FAST/SAFE 분기(y>1460) 대기
  await page.waitForFunction(() => {
    const s = (window as any).__MARBLE_STATE__;
    return s?.marbles?.some((m: any) => m.y > 1460 && !m.retired);
  }, { timeout: 180000 });
  await page.screenshot({ path: 'screenshots/sec4-at-split.png' });

  const state = await page.evaluate(() => (window as any).__MARBLE_STATE__);
  const positions = state.marbles.map((m: any) =>
    `${m.name}: x=${Math.round(m.x)} y=${Math.round(m.y)}`
  ).join('\n');
  console.log('[마블 위치]\n' + positions);

  await context.close();
  expect(state).not.toBeNull();
});
