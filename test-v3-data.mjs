/**
 * 구슬레이스 V3 데이터 검증 단위테스트 (Node.js — Playwright 불필요)
 *
 * TrackData 구조, 세그먼트 좌표, 물리 상수, 플레이어 설정 등
 * 설계문서 + HTML 프리뷰 기반 검증
 */
import { readFileSync } from 'fs';

const results = [];
function pass(name, detail = '') { results.push({ name, status: 'PASS', detail }); }
function fail(name, detail = '') { results.push({ name, status: 'FAIL', detail }); }

// ── TrackData 소스 파싱 (import 없이 직접 파싱) ──
const trackSrc = readFileSync('src/maps/TrackData.ts', 'utf-8');
const typesSrc = readFileSync('src/maps/types.ts', 'utf-8');
const marbleSrc = readFileSync('src/entities/Marble.ts', 'utf-8');
const physicsSrc = readFileSync('src/core/PhysicsWorld.ts', 'utf-8');
const sceneSrc = readFileSync('src/scenes/games/MarbleRaceScene.ts', 'utf-8');
const cameraSrc = readFileSync('src/core/CameraController.ts', 'utf-8');
const constantsSrc = readFileSync('src/utils/constants.ts', 'utf-8');
const funnelSrc = readFileSync('src/maps/segments/FunnelSegment.ts', 'utf-8');
const curvedSrc = readFileSync('src/maps/segments/CurvedChannelSegment.ts', 'utf-8');

console.log('🧪 구슬레이스 V3 데이터 검증 테스트\n');

// ══════════════════════════════════════════
// T-1: TrackData 기본 구조
// ══════════════════════════════════════════
{
  trackSrc.includes('worldWidth: 2400') ? pass('T-1a: worldWidth=2400') : fail('T-1a: worldWidth', '2400 아님');
  trackSrc.includes('worldHeight: 3200') ? pass('T-1b: worldHeight=3200') : fail('T-1b: worldHeight', '3200 아님');
  trackSrc.includes('startX: 1200') ? pass('T-1c: startX=1200') : fail('T-1c: startX', '1200 아님');
  trackSrc.includes('finishX: 1800') ? pass('T-1d: finishX=1800 (우측 결승)') : fail('T-1d: finishX', '1800 아님 — HTML프리뷰에서 결승이 우측');
  trackSrc.includes('finishY: 3080') ? pass('T-1e: finishY=3080') : fail('T-1e: finishY');
}

// ══════════════════════════════════════════
// T-2: 뱀형 경로 세그먼트 존재
// ══════════════════════════════════════════
{
  // 우측 채널 (→ 수평이동)
  const hasRightCh = trackSrc.includes("'s2-ch-right'");
  hasRightCh ? pass('T-2a: 우측 채널 존재 (s2-ch-right)') : fail('T-2a: 우측 채널', 'Y축만 구현?');

  // U턴
  const hasUturn = trackSrc.includes("'s3-uturn'");
  hasUturn ? pass('T-2b: U턴 존재 (s3-uturn)') : fail('T-2b: U턴', '곡선 미구현');

  // 좌측 복귀 채널 (← 수평이동)
  const hasLeftCh = trackSrc.includes("'s3-ch-left'");
  hasLeftCh ? pass('T-2c: 좌측 채널 존재 (s3-ch-left)') : fail('T-2c: 좌측 채널');

  // 물레방아
  const hasWheel = trackSrc.includes("'s4-wheellift'");
  hasWheel ? pass('T-2d: 물레방아 존재 (s4-wheellift)') : fail('T-2d: 물레방아');

  // 나선
  const hasSpiral = trackSrc.includes("'s5-spiral'");
  hasSpiral ? pass('T-2e: 나선 존재 (s5-spiral)') : fail('T-2e: 나선');

  // 장애물 (시소)
  const hasSeesaw = trackSrc.includes("'s6-seesaw'");
  hasSeesaw ? pass('T-2f: 시소 존재 (s6-seesaw)') : fail('T-2f: 시소');

  // 분기
  const hasSplitter = trackSrc.includes("'s6-splitter'");
  hasSplitter ? pass('T-2g: 분기 존재 (s6-splitter)') : fail('T-2g: 분기');

  // 최종 스프린트 (우측 가속)
  const hasSprint = trackSrc.includes("'s7-ch-sprint'");
  hasSprint ? pass('T-2h: 최종 스프린트 존재 (s7-ch-sprint)') : fail('T-2h: 스프린트');
}

// ══════════════════════════════════════════
// T-3: X축 수평이동 확인 (Y축만 아닌지)
// ══════════════════════════════════════════
{
  // 세그먼트 originX 값들 추출
  const originXs = [...trackSrc.matchAll(/originX:\s*(\d+)/g)].map(m => Number(m[1]));
  const uniqueXs = [...new Set(originXs)];

  if (uniqueXs.length >= 5) {
    pass('T-3a: originX 다양성', `${uniqueXs.length}개 고유 X값: ${uniqueXs.sort((a,b)=>a-b).join(', ')}`);
  } else {
    fail('T-3a: originX 다양성', `${uniqueXs.length}개만 — 수직 스택 의심`);
  }

  // direction=-1 (좌측이동) 존재 확인
  const hasLeftDir = trackSrc.includes('direction: -1');
  hasLeftDir ? pass('T-3b: direction:-1 존재 (좌측이동)') : fail('T-3b: direction:-1', '좌측이동 없음');
}

// ══════════════════════════════════════════
// T-4: 세그먼트 타입 정의
// ══════════════════════════════════════════
{
  const requiredTypes = ['funnel', 'channel', 'curved', 'wheelLift', 'spiral', 'windmill', 'seesaw', 'splitter', 'bottleneck', 'trampoline', 'pinzone', 'shortcutGap'];
  for (const t of requiredTypes) {
    typesSrc.includes(`'${t}'`) ? pass(`T-4: SegmentType '${t}'`) : fail(`T-4: SegmentType '${t}'`, '타입 미정의');
  }
}

// ══════════════════════════════════════════
// T-5: 물리 상수 — gravity 980
// ══════════════════════════════════════════
{
  physicsSrc.includes('y: 980') ? pass('T-5a: 기본 gravity 980') : fail('T-5a: gravity', '980 아님');
  sceneSrc.includes('y: 980') ? pass('T-5b: MarbleRaceScene gravity 980') : fail('T-5b: Scene gravity');

  // MAX_MARBLE_SPEED 1800
  sceneSrc.includes('MAX_MARBLE_SPEED = 1800') ? pass('T-5c: MAX_MARBLE_SPEED=1800') : fail('T-5c: MAX_MARBLE_SPEED');

  // STUCK threshold 60
  sceneSrc.includes('speedThreshold: 60') ? pass('T-5d: STUCK threshold=60') : fail('T-5d: STUCK threshold');
}

// ══════════════════════════════════════════
// T-6: Marble 물리 상수
// ══════════════════════════════════════════
{
  marbleSrc.includes('restitution: 0.4') ? pass('T-6a: Marble restitution=0.4') : fail('T-6a: restitution');
  marbleSrc.includes('friction: 0.02') ? pass('T-6b: Marble friction=0.02') : fail('T-6b: friction');
  marbleSrc.includes('linearDamping: 0.5') ? pass('T-6c: Marble linearDamping=0.5') : fail('T-6c: linearDamping');
}

// ══════════════════════════════════════════
// T-7: 카메라 — 줌 + 드래그
// ══════════════════════════════════════════
{
  cameraSrc.includes('_zoom') ? pass('T-7a: 줌 프로퍼티 존재') : fail('T-7a: 줌');
  cameraSrc.includes('MIN_ZOOM') ? pass('T-7b: MIN_ZOOM 정의') : fail('T-7b: MIN_ZOOM');
  cameraSrc.includes('MAX_ZOOM') ? pass('T-7c: MAX_ZOOM 정의') : fail('T-7c: MAX_ZOOM');
  cameraSrc.includes("'wheel'") ? pass('T-7d: wheel 이벤트 리스너') : fail('T-7d: wheel event');
  cameraSrc.includes('interactionLayer') ? pass('T-7e: interactionLayer 파라미터') : fail('T-7e: interactionLayer');
}

// ══════════════════════════════════════════
// T-8: Culling — 카운트다운 중 실행
// ══════════════════════════════════════════
{
  // "countdown" 블록 안에 cullSegments 호출
  const countdownBlock = sceneSrc.match(/if \(this\.phase === 'countdown'\)[\s\S]*?return;/);
  const hasCullInCountdown = countdownBlock && countdownBlock[0].includes('cullSegments');
  hasCullInCountdown ? pass('T-8a: 카운트다운 중 culling 호출') : fail('T-8a: 카운트다운 culling');

  // init 끝에 cullSegments 호출
  sceneSrc.includes('this.cullSegments();\n    this.startCountdown()') ?
    pass('T-8b: init 끝 초기 culling') : fail('T-8b: init culling');
}

// ══════════════════════════════════════════
// T-9: FunnelSegment — 올바른 벽 좌표 계산
// ══════════════════════════════════════════
{
  // 상단점-하단점 기반 중심 계산
  funnelSrc.includes('leftTopX') && funnelSrc.includes('leftBotX') ?
    pass('T-9a: Funnel 상하단점 기반 계산') : fail('T-9a: Funnel 좌표', '구형 dx 방식');

  funnelSrc.includes('Math.atan2(leftDy, leftDx)') ?
    pass('T-9b: Funnel 각도 atan2(dy,dx)') : fail('T-9b: Funnel 각도');
}

// ══════════════════════════════════════════
// T-10: CurvedChannel — 가이드 벽 존재
// ══════════════════════════════════════════
{
  curvedSrc.includes('curved-guide') ?
    pass('T-10a: CurvedChannel 가이드 벽 존재') : fail('T-10a: 가이드 벽 없음');
}

// ══════════════════════════════════════════
// T-11: 도트 비주얼 — 팔레트 + 필터
// ══════════════════════════════════════════
{
  constantsSrc.includes('SECTION_COLORS') ?
    pass('T-11a: SECTION_COLORS 정의') : fail('T-11a: SECTION_COLORS');
  constantsSrc.includes('PLAYER_COLORS') ?
    pass('T-11b: PLAYER_COLORS 정의') : fail('T-11b: PLAYER_COLORS');

  // Neon Space 팔레트 확인 (0xdf0772 = Hot Pink)
  constantsSrc.includes('0xdf0772') ?
    pass('T-11c: Neon Space 팔레트 적용') : fail('T-11c: Neon Space', '이전 PICO-8 팔레트');
}

// ══════════════════════════════════════════
// T-12: 체크포인트 방향 (progressDir +x/-x)
// ══════════════════════════════════════════
{
  const hasXDir = trackSrc.includes("progressDir: '+x'") || trackSrc.includes("progressDir: '-x'");
  hasXDir ? pass('T-12a: 체크포인트 +x/-x 방향 존재') : fail('T-12a: progressDir', 'Y축만');

  const cpCount = (trackSrc.match(/progressDir/g) || []).length;
  cpCount >= 5 ? pass(`T-12b: 체크포인트 ${cpCount}개 (≥5)`) : fail(`T-12b: 체크포인트 ${cpCount}개 (< 5)`);
}

// ══════════════════════════════════════════
// T-13: Matter.js 잔재 없음
// ══════════════════════════════════════════
{
  const allSrc = [trackSrc, typesSrc, marbleSrc, physicsSrc, sceneSrc, cameraSrc].join('\n');
  !allSrc.includes("from 'matter-js'") ?
    pass('T-13: Matter.js import 없음') : fail('T-13: Matter.js 잔재');
}

// ══════════════════════════════════════════
// T-14: 글로우 + 트레일
// ══════════════════════════════════════════
{
  marbleSrc.includes('trailGfx') ? pass('T-14a: 구슬 트레일 그래픽') : fail('T-14a: 트레일');
  marbleSrc.includes('leaderGfx') ? pass('T-14b: 1등 글로우 그래픽') : fail('T-14b: 글로우');
  marbleSrc.includes('setLeader') ? pass('T-14c: setLeader 메서드') : fail('T-14c: setLeader');
}

// ══════════════════════════════════════════
// T-15: 플레이어 수 관련 상수
// ══════════════════════════════════════════
{
  constantsSrc.includes('MIN_PLAYERS = 2') ? pass('T-15a: MIN_PLAYERS=2') : fail('T-15a: MIN_PLAYERS');
  constantsSrc.includes('MAX_PLAYERS = 10') ? pass('T-15b: MAX_PLAYERS=10') : fail('T-15b: MAX_PLAYERS');
  trackSrc.includes('MIN_MARBLES = 6') ? pass('T-15c: MIN_MARBLES=6 (더미 채움)') : fail('T-15c: MIN_MARBLES');

  // PLAYER_COLORS 10개
  const colorCount = (constantsSrc.match(/0x[0-9a-fA-F]{6}/g) || []).length;
  colorCount >= 10 ? pass(`T-15d: 플레이어 색상 ${colorCount}개 (≥10)`) : fail(`T-15d: 색상 ${colorCount}개`);
}

// ══════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════
console.log('\n╔══════════════════════════════════════╗');
console.log('║  구슬레이스 V3 데이터 검증 결과        ║');
console.log('╠══════════════════════════════════════╣');

const passCount = results.filter(r => r.status === 'PASS').length;
const failCount = results.filter(r => r.status === 'FAIL').length;

console.log(`║  테스트: ${results.length}개 실행`);
console.log(`║  ✅ PASS: ${passCount}  ❌ FAIL: ${failCount}`);
console.log('╚══════════════════════════════════════╝\n');

for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  const detail = r.detail ? ` — ${r.detail}` : '';
  console.log(`${icon} ${r.name}${detail}`);
}

if (failCount > 0) {
  console.log(`\n❌ ${failCount}개 실패`);
  process.exit(1);
} else {
  console.log('\n✅ 전체 통과');
}
