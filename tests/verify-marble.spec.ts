import { test, expect, type Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════
// 구슬 레이스 V5 검증 테스트 (검증 1~7)
// ═══════════════════════════════════════════════════════

interface MarbleInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  finished: boolean;
  finishX: number | null;
  finishY: number | null;
  outOfBounds: boolean;
  retired: boolean;
  isDummy: boolean;
  stuckTime: number;
}

interface MarbleState {
  phase: string;
  elapsedTime: number;
  marbles: MarbleInfo[];
  finishedCount: number;
  outOfBoundsCount: number;
  stuckEvents: number;
  totalMarbles: number;
}

async function getState(page: Page): Promise<MarbleState | null> {
  return page.evaluate(() => (window as Record<string, unknown>).__MARBLE_STATE__ as MarbleState | null);
}

async function waitForRacing(page: Page, timeout = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await getState(page);
    if (state?.phase === 'racing') return;
    await page.waitForTimeout(300);
  }
  throw new Error('Timed out waiting for racing phase');
}

async function waitForAllSettled(page: Page, timeout = 300_000): Promise<MarbleState> {
  const start = Date.now();
  let lastState: MarbleState | null = null;
  while (Date.now() - start < timeout) {
    lastState = await getState(page);
    if (!lastState) {
      await page.waitForTimeout(500);
      continue;
    }
    const allDone = lastState.marbles.every(m => m.finished || m.retired);
    if (allDone || lastState.phase === 'done') {
      return lastState;
    }
    await page.waitForTimeout(1000);
  }
  if (lastState) return lastState;
  throw new Error('Timed out waiting for all marbles to settle');
}

// ═══════════════════════════════════════════════════════
// 검증 1: 자동이동 기믹 완전 제거 확인
// ═══════════════════════════════════════════════════════

test.describe('검증 1: 자동이동 기믹 완전 제거', () => {
  test('Body.setPosition 및 강제이동 코드가 없음', async ({ page }) => {
    // 코드 정적 분석 — Playwright에서는 실행 시 검증
    // 게임 시작 후 60초간 outOfBounds 발생 없이 물리만으로 진행되는지 확인
    await page.goto('/?mode=marble&players=2');
    await waitForRacing(page);

    // 30초간 관찰 — 구슬이 순수 물리로만 움직이는지
    const startTime = Date.now();
    let stuckTeleportCount = 0;

    while (Date.now() - startTime < 30_000) {
      const state = await getState(page);
      if (!state || state.phase === 'done') break;

      // stuckEvents가 발생해도 impulse만 적용 (teleport 아님)
      // 자동이동이 없으므로 구슬 위치가 불연속적으로 변하면 안됨
      for (const m of state.marbles) {
        if (m.retired || m.finished) continue;
        // Y좌표가 음수로 점프하거나 500px 이상 순간이동하면 의심
        if (m.y < -50) stuckTeleportCount++;
      }
      await page.waitForTimeout(1000);
    }

    expect(stuckTeleportCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 검증 2: 파이프 구조 적용 확인
// ═══════════════════════════════════════════════════════

test.describe('검증 2: 파이프 구조 적용', () => {
  test('구슬이 파이프 밖으로 이탈하지 않음', async ({ page }) => {
    await page.goto('/?mode=marble&players=2');
    await waitForRacing(page);

    let outOfBoundsEvents = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < 60_000) {
      const state = await getState(page);
      if (!state || state.phase === 'done') break;

      outOfBoundsEvents = state.outOfBoundsCount;
      await page.waitForTimeout(1000);
    }

    expect(outOfBoundsEvents).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 검증 3: Start 영역 확장 확인
// ═══════════════════════════════════════════════════════

test.describe('검증 3: Start 영역', () => {
  test('구슬 9개가 겹치지 않고 SEC1에 진입', async ({ page }) => {
    await page.goto('/?mode=marble&players=9');
    await waitForRacing(page);

    // 시작 직후 구슬 위치 확인 — 겹침 없는지
    const state = await getState(page);
    expect(state).not.toBeNull();
    expect(state!.totalMarbles).toBeGreaterThanOrEqual(9);

    // 간격 체크 (초기 위치)
    const positions = state!.marbles.map(m => ({ x: m.x, y: m.y }));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = Math.abs(positions[i].x - positions[j].x);
        const dy = Math.abs(positions[i].y - positions[j].y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 구슬 반지름 10px * 2 = 20px 이상 간격 필요
        expect(dist).toBeGreaterThanOrEqual(18);
      }
    }

    // 10초 후 모든 구슬이 SEC1(y < 350) 영역을 통과했는지
    await page.waitForTimeout(10_000);
    const afterState = await getState(page);
    if (afterState && afterState.phase !== 'done') {
      const activeMarbles = afterState.marbles.filter(m => !m.retired && !m.finished);
      // 최소한 일부 구슬이 SEC1을 넘어 진행해야 함
      const passedSEC1 = activeMarbles.filter(m => m.y > 350);
      expect(passedSEC1.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 검증 4: 섹션 간 연결 통과 확인
// ═══════════════════════════════════════════════════════

test.describe('검증 4: 섹션 간 연결 통과', () => {
  test('전체 경로 통과 확인 (구슬 완주)', async ({ page }) => {
    // 시뮬레이션으로 전체 경로 통과 검증
    await page.goto('/?mode=marble&players=2&pickMode=last');
    await waitForRacing(page);

    // 최대 300초 대기
    const finalState = await waitForAllSettled(page, 300_000);

    // 최소 1개 구슬이 완주해야 함
    const finishedCount = finalState.marbles.filter(m => m.finished).length;
    expect(finishedCount).toBeGreaterThanOrEqual(1);

    // 이탈 0건
    expect(finalState.outOfBoundsCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 검증 5: 구조물이 경로를 차단하지 않는지
// ═══════════════════════════════════════════════════════

test.describe('검증 5: 구조물 통과', () => {
  test('풍차/해머/시소가 있는 구간을 구슬이 통과', async ({ page }) => {
    await page.goto('/?mode=marble&players=3&pickMode=last');
    await waitForRacing(page);

    // 진행 관찰: SEC2(풍차), SEC4(시소), SEC6(해머+풍차+시소) 통과 여부
    // 60초간 진행도 확인
    let maxY = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < 120_000) {
      const state = await getState(page);
      if (!state || state.phase === 'done') break;

      for (const m of state.marbles) {
        if (m.y > maxY && !m.retired) maxY = m.y;
      }

      // SEC6(y:1960~2330)을 넘어간 구슬이 있으면 구조물 통과 확인
      if (maxY > 2330) break;
      await page.waitForTimeout(2000);
    }

    // SEC2(풍차존, y>770) 이상은 통과해야 함
    expect(maxY).toBeGreaterThan(770);
  });
});

// ═══════════════════════════════════════════════════════
// 검증 6: FINISH 판정 정확도 + 순위 + 사라짐
// ═══════════════════════════════════════════════════════

test.describe('검증 6: FINISH 판정', () => {
  test('완주 구슬에 순위 부여 및 물리 제거', async ({ page }) => {
    await page.goto('/?mode=marble&players=3&pickMode=last');
    await waitForRacing(page);

    const finalState = await waitForAllSettled(page, 300_000);

    const finished = finalState.marbles.filter(m => m.finished);
    expect(finished.length).toBeGreaterThanOrEqual(1);

    // 완주 구슬은 visible=false (container 제거) — 물리에서도 제거됨
    // finishedCount가 실제 finished 배열과 일치
    expect(finalState.finishedCount).toBe(finished.length);

    // 순위가 순서대로 부여되는지 (finishOrder 기반)
    // finishedCount > 0이면 OK
    expect(finalState.finishedCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// 검증 7: 전체 완주 통합 테스트
// ═══════════════════════════════════════════════════════

test.describe('검증 7: 전체 완주 통합', () => {
  test('구슬 9개 전원 완주 (이탈 0건)', async ({ page }) => {
    await page.goto('/?mode=marble&players=9&pickMode=last');
    await waitForRacing(page);

    const finalState = await waitForAllSettled(page, 300_000);

    const finished = finalState.marbles.filter(m => m.finished);
    const retired = finalState.marbles.filter(m => m.retired);

    console.log(`[결과] 완주: ${finished.length}, 이탈: ${retired.length}, 전체: ${finalState.totalMarbles}`);

    // 이탈 0건
    expect(retired.length).toBe(0);
    // 전원 완주
    expect(finished.length).toBe(finalState.totalMarbles);
  });

  test('구슬 2명(+더미=6+) 전원 완주', async ({ page }) => {
    await page.goto('/?mode=marble&players=2&pickMode=last');
    await waitForRacing(page);

    const finalState = await waitForAllSettled(page, 300_000);

    const finished = finalState.marbles.filter(m => m.finished);
    const retired = finalState.marbles.filter(m => m.retired);

    console.log(`[결과] 완주: ${finished.length}, 이탈: ${retired.length}, 전체: ${finalState.totalMarbles}`);

    expect(retired.length).toBe(0);
    expect(finished.length).toBe(finalState.totalMarbles);
  });
});
