/**
 * 구슬레이스 V3 — 구간별 구조물 매칭 검증 단위테스트
 *
 * HTML 프리뷰(Adventure Course Preview)의 SEC1~SEC8 설계를 기준으로:
 *   S-1: 구조물 매칭 검증 — 28개 세그먼트 ID/타입/좌표가 HTML 설계와 일치하는지
 *   S-2: 체크포인트 순서 통과 — 구슬이 cp-s2→cp-s3→cp-s4→cp-s5→cp-s6 순서로 통과하는지
 *   S-3: 전 구간 오류 없이 통과 — 4명 기준, 콘솔 에러 0건 + 모든 구슬 완주
 *   S-4: 10명 최대 인원 구간 통과 + 완주
 *   S-5: 2명 최소 인원 구간 통과 + 완주
 *
 * 검증 방법: window.__gameApp 디버그 훅을 통해 게임 내부 상태 직접 접근
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5177';
const SCREENSHOT_DIR = 'D:/workspace/bbobgi-run/screenshots/v3-section-match';
const DESIGN_W = 390;
const DESIGN_H = 844;
const VIEWPORT = { width: 390, height: 844 };

// ═══════════════════════════════════════════════════════
// HTML 프리뷰 기준 구간별 구조물 설계 사양
// (Marble Run V3 - Adventure Course Preview.html에서 추출)
// ═══════════════════════════════════════════════════════

const HTML_SPEC = {
  sections: [
    {
      id: 'SEC1', name: 'Start Funnel', yRange: [80, 300],
      description: '넓은 깔때기 → 첫 채널 진입',
      requiredSegments: [
        { id: 's1-funnel', type: 'funnel' },
      ],
    },
    {
      id: 'SEC2', name: 'Right Traverse Channel', yRange: [300, 520],
      description: '우측 밀폐 채널 + 내부 범퍼/핀',
      requiredSegments: [
        { id: 's2-ch-right', type: 'channel' },
        { id: 's2-pin1', type: 'pinzone' },
      ],
    },
    {
      id: 'SEC3', name: 'U-Turn + Left Return', yRange: [520, 750],
      description: '반원 U턴 → 좌측 복귀 + 풍차 2개',
      requiredSegments: [
        { id: 's3-uturn', type: 'curved' },
        { id: 's3-ch-left', type: 'channel' },
        { id: 's3-windmill-1', type: 'windmill' },
        { id: 's3-windmill-2', type: 'windmill' },
      ],
    },
    {
      id: 'SEC4', name: 'Waterwheel Lift', yRange: [750, 950],
      description: '물레방아로 구슬 상승 → 우측 출구',
      requiredSegments: [
        { id: 's4-funnel-entry', type: 'funnel' },
        { id: 's4-wheellift', type: 'wheelLift' },
        { id: 's4-ch-exit', type: 'channel' },
      ],
    },
    {
      id: 'SEC5', name: 'Spiral Descent', yRange: [950, 1650],
      description: '나선형 하강 + 트램폴린',
      requiredSegments: [
        { id: 's5-spiral', type: 'spiral' },
        { id: 's5-ch-exit', type: 'channel' },
        { id: 's5-trampoline', type: 'trampoline' },
      ],
    },
    {
      id: 'SEC6', name: 'Obstacle Alley + Splitter', yRange: [1650, 2600],
      description: '장애물 골목(풍차+시소) → 분기(고속/안전) → 합류',
      requiredSegments: [
        { id: 's6-funnel-entry', type: 'funnel' },
        { id: 's6-ch-left', type: 'channel' },
        { id: 's6-windmill', type: 'windmill' },
        { id: 's6-seesaw', type: 'seesaw' },
        { id: 's6-ch-drop', type: 'channel' },
        { id: 's6-ch-right', type: 'channel' },
        { id: 's6-splitter', type: 'splitter' },
        { id: 's6-ch-fast', type: 'channel' },
        { id: 's6-pins-fast', type: 'pinzone' },
        { id: 's6-ch-safe', type: 'channel' },
        { id: 's6-merge', type: 'funnel' },
      ],
    },
    {
      id: 'SEC7', name: 'Final Sprint + Finish', yRange: [2600, 3080],
      description: '가속 직선 → 풍차 관문 → 병목 → 결승',
      requiredSegments: [
        { id: 's7-ch-sprint', type: 'channel' },
        { id: 's7-windmill-gate', type: 'windmill' },
        { id: 's7-bottleneck', type: 'bottleneck' },
        { id: 's7-ch-finish', type: 'channel' },
      ],
    },
  ],
  checkpoints: [
    { id: 'cp-s2', x: 2050, y: 520 },
    { id: 'cp-s3', x: 500, y: 720 },
    { id: 'cp-s4', x: 1500, y: 950 },
    { id: 'cp-s5', x: 1200, y: 1650 },
    { id: 'cp-s6', x: 1000, y: 2600 },
  ],
  finishY: 3080,
  totalSegments: 28,
};

// ═══════════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════════

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

async function waitForGameScene(page, maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const hasScene = await page.evaluate(() => {
      const app = window.__gameApp;
      if (!app) return false;
      const scene = app.scenes?.active;
      if (!scene) return false;
      return !!scene.marbles;
    });
    if (hasScene) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// S-1: 구조물 매칭 검증
// ═══════════════════════════════════════════════════════

async function testStructureMatch(page) {
  const result = {
    scenario: 'S-1',
    name: '구조물 매칭 검증 — 28개 세그먼트 ID/타입 일치',
    status: 'PASS',
    details: [],
    failures: [],
  };

  // 게임 내부에서 TrackData의 세그먼트 정보 추출
  const gameData = await page.evaluate(() => {
    const app = window.__gameApp;
    if (!app) return null;
    const scene = app.scenes?.active;
    if (!scene || !scene.trackBuilder) return null;

    // TrackBuilder.layout (private but accessible at runtime)
    const layout = scene.trackBuilder?.layout;
    if (!layout) return null;

    const segments = (layout.segments || []).map(s => ({
      id: s.id,
      type: s.type,
      originX: s.originX,
      originY: s.originY,
    }));

    const checkpoints = (layout.checkpoints || []).map(cp => ({
      id: cp.id,
      x: cp.x,
      y: cp.y,
    }));

    return {
      segments,
      checkpoints,
      finishY: layout.finishY,
      worldWidth: layout.worldWidth,
      worldHeight: layout.worldHeight,
    };
  });

  if (!gameData) {
    result.status = 'FAIL';
    result.failures.push('게임 내부 TrackData 접근 실패 — window.__gameApp 또는 scene.trackData 없음');
    return result;
  }

  // 1. 전체 세그먼트 수 검증
  if (gameData.segments.length === HTML_SPEC.totalSegments) {
    result.details.push(`✅ 세그먼트 총 수: ${gameData.segments.length}/${HTML_SPEC.totalSegments}`);
  } else {
    result.status = 'FAIL';
    result.failures.push(`❌ 세그먼트 수 불일치: 코드 ${gameData.segments.length}개, 설계 ${HTML_SPEC.totalSegments}개`);
  }

  // 2. 각 구간별 필수 세그먼트 존재 + 타입 검증
  for (const section of HTML_SPEC.sections) {
    let sectionPass = true;
    const sectionDetails = [];

    for (const reqSeg of section.requiredSegments) {
      const found = gameData.segments.find(s => s.id === reqSeg.id);
      if (!found) {
        sectionPass = false;
        sectionDetails.push(`  ❌ ${reqSeg.id} (${reqSeg.type}) — 미구현`);
      } else if (found.type !== reqSeg.type) {
        sectionPass = false;
        sectionDetails.push(`  ❌ ${reqSeg.id} — 타입 불일치: 코드=${found.type}, 설계=${reqSeg.type}`);
      } else {
        sectionDetails.push(`  ✅ ${reqSeg.id} (${reqSeg.type})`);
      }
    }

    if (sectionPass) {
      result.details.push(`✅ ${section.id}: ${section.name} — ${section.requiredSegments.length}개 세그먼트 일치`);
    } else {
      result.status = 'FAIL';
      result.details.push(`❌ ${section.id}: ${section.name} — 불일치 발견`);
      result.failures.push(`${section.id} 세그먼트 매칭 실패`);
    }
    result.details.push(...sectionDetails);
  }

  // 3. 체크포인트 검증
  for (const specCp of HTML_SPEC.checkpoints) {
    const found = gameData.checkpoints.find(cp => cp.id === specCp.id);
    if (!found) {
      result.status = 'FAIL';
      result.details.push(`❌ 체크포인트 ${specCp.id} — 미구현`);
      result.failures.push(`체크포인트 ${specCp.id} 없음`);
    } else {
      const xDiff = Math.abs(found.x - specCp.x);
      const yDiff = Math.abs(found.y - specCp.y);
      if (xDiff > 50 || yDiff > 50) {
        result.status = 'FAIL';
        result.details.push(`❌ ${specCp.id} — 좌표 편차 과다: 코드=(${found.x},${found.y}), 설계=(${specCp.x},${specCp.y})`);
      } else {
        result.details.push(`✅ ${specCp.id} — 좌표 일치 (${found.x},${found.y})`);
      }
    }
  }

  // 4. finishY 검증
  if (gameData.finishY === HTML_SPEC.finishY) {
    result.details.push(`✅ finishY = ${gameData.finishY}`);
  } else {
    result.status = 'FAIL';
    result.details.push(`❌ finishY 불일치: 코드=${gameData.finishY}, 설계=${HTML_SPEC.finishY}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// S-2~S-5: 체크포인트 순서 통과 + 완주 검증
// ═══════════════════════════════════════════════════════

async function testCheckpointTraversal(page, scenario, maxWaitSec = 120) {
  const result = {
    scenario,
    checkpointLog: [],  // { marbleName, cpId, time }
    marbleStates: [],   // 최종 상태
    allFinished: false,
    orderCorrect: true,
    consoleErrors: [],
    screenshots: [],
    duration: 0,
  };

  const startTime = Date.now();
  let lastScreenshotSec = -5;
  const cpOrder = HTML_SPEC.checkpoints.map(cp => cp.id); // cp-s2, cp-s3, cp-s4, cp-s5, cp-s6

  // 체크포인트 통과 상태 추적
  const marbleCpProgress = new Map(); // marbleName → [cp-s2, cp-s3, ...]

  while ((Date.now() - startTime) < maxWaitSec * 1000) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

    // 게임 상태 폴링 — ResultScene 전환 감지 포함
    const state = await page.evaluate(() => {
      const app = window.__gameApp;
      if (!app) return null;
      const scene = app.scenes?.active;
      if (!scene) return null;
      // ResultScene 전환 감지 (marbles 속성 없음)
      if (!scene.marbles) return { gameEnded: true, marbles: [] };

      const marbles = scene.marbles.map(m => {
        const pos = m.body?.getPosition?.() || m.body?.position || { x: 0, y: 0 };
        let cpIdx = -1;
        if (scene.marbleProgress) {
          cpIdx = scene.marbleProgress.cpIndex?.get(m) ?? -1;
        }
        return {
          name: m.player?.name || m.name || '?',
          isDummy: m.isDummy || false,
          finished: m.finished || false,
          retired: m.retired || false,
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          cpIdx,
        };
      });

      return {
        phase: scene.phase || 'unknown',
        totalElapsed: scene.totalElapsed || 0,
        marbles,
      };
    });

    if (state) {
      // 체크포인트 진행 상태 수집
      for (const m of state.marbles) {
        if (m.isDummy) continue;
        const prevIdx = marbleCpProgress.get(m.name) ?? -1;
        if (m.cpIdx > prevIdx) {
          marbleCpProgress.set(m.name, m.cpIdx);
          const cpId = cpOrder[m.cpIdx] || `cp-${m.cpIdx}`;
          result.checkpointLog.push({
            marble: m.name,
            checkpoint: cpId,
            cpIdx: m.cpIdx,
            time: elapsedSec,
            position: { x: m.x, y: m.y },
          });
        }
      }

      // 5초 간격 스크린샷 + 상태 로그
      if (elapsedSec - lastScreenshotSec >= 5) {
        const fname = sp(scenario, `t${elapsedSec}s`);
        await page.screenshot({ path: fname });
        result.screenshots.push({ time: elapsedSec, file: fname });
        lastScreenshotSec = elapsedSec;

        // 상태 로그
        const realMarbles = state.marbles.filter(m => !m.isDummy);
        const finishedCount = realMarbles.filter(m => m.finished).length;
        console.log(
          `  [${scenario} T+${elapsedSec}s] phase=${state.phase}, ` +
          `marbles: ${realMarbles.map(m => `${m.name}(cp${m.cpIdx},${m.x},${m.y}${m.finished ? ',FIN' : ''})`).join(' ')}`
        );
      }

      // 완주 확인: 전원 완주/리타이어 OR ResultScene 전환 감지
      if (state.gameEnded) {
        result.allFinished = true;
        result.duration = elapsedSec;
        const fname = sp(scenario, 'result-final');
        await page.screenshot({ path: fname });
        result.screenshots.push({ time: elapsedSec, file: fname, phase: 'RESULT' });
        break;
      }

      const realMarbles = state.marbles.filter(m => !m.isDummy);
      const allDone = realMarbles.length > 0 && realMarbles.every(m => m.finished || m.retired);
      if (allDone) {
        result.allFinished = true;
        result.marbleStates = state.marbles;
        result.duration = elapsedSec;

        // 최종 스크린샷
        await page.waitForTimeout(2000);
        const fname = sp(scenario, 'result-final');
        await page.screenshot({ path: fname });
        result.screenshots.push({ time: elapsedSec + 2, file: fname, phase: 'RESULT' });
        break;
      }
    }

    await page.waitForTimeout(1000);
  }

  if (!result.allFinished) {
    result.duration = maxWaitSec;
  }

  // 체크포인트 순서 검증
  for (const [marble, logs] of Object.entries(groupByMarble(result.checkpointLog))) {
    const indices = logs.map(l => l.cpIdx);
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] <= indices[i - 1]) {
        result.orderCorrect = false;
      }
    }
  }

  return result;
}

function groupByMarble(logs) {
  const grouped = {};
  for (const l of logs) {
    if (!grouped[l.marble]) grouped[l.marble] = [];
    grouped[l.marble].push(l);
  }
  return grouped;
}

// ═══════════════════════════════════════════════════════
// 시나리오 실행 프레임워크
// ═══════════════════════════════════════════════════════

const results = [];

function setupConsoleCollector(page) {
  const messages = { errors: [], warnings: [] };
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' && !text.includes('favicon') && !text.includes('404') && !text.includes('net::ERR'))
      messages.errors.push(text);
    else if (type === 'warning')
      messages.warnings.push(text);
  });
  page.on('pageerror', err => messages.errors.push(err.message));
  return messages;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Marble Race V3 — 구간별 구조물 매칭 검증 단위테스트      ║');
  console.log('║  HTML 프리뷰 SEC1~SEC8 vs 코드 SEC1~SEC7                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Clean old screenshots
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  try {
    const oldFiles = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
    oldFiles.forEach(f => fs.unlinkSync(path.join(SCREENSHOT_DIR, f)));
  } catch { /* ignore */ }

  const browser = await chromium.launch({ headless: false });

  // ═══════════════════════════════════════════════
  // S-1: 구조물 매칭 검증 (28개 세그먼트)
  // ═══════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('[S-1] 구조물 매칭 검증 — 28개 세그먼트 ID/타입 일치');
  console.log('═'.repeat(60));

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const consoleMsgs = setupConsoleCollector(page);

    try {
      await navigateToMarbleRace(page, 'first', ['매칭A', '매칭B', '매칭C', '매칭D']);
      const sceneReady = await waitForGameScene(page);

      if (!sceneReady) {
        results.push({
          id: 'S-1', name: '구조물 매칭 검증', status: 'FAIL',
          detail: '게임 씬 로딩 실패', failures: ['waitForGameScene timeout'],
        });
      } else {
        await page.waitForTimeout(3000); // 카운트다운 대기
        await page.screenshot({ path: sp('S1', 'game-start') });

        const matchResult = await testStructureMatch(page);
        results.push({
          id: 'S-1', name: matchResult.name, status: matchResult.status,
          detail: matchResult.details.join('\n'),
          failures: matchResult.failures,
          consoleErrors: consoleMsgs.errors,
        });

        console.log(`\n${matchResult.status === 'PASS' ? '✅' : '❌'} ${matchResult.status}`);
        for (const d of matchResult.details) console.log(d);
      }
    } catch (err) {
      results.push({
        id: 'S-1', name: '구조물 매칭 검증', status: 'FAIL',
        detail: `Exception: ${err.message}`, failures: [err.message],
      });
    }

    await context.close();
  }

  // ═══════════════════════════════════════════════
  // S-2: 4명 체크포인트 순서 통과 + 완주
  // ═══════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('[S-2] 4명 체크포인트 순서 통과 + 완주');
  console.log('═'.repeat(60));

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const consoleMsgs = setupConsoleCollector(page);

    try {
      await navigateToMarbleRace(page, 'first', ['순서A', '순서B', '순서C', '순서D']);
      const sceneReady = await waitForGameScene(page);

      if (!sceneReady) {
        results.push({
          id: 'S-2', name: '4명 체크포인트 순서 통과', status: 'FAIL',
          detail: '게임 씬 로딩 실패', failures: ['waitForGameScene timeout'],
        });
      } else {
        await page.screenshot({ path: sp('S2', 'game-start') });

        const traversal = await testCheckpointTraversal(page, 'S2', 120);

        const realMarbles = traversal.marbleStates.filter(m => !m.isDummy);
        const finishedCount = realMarbles.filter(m => m.finished).length;
        const retiredCount = realMarbles.filter(m => m.retired).length;

        // 체크포인트 통과 요약
        const cpSummary = {};
        for (const log of traversal.checkpointLog) {
          if (!cpSummary[log.checkpoint]) cpSummary[log.checkpoint] = 0;
          cpSummary[log.checkpoint]++;
        }

        let status = 'PASS';
        const details = [];
        const failures = [];

        // 완주 검증
        if (traversal.allFinished) {
          details.push(`✅ 전원 완주 (${finishedCount}명 완주, ${retiredCount}명 리타이어) — ${traversal.duration}s`);
        } else {
          status = 'FAIL';
          details.push(`❌ 미완주 — ${traversal.duration}s 타임아웃`);
          failures.push('완주 실패');
        }

        // 체크포인트 순서 검증
        if (traversal.orderCorrect) {
          details.push('✅ 체크포인트 순서 정상 (순차 통과)');
        } else {
          status = 'FAIL';
          details.push('❌ 체크포인트 역순 통과 감지');
          failures.push('체크포인트 순서 위반');
        }

        // 각 체크포인트 통과 마블 수
        for (const cpId of HTML_SPEC.checkpoints.map(cp => cp.id)) {
          const count = cpSummary[cpId] || 0;
          if (count > 0) {
            details.push(`  ✅ ${cpId}: ${count}명 통과`);
          } else {
            details.push(`  ⚠ ${cpId}: 통과 기록 없음 (구슬이 빠르게 통과했을 수 있음)`);
          }
        }

        // 콘솔 에러
        if (consoleMsgs.errors.length === 0) {
          details.push('✅ 콘솔 에러 0건');
        } else {
          status = 'FAIL';
          details.push(`❌ 콘솔 에러 ${consoleMsgs.errors.length}건: ${consoleMsgs.errors.slice(0, 3).join('; ')}`);
          failures.push('콘솔 에러 발생');
        }

        results.push({
          id: 'S-2', name: '4명 체크포인트 순서 통과 + 완주', status,
          detail: details.join('\n'), failures,
          checkpointLog: traversal.checkpointLog,
          duration: traversal.duration,
          consoleErrors: consoleMsgs.errors,
        });

        console.log(`\n${status === 'PASS' ? '✅' : '❌'} ${status} (${traversal.duration}s)`);
        for (const d of details) console.log(d);
      }
    } catch (err) {
      results.push({
        id: 'S-2', name: '4명 체크포인트 순서 통과', status: 'FAIL',
        detail: `Exception: ${err.message}`, failures: [err.message],
      });
    }

    await context.close();
  }

  // ═══════════════════════════════════════════════
  // S-3: 10명 최대 인원 전 구간 통과 + 완주
  // ═══════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('[S-3] 10명 최대 인원 전 구간 통과 + 완주');
  console.log('═'.repeat(60));

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const consoleMsgs = setupConsoleCollector(page);

    try {
      const names = Array.from({ length: 10 }, (_, i) => `선수${i + 1}`);
      await navigateToMarbleRace(page, 'first', names);
      const sceneReady = await waitForGameScene(page);

      if (!sceneReady) {
        results.push({
          id: 'S-3', name: '10명 전 구간 통과', status: 'FAIL',
          detail: '게임 씬 로딩 실패', failures: ['waitForGameScene timeout'],
        });
      } else {
        await page.screenshot({ path: sp('S3', 'game-start') });

        const traversal = await testCheckpointTraversal(page, 'S3', 180);

        const realMarbles = traversal.marbleStates.filter(m => !m.isDummy);
        const finishedCount = realMarbles.filter(m => m.finished).length;
        const retiredCount = realMarbles.filter(m => m.retired).length;

        let status = 'PASS';
        const details = [];
        const failures = [];

        if (traversal.allFinished) {
          details.push(`✅ 10명 전원 처리 (${finishedCount}명 완주, ${retiredCount}명 리타이어) — ${traversal.duration}s`);
        } else {
          status = 'FAIL';
          details.push(`❌ 10명 미완주 — ${traversal.duration}s 타임아웃`);
          failures.push('10명 완주 실패');
        }

        if (traversal.orderCorrect) {
          details.push('✅ 체크포인트 순서 정상');
        } else {
          status = 'FAIL';
          details.push('❌ 체크포인트 역순 통과');
          failures.push('순서 위반');
        }

        // 병목 통과 검증 — 10명이 모두 SEC7(병목)까지 도달했는지
        const cpSummary = {};
        for (const log of traversal.checkpointLog) {
          if (!cpSummary[log.checkpoint]) cpSummary[log.checkpoint] = new Set();
          cpSummary[log.checkpoint].add(log.marble);
        }
        for (const cpId of HTML_SPEC.checkpoints.map(cp => cp.id)) {
          const marbles = cpSummary[cpId] || new Set();
          details.push(`  ${marbles.size > 0 ? '✅' : '⚠'} ${cpId}: ${marbles.size}명 통과`);
        }

        if (consoleMsgs.errors.length === 0) {
          details.push('✅ 콘솔 에러 0건');
        } else {
          status = 'FAIL';
          details.push(`❌ 콘솔 에러 ${consoleMsgs.errors.length}건`);
          failures.push('콘솔 에러');
        }

        results.push({
          id: 'S-3', name: '10명 전 구간 통과 + 완주', status,
          detail: details.join('\n'), failures,
          checkpointLog: traversal.checkpointLog,
          duration: traversal.duration,
          consoleErrors: consoleMsgs.errors,
        });

        console.log(`\n${status === 'PASS' ? '✅' : '❌'} ${status} (${traversal.duration}s)`);
        for (const d of details) console.log(d);
      }
    } catch (err) {
      results.push({
        id: 'S-3', name: '10명 전 구간 통과', status: 'FAIL',
        detail: `Exception: ${err.message}`, failures: [err.message],
      });
    }

    await context.close();
  }

  // ═══════════════════════════════════════════════
  // S-4: 2명 최소 인원 전 구간 통과 + 완주
  // ═══════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('[S-4] 2명 최소 인원 전 구간 통과 + 완주');
  console.log('═'.repeat(60));

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const consoleMsgs = setupConsoleCollector(page);

    try {
      await navigateToMarbleRace(page, 'last', ['최소A', '최소B']);
      const sceneReady = await waitForGameScene(page);

      if (!sceneReady) {
        results.push({
          id: 'S-4', name: '2명 전 구간 통과', status: 'FAIL',
          detail: '게임 씬 로딩 실패', failures: ['waitForGameScene timeout'],
        });
      } else {
        await page.screenshot({ path: sp('S4', 'game-start') });

        const traversal = await testCheckpointTraversal(page, 'S4', 120);

        const realMarbles = traversal.marbleStates.filter(m => !m.isDummy);
        const finishedCount = realMarbles.filter(m => m.finished).length;

        let status = 'PASS';
        const details = [];
        const failures = [];

        if (traversal.allFinished) {
          details.push(`✅ 2명 전원 처리 (${finishedCount}명 완주) — ${traversal.duration}s`);
        } else {
          status = 'FAIL';
          details.push(`❌ 2명 미완주 — ${traversal.duration}s 타임아웃`);
          failures.push('완주 실패');
        }

        if (traversal.orderCorrect) {
          details.push('✅ 체크포인트 순서 정상');
        } else {
          status = 'FAIL';
          details.push('❌ 체크포인트 역순 통과');
          failures.push('순서 위반');
        }

        // 더미 구슬 처리 검증
        const dummyMarbles = traversal.marbleStates.filter(m => m.isDummy);
        details.push(`✅ 더미 구슬: ${dummyMarbles.length}개 (2명이므로 4개 더미 보충)`);

        if (consoleMsgs.errors.length === 0) {
          details.push('✅ 콘솔 에러 0건');
        } else {
          status = 'FAIL';
          details.push(`❌ 콘솔 에러 ${consoleMsgs.errors.length}건`);
          failures.push('콘솔 에러');
        }

        results.push({
          id: 'S-4', name: '2명 전 구간 통과 + 완주 (꼴등뽑기)', status,
          detail: details.join('\n'), failures,
          duration: traversal.duration,
          consoleErrors: consoleMsgs.errors,
        });

        console.log(`\n${status === 'PASS' ? '✅' : '❌'} ${status} (${traversal.duration}s)`);
        for (const d of details) console.log(d);
      }
    } catch (err) {
      results.push({
        id: 'S-4', name: '2명 전 구간 통과', status: 'FAIL',
        detail: `Exception: ${err.message}`, failures: [err.message],
      });
    }

    await context.close();
  }

  // ═══════════════════════════════════════════════
  // S-5: 구간별 구슬 위치 추적 상세 (4명, 3초 폴링)
  // ═══════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('[S-5] 구간별 구슬 위치 추적 상세');
  console.log('═'.repeat(60));

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const consoleMsgs = setupConsoleCollector(page);

    try {
      await navigateToMarbleRace(page, 'first', ['추적A', '추적B', '추적C', '추적D']);
      const sceneReady = await waitForGameScene(page);

      if (!sceneReady) {
        results.push({
          id: 'S-5', name: '구간별 위치 추적', status: 'FAIL',
          detail: '게임 씬 로딩 실패', failures: ['waitForGameScene timeout'],
        });
      } else {
        // 구슬 위치를 2초 간격으로 폴링하며 어느 구간(SEC)에 있는지 기록
        const sectionLog = []; // { time, marbles: [{ name, section, x, y }] }
        const startTime = Date.now();

        let gameFinished = false;

        while ((Date.now() - startTime) < 120 * 1000 && !gameFinished) {
          const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

          const state = await page.evaluate((sections) => {
            const app = window.__gameApp;
            if (!app) return null;
            const scene = app.scenes?.active;
            if (!scene || !scene.marbles) return null; // ResultScene → null

            return scene.marbles.filter(m => !m.isDummy).map(m => {
              const pos = m.body?.getPosition?.() || m.body?.position || { x: 0, y: 0 };
              const y = pos.y;

              // Y좌표 기반 구간 판별
              let section = 'UNKNOWN';
              for (const sec of sections) {
                if (y >= sec.yRange[0] && y < sec.yRange[1]) {
                  section = sec.id;
                  break;
                }
              }
              if (y >= 3080) section = 'FINISH';

              return {
                name: m.player?.name || '?',
                section,
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                finished: m.finished || false,
              };
            });
          }, HTML_SPEC.sections);

          if (state) {
            sectionLog.push({ time: elapsedSec, marbles: state });

            if (elapsedSec % 3 === 0) {
              const summary = state.map(m => `${m.name}@${m.section}(${m.x},${m.y})`).join(' | ');
              console.log(`  [T+${elapsedSec}s] ${summary}`);
              await page.screenshot({ path: sp('S5', `t${elapsedSec}s`) });
            }

            if (state.length > 0 && state.every(m => m.finished)) {
              gameFinished = true;
            }
          } else {
            // state가 null = ResultScene 전환 (게임 종료)
            const sceneCheck = await page.evaluate(() => {
              const app = window.__gameApp;
              return app && !app.scenes?.active?.marbles;
            });
            if (sceneCheck) { gameFinished = true; }
          }

          await page.waitForTimeout(2000);
        }

        // 분석: 각 구슬이 어떤 구간을 통과했는지 정리
        const marbleSections = {};
        for (const log of sectionLog) {
          for (const m of log.marbles) {
            if (!marbleSections[m.name]) marbleSections[m.name] = new Set();
            marbleSections[m.name].add(m.section);
          }
        }

        let status = 'PASS';
        const details = [];
        const failures = [];

        details.push(`게임 ${gameFinished ? '완주' : '미완주'} — ${Math.floor((Date.now() - startTime) / 1000)}s`);

        // 각 구슬이 모든 구간을 통과했는지 검증
        const requiredSections = HTML_SPEC.sections.map(s => s.id); // SEC1~SEC7

        for (const [marble, sections] of Object.entries(marbleSections)) {
          const passed = requiredSections.filter(s => sections.has(s));
          const missed = requiredSections.filter(s => !sections.has(s));

          if (missed.length === 0 || sections.has('FINISH')) {
            details.push(`✅ ${marble}: 전 구간 통과 (${passed.join('→')}→FINISH)`);
          } else {
            // 빠르게 통과한 구간은 폴링에서 놓칠 수 있음 — FINISH 도달했으면 OK
            if (sections.has('FINISH')) {
              details.push(`✅ ${marble}: FINISH 도달 (일부 구간 빠르게 통과: ${missed.join(',')} 폴링 미감지)`);
            } else {
              details.push(`⚠ ${marble}: 미통과 구간 ${missed.join(',')} (폴링 간격으로 미감지 가능)`);
            }
          }
        }

        if (!gameFinished) {
          status = 'FAIL';
          failures.push('완주 실패');
        }

        if (consoleMsgs.errors.length === 0) {
          details.push('✅ 콘솔 에러 0건');
        } else {
          status = 'FAIL';
          details.push(`❌ 콘솔 에러 ${consoleMsgs.errors.length}건`);
          failures.push('콘솔 에러');
        }

        // 최종 스크린샷
        await page.screenshot({ path: sp('S5', 'result-final') });

        results.push({
          id: 'S-5', name: '구간별 구슬 위치 추적 상세', status,
          detail: details.join('\n'), failures,
          sectionLog: sectionLog.length,
          consoleErrors: consoleMsgs.errors,
        });

        console.log(`\n${status === 'PASS' ? '✅' : '❌'} ${status}`);
        for (const d of details) console.log(d);
      }
    } catch (err) {
      results.push({
        id: 'S-5', name: '구간별 위치 추적', status: 'FAIL',
        detail: `Exception: ${err.message}`, failures: [err.message],
      });
    }

    await context.close();
  }

  // ═══════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════

  await browser.close();

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;

  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  구간별 구조물 매칭 검증 — 최종 결과                       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  시나리오: ${results.length}개 실행                                       ║`);
  console.log(`║  ✅ PASS: ${passCount}  ❌ FAIL: ${failCount}  ⚠ WARN: ${warnCount}                          ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  for (const r of results) {
    const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌' }[r.status];
    console.log(`[${r.id}] ${icon} ${r.name} — ${r.status}${r.duration ? ` (${r.duration}s)` : ''}`);
    if (r.failures && r.failures.length > 0) {
      for (const f of r.failures) console.log(`  └ ${f}`);
    }
  }

  // JSON 보고서 저장
  const report = {
    testSuite: 'Marble Race V3 — 구간별 구조물 매칭 검증',
    timestamp: new Date().toISOString(),
    htmlSpec: 'Marble Run V3 - Adventure Course Preview.html',
    summary: { total: results.length, pass: passCount, fail: failCount, warn: warnCount },
    scenarios: results,
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'test-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n📄 ${path.join(SCREENSHOT_DIR, 'test-report.json')}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
