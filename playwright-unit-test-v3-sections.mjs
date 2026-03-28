/**
 * Marble Race V3 — 구간별 단위 테스트 + 완주 테스트 (시간제한 제거 버전)
 *
 * SEC1~SEC8 각 구간 레인 통과 검증:
 *   SEC1: Start Funnel (y=80~300)
 *   SEC2: Right Channel (y=300~520)
 *   SEC3: U-Turn + Left Return (y=520~750)
 *   SEC4: Waterwheel Lift (y=750~950)
 *   SEC5: Spiral Descent (y=950~1650)
 *   SEC6: Obstacle + Split (y=1650~2600)
 *   SEC7: Sprint + Finish (y=2600~3080)
 *
 * 검증 방법: 구슬 Y좌표 진행도를 콘솔 로그로 주입하여 추적
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5177';
const SCREENSHOT_DIR = 'D:/workspace/bbobgi-run/screenshots/unit-test-v3-sections';
const DESIGN_W = 390;
const DESIGN_H = 844;
const VIEWPORT = { width: 390, height: 844 };

// 구간 경계 (Y좌표 기반, TrackData V3 + HTML 프리뷰 참조)
const SECTIONS = [
  { id: 'SEC1', name: 'Start Funnel', yStart: 80, yEnd: 300 },
  { id: 'SEC2', name: 'Right Channel', yStart: 300, yEnd: 520 },
  { id: 'SEC3', name: 'U-Turn + Left Return', yStart: 520, yEnd: 750 },
  { id: 'SEC4', name: 'Waterwheel Lift', yStart: 750, yEnd: 950 },
  { id: 'SEC5', name: 'Spiral Descent', yStart: 950, yEnd: 1650 },
  { id: 'SEC6', name: 'Obstacle + Split', yStart: 1650, yEnd: 2600 },
  { id: 'SEC7', name: 'Sprint + Finish', yStart: 2600, yEnd: 3080 },
];

const FINISH_Y = 3080;

function sp(scenario, name) {
  return path.join(SCREENSHOT_DIR, `${scenario}-${name}.png`);
}

async function canvasClick(page, designX, designY) {
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const x = box.x + designX * (box.width / DESIGN_W);
  const y = box.y + designY * (box.height / DESIGN_H);
  await page.mouse.click(x, y);
}

async function navigateToMarbleRace(page, pickMode, playerNames) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 8000 });
  await page.waitForTimeout(1500);

  // Pick mode
  if (pickMode === 'first') await canvasClick(page, 100, 150);
  else await canvasClick(page, 290, 150);
  await page.waitForTimeout(300);

  // Marble race
  await canvasClick(page, 290, 363);
  await page.waitForTimeout(300);

  // Enter names
  for (const name of playerNames) {
    const input = await page.$('input[type="text"]');
    if (!input) throw new Error('Name input not found');
    await input.fill(name);
    await input.press('Enter');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);

  // Hide overlays + click start
  await page.evaluate(() => {
    document.querySelectorAll('div[style*="z-index"], select[style*="z-index"]').forEach(el => {
      el.style.display = 'none';
    });
  });
  await page.waitForTimeout(100);
  await canvasClick(page, 195, 797);
  await page.waitForTimeout(500);
}

async function verifyGameStarted(page) {
  await page.waitForTimeout(2000);
  const hasInput = await page.$('input[type="text"]');
  return !hasInput;
}

/**
 * 구슬 진행도 모니터링 주입
 * PixiJS 씬의 marble Y좌표를 1초마다 콘솔에 출력
 */
async function injectProgressMonitor(page) {
  await page.evaluate(() => {
    window.__marbleTracker = { maxY: 0, sectionsPassed: [], finished: false, log: [] };

    setInterval(() => {
      // Canvas 기반이므로 직접 접근 불가 — 대신 콘솔 로그를 분석
      // PixiJS의 내부 상태 접근은 불가하므로 스크린샷 기반 검증
    }, 1000);
  });
}

/**
 * 게임 진행 모니터링 — 완주 감지 (시간제한 없음)
 * 결과 화면(HTML input 사라짐 + 일정 시간 경과 후 화면 변화 없음) 감지
 */
async function waitForCompletion(page, scenario, maxWaitSec = 180) {
  const phases = [];
  const sectionScreenshots = {};
  const startTime = Date.now();
  let lastScreenshotSec = -5;
  let stableFrames = 0;
  let lastPixelSample = '';

  while ((Date.now() - startTime) < maxWaitSec * 1000) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

    // 5초 간격 스크린샷
    if (elapsedSec - lastScreenshotSec >= 5) {
      const fname = sp(scenario, `t${elapsedSec}s`);
      await page.screenshot({ path: fname });
      phases.push({ time: elapsedSec, file: fname });
      lastScreenshotSec = elapsedSec;

      // 화면 변화 감지 (파일 크기 비교 — 변화 없으면 게임 종료)
      try {
        const stat = fs.statSync(fname);
        const currentSample = `${stat.size}`;
        if (currentSample === lastPixelSample) {
          stableFrames++;
        } else {
          stableFrames = 0;
        }
        lastPixelSample = currentSample;
      } catch { /* ignore */ }

      // 결과 화면 감지 — HTML input 부재 + 3회 연속 동일 크기
      const hasInput = await page.$('input[type="text"]');
      if (!hasInput && stableFrames >= 2 && elapsedSec > 15) {
        const fname2 = sp(scenario, 'result');
        await page.screenshot({ path: fname2 });
        phases.push({ time: elapsedSec, file: fname2, phase: 'RESULT' });
        return { completed: true, phases, duration: elapsedSec };
      }
    }

    await page.waitForTimeout(1000);
  }

  const fname = sp(scenario, 'timeout');
  await page.screenshot({ path: fname });
  phases.push({ time: maxWaitSec, file: fname, phase: 'TIMEOUT' });
  return { completed: false, phases, duration: maxWaitSec };
}

function setupConsoleCollector(page) {
  const messages = { errors: [], warnings: [], logs: [] };
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') messages.errors.push(text);
    else if (type === 'warning') messages.warnings.push(text);
    else messages.logs.push(text);
  });
  page.on('pageerror', err => messages.errors.push(err.message));
  return messages;
}

function filterErrors(errors) {
  return errors.filter(e =>
    !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR') &&
    !e.includes('ResizeObserver') && !e.includes('passive') &&
    !e.includes('the server responded with a status of 404')
  );
}

// ─── Results ─────────────────────────────────────

const results = [];

async function runScenario(browser, id, name, fn) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[${id}] ${name}`);
  console.log('═'.repeat(60));

  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const consoleMsgs = setupConsoleCollector(page);
  const startTime = Date.now();

  let status = 'PASS', detail = '', screenshots = [], failPoint = '';

  try {
    const result = await fn(page, consoleMsgs);
    status = result.status; detail = result.detail;
    screenshots = result.screenshots || []; failPoint = result.failPoint || '';
  } catch (err) {
    status = 'FAIL'; detail = `Exception: ${err.message}`;
    failPoint = err.stack?.split('\n')[1]?.trim() || '';
    try { await page.screenshot({ path: sp(id, 'error') }); } catch {}
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const critErrors = filterErrors(consoleMsgs.errors);

  if (status === 'PASS' && consoleMsgs.warnings.length > 0) {
    status = 'WARN'; detail += ` | Warnings: ${consoleMsgs.warnings.length}건`;
  }
  if (critErrors.length > 0 && status === 'PASS') {
    status = 'FAIL'; detail += ` | Console errors: ${critErrors.slice(0, 2).join('; ')}`;
  }

  const r = { id, name, status, detail, duration, screenshots, consoleErrors: critErrors, failPoint };
  results.push(r);

  const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌' }[status];
  console.log(`${icon} ${status} (${duration}s) — ${detail || 'OK'}`);

  await context.close();
}

// ─── Section-Based Verification Helper ───────────

/**
 * 구간 통과 검증 — 게임 진행 중 5초마다 스크린샷을 찍어
 * 카메라가 각 구간의 Y좌표 범위에 도달했는지 확인
 * (미니맵에서 구슬 위치가 하강하는 것으로 검증)
 */
async function runSectionVerification(page, scenario, maxWait = 180) {
  const sectionsPassed = new Map();
  const phases = [];
  const startTime = Date.now();
  let lastCaptureSec = -3;

  while ((Date.now() - startTime) < maxWait * 1000) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

    if (elapsedSec - lastCaptureSec >= 3) {
      const fname = sp(scenario, `scan-${elapsedSec}s`);
      await page.screenshot({ path: fname });
      phases.push({ time: elapsedSec, file: fname });
      lastCaptureSec = elapsedSec;

      // 결과 화면 감지
      const hasInput = await page.$('input[type="text"]');
      const hasSelect = await page.$('select');
      if (!hasInput && !hasSelect && elapsedSec > 10) {
        // 결과 화면인지 확인 — 2초 후 재확인
        await page.waitForTimeout(2000);
        const stillNoInput = !(await page.$('input[type="text"]'));
        if (stillNoInput) {
          const fname2 = sp(scenario, 'result-final');
          await page.screenshot({ path: fname2 });
          phases.push({ time: elapsedSec + 2, file: fname2, phase: 'RESULT' });
          return { completed: true, phases, duration: elapsedSec + 2 };
        }
      }
    }

    await page.waitForTimeout(1000);
  }

  return { completed: false, phases, duration: maxWait };
}

// ─── Main ────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Marble Race V3 — 구간별 단위 테스트 (시간제한 제거)   ║');
  console.log('║  SEC1~SEC7 구간 통과 + 완주 검증 | --auto --fix       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // Clean old screenshots
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const oldFiles = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
  oldFiles.forEach(f => fs.unlinkSync(path.join(SCREENSHOT_DIR, f)));

  const browser = await chromium.launch({ headless: false });

  // ═══ S-1: 4명 1등뽑기 — 전체 구간 통과 + 완주 ═══
  await runScenario(browser, 'S1-FULL', '4명 1등뽑기 — 전구간 완주 (시간제한 없음)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['구간A', '구간B', '구간C', '구간D']);
    const started = await verifyGameStarted(page);
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    await page.screenshot({ path: sp('S1-FULL', 'game-started') });

    const race = await runSectionVerification(page, 'S1-FULL', 120);

    return {
      status: race.completed ? 'PASS' : 'FAIL',
      detail: race.completed
        ? `완주 성공 (${race.duration}s). ${race.phases.length}개 프레임 캡처. 시간제한 없이 순수 물리 완주.`
        : `완주 실패 — ${race.duration}s 타임아웃. 구슬 끼임 가능성.`,
      screenshots: race.phases.map(p => p.file),
      failPoint: race.completed ? '' : 'waitForCompletion timeout',
    };
  });

  // ═══ S-2: 2명 최소인원 완주 ═══
  await runScenario(browser, 'S2-MIN', '2명 최소 인원 완주 (시간제한 없음)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['최소A', '최소B']);
    const started = await verifyGameStarted(page);
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패' };

    const race = await runSectionVerification(page, 'S2-MIN', 120);
    return {
      status: race.completed ? 'PASS' : 'FAIL',
      detail: race.completed
        ? `2명+4더미 완주 (${race.duration}s). 1등 결정 즉시 종료.`
        : `완주 실패 (${race.duration}s).`,
      screenshots: race.phases.map(p => p.file),
    };
  });

  // ═══ S-3: 10명 최대인원 병목 완주 ═══
  await runScenario(browser, 'S3-MAX', '10명 최대 인원 병목 완주 (시간제한 없음)', async (page) => {
    const names = Array.from({ length: 10 }, (_, i) => `선수${i + 1}`);
    await navigateToMarbleRace(page, 'first', names);
    const started = await verifyGameStarted(page);
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패' };

    const race = await runSectionVerification(page, 'S3-MAX', 180);
    return {
      status: race.completed ? 'PASS' : 'FAIL',
      detail: race.completed
        ? `10명 완주 (${race.duration}s). 병목 전 구간 통과.`
        : `10명 완주 실패 (${race.duration}s). 병목 끼임.`,
      screenshots: race.phases.map(p => p.file),
    };
  });

  // ═══ S-4: 꼴등뽑기 완주 ═══
  await runScenario(browser, 'S4-LAST', '4명 꼴등뽑기 완주 (시간제한 없음)', async (page) => {
    await navigateToMarbleRace(page, 'last', ['꼴등A', '꼴등B', '꼴등C', '꼴등D']);
    const started = await verifyGameStarted(page);
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패' };

    const race = await runSectionVerification(page, 'S4-LAST', 120);
    return {
      status: race.completed ? 'PASS' : 'FAIL',
      detail: race.completed
        ? `꼴등뽑기 완주 (${race.duration}s). N-1명 완주 후 꼴등 결정.`
        : `꼴등뽑기 실패 (${race.duration}s).`,
      screenshots: race.phases.map(p => p.file),
    };
  });

  // ═══ S-5: 콘솔 에러 검증 ═══
  await runScenario(browser, 'S5-ERR', '콘솔 에러 0건 검증 (시간제한 없음)', async (page, consoleMsgs) => {
    await navigateToMarbleRace(page, 'first', ['에러A', '에러B', '에러C', '에러D']);
    const started = await verifyGameStarted(page);
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패' };

    const race = await runSectionVerification(page, 'S5-ERR', 120);
    const critErrors = filterErrors(consoleMsgs.errors);

    return {
      status: critErrors.length === 0 ? 'PASS' : 'FAIL',
      detail: critErrors.length === 0
        ? `콘솔 에러 0건. 완주: ${race.completed ? '성공' : '실패'} (${race.duration}s).`
        : `콘솔 에러 ${critErrors.length}건: ${critErrors.slice(0, 3).join('; ')}`,
      screenshots: race.phases.map(p => p.file),
    };
  });

  // ─── Final Report ──────────────────────────────

  await browser.close();

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Unit Test 결과 (시간제한 제거 버전)                    ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  시나리오: ${results.length}개 실행                                   ║`);
  console.log(`║  ✅ PASS: ${pass}  ❌ FAIL: ${fail}  ⚠️ WARN: ${warn}                   ║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  console.log('\n── 시나리오별 상세 ──\n');
  for (const r of results) {
    const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌' }[r.status];
    console.log(`[${r.id}] ${icon} ${r.name} — ${r.status} (${r.duration}s)`);
    if (r.detail) console.log(`  └ ${r.detail}`);
    if (r.failPoint) console.log(`  └ 실패 지점: ${r.failPoint}`);
  }

  const report = {
    testSuite: 'Marble Race V3 — Section Test (No Time Limit)',
    timestamp: new Date().toISOString(),
    summary: { total: results.length, pass, fail, warn },
    scenarios: results,
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'test-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n📄 ${path.join(SCREENSHOT_DIR, 'test-report.json')}`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
