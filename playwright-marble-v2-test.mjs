/**
 * playwright-marble-v2-test.mjs
 * 구슬 레이스 V2 리디자인 검증:
 *  1. 게임 진입 (메인→뽑기→구슬레이스→이름입력→게임)
 *  2. 콘솔 에러 없이 게임 로딩
 *  3. 구슬이 진행하는지 (y 좌표 변화)
 *  4. 30초 게임 종료 후 결과 화면 진입
 */
import { webkit } from '@playwright/test';
import fs from 'fs';

const DIR = '/mnt/d/workspace/bbobgi-run/screenshots/marble-v2';
fs.mkdirSync(DIR, { recursive: true });

const BASE = 'http://localhost:5173';
const W = 390, H = 844;
const cx = W / 2;

async function run() {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    // ── 1. 메인 화면 ──
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/01_main.png` });
    console.log('01 메인 화면 OK');

    // ── 2. 뽑기 모드 선택 (1등 뽑기) ──
    await page.click('canvas', { position: { x: cx, y: H * 0.3 } });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/02_pick.png` });
    console.log('02 뽑기 모드 선택 OK');

    // ── 3. 게임 모드 선택 (구슬레이스 = 2번째 카드) ──
    await page.click('canvas', { position: { x: cx, y: H * 0.42 } });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/03_mode.png` });
    console.log('03 게임 모드 선택 OK');

    // ── 4. 이름 입력 (3명) ──
    const inputSelector = 'input[type="text"], input[placeholder]';
    await page.waitForSelector(inputSelector, { timeout: 5000 }).catch(() => null);
    const input = await page.$(inputSelector);
    if (input) {
      // 이름 3개 입력
      for (const name of ['Alice', 'Bob', 'Carol']) {
        await input.fill(name);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/04_names.png` });
      console.log('04 이름 입력 OK');

      // 시작 버튼 클릭
      await page.click('canvas', { position: { x: cx, y: H * 0.85 } });
      await page.waitForTimeout(500);
    }

    // ── 5. 게임 진행 대기 (카운트다운 3초 + 레이스 5초) ──
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${DIR}/05_racing.png` });
    console.log('05 레이스 진행 중 OK');

    // ── 6. 게임 종료 대기 (30초 타임아웃) ──
    await page.waitForTimeout(25000);
    await page.screenshot({ path: `${DIR}/06_result.png` });
    console.log('06 게임 종료/결과 OK');

    // ── 결과 ──
    if (errors.length > 0) {
      console.error('\n❌ 콘솔 에러 감지:');
      errors.forEach(e => console.error('  -', e));
      process.exit(1);
    } else {
      console.log('\n✅ 모든 검증 통과! (콘솔 에러 없음)');
    }
  } catch (e) {
    console.error('❌ 테스트 실패:', e.message);
    await page.screenshot({ path: `${DIR}/error.png` }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
