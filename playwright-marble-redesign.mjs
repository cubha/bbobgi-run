/**
 * 구슬레이스 V2 재설계 검증
 * 1. 구슬 원형 확인
 * 2. 레일(지그재그 램프) 위 주행 확인
 * 3. 구슬 진행 확인 (y좌표 변화)
 * 4. 30초 게임 완주
 */
import { chromium } from '@playwright/test';
import fs from 'fs';

const DIR = 'screenshots/marble-redesign';
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
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // 1등 뽑기
    await page.click('canvas', { position: { x: 100, y: 150 } });
    await page.waitForTimeout(800);

    // 구슬 레이스 (우측 상단)
    await page.click('canvas', { position: { x: 290, y: 310 } });
    await page.waitForTimeout(800);

    // 이름 3명 입력
    const input = await page.$('input[type="text"], input[placeholder]');
    if (input) {
      for (const name of ['Alice', 'Bob', 'Carol']) {
        await input.fill(name);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(500);
      await page.click('canvas', { position: { x: 195, y: 795 }, force: true });
      await page.waitForTimeout(500);
    }

    // 카운트다운 중
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/01_countdown.png` });
    console.log('01 카운트다운');

    // 레이스 시작 직후
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${DIR}/02_race_start.png` });
    console.log('02 레이스 시작');

    // 5초
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${DIR}/03_race_5s.png` });
    console.log('03 5초');

    // 10초
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${DIR}/04_race_10s.png` });
    console.log('04 10초');

    // 20초
    await page.waitForTimeout(10000);
    await page.screenshot({ path: `${DIR}/05_race_20s.png` });
    console.log('05 20초');

    // 30초 (결과)
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${DIR}/06_result.png` });
    console.log('06 결과');

    if (errors.length > 0) {
      console.error('\n❌ 에러:', errors.slice(0, 5).join('\n  '));
    } else {
      console.log('\n✅ 에러 없음');
    }
  } catch (e) {
    console.error('❌ 실패:', e.message);
    await page.screenshot({ path: `${DIR}/error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run();
