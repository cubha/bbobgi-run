import { firefox } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_DIR = '/mnt/d/workspace/bbobgi-run/screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const consoleMessages = [];
const consoleErrors = [];

async function run() {
  const browser = await firefox.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // 콘솔 메시지 수집
  page.on('console', (msg) => {
    const entry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleMessages.push(entry);
    if (msg.type() === 'error') {
      consoleErrors.push(entry);
    }
  });

  // 페이지 에러 수집
  page.on('pageerror', (err) => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });

  // 네트워크 실패 수집
  page.on('requestfailed', (req) => {
    consoleErrors.push(`[NETWORK FAIL] ${req.url()} — ${req.failure()?.errorText}`);
  });

  console.log('=== 1. 메인 화면 접속 ===');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_main_menu.png'), fullPage: false });
  console.log('스크린샷: 01_main_menu.png 저장됨');

  // Canvas 확인
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'canvas 없음';
    return `canvas: ${canvas.width}x${canvas.height}, style: ${canvas.style.cssText}`;
  });
  console.log('Canvas 정보:', canvasInfo);

  // 페이지 전체 구조 확인
  const pageStructure = await page.evaluate(() => {
    const body = document.body;
    return {
      childCount: body.children.length,
      children: Array.from(body.children).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className?.toString().substring(0, 100),
      })),
    };
  });
  console.log('페이지 구조:', JSON.stringify(pageStructure, null, 2));

  const viewportSize = page.viewportSize();
  const centerX = viewportSize.width / 2;
  const centerY = viewportSize.height / 2;

  console.log('\n=== 2. 뽑기 모드 선택 (1등 뽑기 = 화면 상단 클릭) ===');
  // 1등 뽑기 버튼 클릭 (화면 상단 영역)
  await page.click('canvas', { position: { x: centerX, y: viewportSize.height * 0.35 } });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_pick_mode.png'), fullPage: false });
  console.log('스크린샷: 02_pick_mode.png');

  console.log('\n=== 3. 게임 모드 화면 확인 ===');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_game_mode_screen.png'), fullPage: false });
  console.log('스크린샷: 03_game_mode_screen.png');

  // 구슬 레이스 모드 클릭 시도 — 화면의 여러 위치 탐색
  console.log('\n=== 4. 구슬 레이스 모드 선택 ===');
  // 게임 모드 선택 화면에서 구슬 레이스는 보통 2번째 카드
  const positions = [
    { x: centerX, y: viewportSize.height * 0.45 },  // 중간
    { x: centerX, y: viewportSize.height * 0.50 },  // 중간 약간 아래
    { x: centerX, y: viewportSize.height * 0.55 },  // 아래
    { x: centerX * 0.5, y: viewportSize.height * 0.45 }, // 왼쪽
    { x: centerX * 1.5, y: viewportSize.height * 0.45 }, // 오른쪽
  ];

  for (const pos of positions) {
    await page.click('canvas', { position: pos });
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_after_mode_clicks.png'), fullPage: false });
  console.log('스크린샷: 04_after_mode_clicks.png');

  // HTML input 요소 확인 (이름 입력 단계인지)
  console.log('\n=== 5. HTML Input 요소 확인 ===');
  await page.waitForTimeout(500);
  const inputs = await page.$$('input');
  console.log(`Input 요소 수: ${inputs.length}`);

  if (inputs.length > 0) {
    // 이름 입력
    const names = ['철수', '영희', '민수', '지수'];
    for (let i = 0; i < Math.min(inputs.length, 4); i++) {
      await inputs[i].fill(names[i]);
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_name_input.png'), fullPage: false });
    console.log('스크린샷: 05_name_input.png');

    // Enter 또는 시작 버튼 클릭
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 화면 중앙 클릭 (시작 버튼)
    await page.click('canvas', { position: { x: centerX, y: viewportSize.height * 0.8 } });
    await page.waitForTimeout(1000);
  } else {
    console.log('Input 없음 — 다른 위치 클릭 시도');
    // 화면의 다양한 위치 클릭
    for (const yRatio of [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) {
      await page.click('canvas', { position: { x: centerX, y: viewportSize.height * yRatio } });
      await page.waitForTimeout(200);
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_current_state.png'), fullPage: false });
  console.log('스크린샷: 06_current_state.png');

  console.log('\n=== 6. 게임 씬 파악 시도 ===');
  await page.waitForTimeout(1000);

  // JavaScript 통해 현재 씬 상태 확인
  const gameState = await page.evaluate(() => {
    // @ts-ignore
    const app = window.__gameApp || window.gameApp || window.app;
    if (!app) return { error: '게임 앱 참조 없음' };
    return { keys: Object.keys(app) };
  });
  console.log('게임 상태:', JSON.stringify(gameState));

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_game_state.png'), fullPage: false });
  console.log('스크린샷: 07_game_state.png');

  await browser.close();

  console.log('\n=== 콘솔 에러 요약 ===');
  if (consoleErrors.length === 0) {
    console.log('콘솔 에러 없음');
  } else {
    consoleErrors.forEach(e => console.log(e));
  }

  console.log('\n=== 전체 콘솔 메시지 (처음 50개) ===');
  consoleMessages.slice(0, 50).forEach(m => console.log(m));

  if (consoleMessages.length > 50) {
    console.log(`... 외 ${consoleMessages.length - 50}개 더 있음`);
  }
}

run().catch(console.error);
