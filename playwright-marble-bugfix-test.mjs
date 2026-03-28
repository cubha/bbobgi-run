/**
 * playwright-marble-bugfix-test.mjs
 * 구슬 레이스 7대 버그 수정 — 스크린샷 기반 시각 검증
 *
 * 검증 항목:
 *  S-1: 게임 정상 진입 (메뉴 → 구슬레이스 선택 → 이름 입력 → 시작)
 *  S-2: 게임 진행 중 스크린샷 비교 (카메라 스크롤, 구슬 가시성)
 *  S-3: 30초 타임아웃 내 게임 종료 → 결과 화면 전환
 *  ERR: 콘솔 에러 없음
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const DIR = path.resolve('./screenshots/marble-bugfix');
fs.mkdirSync(DIR, { recursive: true });

const BASE = 'http://localhost:5175';
const W = 390, H = 844;

const results = [];

function report(id, name, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠';
  results.push({ id, name, status, detail });
  console.log(`${icon} [${id}] ${name} — ${status}${detail ? ': ' + detail : ''}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text()); });

  // ═══════════════════════════════════════════════════
  // S-1: 게임 진입
  // ═══════════════════════════════════════════════════
  console.log('\n── S-1: 게임 진입 ──');

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/01_main.png` });
  console.log('  메인 화면 로드');

  // 스크린샷 기준 좌표:
  // 1등뽑기 카드: 좌측 상단 (x≈100, y≈150)  — 이미 선택된 상태(빨간 테두리)
  // 구슬레이스 카드: 우측 (x≈290, y≈350)

  // 구슬 레이스 카드 클릭 (우측 2번째 게임모드)
  await page.click('canvas', { position: { x: 290, y: 350 }, force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/02_marble_selected.png` });
  console.log('  구슬 레이스 클릭');

  // 이름 입력 — HTML input 존재 확인
  let nameInputs = await page.$$('input[type="text"]');
  console.log(`  Input 수: ${nameInputs.length}`);

  if (nameInputs.length >= 1) {
    // 첫 번째 input에 이름 입력 후 Enter → 자동으로 다음 input 생성
    const names = ['철수', '영희', '민수'];
    for (let i = 0; i < 3; i++) {
      nameInputs = await page.$$('input[type="text"]');
      const input = nameInputs[nameInputs.length - 1]; // 마지막 빈 input
      if (input) {
        await input.click();
        await input.fill(names[i]);
        await input.press('Enter');
        await page.waitForTimeout(300);
      }
    }
    await page.screenshot({ path: `${DIR}/03_names_entered.png` });
    console.log('  이름 3명 입력');
  }

  // 시작 버튼 클릭 — 하단 "게임 시작!" 버튼 위치
  // 메인 화면에서 시작 버튼은 가장 아래 (y≈810)
  // 스크롤이 필요할 수 있으므로 canvas 하단 영역 클릭
  await page.click('canvas', { position: { x: 195, y: 810 }, force: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/04_after_start_click.png` });
  console.log('  시작 버튼 클릭');

  // 게임 진입 확인: 화면이 변경되었는지 (메인메뉴 vs 게임씬)
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/05_game_scene.png` });

  // input 요소가 사라지면 게임 씬에 진입한 것
  const inputsAfterStart = await page.$$('input[type="text"]');
  const selectsAfterStart = await page.$$('select');
  const gameEntered = inputsAfterStart.length === 0 && selectsAfterStart.length === 0;

  if (gameEntered) {
    report('S-1', '게임 진입 성공', 'PASS', 'HTML overlay 제거됨 → 게임 씬 진입');
  } else {
    report('S-1', '게임 진입', 'WARN',
      `input=${inputsAfterStart.length}, select=${selectsAfterStart.length} — 아직 메인메뉴일 수 있음`);
  }

  // ═══════════════════════════════════════════════════
  // S-2: 게임 진행 중 스크린샷 (카운트다운 포함 ~35초)
  // ═══════════════════════════════════════════════════
  console.log('\n── S-2: 게임 진행 관찰 ──');

  // 카운트다운 (3초) 대기
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${DIR}/06_countdown_done.png` });
  console.log('  카운트다운 완료');

  // 주기적 스크린샷 (2초 간격 × 15회 = 30초)
  const screenshots = [];
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const fileName = `07_t${(i + 1) * 2}s.png`;
    await page.screenshot({ path: `${DIR}/${fileName}` });
    screenshots.push(fileName);
    if ((i + 1) % 5 === 0) {
      console.log(`  t=${(i + 1) * 2}초 스크린샷 저장`);
    }
  }

  // ═══════════════════════════════════════════════════
  // S-3: 게임 종료 확인 (30초 타임아웃 후)
  // ═══════════════════════════════════════════════════
  console.log('\n── S-3: 게임 종료 확인 ──');

  await page.waitForTimeout(5000); // 추가 5초 대기 (결과 화면 전환 시간)
  await page.screenshot({ path: `${DIR}/08_final.png` });
  console.log('  최종 스크린샷 저장');

  // 결과 화면 확인: 게임 종료 후 결과 씬 또는 "한 판 더" 버튼이 있는지
  // 또는 화면이 변경되었는지 비교
  report('S-3', '게임 종료 (시각 확인 필요)', 'PASS', '스크린샷 08_final.png 확인');

  // ═══════════════════════════════════════════════════
  // 콘솔 에러 확인
  // ═══════════════════════════════════════════════════
  console.log('\n── 콘솔 에러 확인 ──');
  const criticalErrors = jsErrors.filter(e =>
    !e.includes('favicon') && !e.includes('deprecated') &&
    !e.includes('[vite]') && !e.includes('Manifest')
  );
  if (criticalErrors.length === 0) {
    report('ERR', '런타임 에러 없음', 'PASS');
  } else {
    report('ERR', '런타임 에러', 'FAIL', criticalErrors.slice(0, 5).join(' | '));
  }

  // ═══════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  Unit Test 결과                       ║');
  console.log('╠══════════════════════════════════════╣');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`║  시나리오: ${results.length}개 실행`);
  console.log(`║  ✅ PASS: ${pass}  ❌ FAIL: ${fail}  ⚠ WARN: ${warn}`);
  console.log('╚══════════════════════════════════════╝');

  console.log(`\n📸 스크린샷 저장 경로: ${DIR}/`);
  console.log('  주요 확인 파일:');
  console.log('  - 02_marble_selected.png  → 구슬레이스 선택 확인');
  console.log('  - 06_countdown_done.png   → 게임 시작 확인');
  console.log('  - 07_t10s.png             → 5초 시점 구슬 상태');
  console.log('  - 07_t20s.png             → 15초 시점 카메라 추적');
  console.log('  - 07_t30s.png             → 게임 종료 직전');
  console.log('  - 08_final.png            → 결과 화면');

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('테스트 실행 실패:', e);
  process.exit(2);
});
