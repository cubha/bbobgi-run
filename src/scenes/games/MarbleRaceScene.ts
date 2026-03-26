import { Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { Marble } from '@entities/Marble';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { ChaosEffect } from '@effects/ChaosEffect';
import type { GameConfig, GameResult, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  COUNTDOWN_SEC,
  CHAOS_SEC,
  TENSION_SEC,
  SLOWMO_SEC,
  GAME_DURATION_SEC,
  FONT_DISPLAY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

type RacePhase = 'countdown' | 'racing' | 'chaos' | 'tension' | 'slowmo' | 'done';

/**
 * Track layout — 5-Zone design (2400px, 290px wide)
 *  Wall guides: 양쪽 벽 내향 가이드 레일 (Zone B~E, 120px 간격)
 *  Zone A [y=100~520]:   출발 산개  — 4개 완만 와이드 램프 (260px)
 *  Zone B [y=520~800]:   첫 번째 압축 — 병목1 (passWidth=80)
 *  Zone C [y=800~1300]:  핀볼 카오스 — 미디엄 램프 3개 (250px) + 6×5 핀존
 *  Zone D [y=1300~1800]: 클라이맥스  — 스팁 램프 3개 (245px) + 좁은 병목2 + 계단식 드롭
 *  Zone E [y=1800~2300]: 피날레      — 소형 핀존 3×7 + 스팁 램프 2개 (235px)
 */
const TRACK = {
  leftX: 50,
  rightX: 340,
  startY: 100,
  totalHeight: 2400,
  finishY: 2300,
  wallThick: 20,
  rampThick: 14,
  pinRadius: 5,
} as const;

/** PIN ZONE exclusion regions — chaos obstacles must not overlap these */
const PIN_ZONES = [
  { top: 1100, bottom: 1320 },  // Zone C: 5×6 핀존 (y=1130 ± margin)
  { top: 1840, bottom: 2000 },  // Zone E: 3×5 핀존 (y=1870 ± margin)
] as const;

/** Stuck marble detection thresholds */
const STUCK = {
  speedThreshold: 0.8,  // px/physics-step — 이하면 "정지" 판정
  time1: 2.0,           // 2초: Level 1 — 부드러운 힘 적용
  time2: 3.5,           // 3.5초: Level 2 — 강한 속도 리셋
  time3: 5.0,           // 5초: Level 3 — 텔레포트 + 중앙이동
  retire: 8.0,          // 8초: Level 4 — 리타이어 처리
  wallFastTime: 1.0,    // 1초: 벽 근처 끼임 시 빠른 구제 경로
} as const;

/** Pre-chaos event triggers (seconds after racing phase starts) */
const RACE_EVT = { lastBooster: 8, leadLightning: 16 } as const;
/** Post-chaos event triggers (seconds after chaos starts) */
const CHAOS_EVT = { lastBooster: 4, leadLightning: 7 } as const;

/**
 * Marble Race game scene — 2400px physics track with camera scroll,
 * bottleneck funnels, pin zone, and reversal event system.
 */
export class MarbleRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

  private physics: PhysicsWorld | null = null;
  private marbles: Marble[] = [];
  private finishOrder: Marble[] = [];
  private totalElapsed = 0;
  private phase: RacePhase = 'countdown';

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();
  private chaos: ChaosEffect | null = null;

  private readonly trackContainer = new Container();
  private readonly marbleContainer = new Container();
  private readonly uiContainer = new Container();
  private rankLabels: Text[] = [];

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private chaosApplied = false;
  private chaosObstacles: Matter.Body[] = [];
  private prevRankIds: number[] = [];
  private finishSensor: Matter.Body | null = null;

  // ─── Camera ───────────────────────────────────
  /** World-Y of the viewport top (smoothly lerped) */
  private cameraY = 0;
  /** true while user is dragging — suspends auto-tracking */
  private cameraDragging = false;
  /** Y coordinate of the last pointer event (screen space) */
  private dragLastY = 0;
  /** setTimeout handle for auto-resume after drag ends */
  private dragResumeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Seconds to wait after drag release before resuming auto-tracking */
  private static readonly DRAG_RESUME_DELAY = 2000;

  // ─── Event system ─────────────────────────────
  private chaosStartTime = 0;
  private readonly eventsFired = {
    lastBooster: false,
    leadLightning: false,
    postChaosBooster: false,
    postChaosLightning: false,
  };
  /** Short-lived flash visuals [{gfx, framesLeft, total}] */
  private readonly flashes: Array<{ gfx: Graphics; framesLeft: number; total: number }> = [];

  // ─── Slowmo frame skip ──────────────────────────
  private slowmoFrameCounter = 0;

  // ─── Stuck detection ──────────────────────────
  /** Accumulated stuck time per marble (seconds). Cleared when marble moves. */
  private readonly stuckTimers = new Map<Marble, number>();

  // ─── Timer cleanup ────────────────────────────
  private readonly pendingTimers: ReturnType<typeof setTimeout>[] = [];

  // ─── Public API ───────────────────────────────

  setConfig(config: GameConfig): void { this.config = config; }
  setEndCallback(cb: (result: GameResult) => void): void { this.endCallback = cb; }
  setScaleInfo(s: ScaleInfo): void { this._scaleInfo = s; }

  async init(): Promise<void> {
    if (!this.config) return;

    this.physics = new PhysicsWorld({ x: 0, y: 0.6 });

    this.container.addChild(this.trackContainer);
    this.container.addChild(this.marbleContainer);
    this.container.addChild(this.uiContainer);

    this.buildTrack();
    this.buildMarbles();
    this.buildHUD();
    this.buildRankLabels();
    this.setupCollisionDetection();
    this.setupDragCamera();
    this.startCountdown();
  }

  update(delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') return;

    // Phase transitions
    if (this.totalElapsed >= GAME_DURATION_SEC) {
      this.endRace();
      return;
    }
    const playerCount = this.config!.players.length;
    const lastPickSlowmo = this.config!.pickMode === 'last'
      && this.uniqueFinishedPlayerCount() >= playerCount - 1;
    if (this.phase !== 'slowmo' && (this.totalElapsed >= SLOWMO_SEC || lastPickSlowmo)) {
      this.enterSlowmo();
    } else if (this.phase === 'chaos' && this.totalElapsed >= TENSION_SEC) {
      this.phase = 'tension';
      this.setPhaseLabel('');
      this.removeChaosObstacles();
    } else if (!this.chaosApplied && this.totalElapsed >= CHAOS_SEC) {
      this.applyChaos();
    }

    // Event scheduler
    this.tickEvents();

    // 1. Pre-physics: 벽 클램핑 (물리 스텝 전에 수행하여 다음 스텝에 반영)
    const MARBLE_R = 8;
    const boundsMinX = TRACK.leftX + TRACK.wallThick / 2 + MARBLE_R + 2;
    const boundsMaxX = TRACK.rightX - TRACK.wallThick / 2 - MARBLE_R - 2;
    for (const marble of this.marbles) {
      if (!marble.retired) marble.clampToBounds(boundsMinX, boundsMaxX);
    }

    // 2. Physics step — slowmo는 프레임 스킵 방식 (Issue #303 회피)
    if (this.phase === 'slowmo') {
      this.slowmoFrameCounter++;
      if (this.slowmoFrameCounter % 3 === 0) {
        this.physics.update(); // 3프레임에 1번 → ~33% 속도
      }
    } else {
      this.physics.update();
    }

    // 3. Post-physics: 렌더 동기화 + out-of-bounds retire
    for (const marble of this.marbles) {
      if (marble.retired) continue;
      marble.sync();

      const pos = marble.body.position;
      if (pos.y < TRACK.startY - 100 || pos.y > TRACK.totalHeight + 100) {
        marble.markRetired();
      }
    }

    // Stuck marble detection & rescue (dt in seconds)
    this.checkStuckMarbles(dt);

    // Camera scroll (SubTask 2)
    this.updateCamera();

    // Fade flash overlays
    this.tickFlashes();

    // Timer bar
    const raceElapsed = this.totalElapsed - COUNTDOWN_SEC;
    const raceTotal = GAME_DURATION_SEC - COUNTDOWN_SEC;
    const progress = Math.max(0, Math.min(1, 1 - raceElapsed / raceTotal));
    this.updateTimerBar(progress);

    // Rankings
    const sorted = this.getSortedByProgress();
    this.checkRankChanges(sorted);
    this.prevRankIds = sorted.map((m) => m.player.id);
    this.updateRankLabels(sorted);

    // 꼴등뽑기: N-1명 완주 시 즉시 종료, 그 외: 전원 완주 시 종료 (marbleCount 중복 제거)
    const endThreshold = this.config!.pickMode === 'last'
      ? playerCount - 1
      : playerCount;
    if (this.uniqueFinishedPlayerCount() >= endThreshold) this.endRace();
  }

  override destroy(): void {
    if (this.dragResumeTimer !== null) {
      clearTimeout(this.dragResumeTimer);
      this.dragResumeTimer = null;
    }
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.length = 0;
    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.chaos?.destroy();
    this.physics?.destroy();
    this.physics = null;
    super.destroy();
  }

  // ─── Build: Track ─────────────────────────────

  private buildTrack(): void {
    if (!this.physics) return;

    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const trackW = TRACK.rightX - TRACK.leftX;

    // ── Backgrounds ──────────────────────────────────
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, TRACK.totalHeight + 60);
    bg.fill(COLORS.background);
    this.trackContainer.addChild(bg);

    const trackBg = new Graphics();
    trackBg.rect(TRACK.leftX, TRACK.startY - 20, trackW, TRACK.totalHeight);
    trackBg.fill({ color: 0x0d2020 });
    this.trackContainer.addChild(trackBg);

    // ── Side walls ───────────────────────────────────
    const wallH = TRACK.totalHeight + 60;
    const wallCY = TRACK.startY + TRACK.totalHeight / 2;
    const leftWall = PhysicsWorld.createWall(TRACK.leftX, wallCY, TRACK.wallThick, wallH);
    this.physics.addBodies(leftWall);
    this.drawStaticBody(leftWall, 0x224422);
    const rightWall = PhysicsWorld.createWall(TRACK.rightX, wallCY, TRACK.wallThick, wallH);
    this.physics.addBodies(rightWall);
    this.drawStaticBody(rightWall, 0x224422);

    // ── Outer boundary walls (invisible, prevents any escape) ──
    // 내부 벽 외측 가장자리와 맞닿도록 배치 (겹침 방지)
    const BOUND_THICK = 40;
    const halfWall = TRACK.wallThick / 2;
    const outerLeft = PhysicsWorld.createWall(
      TRACK.leftX - halfWall - BOUND_THICK / 2, wallCY, BOUND_THICK, wallH,
      { restitution: 0.3, friction: 0.1 },
    );
    const outerRight = PhysicsWorld.createWall(
      TRACK.rightX + halfWall + BOUND_THICK / 2, wallCY, BOUND_THICK, wallH,
      { restitution: 0.3, friction: 0.1 },
    );
    const outerTop = PhysicsWorld.createWall(
      cx, TRACK.startY - BOUND_THICK / 2, trackW + BOUND_THICK * 2, BOUND_THICK,
      { restitution: 0.3, friction: 0.1 },
    );
    this.physics.addBodies(outerLeft, outerRight, outerTop);

    // ── Wall guide rails (데드존 해소) ────────────────
    this.buildWallGuides();

    // ── Zone A: 출발 산개 (y=100~520) ────────────────
    this.buildZoneA(cx);

    // ── Zone B: 첫 번째 압축 (y=520~800) ─────────────
    this.buildBottleneck(655, 80, 0.28);

    // ── Zone C: 핀볼 카오스 (y=800~1300) ─────────────
    this.buildZoneC(cx);

    // ── Zone D: 클라이맥스 (y=1300~1800) ─────────────
    this.buildZoneD(cx);

    // ── Zone E: 피날레 (y=1800~2300) ─────────────────
    this.buildZoneE(cx);

    // ── Floor + Finish ────────────────────────────────
    const floor = PhysicsWorld.createWall(cx, TRACK.totalHeight + 30, trackW, TRACK.wallThick);
    this.physics.addBodies(floor);
    this.drawFinishLine();
    this.finishSensor = PhysicsWorld.createSensor(cx, TRACK.finishY, trackW, 10, 'finish');
    this.physics.addBodies(this.finishSensor);
  }

  // ─── Zone Builders ────────────────────────────

  /**
   * 좌우 벽에서 안쪽으로 기울어진 소형 가이드 레일을 배치한다.
   * 벽 근처 데드존에 빠진 구슬을 트랙 중앙으로 되돌린다.
   * Zone B(520)~Zone E(2200) 구간에 약 120px 간격으로 배치.
   */
  private buildWallGuides(): void {
    if (!this.physics) return;

    const guideWidth = 32;       // 45→32: 포켓 깊이 축소
    const guideAngle = 0.20;     // 0.35→0.20: V자 각도 완화, 자연 탈출 유도
    const startY = 520;
    const endY = 2200;
    const interval = 140;        // 120→140: 간격 넓혀 트랩 포인트 감소
    // 벽~가이드 최소 간격 = wallInset - guideWidth/2*cos(angle) ≈ 22px > 구슬 지름 16px
    const wallInset = TRACK.wallThick / 2 + guideWidth / 2 + 6;

    for (let y = startY; y <= endY; y += interval) {
      // Left wall guide — angled inward (positive angle pushes right toward center)
      const leftX = TRACK.leftX + wallInset;
      const leftGuide = PhysicsWorld.createWall(leftX, y, guideWidth, TRACK.rampThick, {
        angle: guideAngle,
        restitution: 0.15,       // 0.5→0.15: 반발 감소, 끼인 구슬 바운스 억제
        friction: 0.01,
        frictionStatic: 0,
      });
      this.physics.addBodies(leftGuide);
      this.drawStaticBody(leftGuide, 0x1a3a2a);

      // Right wall guide — angled inward (negative angle pushes left toward center)
      const rightX = TRACK.rightX - wallInset;
      const rightGuide = PhysicsWorld.createWall(rightX, y, guideWidth, TRACK.rampThick, {
        angle: -guideAngle,
        restitution: 0.15,
        friction: 0.01,
        frictionStatic: 0,
      });
      this.physics.addBodies(rightGuide);
      this.drawStaticBody(rightGuide, 0x1a3a2a);
    }
  }

  /** Zone A: 출발 산개 (y=100~520) — 4개 완만 램프 (폭 200px, 양쪽 갭 45px+) */
  private buildZoneA(cx: number): void {
    this.buildZoneLabel('◀ ZONE A: 출발 ▶', cx, 112, COLORS.brightGreen);

    const rampDefs = [
      { y: 165, width: 200, angle: 0.18 },
      { y: 270, width: 200, angle: 0.18 },
      { y: 375, width: 195, angle: 0.20 },
      { y: 470, width: 195, angle: 0.20 },
    ];
    rampDefs.forEach(({ y, width, angle }, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      const rampX = cx + dir * 10;
      const body = PhysicsWorld.createWall(rampX, y, width, TRACK.rampThick, {
        angle: -angle * dir,
        restitution: 0.15,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
      });
      this.physics!.addBodies(body);
      this.drawRamp(body, i);
    });
  }

  /** Two wedge shelves funneling to a `passWidth` gap at center */
  private buildBottleneck(y: number, passWidth = 90, wedgeAngle = 0.25): void {
    if (!this.physics) return;

    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const halfPass = passWidth / 2;

    // Left wedge: from left wall inward
    const leftW = cx - halfPass - TRACK.leftX - TRACK.wallThick;
    const leftX = TRACK.leftX + TRACK.wallThick + leftW / 2;
    const leftWedge = PhysicsWorld.createWall(leftX, y, leftW, TRACK.rampThick, {
      angle: wedgeAngle, friction: 0.02, restitution: 0.2,
    });
    this.physics.addBodies(leftWedge);
    this.drawStaticBody(leftWedge, 0x3a1a1a);

    // Right wedge: from right wall inward
    const rightW = TRACK.rightX - TRACK.wallThick - cx - halfPass;
    const rightX = cx + halfPass + rightW / 2;
    const rightWedge = PhysicsWorld.createWall(rightX, y, rightW, TRACK.rampThick, {
      angle: -wedgeAngle, friction: 0.02, restitution: 0.2,
    });
    this.physics.addBodies(rightWedge);
    this.drawStaticBody(rightWedge, 0x3a1a1a);

    // Kick bump — 병목 직후 중앙에 배치, 끼임 구슬을 좌우로 튕겨냄
    const kickPin = PhysicsWorld.createBall(cx, y + 12, 3, {
      isStatic: true,
      restitution: 0.8,
      friction: 0,
      label: 'kick-bump',
    });
    this.physics.addBodies(kickPin);
    const kickGfx = new Graphics();
    kickGfx.circle(0, 0, 3);
    kickGfx.fill({ color: 0xffaa00 });
    kickGfx.position.set(cx, y + 12);
    this.trackContainer.addChild(kickGfx);

    // Warning label
    const label = new Text({
      text: '▼ NARROW ▼',
      style: { fontFamily: FONT_DISPLAY, fontSize: 8, fill: COLORS.orange },
    });
    label.anchor.set(0.5, 1);
    label.x = cx;
    label.y = y - TRACK.rampThick - 2;
    this.trackContainer.addChild(label);
  }

  /** Staggered equilateral-triangle pin grid (pachinko-style) */
  private buildPinZone(startY: number, rows = 4, cols = 4, spacing = 50): void {
    if (!this.physics) return;

    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const rowH = spacing * 0.866; // equilateral triangle row height
    const wallMin = TRACK.leftX + TRACK.wallThick / 2 + 25; // 벽~핀 최소 간격 25px
    const wallMax = TRACK.rightX - TRACK.wallThick / 2 - 25;

    for (let row = 0; row < rows; row++) {
      const stagger = row % 2 === 1 ? spacing / 2 : 0;
      for (let col = 0; col < cols; col++) {
        const pinX = cx + (col - (cols - 1) / 2) * spacing + stagger;
        const pinY = startY + row * rowH;

        // 벽 근처 핀 스킵 — 벽~핀 사이 끼임 방지
        if (pinX < wallMin || pinX > wallMax) continue;

        const pin = PhysicsWorld.createPin(pinX, pinY, TRACK.pinRadius);
        this.physics.addBodies(pin);

        const g = new Graphics();
        g.circle(0, 0, TRACK.pinRadius);
        g.fill({ color: 0x33aa55 });
        g.position.set(pinX, pinY);
        this.trackContainer.addChild(g);
      }
    }

    const label = new Text({
      text: '◆ PIN ZONE ◆',
      style: { fontFamily: FONT_DISPLAY, fontSize: 8, fill: COLORS.brightGreen },
    });
    label.anchor.set(0.5, 1);
    label.x = cx;
    label.y = startY - 6;
    this.trackContainer.addChild(label);
  }

  /** Zone C: 핀볼 카오스 (y=800~1300) — 미디엄 램프 3개 + 6×5 대형 핀존 */
  private buildZoneC(cx: number): void {
    this.buildZoneLabel('◆ ZONE C: 카오스 ◆', cx, 812, COLORS.primary);

    const rampDefs = [
      { y: 860, width: 195, angle: 0.25 },
      { y: 960, width: 195, angle: 0.25 },
      { y: 1060, width: 195, angle: 0.25 },
    ];
    rampDefs.forEach(({ y, width, angle }, i) => {
      // 1,-1,1 패턴 — 첫 램프 좌측 방향으로 Zone A와 교대 연결
      const dir = i % 2 === 0 ? 1 : -1;
      const rampX = cx + dir * 10;
      const body = PhysicsWorld.createWall(rampX, y, width, TRACK.rampThick, {
        angle: -angle * dir,
        restitution: 0.20,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
      });
      this.physics!.addBodies(body);
      this.drawRamp(body, i + 4);
    });

    // 6×5 핀존 (cols 7→6: 최외곽 핀~벽 간격 44px+ 확보, 끼임 방지)
    this.buildPinZone(1130, 5, 6, 42);
  }

  /** Zone D: 클라이맥스 (y=1300~1800) — 스팁 램프 3개 + 좁은 병목2 + 계단식 드롭 */
  private buildZoneD(cx: number): void {
    this.buildZoneLabel('⚡ ZONE D: 클라이맥스 ⚡', cx, 1312, COLORS.gold);

    // 스팁 램프 3개 (angle 0.30~0.35, width 190)
    const rampDefs = [
      { y: 1360, width: 190, angle: 0.30 },
      { y: 1450, width: 190, angle: 0.30 },
      { y: 1540, width: 190, angle: 0.35 },
    ];
    rampDefs.forEach(({ y, width, angle }, i) => {
      // Zone C(1,-1,1=좌,우,좌)와 교대: -1,1,-1 → 우,좌,우
      const dir = i % 2 === 0 ? -1 : 1;
      const rampX = cx + dir * 10;
      const body = PhysicsWorld.createWall(rampX, y, width, TRACK.rampThick, {
        angle: -angle * dir,
        restitution: 0.20,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
      });
      this.physics!.addBodies(body);
      this.drawRamp(body, i + 7);
    });

    // 좁은 병목2 (passWidth=65, Zone B의 80보다 타이트)
    this.buildBottleneck(1610, 65, 0.32);

    // 계단식 드롭 (y=1660~1835)
    this.buildStaircase(1660, cx);
  }

  /** Zone E: 피날레 (y=1800~2300) — 소형 핀존 + 스팁 램프 2개 (데드존 해소) */
  private buildZoneE(cx: number): void {
    this.buildZoneLabel('🏁 ZONE E: 피날레 🏁', cx, 1812, COLORS.gold);

    // 소형 핀존 3×5 (cols 6→5: 벽 간격 확보, spacing=42)
    this.buildPinZone(1870, 3, 5, 42);

    // 피날레 램프 2개 (angle=0.35, width=185)
    const rampDefs = [
      { y: 1985, width: 185, angle: 0.35 },
      { y: 2080, width: 185, angle: 0.35 },
    ];
    rampDefs.forEach(({ y, width, angle }, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      const rampX = cx + dir * 10;
      const body = PhysicsWorld.createWall(rampX, y, width, TRACK.rampThick, {
        angle: -angle * dir,
        restitution: 0.20,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
      });
      this.physics!.addBodies(body);
      this.drawRamp(body, i + 12);
    });
  }

  /** 교대 선반 계단식 드롭 섹션 */
  private buildStaircase(startY: number, cx: number): void {
    if (!this.physics) return;

    this.buildZoneLabel('▼ STEP DROP ▼', cx, startY - 6, COLORS.textDim);

    const steps = 4;
    const stepSpacing = 46;  // 수직 간격 (16px 구슬 지름 + 30px 여유)
    const shelfWidth = 140;  // 트랙 폭 290px 기준 확대 (128→140)
    const shelfOffset = 50;  // cx로부터 좌/우 이동량 (58→50, 좌우 여백 축소)

    for (let i = 0; i < steps; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const shelfX = cx + dir * shelfOffset;
      const shelfY = startY + i * stepSpacing;

      // angle: dir*0.06 → dir=1이면 오른쪽 UP → 구슬이 왼쪽으로 흘러 낙하
      const shelf = PhysicsWorld.createWall(shelfX, shelfY, shelfWidth, TRACK.rampThick, {
        angle: dir * 0.06,
        restitution: 0.30,
        friction: 0.04,
        frictionStatic: 0,
        chamfer: { radius: 2 },
      });
      this.physics.addBodies(shelf);
      this.drawRamp(shelf, i + 10);
    }
  }

  private drawStaticBody(body: Matter.Body, color: number): void {
    const verts = body.vertices;
    const g = new Graphics();
    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
    g.closePath();
    g.fill({ color, alpha: 0.8 });
    this.trackContainer.addChild(g);
  }

  /** Small zone label text on the track */
  private buildZoneLabel(text: string, x: number, y: number, color: number): void {
    const label = new Text({
      text,
      style: { fontFamily: FONT_DISPLAY, fontSize: 8, fill: color },
    });
    label.anchor.set(0.5, 0);
    label.x = x;
    label.y = y;
    this.trackContainer.addChild(label);
  }

  private drawRamp(body: Matter.Body, index: number): void {
    const verts = body.vertices;
    const colors = [0x1a3a2a, 0x1a2a3a, 0x2a1a3a, 0x3a2a1a, 0x3a1a1a, 0x1a3a3a];
    const g = new Graphics();

    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
    g.closePath();
    g.fill({ color: colors[index % colors.length], alpha: 0.9 });

    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
    g.closePath();
    g.stroke({ color: 0x336633, width: 1, alpha: 0.6 });

    this.trackContainer.addChild(g);
  }

  private drawFinishLine(): void {
    const y = TRACK.finishY;
    const sqSize = 6;
    const startX = TRACK.leftX + TRACK.wallThick / 2;
    const endX = TRACK.rightX - TRACK.wallThick / 2;

    for (let x = startX; x < endX; x += sqSize) {
      for (let row = 0; row < 2; row++) {
        const isWhite = (Math.floor((x - TRACK.leftX) / sqSize) + row) % 2 === 0;
        const sq = new Graphics();
        sq.rect(x, y - sqSize + row * sqSize, sqSize, sqSize);
        sq.fill({ color: isWhite ? COLORS.text : 0x000000, alpha: isWhite ? 0.9 : 0.6 });
        this.trackContainer.addChild(sq);
      }
    }

    const glow = new Graphics();
    glow.moveTo(TRACK.leftX, y);
    glow.lineTo(TRACK.rightX, y);
    glow.stroke({ color: COLORS.gold, width: 2, alpha: 0.4 });
    this.trackContainer.addChild(glow);

    const goalLabel = new Text({
      text: 'GOAL',
      style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: COLORS.gold },
    });
    goalLabel.anchor.set(0.5, 1);
    goalLabel.x = (TRACK.leftX + TRACK.rightX) / 2;
    goalLabel.y = y - sqSize - 2;
    this.trackContainer.addChild(goalLabel);
  }

  // ─── Build: Marbles ───────────────────────────

  private buildMarbles(): void {
    if (!this.config || !this.physics) return;
    const { players } = this.config;
    const marbleCount = this.config.marbleCount ?? 1;
    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const totalMarbles = players.length * marbleCount;
    const spacing = Math.min(20, (TRACK.rightX - TRACK.leftX - 40) / totalMarbles);

    let idx = 0;
    players.forEach((player) => {
      for (let m = 0; m < marbleCount; m++) {
        const offset = (idx - (totalMarbles - 1) / 2) * spacing;
        const marble = new Marble(player, cx + offset, TRACK.startY + 10);
        this.physics!.addBodies(marble.body);
        this.marbles.push(marble);
        this.marbleContainer.addChild(marble.container);
        idx++;
      }
    });

    this.prevRankIds = players.map((p) => p.id);
  }

  // ─── Build: HUD ───────────────────────────────

  private buildHUD(): void {
    const hudH = TRACK.startY - 20;

    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, hudH);
    hudBg.fill({ color: 0x080810 });
    this.uiContainer.addChild(hudBg);

    const timerBgBar = new Graphics();
    timerBgBar.rect(14, 10, DESIGN_WIDTH - 28, 7);
    timerBgBar.fill({ color: COLORS.secondary, alpha: 0.9 });
    this.uiContainer.addChild(timerBgBar);

    this.timerBar = new Graphics();
    this.uiContainer.addChild(this.timerBar);
    this.updateTimerBar(1);

    const title = new Text({
      text: '구슬 레이스',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = 26;
    this.uiContainer.addChild(title);

    this.phaseLabel = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.primary },
    });
    this.phaseLabel.anchor.set(1, 0);
    this.phaseLabel.x = DESIGN_WIDTH - 14;
    this.phaseLabel.y = 26;
    this.uiContainer.addChild(this.phaseLabel);
  }

  private buildRankLabels(): void {
    this.marbles.forEach(() => {
      const label = new Text({
        text: '',
        style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
      });
      label.anchor.set(0.5, 1);
      this.marbleContainer.addChild(label);
      this.rankLabels.push(label);
    });
  }

  // ─── Collision ────────────────────────────────

  private setupCollisionDetection(): void {
    if (!this.physics) return;

    this.physics.onCollisionStart((event) => {
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const sensor = bodies.find((b) => b.label === 'finish');
        const marbleBody = bodies.find((b) => b !== sensor && !b.isStatic);

        if (sensor && marbleBody) {
          const marble = this.marbles.find((m) => m.body === marbleBody);
          if (marble && !marble.finished) {
            marble.markFinished(this.totalElapsed);
            this.finishOrder.push(marble);
          }
        }
      }
    });
  }

  // ─── Camera (SubTask 2) ───────────────────────

  /**
   * Lerp the viewport so the leading *unfinished* marble sits at 35% from top.
   * Adaptive lerp: faster when camera is far from target (빈 화면 방지).
   * Skips auto-tracking while user is dragging.
   */
  private updateCamera(): void {
    // User is manually controlling or recently released — skip auto-tracking
    if (this.cameraDragging || this.dragResumeTimer !== null) {
      this.trackContainer.y = -this.cameraY;
      this.marbleContainer.y = -this.cameraY;
      return;
    }

    const active = this.marbles.filter((m) => !m.finished);
    let target: Marble | undefined;

    if (active.length > 0) {
      // 가장 진행이 많은(y가 큰) 활성 구슬 추적
      target = active.reduce((best, m) =>
        m.body.position.y > best.body.position.y ? m : best,
      );
    } else {
      target = this.finishOrder[this.finishOrder.length - 1];
    }
    if (!target) return;

    const targetY = Math.max(
      0,
      Math.min(
        TRACK.totalHeight - DESIGN_HEIGHT,
        target.body.position.y - DESIGN_HEIGHT * 0.35,
      ),
    );

    // Adaptive lerp — 거리가 크면 빠르게 보정, 가까우면 부드럽게
    const dist = Math.abs(targetY - this.cameraY);
    let lerpFactor: number;
    if (dist > DESIGN_HEIGHT * 0.8) {
      lerpFactor = 0.25;  // 즉시 보정 수준
    } else if (dist > DESIGN_HEIGHT * 0.5) {
      lerpFactor = 0.15;  // 빠른 보정
    } else {
      lerpFactor = 0.06;  // 기본 부드러운 추적
    }

    this.cameraY += (targetY - this.cameraY) * lerpFactor;

    this.trackContainer.y = -this.cameraY;
    this.marbleContainer.y = -this.cameraY;
  }

  /** Register pointer events on the scene container for drag-to-scroll camera */
  private setupDragCamera(): void {
    // Need a hit area covering the full track for pointer events
    const hitArea = new Graphics();
    hitArea.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    hitArea.fill({ color: 0x000000, alpha: 0.001 });
    hitArea.eventMode = 'static';
    hitArea.cursor = 'grab';
    this.uiContainer.addChildAt(hitArea, 0);

    hitArea.on('pointerdown', (e) => {
      this.cameraDragging = true;
      this.dragLastY = e.globalY;
      hitArea.cursor = 'grabbing';

      if (this.dragResumeTimer !== null) {
        clearTimeout(this.dragResumeTimer);
        this.dragResumeTimer = null;
      }
    });

    hitArea.on('pointermove', (e) => {
      if (!this.cameraDragging) return;

      const scale = this._scaleInfo?.scale ?? 1;
      const dy = (e.globalY - this.dragLastY) / scale;
      this.dragLastY = e.globalY;

      // Drag up → cameraY increases (scroll down), drag down → cameraY decreases
      this.cameraY = Math.max(
        0,
        Math.min(TRACK.totalHeight - DESIGN_HEIGHT, this.cameraY - dy),
      );
    });

    const endDrag = () => {
      if (!this.cameraDragging) return;
      this.cameraDragging = false;
      hitArea.cursor = 'grab';

      // Resume auto-tracking after delay
      this.dragResumeTimer = setTimeout(() => {
        this.dragResumeTimer = null;
      }, MarbleRaceScene.DRAG_RESUME_DELAY);
    };

    hitArea.on('pointerup', endDrag);
    hitArea.on('pointerupoutside', endDrag);
  }

  // ─── HUD Updates ─────────────────────────────

  private updateTimerBar(progress: number): void {
    if (!this.timerBar) return;
    const barWidth = DESIGN_WIDTH - 28;
    this.timerBar.clear();
    if (progress <= 0) return;
    const color = progress > 0.35 ? COLORS.gold : COLORS.primary;
    this.timerBar.rect(14, 10, barWidth * progress, 7);
    this.timerBar.fill({ color, alpha: 0.9 });
  }

  private setPhaseLabel(text: string): void {
    if (this.phaseLabel) this.phaseLabel.text = text;
  }

  // ─── Events (SubTask 3) ───────────────────────

  private tickEvents(): void {
    const raceTime = this.totalElapsed - COUNTDOWN_SEC;

    // Pre-chaos
    if (!this.eventsFired.lastBooster && raceTime >= RACE_EVT.lastBooster) {
      this.eventsFired.lastBooster = true;
      if (Math.random() < 0.4) this.fireLastBooster();
    }
    if (!this.eventsFired.leadLightning && raceTime >= RACE_EVT.leadLightning) {
      this.eventsFired.leadLightning = true;
      if (Math.random() < 0.3) this.fireLeadLightning();
    }

    // Post-chaos
    if (this.chaosApplied && this.chaosStartTime > 0) {
      const chaosElapsed = this.totalElapsed - this.chaosStartTime;
      if (!this.eventsFired.postChaosBooster && chaosElapsed >= CHAOS_EVT.lastBooster) {
        this.eventsFired.postChaosBooster = true;
        if (Math.random() < 0.7) this.fireLastBooster();
      }
      if (!this.eventsFired.postChaosLightning && chaosElapsed >= CHAOS_EVT.leadLightning) {
        this.eventsFired.postChaosLightning = true;
        if (Math.random() < 0.6) this.fireLeadLightning();
      }
    }
  }

  /** 꼴찌 구슬에 속도 부스터 적용 */
  private fireLastBooster(): void {
    const sorted = this.getSortedByProgress();
    const last = sorted[sorted.length - 1];
    if (!last) return;

    const vel = last.body.velocity;
    Matter.Body.setVelocity(last.body, { x: vel.x * 1.1, y: vel.y + 1.5 });

    this.spawnWorldFlash(last.body.position.x, last.body.position.y, COLORS.brightGreen, 20);
    this.setPhaseLabel('🚀 꼴찌 부스터!');
    this.pendingTimers.push(setTimeout(() => { if (this.phase !== 'done') this.setPhaseLabel(''); }, 1500));
    this.shaker.shake(this.marbleContainer, 2, 3);
  }

  /** 선두 구슬에 상방 충격량 적용 */
  private fireLeadLightning(): void {
    const sorted = this.getSortedByProgress();
    const leader = sorted[0];
    if (!leader) return;

    Matter.Body.applyForce(leader.body, leader.body.position, { x: (Math.random() - 0.5) * 0.02, y: -0.01 });

    this.spawnWorldFlash(leader.body.position.x, leader.body.position.y - 20, COLORS.gold, 20);
    this.setPhaseLabel('⚡ 선두 낙뢰!');
    this.pendingTimers.push(setTimeout(() => { if (this.phase !== 'done') this.setPhaseLabel(''); }, 1500));
    this.shaker.shake(this.marbleContainer, 4, 5);
  }

  /** 화면 중심에서 방사형 힘 + 플래시 */
  private fireExplosion(): void {
    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const cy = this.cameraY + DESIGN_HEIGHT * 0.5;

    for (const marble of this.marbles) {
      if (marble.finished) continue;
      const dx = marble.body.position.x - cx;
      const dy = marble.body.position.y - cy;
      const dist = Math.max(10, Math.sqrt(dx * dx + dy * dy));
      const force = Math.min(0.05, 0.12 / dist);
      Matter.Body.applyForce(marble.body, marble.body.position, {
        x: dx * force,
        y: dy * force,
      });
    }

    // Screen-space flash overlay
    const flash = new Graphics();
    flash.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    flash.fill({ color: COLORS.primary, alpha: 0.35 });
    this.uiContainer.addChild(flash);
    this.flashes.push({ gfx: flash, framesLeft: 12, total: 12 });

    this.shaker.shake(this.container, 8, 8);
  }

  /** Dot flash at a world-space position (scrolls with track) */
  private spawnWorldFlash(x: number, y: number, color: number, frames: number): void {
    const g = new Graphics();
    g.circle(0, 0, 16);
    g.fill({ color, alpha: 0.7 });
    g.position.set(x, y);
    this.trackContainer.addChild(g);
    this.flashes.push({ gfx: g, framesLeft: frames, total: frames });
  }

  private tickFlashes(): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f) continue;
      f.framesLeft--;
      f.gfx.alpha = f.framesLeft / f.total;
      if (f.framesLeft <= 0) {
        f.gfx.parent?.removeChild(f.gfx);
        f.gfx.destroy();
        this.flashes.splice(i, 1);
      }
    }
  }

  // ─── Phase Handlers ──────────────────────────

  private startCountdown(): void {
    this.countdown = new CountdownEffect(this.container, this._scaleInfo ?? undefined);
    this.countdown.play(() => {
      this.phase = 'racing';
      this.countdown = null;
      this.totalElapsed = COUNTDOWN_SEC;
      this.sound?.play('race-start');
    });
  }

  private applyChaos(): void {
    if (!this.physics) return;
    this.chaosApplied = true;
    this.chaosStartTime = this.totalElapsed;
    this.phase = 'chaos';
    this.setPhaseLabel('💥 카오스!');
    this.sound?.play('chaos');

    this.chaos = new ChaosEffect();
    this.chaos.play(this.uiContainer, (TRACK.startY - 20) / 2 + 12);
    this.shaker.shake(this.marbleContainer, 5, 6);

    // 카오스 이벤트: 50% 횡풍(좌우 흔들림) OR 50% 폭발+장애물
    if (Math.random() < 0.5) {
      // 횡풍 — 짧은 좌우 중력으로 순위 섞기 (역주행 없이)
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.physics.setGravity(dir * 0.3, 0.6);
      this.pendingTimers.push(setTimeout(() => {
        if (this.physics && this.phase !== 'done') this.physics.setGravity(0, 0.6);
      }, 600));
    } else {
      // 폭발 + 장애물 (PIN ZONE 회피)
      this.fireExplosion();

      const cx = (TRACK.leftX + TRACK.rightX) / 2;
      const baseY = this.cameraY + DESIGN_HEIGHT * 0.5;
      const rawPositions = [
        { x: cx - 60, y: baseY - 100, angle: 0.5 },
        { x: cx + 60, y: baseY - 50,  angle: -0.5 },
        { x: cx - 30, y: baseY + 80,  angle: 0.3 },
        { x: cx + 30, y: baseY + 150, angle: -0.3 },
      ];

      // PIN ZONE exclusion — 겹치는 장애물은 핀존 아래로 재배치
      const obstPositions = rawPositions.filter((pos) => {
        for (const zone of PIN_ZONES) {
          if (pos.y >= zone.top && pos.y <= zone.bottom) return false;
        }
        return true;
      });

      for (const pos of obstPositions) {
        const body = PhysicsWorld.createWall(pos.x, pos.y, 70, 10, {
          angle: pos.angle,
          restitution: 0.8,
        });
        this.physics.addBodies(body);
        this.chaosObstacles.push(body);

        const g = new Graphics();
        g.rect(-35, -5, 70, 10);
        g.fill({ color: COLORS.primary, alpha: 0.7 });
        g.position.set(pos.x, pos.y);
        g.rotation = pos.angle;
        g.label = `chaos-obstacle-${this.chaosObstacles.length - 1}`;
        this.trackContainer.addChild(g);
      }
    }
  }

  private removeChaosObstacles(): void {
    if (!this.physics) return;
    this.physics.setGravity(0, 0.6);

    for (const body of this.chaosObstacles) this.physics.removeBodies(body);
    this.chaosObstacles = [];

    const toRemove = this.trackContainer.children.filter(
      (c) => typeof c.label === 'string' && c.label.startsWith('chaos-obstacle'),
    );
    for (const child of toRemove) {
      this.trackContainer.removeChild(child);
      child.destroy();
    }
  }

  private enterSlowmo(): void {
    this.phase = 'slowmo';
    this.setPhaseLabel('🎬 슬로우모션');
    this.sound?.play('slowmo');
    this.slowMo = new SlowMotionEffect(this.container, this._scaleInfo ?? undefined);
    this.slowMo.activate(0.4);
    this.shaker.shake(this.container, 7, 10);
  }

  private endRace(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.slowMo?.deactivate();
    this.sound?.play('finish');

    const rankings = this.buildRankings();
    this.endCallback?.({
      mode: 'marble',
      rankings,
      seed: this.config?.seed ?? 0,
      pickMode: this.config!.pickMode,
    });
  }

  // ─── Runtime helpers ─────────────────────────

  private getSortedByProgress(): Marble[] {
    return [...this.marbles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.body.position.y - a.body.position.y;
    });
  }

  private checkRankChanges(sorted: Marble[]): void {
    if (this.prevRankIds.length !== sorted.length) return;
    for (let newRank = 0; newRank < sorted.length; newRank++) {
      const marble = sorted[newRank];
      if (!marble) continue;
      const oldRank = this.prevRankIds.indexOf(marble.player.id);
      if (oldRank !== -1 && Math.abs(oldRank - newRank) >= 2) {
        this.shaker.shake(this.marbleContainer, 3, 4);
        break;
      }
    }
  }

  private updateRankLabels(sorted: Marble[]): void {
    for (let rank = 0; rank < sorted.length; rank++) {
      const marble = sorted[rank];
      if (!marble) continue;
      const idx = this.marbles.indexOf(marble);
      const label = this.rankLabels[idx];
      if (!label) continue;

      // Label follows marble in world space (both in marbleContainer)
      label.text = `${rank + 1}위`;
      label.x = marble.container.x;
      label.y = marble.container.y - marble.radius - 4;
      label.visible = !marble.retired;
    }
  }

  /** 완주한 고유 플레이어 수 (marbleCount > 1일 때 중복 제거) */
  private uniqueFinishedPlayerCount(): number {
    return new Set(this.finishOrder.map((m) => m.player.id)).size;
  }

  /**
   * 끼임 구슬 감지 및 3단계 해소.
   * 속도 < threshold 상태가 지속되면 단계별로 개입한다.
   * @param dt — 경과 시간 (초 단위)
   */
  private checkStuckMarbles(dt: number): void {
    if (this.phase === 'countdown' || this.phase === 'done') return;

    const minX = TRACK.leftX + TRACK.wallThick / 2 + 10;
    const maxX = TRACK.rightX - TRACK.wallThick / 2 - 10;
    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const wallZone = 25; // 벽 근처 판정 거리

    for (const marble of this.marbles) {
      if (marble.finished) {
        this.stuckTimers.delete(marble);
        continue;
      }

      const vel = marble.body.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

      if (speed < STUCK.speedThreshold) {
        const prev = this.stuckTimers.get(marble) ?? 0;
        const next = prev + dt;
        this.stuckTimers.set(marble, next);

        const pos = marble.body.position;
        const nearWall = pos.x < minX + wallZone || pos.x > maxX - wallZone;

        // 벽 근처 빠른 구제 — 1초만에 중앙 방향으로 강제 이동
        if (nearWall && next >= STUCK.wallFastTime && prev < STUCK.wallFastTime) {
          const dir = pos.x < cx ? 1 : -1;
          Matter.Body.setVelocity(marble.body, { x: dir * 3, y: 2 });
        }

        if (next >= STUCK.retire) {
          // Level 4: 리타이어 — 더 이상 구제 불가
          marble.markRetired();
          this.stuckTimers.delete(marble);
          continue;
        } else if (next >= STUCK.time3) {
          // Level 3: 텔레포트 — 중앙 근처로 수평이동 + 50px 위
          const newX = cx + (Math.random() - 0.5) * 60;
          const newY = Math.max(TRACK.startY, pos.y - 50);
          Matter.Body.setPosition(marble.body, { x: newX, y: newY });
          Matter.Body.setVelocity(marble.body, {
            x: (Math.random() - 0.5) * 3,
            y: 2,
          });
          this.stuckTimers.set(marble, 0);
        } else if (next >= STUCK.time2 && prev < STUCK.time2) {
          // Level 2: 강한 속도 리셋 (중앙 반대 방향으로)
          const dir = pos.x < cx ? 1 : -1;
          Matter.Body.setVelocity(marble.body, { x: dir * 2, y: 3 });
        } else if (next >= STUCK.time1 && prev < STUCK.time1) {
          // Level 1: 부드러운 하방 힘 적용
          const dir = Math.random() < 0.5 ? 1 : -1;
          Matter.Body.applyForce(marble.body, marble.body.position, {
            x: dir * 0.004,
            y: 0.006,
          });
        }
      } else {
        this.stuckTimers.delete(marble);
      }
    }
  }

  /**
   * 플레이어별 최고 결과로 중복 제거한 최종 랭킹.
   * marbleCount > 1 시 같은 플레이어의 여러 구슬 중 가장 앞선 것만 반영.
   */
  private buildRankings(): RankingEntry[] {
    const sorted = this.getSortedByProgress();
    const seen = new Set<number>();
    const result: RankingEntry[] = [];
    for (const marble of sorted) {
      if (!seen.has(marble.player.id)) {
        seen.add(marble.player.id);
        result.push({
          player: marble.player,
          rank: result.length + 1,
          finishTime: marble.finished ? marble.finishTime : undefined,
        });
      }
    }
    return result;
  }
}
