/**
 * playwright-marble-check.mjs
 * 구슬 레이스 버그 확인:
 *  1. 공들이 첫번째 구간에서 통과하는지 (y 좌표 진행)
 *  2. 카메라 스크롤이 작동하는지 (trackContainer.y 변화)
 */
import { firefox } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const DIR = '/mnt/d/workspace/bbobgi-run/screenshots/marble';
fs.mkdirSync(DIR, { recursive: true });

const BASE = 'http://localhost:5173';
const W = 390, H = 844;
const cx = W / 2;

async function run() {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ── 1. 메인 화면 ──────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/01_main.png` });
  console.log('01 메인 화면 저장');

  // ── 2. 뽑기 모드 선택 (1등 뽑기 = 상단 카드) ──────────
  await page.click('canvas', { position: { x: cx, y: H * 0.3 } });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/02_pick.png` });
  console.log('02 뽑기 모드 선택 후');

  // ── 3. 게임 모드 선택 (구슬레이스 = 2번째) ────────────
  // 게임 모드 선택 화면 — 구슬 레이스 카드 클릭
  await page.click('canvas', { position: { x: cx * 1.5, y: H * 0.45 } });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/03_gamemode.png` });
  console.log('03 게임 모드 선택 후');

  // 혹시 아직 이전 단계인 경우 재시도
  for (const yR of [0.35, 0.45, 0.55, 0.65]) {
    await page.click('canvas', { position: { x: cx * 1.5, y: H * yR } });
    await page.waitForTimeout(200);
  }

  // ── 4. 이름 입력 ─────────────────────────────────────
  await page.waitForTimeout(800);
  const inputs = await page.$$('input');
  console.log(`Input 수: ${inputs.length}`);
  if (inputs.length > 0) {
    const names = ['철수', '영희', '민수', '지수'];
    for (let i = 0; i < Math.min(inputs.length, 4); i++) {
      await inputs[i].fill(names[i] ?? `player${i + 1}`);
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: `${DIR}/04_names.png` });
    console.log('04 이름 입력 완료');
    // 시작 버튼 클릭
    await page.click('canvas', { position: { x: cx, y: H * 0.85 } });
    await page.waitForTimeout(800);
  } else {
    console.log('Input 없음 — 현재 화면 확인');
    await page.screenshot({ path: `${DIR}/04_no_input.png` });
    // 여러 위치 클릭 시도
    for (const [x, y] of [[cx, H * 0.7], [cx, H * 0.8], [cx, H * 0.9]]) {
      await page.click('canvas', { position: { x, y } });
      await page.waitForTimeout(300);
    }
  }

  // ── 5. 게임 씬 진입 확인 ─────────────────────────────
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/05_game_start.png` });
  console.log('05 게임 씬 진입');

  // ── 6. 카운트다운 대기 (3초) ─────────────────────────
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${DIR}/06_after_countdown.png` });
  console.log('06 카운트다운 후');

  // ── 7. 주기적 스크린샷으로 구슬 위치/스크롤 확인 ──────
  // 게임 중 trackContainer.y를 모니터링
  const trackPositions = [];

  for (let t = 0; t < 10; t++) {
    await page.waitForTimeout(2000);
    const pos = await page.evaluate(() => {
      // PixiJS app 접근
      const canvasEl = document.querySelector('canvas');
      if (!canvasEl) return null;
      // @ts-ignore: __PIXI_APP__ 또는 전역 참조
      const pixi = window.__PIXI_APP__ || window.PIXI_APP;
      if (!pixi) return { pixi: 'not found' };
      try {
        const stage = pixi.stage;
        if (!stage || stage.children.length === 0) return { stage: 'empty', children: 0 };
        const sceneContainer = stage.children[0];
        if (!sceneContainer) return { scene: 'not found' };
        const sc = sceneContainer.children;
        const info = {
          stageChildren: stage.children.length,
          sceneChildren: sc.length,
          sceneY: sceneContainer.y,
          containers: sc.map((c, i) => ({
            i,
            label: c.label || c.name || '?',
            y: Math.round(c.y),
            childCount: c.children?.length ?? 0,
          })),
        };
        return info;
      } catch (e) {
        return { error: String(e) };
      }
    });
    trackPositions.push({ t: (t + 1) * 2, pos });
    await page.screenshot({ path: `${DIR}/07_t${(t + 1) * 2}s.png` });
    console.log(`t=${(t + 1) * 2}s — containers:`, JSON.stringify(pos));
  }

  // ── 8. 최종 상태 ─────────────────────────────────────
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/08_final.png` });
  console.log('08 최종 상태 저장');

  // ── 분석 ─────────────────────────────────────────────
  console.log('\n=== 스크롤 분석 ===');
  const ys = trackPositions
    .map(({ t, pos }) => {
      const trackY = pos?.containers?.find(c => c.i === 0)?.y;
      return { t, trackY: trackY ?? 'N/A' };
    });
  ys.forEach(({ t, trackY }) => console.log(`  t=${t}s: trackContainer.y = ${trackY}`));

  const trackYValues = ys
    .map(x => x.trackY)
    .filter(y => typeof y === 'number');
  if (trackYValues.length >= 2) {
    const first = trackYValues[0];
    const last = trackYValues[trackYValues.length - 1];
    if (last < first) {
      console.log(`✅ 스크롤 작동: ${first} → ${last} (${last - first}px 이동)`);
    } else {
      console.log(`❌ 스크롤 미작동: ${first} → ${last}`);
    }
  }

  if (errors.length > 0) {
    console.log('\n=== JS 에러 ===');
    errors.forEach(e => console.log(' ', e));
  } else {
    console.log('\n콘솔 에러 없음');
  }

  await browser.close();
}

run().catch(console.error);
