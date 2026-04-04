import { test, type Page } from '@playwright/test';

interface MarbleState {
  phase: string;
  elapsedTime: number;
  marbles: Array<{
    id: number; name: string; x: number; y: number;
    vx: number; vy: number;
    finished: boolean; retired: boolean; isDummy: boolean;
  }>;
  finishedCount: number;
  outOfBoundsCount: number;
  totalMarbles: number;
}

async function getState(page: Page): Promise<MarbleState | null> {
  return page.evaluate(() => (window as Record<string, unknown>).__MARBLE_STATE__ as MarbleState | null);
}

test('구슬 진행도 60초 모니터링', async ({ page }) => {
  await page.goto('/?mode=marble&players=2&pickMode=last');
  await page.waitForTimeout(3000);

  // 카운트다운 대기
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    try {
      const s = await getState(page);
      if (s?.phase === 'racing') break;
    } catch { /* navigation */ }
    await page.waitForTimeout(500);
  }

  // 60초간 5초마다 진행 상황 로그
  for (let t = 0; t < 60; t += 5) {
    await page.waitForTimeout(5000);
    const state = await getState(page);
    if (!state) { console.log(`[${t+5}s] no state`); continue; }

    const active = state.marbles.filter(m => !m.retired && !m.finished);
    const maxY = Math.max(...active.map(m => m.y), 0);
    const minY = Math.min(...active.map(m => m.y), 9999);
    const positions = active.slice(0, 4).map(m => `${m.name}:(${m.x},${m.y}) v=(${m.vx},${m.vy})`).join(' | ');

    console.log(`[${t+5}s] phase=${state.phase} fin=${state.finishedCount} oob=${state.outOfBoundsCount} maxY=${maxY} minY=${minY} | ${positions}`);

    if (state.phase === 'done') break;
  }
});
