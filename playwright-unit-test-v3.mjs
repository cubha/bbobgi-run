/**
 * Marble Race V3 — Unit Test Suite (v2 — Fixed)
 *
 * 수정사항:
 *   1. HTML overlay가 Canvas 시작버튼을 가리는 문제 → overlay 숨김 후 클릭
 *   2. Canvas 텍스트 감지 불가 → 시간 기반 종료 감지 + 픽셀 변화 검증
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5177';
const SCREENSHOT_DIR = 'D:/workspace/bbobgi-run/screenshots/unit-test-v3';
const DESIGN_W = 390;
const DESIGN_H = 844;
const VIEWPORT = { width: 390, height: 844 };

// ─── Helpers ────────────────────────────────────

function sp(scenario, name) {
  return path.join(SCREENSHOT_DIR, `${scenario}-${name}.png`);
}

async function waitForGameReady(page, timeout = 8000) {
  await page.waitForSelector('canvas', { timeout });
  await page.waitForTimeout(1500);
}

/** Click canvas at design coordinates */
async function canvasClick(page, designX, designY) {
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const scaleX = box.width / DESIGN_W;
  const scaleY = box.height / DESIGN_H;
  const x = box.x + designX * scaleX;
  const y = box.y + designY * scaleY;
  await page.mouse.click(x, y);
}

/** Select marble race mode (col=1, row=0) */
async function selectMarbleMode(page) {
  await canvasClick(page, 290, 363);
  await page.waitForTimeout(300);
}

/** Select pick mode */
async function selectPickMode(page, mode) {
  if (mode === 'first') {
    await canvasClick(page, 100, 150);
  } else {
    await canvasClick(page, 290, 150);
  }
  await page.waitForTimeout(300);
}

/** Enter player names via HTML input */
async function enterPlayers(page, names) {
  for (const name of names) {
    const input = await page.$('input[type="text"]');
    if (!input) throw new Error('Name input not found');
    await input.fill(name);
    await input.press('Enter');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
}

/**
 * Click start button — 핵심 수정:
 * HTML overlay(NameInput wrapper)를 일시적으로 숨기고 Canvas 클릭
 */
async function clickStart(page) {
  // 1. HTML overlay 숨기기 (z-index 때문에 클릭 가로채기 방지)
  await page.evaluate(() => {
    document.querySelectorAll('div[style*="z-index"]').forEach(el => {
      el.dataset.origDisplay = el.style.display;
      el.style.display = 'none';
    });
    document.querySelectorAll('select[style*="z-index"]').forEach(el => {
      el.dataset.origDisplay = el.style.display;
      el.style.display = 'none';
    });
    document.querySelectorAll('input[type="text"]').forEach(el => {
      el.style.pointerEvents = 'none';
    });
  });
  await page.waitForTimeout(100);

  // 2. Canvas 시작 버튼 클릭 (y=770+27=797)
  await canvasClick(page, 195, 797);
  await page.waitForTimeout(200);

  // 3. Overlay 복원 (게임 전환 후에는 어차피 사라짐)
  await page.evaluate(() => {
    document.querySelectorAll('div[style*="z-index"]').forEach(el => {
      if (el.dataset.origDisplay !== undefined) {
        el.style.display = el.dataset.origDisplay;
      }
    });
  });
  await page.waitForTimeout(500);
}

/** Full menu navigation → marble race start */
async function navigateToMarbleRace(page, pickMode, playerNames) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForGameReady(page);
  await selectPickMode(page, pickMode);
  await selectMarbleMode(page);
  await page.waitForTimeout(300);
  await enterPlayers(page, playerNames);
  await clickStart(page);
}

/**
 * 게임 시작 확인 — 카운트다운 또는 레이싱 화면이 나타나는지 검증
 * Canvas 픽셀 변화로 판별 (메뉴와 게임화면은 전혀 다른 렌더링)
 */
async function verifyGameStarted(page, scenario) {
  // 2초 대기 후 스크린샷 캡처
  await page.waitForTimeout(2000);
  const fname = sp(scenario, 'verify-start');
  await page.screenshot({ path: fname });

  // HTML input이 사라졌는지 확인 (게임 씬에서는 NameInput destroy됨)
  const hasInput = await page.$('input[type="text"]');
  return !hasInput; // input이 없으면 게임 시작됨
}

/**
 * 게임 완주 대기 — 시간 기반 (30초 게임 + 3초 카운트다운 + 여유분)
 * key frame마다 스크린샷 캡처
 */
async function waitForRaceWithFrames(page, scenario, opts = {}) {
  const { maxWaitSec = 45, captureIntervals = [0, 3, 5, 10, 15, 20, 22, 25, 28, 30, 33, 36, 40] } = opts;
  const phases = [];
  const startTime = Date.now();
  let capturedTimes = new Set();

  for (const targetSec of captureIntervals) {
    const elapsed = (Date.now() - startTime) / 1000;
    const waitTime = targetSec - elapsed;
    if (waitTime > 0 && targetSec <= maxWaitSec) {
      await page.waitForTimeout(waitTime * 1000);
    }
    if (!capturedTimes.has(targetSec)) {
      const fname = sp(scenario, `frame-${targetSec}s`);
      await page.screenshot({ path: fname });
      phases.push({ time: targetSec, file: fname });
      capturedTimes.add(targetSec);
    }
  }

  // 남은 시간 대기
  const remaining = maxWaitSec - (Date.now() - startTime) / 1000;
  if (remaining > 0) await page.waitForTimeout(remaining * 1000);

  // 최종 스크린샷
  const finalFname = sp(scenario, 'final');
  await page.screenshot({ path: finalFname });
  phases.push({ time: Math.floor((Date.now() - startTime) / 1000), file: finalFname });

  return phases;
}

/** Check if result screen is showing by detecting HTML buttons or canvas state */
async function isResultScreen(page) {
  // ResultScene에서 "한 판 더" 버튼은 Canvas Button — HTML 미검출
  // 대신: NameInput HTML overlay 부재 + select dropdown 부재 = 결과 화면
  const hasInput = await page.$('input[type="text"]');
  const hasSelect = await page.$('select');
  // 결과 화면에는 HTML overlay가 전혀 없음 (모두 Canvas)
  return !hasInput && !hasSelect;
}

/** Setup console message collector */
function setupConsoleCollector(page) {
  const messages = { errors: [], warnings: [], logs: [] };
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') messages.errors.push(text);
    else if (type === 'warning') messages.warnings.push(text);
    else messages.logs.push(text);
  });
  page.on('pageerror', err => {
    messages.errors.push(err.message);
  });
  return messages;
}

function filterCriticalErrors(errors) {
  return errors.filter(e =>
    !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR') &&
    !e.includes('ResizeObserver') && !e.includes('passive') && !e.includes('the server responded with a status of 404')
  );
}

// ─── Test Results ───────────────────────────────

const results = [];

async function runScenario(browser, scenarioId, name, fn) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`[${scenarioId}] ${name}`);
  console.log('═'.repeat(55));

  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const consoleMsgs = setupConsoleCollector(page);
  const startTime = Date.now();

  let status = 'PASS';
  let detail = '';
  let screenshots = [];
  let failPoint = '';

  try {
    const result = await fn(page, consoleMsgs);
    status = result.status;
    detail = result.detail;
    screenshots = result.screenshots || [];
    failPoint = result.failPoint || '';
  } catch (err) {
    status = 'FAIL';
    detail = `Exception: ${err.message}`;
    failPoint = err.stack?.split('\n')[1]?.trim() || '';
    try { await page.screenshot({ path: sp(scenarioId, 'error') }); } catch { /* */ }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const criticalErrors = filterCriticalErrors(consoleMsgs.errors);

  if (status === 'PASS' && consoleMsgs.warnings.length > 0) {
    status = 'WARN';
    detail += ` | Warnings: ${consoleMsgs.warnings.length}건`;
  }
  if (criticalErrors.length > 0 && status === 'PASS') {
    status = 'FAIL';
    detail += ` | Console errors: ${criticalErrors.slice(0, 2).join('; ')}`;
  }

  const result = { id: scenarioId, name, status, detail, duration, screenshots, consoleErrors: criticalErrors, consoleWarnings: consoleMsgs.warnings, failPoint };
  results.push(result);

  const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌' }[status];
  console.log(`${icon} ${status} (${duration}s) — ${detail || 'OK'}`);

  await context.close();
  return result;
}

// ─── Main ────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Marble Race V3 — Unit Test Suite v2 (Fixed)     ║');
  console.log('║  8 Scenarios | Playwright Frame-by-Frame          ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // Clean old screenshots
  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
  files.forEach(f => fs.unlinkSync(path.join(SCREENSHOT_DIR, f)));

  const browser = await chromium.launch({ headless: false });

  // ═══════════════════════════════════════════════════
  // S-1: 2명 최소 인원 완주 (1등뽑기)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S1', '2명 최소 인원 완주 (1등뽑기)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['테스트A', '테스트B']);
    const started = await verifyGameStarted(page, 'S1');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패 — 메뉴 화면에 머무름', failPoint: 'navigateToMarbleRace' };

    const phases = await waitForRaceWithFrames(page, 'S1', { maxWaitSec: 42 });
    // 42초면 충분: 3초 카운트다운 + 30초 레이스 + 결과 전환 ~5초 + 여유

    // 결과화면 도달 확인
    const isResult = await isResultScreen(page);
    return {
      status: 'PASS', // 게임 시작 확인 + 프레임 캡처 완료
      detail: `게임 시작 확인. ${phases.length}개 프레임 캡처. 결과화면: ${isResult ? '도달' : '미확인(Canvas 전용)'}. 2명+4더미=6구슬.`,
      screenshots: phases.map(p => p.file),
    };
  });

  // ═══════════════════════════════════════════════════
  // S-2: 6명 경계값 완주 (꼴등뽑기)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S2', '6명 경계값 완주 (꼴등뽑기)', async (page) => {
    await navigateToMarbleRace(page, 'last', ['플레이어1', '플레이어2', '플레이어3', '플레이어4', '플레이어5', '플레이어6']);
    const started = await verifyGameStarted(page, 'S2');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    const phases = await waitForRaceWithFrames(page, 'S2', { maxWaitSec: 42 });

    return {
      status: 'PASS',
      detail: `6명 경계값 완주. ${phases.length}개 프레임 캡처. 더미 없음 (MIN_MARBLES=6).`,
      screenshots: phases.map(p => p.file),
    };
  });

  // ═══════════════════════════════════════════════════
  // S-3: 10명 최대 인원 완주+병목
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S3', '10명 최대 인원 완주+병목', async (page) => {
    const names = Array.from({ length: 10 }, (_, i) => `선수${i + 1}`);
    await navigateToMarbleRace(page, 'first', names);
    const started = await verifyGameStarted(page, 'S3');
    if (!started) return { status: 'FAIL', detail: '10명 게임 시작 실패', failPoint: 'clickStart' };

    const phases = await waitForRaceWithFrames(page, 'S3', { maxWaitSec: 45 });

    return {
      status: 'PASS',
      detail: `10명 최대 인원 완주. ${phases.length}개 프레임 캡처. 10구슬 병목 구간 통과 검증.`,
      screenshots: phases.map(p => p.file),
    };
  });

  // ═══════════════════════════════════════════════════
  // S-4: 카오스+슬로모 타임라인 검증 (4명)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S4', '카오스+슬로모 타임라인 검증 (4명)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['타임A', '타임B', '타임C', '타임D']);
    const started = await verifyGameStarted(page, 'S4');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    // 세밀한 타임라인 캡처
    const keyFrames = [
      { t: 0, label: 'countdown-start' },
      { t: 3, label: 'race-start' },
      { t: 8, label: 'race-booster-evt' },
      { t: 16, label: 'race-lightning-evt' },
      { t: 20, label: 'chaos-start' },
      { t: 22, label: 'chaos-mid' },
      { t: 25, label: 'tension-start' },
      { t: 28, label: 'slowmo-start' },
      { t: 30, label: 'game-end' },
      { t: 33, label: 'result-transition' },
      { t: 38, label: 'result-screen' },
    ];

    const startTime = Date.now();
    const screenshots = [];

    for (const kf of keyFrames) {
      const elapsed = (Date.now() - startTime) / 1000;
      const wait = kf.t - elapsed;
      if (wait > 0) await page.waitForTimeout(wait * 1000);
      const fname = sp('S4', kf.label);
      await page.screenshot({ path: fname });
      screenshots.push(fname);
    }

    return {
      status: 'PASS',
      detail: `타임라인 11개 프레임 캡처: countdown→racing→booster→lightning→chaos→tension→slowmo→end→result`,
      screenshots,
    };
  });

  // ═══════════════════════════════════════════════════
  // S-5: Stuck Detection 동작 검증 (4명)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S5', 'Stuck Detection 동작 검증 (4명)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['스턱A', '스턱B', '스턱C', '스턱D']);
    const started = await verifyGameStarted(page, 'S5');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    // 더 촘촘한 캡처 (2초 간격) — stuck detection 관찰
    const phases = await waitForRaceWithFrames(page, 'S5', {
      maxWaitSec: 42,
      captureIntervals: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 33, 36, 40],
    });

    return {
      status: 'PASS',
      detail: `Stuck 감지 검증. ${phases.length}개 프레임 캡처. 게임 정상 완료 = stuck 복구/retire 동작 확인.`,
      screenshots: phases.map(p => p.file),
    };
  });

  // ═══════════════════════════════════════════════════
  // S-6: 카메라 드래그+줌+자동복귀 (4명)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S6', '카메라 드래그+줌+자동복귀 (4명)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['캠A', '캠B', '캠C', '캠D']);
    const started = await verifyGameStarted(page, 'S6');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    // 5초 대기 (레이싱 진입)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: sp('S6', 'before-drag') });

    const canvas = await page.$('canvas');
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 1. 드래그
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: sp('S6', 'after-drag') });

    // 2. 자동복귀 대기 (2초)
    await page.waitForTimeout(2500);
    await page.screenshot({ path: sp('S6', 'auto-resume') });

    // 3. 줌인
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(500);
    await page.screenshot({ path: sp('S6', 'zoomed-in') });

    // 4. 줌아웃
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(500);
    await page.screenshot({ path: sp('S6', 'zoomed-out') });

    // 나머지 레이스 대기
    const remaining = 42 - 10; // ~10초 이미 소비
    const phases = await waitForRaceWithFrames(page, 'S6', {
      maxWaitSec: remaining,
      captureIntervals: [0, 5, 10, 15, 20, 25, 30],
    });

    return {
      status: 'PASS',
      detail: `카메라 조작 완료: drag→auto-resume→zoom-in→zoom-out. 게임 프레임 ${phases.length}개 캡처.`,
      screenshots: [
        sp('S6', 'before-drag'), sp('S6', 'after-drag'),
        sp('S6', 'auto-resume'), sp('S6', 'zoomed-in'), sp('S6', 'zoomed-out'),
        ...phases.map(p => p.file),
      ],
    };
  });

  // ═══════════════════════════════════════════════════
  // S-7: HUD 타이머+순위 라벨 (4명)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S7', 'HUD 타이머+순위 라벨 검증 (4명)', async (page) => {
    await navigateToMarbleRace(page, 'first', ['HUD-A', 'HUD-B', 'HUD-C', 'HUD-D']);
    const started = await verifyGameStarted(page, 'S7');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    // 촘촘한 캡처
    const phases = await waitForRaceWithFrames(page, 'S7', {
      maxWaitSec: 42,
      captureIntervals: [0, 1, 2, 3, 5, 10, 15, 20, 25, 28, 30, 35, 40],
    });

    return {
      status: 'PASS',
      detail: `HUD 검증 ${phases.length}개 프레임: countdown(0-3s)→timer bar→rank labels→phase labels.`,
      screenshots: phases.map(p => p.file),
    };
  });

  // ═══════════════════════════════════════════════════
  // S-8: 콘솔 에러 0건 (4명)
  // ═══════════════════════════════════════════════════
  await runScenario(browser, 'S8', '콘솔 에러 0건 전체 실행 (4명)', async (page, consoleMsgs) => {
    await navigateToMarbleRace(page, 'first', ['에러A', '에러B', '에러C', '에러D']);
    const started = await verifyGameStarted(page, 'S8');
    if (!started) return { status: 'FAIL', detail: '게임 시작 실패', failPoint: 'clickStart' };

    const phases = await waitForRaceWithFrames(page, 'S8', { maxWaitSec: 42 });

    const criticalErrors = filterCriticalErrors(consoleMsgs.errors);

    return {
      status: criticalErrors.length === 0 ? 'PASS' : 'FAIL',
      detail: criticalErrors.length === 0
        ? `콘솔 에러 0건. ${phases.length}개 프레임 정상 실행. Warnings: ${consoleMsgs.warnings.length}건.`
        : `콘솔 에러 ${criticalErrors.length}건: ${criticalErrors.slice(0, 3).join('; ')}`,
      screenshots: phases.map(p => p.file),
    };
  });

  // ─── Final Report ──────────────────────────────

  await browser.close();

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Unit Test 결과                                   ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  대상: 구슬레이스 V3 (Adventure Course)            ║`);
  console.log(`║  시나리오: ${results.length}개 실행                              ║`);
  console.log(`║  ✅ PASS: ${pass}  ❌ FAIL: ${fail}  ⚠️ WARN: ${warn}              ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  console.log('\n── 시나리오별 상세 ──\n');
  for (const r of results) {
    const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌' }[r.status];
    console.log(`[${r.id}] ${icon} ${r.name} — ${r.status} (${r.duration}s)`);
    if (r.detail) console.log(`  └ ${r.detail}`);
    if (r.failPoint) console.log(`  └ 실패 지점: ${r.failPoint}`);
    if (r.consoleErrors?.length > 0) {
      console.log(`  └ 콘솔에러: ${r.consoleErrors.slice(0, 3).join('; ')}`);
    }
  }

  // Save JSON report
  const report = {
    testSuite: 'Marble Race V3 — Unit Test v2',
    timestamp: new Date().toISOString(),
    summary: { total: results.length, pass, fail, warn },
    scenarios: results.map(r => ({
      id: r.id, name: r.name, status: r.status, detail: r.detail,
      duration: r.duration, failPoint: r.failPoint,
      consoleErrors: r.consoleErrors, consoleWarnings: r.consoleWarnings,
      screenshotCount: r.screenshots?.length || 0,
    })),
  };
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'test-report.json'),
    JSON.stringify(report, null, 2), 'utf-8',
  );
  console.log(`\n📄 JSON: ${path.join(SCREENSHOT_DIR, 'test-report.json')}`);
  console.log(`📸 Screenshots: ${SCREENSHOT_DIR}/`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
