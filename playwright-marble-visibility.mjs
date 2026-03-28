/**
 * playwright-marble-visibility.mjs
 * 구슬 레이스 가시성 검증
 */
import { chromium } from '@playwright/test';
import fs from 'fs';

const DIR = 'screenshots/marble-visibility';
fs.mkdirSync(DIR, { recursive: true });

const BASE = 'http://localhost:5176';
const W = 390, H = 844;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    // 1. 메인 화면
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/01_main.png` });
    console.log('01 메인 화면 OK');

    // 2. 1등 뽑기 선택 (좌측 카드)
    await page.click('canvas', { position: { x: 100, y: 150 } });
    await page.waitForTimeout(800);

    // 3. 구슬 레이스 선택 (우측 상단 카드, x=290)
    await page.click('canvas', { position: { x: 290, y: 310 } });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/02_marble_selected.png` });
    console.log('02 구슬 레이스 선택');

    // 4. 이름 입력 (3명)
    const inputSelector = 'input[type="text"], input[placeholder]';
    await page.waitForSelector(inputSelector, { timeout: 5000 }).catch(() => null);
    const input = await page.$(inputSelector);
    if (input) {
      for (const name of ['Alice', 'Bob', 'Carol']) {
        await input.fill(name);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/03_names.png` });
      console.log('03 이름 입력 완료');

      // 시작 버튼 — input 위에서 force 클릭
      await page.click('canvas', { position: { x: 195, y: 795 }, force: true });
      await page.waitForTimeout(500);
    }

    // 5. 카운트다운 중 (1초)
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${DIR}/04_countdown.png` });
    console.log('04 카운트다운 중');

    // 6. 카운트다운 끝 직후 (3초 후)
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${DIR}/05_race_start.png` });
    console.log('05 레이스 시작');

    // 7. 레이스 5초 후
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${DIR}/06_racing_5s.png` });
    console.log('06 레이스 5초');

    // 8. 레이스 15초 후
    await page.waitForTimeout(10000);
    await page.screenshot({ path: `${DIR}/07_racing_15s.png` });
    console.log('07 레이스 15초');

    // 9. 결과 대기
    await page.waitForTimeout(20000);
    await page.screenshot({ path: `${DIR}/08_result.png` });
    console.log('08 결과/종료');

    if (errors.length > 0) {
      console.error('\n❌ 콘솔 에러:');
      errors.forEach(e => console.error('  -', e));
    } else {
      console.log('\n✅ 콘솔 에러 없음');
    }
  } catch (e) {
    console.error('❌ 테스트 실패:', e.message);
    await page.screenshot({ path: `${DIR}/error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run();
