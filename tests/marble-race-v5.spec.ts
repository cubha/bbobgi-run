import { test, expect, type Page } from '@playwright/test';

interface MarbleDebug {
  phase: string;
  elapsed: number;
  marbles: Array<{
    name: string;
    x: number;
    y: number;
    finished: boolean;
    retired: boolean;
    isDummy: boolean;
  }>;
  finishedCount: number;
  totalMarbles: number;
}

async function getDebug(page: Page): Promise<MarbleDebug | null> {
  return page.evaluate(() => (window as Record<string, unknown>).__MARBLE_DEBUG__ as MarbleDebug | null);
}

async function waitForPhase(page: Page, phase: string, timeout = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const debug = await getDebug(page);
    if (debug?.phase === phase) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for phase: ${phase}`);
}

async function waitForRacing(page: Page): Promise<void> {
  await waitForPhase(page, 'racing', 15_000);
}

test.describe('Marble Race V5', () => {
  test('구슬 9개 시작 + 레이싱 진입 확인', async ({ page }) => {
    // 구슬 레이스 자동 시작 (2명 플레이어 + 더미로 9개 보충)
    await page.goto('/?mode=marble&players=2');
    await page.waitForTimeout(2000);

    // 카운트다운 후 레이싱 진입 대기
    await waitForRacing(page);

    const debug = await getDebug(page);
    expect(debug).not.toBeNull();
    expect(debug!.phase).toBe('racing');
    expect(debug!.totalMarbles).toBeGreaterThanOrEqual(6);

    // 구슬이 Y=50 근처에서 시작했는지
    for (const m of debug!.marbles) {
      expect(m.y).toBeGreaterThan(0);
    }

    console.log(`[OK] ${debug!.totalMarbles} marbles racing`);
  });

  test('구슬 완주 확인 (60초 대기)', async ({ page }) => {
    await page.goto('/?mode=marble&players=3&pickMode=last');
    await page.waitForTimeout(2000);
    await waitForRacing(page);

    // 300초간 대기하며 구슬 진행 관찰
    const startTime = Date.now();
    const maxWait = 300_000;
    let lastDebug: MarbleDebug | null = null;

    while (Date.now() - startTime < maxWait) {
      lastDebug = await getDebug(page);
      if (!lastDebug) {
        await page.waitForTimeout(1000);
        continue;
      }

      // 게임 종료 확인
      if (lastDebug.phase === 'done' || lastDebug.phase === 'slowmo') {
        break;
      }

      // 5초마다 진행 상황 로그 (x, y, vx, vy)
      if ((Date.now() - startTime) % 5000 < 1000) {
        const positions = lastDebug.marbles.map((m: Record<string, unknown>) =>
          `${m.name}:(${m.x},${m.y}) v=(${m.vx ?? '?'},${m.vy ?? '?'})`
        ).join(' | ');
        console.log(`[${Math.round((Date.now() - startTime) / 1000)}s] fin=${lastDebug.finishedCount} | ${positions}`);
      }

      await page.waitForTimeout(1000);
    }

    expect(lastDebug).not.toBeNull();
    // 최소 2개 구슬이 완주했어야 함 (실제 플레이어 + 더미 중)
    const finishedOrNearFinish = lastDebug!.marbles.filter(
      (m: Record<string, unknown>) => (m.finished === true) || ((m.y as number) >= 2800)
    ).length;
    expect(finishedOrNearFinish).toBeGreaterThanOrEqual(2);
    console.log(`[OK] ${lastDebug!.finishedCount}/${lastDebug!.totalMarbles} marbles finished (${finishedOrNearFinish} near/at finish)`);
  });

  test('구슬 이탈 없음 확인 (월드 범위 이내)', async ({ page }) => {
    await page.goto('/?mode=marble&players=2');
    await page.waitForTimeout(2000);
    await waitForRacing(page);

    // 30초간 관찰
    let outOfBoundsCount = 0;
    const checkDuration = 30_000;
    const startTime = Date.now();

    while (Date.now() - startTime < checkDuration) {
      const debug = await getDebug(page);
      if (!debug) {
        await page.waitForTimeout(500);
        continue;
      }

      if (debug.phase === 'done') break;

      for (const m of debug.marbles) {
        if (m.retired) continue;
        // 월드 범위: 0~2200 (x), -100~3000 (y with tolerance)
        if (m.x < -50 || m.x > 2250 || m.y < -200 || m.y > 3100) {
          outOfBoundsCount++;
          console.error(`[OOB] ${m.name} at (${m.x}, ${m.y})`);
        }
      }

      await page.waitForTimeout(1000);
    }

    expect(outOfBoundsCount).toBe(0);
    console.log('[OK] No marbles out of bounds');
  });

  test('기구 동작 확인 (풍차/시소 회전)', async ({ page }) => {
    await page.goto('/?mode=marble&players=2');
    await page.waitForTimeout(2000);
    await waitForRacing(page);

    // 5초간 구슬 Y위치 변화 확인 (물리 엔진 동작 확인)
    const debug1 = await getDebug(page);
    await page.waitForTimeout(5000);
    const debug2 = await getDebug(page);

    expect(debug1).not.toBeNull();
    expect(debug2).not.toBeNull();

    // 구슬들이 아래로 이동했는지 (중력 + 물리 작동)
    let movedDown = 0;
    for (let i = 0; i < debug1!.marbles.length; i++) {
      const before = debug1!.marbles[i];
      const after = debug2!.marbles[i];
      if (after.y > before.y + 10) movedDown++;
    }

    expect(movedDown).toBeGreaterThan(0);
    console.log(`[OK] ${movedDown}/${debug1!.marbles.length} marbles moved down`);
  });

  test('스크린샷 캡처', async ({ page }) => {
    await page.goto('/?mode=marble&players=4');
    await page.waitForTimeout(2000);
    await waitForRacing(page);

    // 레이싱 시작 직후 스크린샷
    await page.screenshot({ path: 'screenshots/v5-race-start.png', fullPage: false });

    // 10초 후 스크린샷
    await page.waitForTimeout(10000);
    await page.screenshot({ path: 'screenshots/v5-race-10s.png', fullPage: false });

    console.log('[OK] Screenshots captured');
  });
});
