import { Container, Graphics, Text } from 'pixi.js';
import { PhysicsWorld, Vec2, BoxShape, type Body, type Joint } from '@core/PhysicsWorld';
import { RevoluteJoint } from 'planck';
import { COLORS, FONT_DISPLAY, SECTION_COLORS } from '@utils/constants';

// ─── V5 World Constants ─────────────────────────
export const V5_WORLD_W = 2200;
export const V5_WORLD_H = 2900;
export const V5_START_Y = 50;
export const V5_FINISH_Y = 2880;
export const V5_MARBLE_RADIUS = 10;
export const V5_WALL_THICK = 4;
export const V5_FLOOR_THICK = 6;

/** Marble start positions (9 marbles, 간격 85px, X: 700~1380) */
export const V5_MARBLE_STARTS = [
  { x: 700, y: 50 }, { x: 785, y: 50 }, { x: 870, y: 50 },
  { x: 955, y: 50 }, { x: 1040, y: 50 }, { x: 1125, y: 50 },
  { x: 1210, y: 50 }, { x: 1295, y: 50 }, { x: 1380, y: 50 },
];

/** Section Y-ranges for background coloring */
const SECTIONS = [
  { name: 'SEC1: 깔때기+핀존', y1: 60, y2: 350 },
  { name: 'SEC2: S-채널 3단', y1: 370, y2: 770 },
  { name: 'SEC3: 플링코', y1: 760, y2: 1230 },
  { name: 'SEC4: 분기1 FAST/SAFE', y1: 1230, y2: 1680 },
  { name: 'SEC5: 물레방아 리프트', y1: 1680, y2: 1960 },
  { name: 'SEC6: 카오스 존', y1: 1860, y2: 2290 },
  { name: 'SEC7: 분기2 VORTEX/SPRINT', y1: 2270, y2: 2640 },
  { name: 'SEC8: 파이널 스프린트', y1: 2640, y2: 2900 },
];

/** Section sensor names for sectionsVisited tracking */
export const SECTION_SENSOR_LABELS = [
  'sec1', 'sec2', 'sec3', 'sec4', 'sec5', 'sec6', 'sec7', 'sec8',
] as const;

// ─── Pipe Types ──────────────────────────────────
export type PipeDir = 'angled' | 'vertical' | 'curve';

export interface PipeOptions {
  direction?: PipeDir;      // default: 'angled'
  gap?: number;             // 파이프 내부 폭 px (default: 40)
  color?: number;           // hex 색상 코드 (default: COLORS.darkGray)
  // 'curve' 전용
  arcRadius?: number;       // 호 중심선 반지름 (필수)
  arcStart?: number;        // 시작 각도 rad (default: 0)
  arcEnd?: number;          // 끝 각도 rad (default: Math.PI)
  arcSegments?: number;     // 다각형 근사 분할 수 (default: 24)
  skipOuterWall?: boolean;  // outer arc 물리/그래픽 생략 (합류 교차점 blockage 방지용)
}

type PipeResult = { walls: Body[]; zone: { x1: number; y1: number; x2: number; y2: number } };

/** Dynamic obstacle info for graphics sync */
interface DynamicObstacle {
  body: Body;
  gfxContainer: Container;
  type: 'windmill' | 'seesaw' | 'hammer' | 'waterwheel';
}

/**
 * V5TrackBuilder — V5 설계 명세서의 좌표를 반영하여 트랙 빌드.
 * 깔때기 → S-채널 → 플링코 → 분기(FAST/SAFE) → 물레방아 → 카오스 → 분기(VORTEX/SPRINT) → FINISH
 */
export class V5TrackBuilder {
  private readonly physics: PhysicsWorld;
  private readonly worldContainer: Container;
  private readonly bodies: Body[] = [];
  private readonly joints: Joint[] = [];
  private readonly obstacles: DynamicObstacle[] = [];
  private finishSensor: Body | null = null;
  private sec2ExitX = 0;
  private sec2ExitY = 0;
  private sec4FastX = 0;
  private sec4FastY = 0;
  private sec4SlowX = 0;
  private sec4SlowY = 0;
  private sec5ExitX = 0;
  private sec5ExitY = 0;
  private readonly sectionSensors: Array<{ label: string; body: Body }> = [];
  private updateHandler: (() => void) | null = null;

  constructor(physics: PhysicsWorld, worldContainer: Container) {
    this.physics = physics;
    this.worldContainer = worldContainer;
  }

  /** 전체 트랙 빌드 */
  build(): void {
    this.buildBackground();
    this.buildWorldBounds();
    this.buildSEC1();
    this.buildSEC2();
    this.buildSEC3();
    this.buildSEC4();
    this.buildSEC5();
    this.buildSEC6();
    this.buildSEC7();
    this.buildSEC8();
    this.buildFinishLine();
    this.setupUpdateLoop();
  }

  getFinishSensor(): Body | null { return this.finishSensor; }
  getSectionSensors(): Array<{ label: string; body: Body }> { return this.sectionSensors; }
  getTrackBounds(): { minX: number; maxX: number } { return { minX: 10, maxX: V5_WORLD_W - 10 }; }
  getSec5Exit(): { x: number; y: number } { return { x: this.sec5ExitX, y: this.sec5ExitY }; }

  // ─── Helpers ──────────────────────────────────

  /** Create a floor (angled static rectangle) from (x1,y1) to (x2,y2) */
  private createFloor(x1: number, y1: number, x2: number, y2: number, color: number = COLORS.secondary): Body {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const body = this.physics.createWall(cx, cy, len, V5_FLOOR_THICK, { angle, friction: 0.01, restitution: 0.3 });
    this.bodies.push(body);
    const g = new Graphics();
    g.rect(-len / 2, -V5_FLOOR_THICK / 2, len, V5_FLOOR_THICK);
    g.fill({ color, alpha: 0.9 });
    g.position.set(cx, cy);
    g.rotation = angle;
    this.worldContainer.addChild(g);
    return body;
  }

/** Create a vertical wall from (x, y1) to (x, y2) */
  private createWall(x: number, y1: number, y2: number, color: number = COLORS.darkGray): Body {
    const cy = (y1 + y2) / 2;
    const h = Math.abs(y2 - y1);
    const body = this.physics.createWall(x, cy, V5_WALL_THICK, h, { friction: 0.1, restitution: 0.5 });
    this.bodies.push(body);
    const g = new Graphics();
    g.rect(-V5_WALL_THICK / 2, -h / 2, V5_WALL_THICK, h);
    g.fill({ color, alpha: 0.8 });
    g.position.set(x, cy);
    this.worldContainer.addChild(g);
    return body;
  }

  /**
   * 통합 파이프 생성 — direction Prop으로 방향 선택, color Prop으로 색상 지정.
   *
   * direction: 'angled' | 'vertical' | 'curve'
   * - 'angled'  (기본): (x1,y1)→(x2,y2) 경사/수평 파이프 — 상벽+하벽
   * - 'vertical': (x1,y1~y2) 수직 파이프 — 좌벽+우벽 (x2 무시)
   * - 'curve'  : (x1,y1)=호 중심 — 내벽+외벽 체인 (arcRadius/arcStart/arcEnd 필수)
   */
  private createPipe(
    x1: number, y1: number,
    x2: number, y2: number,
    options?: PipeOptions,
  ): PipeResult {
    const {
      direction = 'angled',
      gap = 40,
      color = COLORS.darkGray,
      arcRadius = 100,
      arcStart = 0,
      arcEnd = Math.PI,
      arcSegments = 24,
      skipOuterWall = false,
    } = options ?? {};
    const halfGap = gap / 2;
    const walls: Body[] = [];

    // ── 곡선 파이프 ───────────────────────────────
    if (direction === 'curve') {
      const cx = x1, cy = y1;
      const innerR = arcRadius - halfGap;
      const outerR = arcRadius + halfGap;

      const buildArcPts = (r: number) => {
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i <= arcSegments; i++) {
          const a = arcStart + (arcEnd - arcStart) * (i / arcSegments);
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
      };

      const innerPts = buildArcPts(innerR);
      const outerPts = buildArcPts(outerR);

      const innerBody = this.physics.createChain(innerPts, false, 0.01);
      this.bodies.push(innerBody); walls.push(innerBody);
      if (!skipOuterWall) {
        const outerBody = this.physics.createChain(outerPts, false, 0.01);
        this.bodies.push(outerBody); walls.push(outerBody);
      }

      // 내부 채널 배경 (도넛 섹터) — outer wall 없을 때는 inner arc만 표시
      const gFill = new Graphics();
      gFill.moveTo(cx + innerR * Math.cos(arcStart), cy + innerR * Math.sin(arcStart));
      gFill.arc(cx, cy, innerR, arcStart, arcEnd);
      gFill.lineTo(cx + outerR * Math.cos(arcEnd), cy + outerR * Math.sin(arcEnd));
      gFill.arc(cx, cy, outerR, arcEnd, arcStart, true);
      gFill.closePath();
      gFill.fill({ color: 0x1a1a2e, alpha: 0.25 });
      this.worldContainer.addChild(gFill);

      // 내벽 스트로크
      const gInner = new Graphics();
      gInner.moveTo(innerPts[0].x, innerPts[0].y);
      for (let i = 1; i < innerPts.length; i++) gInner.lineTo(innerPts[i].x, innerPts[i].y);
      gInner.stroke({ width: V5_FLOOR_THICK, color, alpha: 0.9 });
      this.worldContainer.addChild(gInner);

      // 외벽 스트로크 — skipOuterWall 시 생략
      if (!skipOuterWall) {
        const gOuter = new Graphics();
        gOuter.moveTo(outerPts[0].x, outerPts[0].y);
        for (let i = 1; i < outerPts.length; i++) gOuter.lineTo(outerPts[i].x, outerPts[i].y);
        gOuter.stroke({ width: V5_FLOOR_THICK, color, alpha: 0.9 });
        this.worldContainer.addChild(gOuter);
      }

      return { walls, zone: { x1, y1, x2: cx + arcRadius, y2: cy + arcRadius } };
    }

    // ── 수직 파이프 ───────────────────────────────
    if (direction === 'vertical') {
      const lx = x1 - halfGap;
      const rx = x1 + halfGap;
      const pcy = (y1 + y2) / 2;
      const h = Math.abs(y2 - y1);

      const leftBody = this.physics.createWall(lx, pcy, V5_WALL_THICK, h, { friction: 0.1, restitution: 0.5 });
      this.bodies.push(leftBody); walls.push(leftBody);
      const rightBody = this.physics.createWall(rx, pcy, V5_WALL_THICK, h, { friction: 0.1, restitution: 0.5 });
      this.bodies.push(rightBody); walls.push(rightBody);

      const gFill = new Graphics();
      gFill.rect(lx + V5_WALL_THICK / 2, y1, gap - V5_WALL_THICK, h);
      gFill.fill({ color: 0x1a1a2e, alpha: 0.25 });
      this.worldContainer.addChild(gFill);

      const gLeft = new Graphics();
      gLeft.rect(-V5_WALL_THICK / 2, -h / 2, V5_WALL_THICK, h);
      gLeft.fill({ color, alpha: 0.8 });
      gLeft.position.set(lx, pcy);
      this.worldContainer.addChild(gLeft);

      const gRight = new Graphics();
      gRight.rect(-V5_WALL_THICK / 2, -h / 2, V5_WALL_THICK, h);
      gRight.fill({ color, alpha: 0.8 });
      gRight.position.set(rx, pcy);
      this.worldContainer.addChild(gRight);

      return { walls, zone: { x1: lx, y1, x2: rx, y2 } };
    }

    // ── 경사/수평 파이프 (angled) ─────────────────
    const pcx = (x1 + x2) / 2;
    const pcy = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    let nx = -Math.sin(angle);
    let ny = Math.cos(angle);
    if (ny < 0) { nx = -nx; ny = -ny; }

    const bx = pcx + nx * halfGap; const by = pcy + ny * halfGap;
    const tx = pcx - nx * halfGap; const ty = pcy - ny * halfGap;

    const bottomBody = this.physics.createWall(bx, by, len, V5_FLOOR_THICK, { angle, friction: 0.01, restitution: 0.3 });
    this.bodies.push(bottomBody); walls.push(bottomBody);
    const topBody = this.physics.createWall(tx, ty, len, V5_FLOOR_THICK, { angle, friction: 0.01, restitution: 0.3 });
    this.bodies.push(topBody); walls.push(topBody);

    const gFill = new Graphics();
    gFill.rect(-len / 2, -(halfGap - V5_FLOOR_THICK / 2), len, gap - V5_FLOOR_THICK);
    gFill.fill({ color: 0x1a1a2e, alpha: 0.25 });
    gFill.position.set(pcx, pcy);
    gFill.rotation = angle;
    this.worldContainer.addChild(gFill);

    const gBottom = new Graphics();
    gBottom.rect(-len / 2, -V5_FLOOR_THICK / 2, len, V5_FLOOR_THICK);
    gBottom.fill({ color, alpha: 0.9 });
    gBottom.position.set(bx, by);
    gBottom.rotation = angle;
    this.worldContainer.addChild(gBottom);

    const gTop = new Graphics();
    gTop.rect(-len / 2, -V5_FLOOR_THICK / 2, len, V5_FLOOR_THICK);
    gTop.fill({ color, alpha: 0.9 });
    gTop.position.set(tx, ty);
    gTop.rotation = angle;
    this.worldContainer.addChild(gTop);

    return { walls, zone: { x1, y1, x2, y2 } };
  }

  /** Create a static circle pin */
  private createPin(x: number, y: number, r: number, color: number = 0xffffff): void {
    const body = this.physics.createPin(x, y, r);
    this.bodies.push(body);
    const g = new Graphics();
    g.circle(0, 0, r);
    g.fill({ color, alpha: 0.9 });
    g.position.set(x, y);
    this.worldContainer.addChild(g);
  }

  /** Create a windmill (kinematic rotating blades) */
  private createWindmill(x: number, y: number, r: number, blades = 4, speed = 2.0): void {
    const bladeThick = 10;
    const body = this.physics.createKinematicBody(x, y);
    this.bodies.push(body);
    for (let i = 0; i < blades; i++) {
      const angle = i * ((Math.PI * 2) / blades);
      body.createFixture(new BoxShape(r, bladeThick / 2, new Vec2(0, 0), angle), { restitution: 0.6, friction: 0.1 });
    }
    body.setAngularVelocity(speed);
    const gfxContainer = new Container();
    gfxContainer.position.set(x, y);
    for (let i = 0; i < blades; i++) {
      const angle = i * ((Math.PI * 2) / blades);
      const g = new Graphics();
      g.rect(-r, -bladeThick / 2, r * 2, bladeThick);
      g.fill({ color: COLORS.orange });
      g.rotation = angle;
      gfxContainer.addChild(g);
    }
    this.worldContainer.addChild(gfxContainer);
    const hub = new Graphics();
    hub.circle(0, 0, 5);
    hub.fill({ color: 0xffffff });
    hub.position.set(x, y);
    this.worldContainer.addChild(hub);
    this.obstacles.push({ body, gfxContainer, type: 'windmill' });
  }

  /** Create a seesaw (dynamic beam on revolute joint) */
  private createSeesaw(x: number, y: number, width: number): void {
    const thick = 8;
    const pivot = this.physics.createStaticBody(x, y);
    this.bodies.push(pivot);
    const beam = this.physics.createDynamicBody(x, y, { angularDamping: 2.0 });
    beam.createFixture(new BoxShape(width / 2, thick / 2), { density: 0.005, restitution: 0.3, friction: 0.1 });
    this.bodies.push(beam);
    const joint = this.physics.createRevoluteJoint(pivot, beam, { x, y }, { enableLimit: true, lowerAngle: -0.4, upperAngle: 0.4 });
    this.joints.push(joint);
    const pivotGfx = new Graphics();
    pivotGfx.moveTo(x - 10, y + 16); pivotGfx.lineTo(x + 10, y + 16); pivotGfx.lineTo(x, y - 2);
    pivotGfx.closePath(); pivotGfx.fill({ color: COLORS.darkGray, alpha: 0.9 });
    this.worldContainer.addChild(pivotGfx);
    const gfxContainer = new Container();
    const beamGfx = new Graphics();
    beamGfx.rect(-width / 2, -thick / 2, width, thick);
    beamGfx.fill({ color: COLORS.orange, alpha: 0.9 });
    gfxContainer.addChild(beamGfx);
    gfxContainer.position.set(x, y);
    this.worldContainer.addChild(gfxContainer);
    this.obstacles.push({ body: beam, gfxContainer, type: 'seesaw' });
  }

  /** Create a section sensor for tracking sectionsVisited */
  private createSectionSensor(x: number, y: number, w: number, h: number, label: string): void {
    const body = this.physics.createSensor(x, y, w, h, label);
    this.bodies.push(body);
    this.sectionSensors.push({ label, body });
  }

  // ─── Background ──────────────────────────────

  private buildBackground(): void {
    const bg = new Graphics();
    bg.rect(0, 0, V5_WORLD_W, V5_WORLD_H);
    bg.fill(COLORS.background);
    this.worldContainer.addChild(bg);
    SECTIONS.forEach((sec, i) => {
      const band = new Graphics();
      band.rect(0, sec.y1, V5_WORLD_W, sec.y2 - sec.y1);
      band.fill({ color: SECTION_COLORS[i % SECTION_COLORS.length], alpha: 0.06 });
      this.worldContainer.addChild(band);
      const label = new Text({ text: sec.name, style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: COLORS.textDim } });
      label.x = 20; label.y = sec.y1 + 8; label.alpha = 0.5;
      this.worldContainer.addChild(label);
    });
  }

  private buildWorldBounds(): void {
    const thick = 20;
    this.physics.createWall(thick / 2, V5_WORLD_H / 2, thick, V5_WORLD_H, { friction: 0.1 });
    this.physics.createWall(V5_WORLD_W - thick / 2, V5_WORLD_H / 2, thick, V5_WORLD_H, { friction: 0.1 });
    this.physics.createWall(V5_WORLD_W / 2, V5_WORLD_H + thick / 2, V5_WORLD_W, thick, { friction: 0.1 });
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 1: 깔때기(A) + 핀존(B) + 자유낙하(C)  (Y: 50 → 380+)
  // ════════════════════════════════════════════════════════════════
  private buildSEC1(): void {
    // ── 구간A: 깔때기 ─────────────────────────────
    // 출구 폭 120px (x:980~1100), 하단 y=300 — SEC2 curveA 입구와 정확히 일치
    this.createFloor(600, 80, 980, 300, 0x3366ff);    // 좌측 경사벽
    this.createFloor(1480, 80, 1100, 300, 0x3366ff);  // 우측 경사벽

    // ── 구간B: 핀존 좌우 경계벽 ─────────────────────
    this.createWall(980, 300, 380);    // 좌벽: x=980, y=300~380
    this.createWall(1100, 300, 380);   // 우벽: x=1100, y=300~380

    // 핀 (r=8, 안전 구역 x=988~1092)
    this.createPin(1012, 320, 8);    // 1행
    this.createPin(1064, 320, 8);
    this.createPin(1038, 347, 8);    // 2행 (오프셋)
    this.createPin(1090, 347, 8);
    this.createPin(1012, 374, 8);    // 3행
    this.createPin(1064, 374, 8);

    // ── 구간C: 수직 통로 → SEC2 자유낙하 ──────────
    // center x=1040, gap=120 → 좌벽=980, 우벽=1100, 하단 y=470
    this.createPipe(1040, 380, 1040, 470, { direction: 'vertical', gap: 120 });

    // 구간C 파이프 내부 핀 (4~5행)
    this.createPin(1038, 401, 8);
    this.createPin(1090, 401, 8);
    this.createPin(1012, 428, 8);
    this.createPin(1064, 428, 8);
    // Section 1 sensor
    this.createSectionSensor(1040, 350, 120, 120, 'sec1');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 2: S-채널 3단 (Y: 470 → ~840)
  //   커브A → CH1 우하향 → 커브B → CH2 좌하향 → 커브C → CH3 우하향
  // ════════════════════════════════════════════════════════════════
  private buildSEC2(): void {
    const GAP   = 120;    // 파이프 내부 폭 (구슬 지름 20px × 6 여유)
    const R     = 80;     // U턴 반지름
    const color = 0x33aa33;

    // ── 커브A: SEC1 수직 파이프 하단 → CH1 우향 전환 ──────────────
    // SEC1 수직 파이프: center=(1040, 380~470), 하단 y=470
    // 커브A 중심: SEC1 center x + R, SEC1 bottom y = (1040+R, 470)
    const cAcx = 1040 + R;        // = 1120
    const cAcy = 470;

    // arcStart=π (좌측 = SEC1 파이프 중심선), arcEnd=π/2 (하단 = CH1 시작)
    this.createPipe(cAcx, cAcy, 0, 0, {
      direction: 'curve',
      arcRadius: R,
      arcStart: Math.PI,
      arcEnd: Math.PI / 2,
      gap: GAP,
      color,
    });

    // ── CH1: 우하향 (커브A 출구 → 우측 월드 끝) ──────────────────
    // 커브A 출구: (cAcx + R*cos(π/2), cAcy + R*sin(π/2)) = (1120, 550)
    const ch1X1 = cAcx + R * Math.cos(Math.PI / 2);  // = 1120
    const ch1Y1 = cAcy + R * Math.sin(Math.PI / 2);  // = 550
    const ch1X2 = 2080;
    const ch1Y2 = ch1Y1 + (ch1X2 - ch1X1) * Math.tan(0.03);

    this.createPipe(ch1X1, ch1Y1, ch1X2, ch1Y2, { direction: 'angled', gap: GAP, color });

    // ── 커브B: CH1 끝점 → CH2 시작점 (우측 CW U턴) ───────────────
    const t1     = Math.atan2(ch1Y2 - ch1Y1, ch1X2 - ch1X1);
    const bCx    = ch1X2 - Math.sin(t1) * R;
    const bCy    = ch1Y2 + Math.cos(t1) * R;
    const bStart = Math.atan2(ch1Y2 - bCy, ch1X2 - bCx);
    const bEnd   = bStart + Math.PI;

    this.createPipe(bCx, bCy, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: bStart, arcEnd: bEnd,
      gap: GAP, color,
    });

    // ── CH2: 좌하향 ────────────────────────────────────────────────
    const ch2X1 = bCx + R * Math.cos(bEnd);
    const ch2Y1 = bCy + R * Math.sin(bEnd);
    const ch2X2 = 150;
    const ch2Y2 = ch2Y1 + (ch2X1 - ch2X2) * Math.tan(0.03);

    this.createPipe(ch2X1, ch2Y1, ch2X2, ch2Y2, { direction: 'angled', gap: GAP, color });

    // ── 커브C: CH2 끝점 → CH3 시작점 (좌측 CCW U턴) ──────────────
    const t2     = Math.atan2(ch2Y2 - ch2Y1, ch2X2 - ch2X1);
    const cCx    = ch2X2 + Math.sin(t2) * R;
    const cCy    = ch2Y2 - Math.cos(t2) * R;
    const cStart = Math.atan2(ch2Y2 - cCy, ch2X2 - cCx);
    const cEnd   = cStart - Math.PI;

    this.createPipe(cCx, cCy, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: cStart, arcEnd: cEnd,
      gap: GAP, color,
    });

    // ── CH3: 우하향 → SEC3 진입 ───────────────────────────────────
    const ch3X1 = cCx + R * Math.cos(cEnd);
    const ch3Y1 = cCy + R * Math.sin(cEnd);
    const ch3X2 = 1750;
    const ch3Y2 = ch3Y1 + (ch3X2 - ch3X1) * Math.tan(0.05);

    this.createPipe(ch3X1, ch3Y1, ch3X2, ch3Y2, { direction: 'angled', gap: GAP, color });

    // CH3 끝점 저장 → buildSEC3 좌벽 개구부 종속 계산용
    this.sec2ExitX = ch3X2;
    this.sec2ExitY = ch3Y2;

    // ── SEC2 센서: CH1 중간 지점 ───────────────────────────────────
    this.createSectionSensor(
      (ch1X1 + ch1X2) / 2,
      (ch1Y1 + ch1Y2) / 2,
      200, 40, 'sec2',
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 3: 플링코 보드 (Y: 760 → 1310)
  // ════════════════════════════════════════════════════════════════
  private buildSEC3(): void {
    const color = 0x663366;
    const SEC3_GAP = 120;  // CH3 파이프 gap과 동일 → 개구부 폭
    const halfGap  = SEC3_GAP / 2; // 60
    // CH3 끝점(sec2ExitX, sec2ExitY)에 종속된 좌벽 x 및 개구부 y
    const wallX    = this.sec2ExitX + 10;  // CH3 끝 바로 우측 (≈1760)
    const openMidY = this.sec2ExitY;       // CH3 중심선 y → 개구부 중심
    const RIGHT    = 2060;
    const TOP      = 900;
    const BOT      = 1290;

    // ── 외벽 ────────────────────────────────────────────────────────
    // 상단 캡 (수평 직선 1개 — 구슬 이탈 방지)
    this.createFloor(wallX, TOP, RIGHT, TOP, color);

    // 좌벽 상단: y=TOP → 개구부 위 (CH3 중심선 - halfGap)
    this.createWall(wallX, TOP, openMidY - halfGap, color);
    // 좌벽 하단: 개구부 아래 (CH3 중심선 + halfGap) → BOT - 20 (경사 끝점과 정합)
    this.createWall(wallX, openMidY + halfGap, BOT - 20, color);

    // 우벽 전체: TOP → BOT - 20 (경사 끝점과 정합)
    this.createWall(RIGHT, TOP, BOT - 20, color);

    // 하단: 중앙 50px 구멍(x=1885~1935) 개방 → SEC4 낙하
    // 경사 바닥 — 좌우 끝점 y=BOT-20, 벽 꼭지점과 정합하여 라인 삐져나옴 방지
    this.createFloor(wallX, BOT - 20, 1885, BOT, color);  // 하단 좌측 — 경사 강화
    this.createFloor(1935, BOT, RIGHT, BOT - 20, color);  // 하단 우측 — 경사 강화

    // ── 핀 배열 (SEC1과 동일 규격: r=8, x간격=52px, y간격=27px) ────
    // 핀 유효 구역: wallX~RIGHT 내 30px 이격, y=1110~1218
    // 짝수행(5핀): wallX+30, +82, +134, +186, +238
    // 홀수행(4핀): wallX+56, +108, +160, +212 (오프셋 +26)
    const EVEN_COLS = [wallX+30, wallX+82, wallX+134, wallX+186, wallX+238];
    const ODD_COLS  = [wallX+56, wallX+108, wallX+160, wallX+212];

    for (let row = 0; row < 5; row++) {
      const y = 1110 + row * 27;
      const cols = row % 2 === 0 ? EVEN_COLS : ODD_COLS;
      cols.forEach(x => this.createPin(x, y, 8));
    }

    // ── 섹션 센서 ──────────────────────────────────────────────────
    this.createSectionSensor(1910, 1190, 260, 40, 'sec3');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 4: 첫 번째 분기 FAST/SAFE (Y: 1160 → 1700)
  // ════════════════════════════════════════════════════════════════
  private buildSEC4(): void {
    const GAP  = 50;
    const R    = 80;
    const HALF = GAP / 2; // 25

    // ── 1단계: 수직 파이프 — SEC3 하단 floor 바닥~커브A 오버랩 포함
    this.createPipe(1910, 1293, 1910, 1370, {
      direction: 'vertical',
      gap: GAP,
      color: 0x996600,
    });

    // ── 커브A — 수직파이프 하단(1363)에서 사선으로 전환
    const cAcx = 1910 - R; // = 1830
    const cAcy = 1363;
    this.createPipe(cAcx, cAcy, 0, 0, {
      direction: 'curve',
      arcRadius: R,
      arcStart: 0,
      arcEnd: Math.PI / 3,
      gap: GAP,
      color: 0x996600,
    });

    // ── 2단계: CH_conn 사선 파이프 + 챔버 입구 전환 커브 ────────────
    const connX1 = cAcx + R * Math.cos(Math.PI / 3);           // = 1870
    const connY1 = Math.round(cAcy + R * Math.sin(Math.PI / 3)); // = 1432
    const splitX = 1400;
    const splitY = 1750;

    // 전환 커브: CH_conn 사선 → 수직 하향(챔버 진입) 방향 전환
    // 커브 중심: (splitX + R_conn, splitY) — arcEnd=π 에서 점(splitX, splitY) 도달
    const R_conn = 60;
    const connAngle = Math.atan2(splitY - connY1, splitX - connX1); // CH_conn 진행 각도
    const transArcStart = connAngle + Math.PI / 2; // CW 방향: 접선=connAngle
    const transArcEnd   = Math.PI;                  // CW 방향: 접선=π/2 (수직 하향)
    const transCx = splitX + R_conn;               // = 1460
    const transCy = splitY;                         // = 1750

    // 커브 시작점 (CH_conn의 끝점) — 소수점 반올림으로 정합
    const curveStartX = Math.round(transCx + R_conn * Math.cos(transArcStart));
    const curveStartY = Math.round(transCy + R_conn * Math.sin(transArcStart));

    // CH_conn: 커브 시작점 + OVERLAP(8px) 연장 → 전환커브와 연결부 갭 방지
    const CONN_OVERLAP = 8;
    this.createPipe(connX1, connY1,
      Math.round(curveStartX + CONN_OVERLAP * Math.cos(connAngle)),
      Math.round(curveStartY + CONN_OVERLAP * Math.sin(connAngle)),
      { gap: GAP, color: 0x996600 },
    );

    // 전환 커브 (CW: arcStart → arcEnd 감소)
    this.createPipe(transCx, transCy, 0, 0, {
      direction: 'curve',
      arcRadius: R_conn,
      arcStart: transArcStart,
      arcEnd: transArcEnd,
      gap: GAP,
      color: 0x996600,
    });

    // ── 3단계: 사각형 분기 챔버 (x:1000~1800, y:1750~1900) ──────────
    // splitX=1400이 챔버 정중앙에 오도록 좌우 400px 대칭
    const CHAMBER_L   = 1000;
    const CHAMBER_R   = 1800;
    const CHAMBER_TOP = splitY;       // 1750
    const CHAMBER_BOT = splitY + 150; // 1900

    const inletL = splitX - HALF; // 1375 — 전환커브 입구 좌측
    const inletR = splitX + HALF; // 1425 — 전환커브 입구 우측

    // 상단: 입구(50px) 열고 좌/우 수평벽 (미세경사 +4px — 영구정지 방지)
    this.createFloor(CHAMBER_L, CHAMBER_TOP, inletL, CHAMBER_TOP + 4, 0x996600);
    this.createFloor(inletR, CHAMBER_TOP, CHAMBER_R, CHAMBER_TOP + 4, 0x996600);

    // 좌/우 수직벽 (CHAMBER_BOT=1900까지 — V자 바닥 영역에 출구 개방)
    this.createWall(CHAMBER_L, CHAMBER_TOP, CHAMBER_BOT, 0x996600);
    this.createWall(CHAMBER_R, CHAMBER_TOP, CHAMBER_BOT, 0x996600);

    // ── 4단계: 챔버 하단 역V자 경사 floor + 양쪽 출구 개구부 ────────────
    const BRANCH_GAP  = 60;
    const BRANCH_R    = 80;
    const FAST_GAP    = BRANCH_GAP;
    const SLOW_GAP    = BRANCH_GAP;
    const FAST_R      = 80;
    const SLOW_R      = 80;
    const OVERLAP     = 8;

    // LEFT 출구 중심: x=1100, RIGHT 출구 중심: x=1700
    // 개구부 폭 = BRANCH_GAP = 60 → LEFT: x=1070~1130, RIGHT: x=1670~1730
    const LEFT_OUT_X  = 1100;
    const RIGHT_OUT_X = 1700;
    const OUT_HALF    = BRANCH_GAP / 2; // 30

    // 역V 바닥 4개: 좌벽→LEFT개구부 / 경사좌 / 경사우 / RIGHT개구부→우벽
    this.createFloor(CHAMBER_L, CHAMBER_BOT, LEFT_OUT_X - OUT_HALF, CHAMBER_BOT, 0x996600);
    this.createFloor(LEFT_OUT_X + OUT_HALF, CHAMBER_BOT, 1412, CHAMBER_BOT - 40, 0x996600);
    this.createFloor(1412, CHAMBER_BOT - 40, RIGHT_OUT_X - OUT_HALF, CHAMBER_BOT, 0x996600);
    this.createFloor(RIGHT_OUT_X + OUT_HALF, CHAMBER_BOT, CHAMBER_R, CHAMBER_BOT, 0x996600);

    // ── 5단계: FAST 경로 (좌하) — 90° 커브 → 사선 → CW커브 → 수직 ────
    // LEFT 출구(1100, 1900)에서 수직하강 → 좌향 90° 전환
    // 커브 중심: (LEFT_OUT_X - BRANCH_R, CHAMBER_BOT) = (1020, 1900)
    // arcStart=0: (1020+80, 1900) = (1100, 1900) = 출구 중심 ✓
    // arcEnd=π/2: (1020, 1900+80) = (1020, 1980) = FAST 사선 시작 ✓
    const fastCurveCx = LEFT_OUT_X - BRANCH_R;  // 1020
    const fastCurveCy = CHAMBER_BOT;              // 1900
    this.createPipe(fastCurveCx, fastCurveCy, 0, 0, {
      direction: 'curve',
      arcRadius: BRANCH_R,
      arcStart: 0,
      arcEnd: Math.PI / 2,
      gap: BRANCH_GAP,
      color: 0xff4444,
    });
    // FAST 사선 시작점: 커브 arcEnd=π/2 출구
    const fastSX = fastCurveCx;          // 1020
    const fastSY = fastCurveCy + BRANCH_R; // 1980
    const fastEX = 700;
    const fastEY = 2050;
    const fastAlpha = Math.atan2(fastEY - fastSY, fastEX - fastSX);
    const fastArcS  = fastAlpha + Math.PI / 2;
    const fastArcE  = Math.PI;
    const fastCx    = fastEX - FAST_R * Math.cos(fastArcS);
    const fastCy    = fastEY - FAST_R * Math.sin(fastArcS);
    // 사선: 끝점을 fastAlpha 방향으로 OVERLAP 연장 → 커브 시작부와 오버랩 ✅②
    this.createPipe(fastSX, fastSY,
      fastEX + OVERLAP * Math.cos(fastAlpha),
      fastEY + OVERLAP * Math.sin(fastAlpha),
      { gap: FAST_GAP, color: 0xff4444 });
    this.createPipe(fastCx, fastCy, 0, 0, {
      direction: 'curve', arcRadius: FAST_R,
      arcStart: fastArcS, arcEnd: fastArcE,
      gap: FAST_GAP, color: 0xff4444,
    });
    // 수직: 커브 arcEnd=π 기준 위쪽으로 OVERLAP 연장 → 커브 끝과 오버랩 ✅③
    const fastVX = fastCx - FAST_R;
    const fastVY = fastCy;
    this.createPipe(fastVX, fastVY - OVERLAP, fastVX, fastVY + 100, {
      direction: 'vertical', gap: FAST_GAP, color: 0xff4444,
    });

    // ── 6단계: SLOW 경로 (우하) — 90° 커브 → 사선 → CCW커브 → 수직 ──
    // RIGHT 출구(1700, 1900)에서 수직하강 → 우향 90° 전환
    // 커브 중심: (RIGHT_OUT_X + BRANCH_R, CHAMBER_BOT) = (1780, 1900)
    // arcStart=π: (1780-80, 1900) = (1700, 1900) = 출구 중심 ✓
    // arcEnd=π/2: (1780, 1900+80) = (1780, 1980) = SLOW 사선 시작 ✓
    const slowCurveCx = RIGHT_OUT_X + BRANCH_R;  // 1780
    const slowCurveCy = CHAMBER_BOT;               // 1900
    this.createPipe(slowCurveCx, slowCurveCy, 0, 0, {
      direction: 'curve',
      arcRadius: BRANCH_R,
      arcStart: Math.PI,
      arcEnd: Math.PI / 2,
      gap: BRANCH_GAP,
      color: 0x44aa44,
    });
    // SLOW 사선 시작점: 커브 arcEnd=π/2 출구
    const slowSX = slowCurveCx;           // 1780
    const slowSY = slowCurveCy + BRANCH_R;  // 1980
    const slowEX = 2100;  // FAST 대칭: dx=+320 (FAST는 dx=-320)
    const slowEY = 2050;
    const slowAlpha = Math.atan2(slowEY - slowSY, slowEX - slowSX);
    const slowArcS  = slowAlpha - Math.PI / 2;
    const slowArcE  = 0;
    const slowCx    = slowEX - SLOW_R * Math.cos(slowArcS);
    const slowCy    = slowEY - SLOW_R * Math.sin(slowArcS);
    // 사선: 끝점을 slowAlpha 방향으로 OVERLAP 연장 → 커브 시작부와 오버랩 ✅⑤
    this.createPipe(slowSX, slowSY,
      slowEX + OVERLAP * Math.cos(slowAlpha),
      slowEY + OVERLAP * Math.sin(slowAlpha),
      { gap: SLOW_GAP, color: 0x44aa44 });
    // 사선 중간에 시소 장애물 배치
    this.createSeesaw(Math.round((slowSX + slowEX) / 2), Math.round((slowSY + slowEY) / 2), 60);
    this.createPipe(slowCx, slowCy, 0, 0, {
      direction: 'curve', arcRadius: SLOW_R,
      arcStart: slowArcS, arcEnd: slowArcE,
      gap: SLOW_GAP, color: 0x44aa44,
    });
    // 수직: 커브 arcEnd=0 기준 위쪽으로 OVERLAP 연장 → 커브 끝과 오버랩 ✅⑥
    const slowVX = slowCx + SLOW_R;
    const slowVY = slowCy;
    this.createPipe(slowVX, slowVY - OVERLAP, slowVX, slowVY + 100, {
      direction: 'vertical', gap: SLOW_GAP, color: 0x44aa44,
    });

    // ── 섹션 센서 ───────────────────────────────────────────────────
    this.createSectionSensor(1635, 1590, 80, 30, 'sec4');
    this.createSectionSensor(fastVX, fastVY + 50, 100, 30, 'sec4-fast');
    this.createSectionSensor(slowVX, slowVY + 50, 100, 30, 'sec4-safe');

    // ── SEC5 연결용 출구 좌표 저장 ────────────────────────────────────
    // 수직 파이프 하단: 파이프 중심 X, 파이프 끝 Y (fastVY + 100)
    this.sec4FastX = fastVX;
    this.sec4FastY = fastVY + 100;
    this.sec4SlowX = slowVX;
    this.sec4SlowY = slowVY + 100;
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 5: 합류 파이프 + 윈드밀  (Y: sec4FastY → sec5ExitY)
  //
  //   규칙: 모든 경로는 파이프, 꺾임은 반드시 curve
  //
  //   FAST(X≈637) : Curve1(하→우) → 우향파이프 → Curve2(우→하) ─┐
  //                                                             ├→ (1400, mergeY) → 수직파이프 → 윈드밀
  //   SLOW(X≈2163): Curve1(하→좌) → 좌향파이프 → Curve2(좌→하) ─┘
  //
  //   Curve2 FAST: center=(1340, fP2y+R), arcStart=-π/2, arcEnd=0   → exit (1400, mergeY)
  //   Curve2 SLOW: center=(1460, sP2y+R), arcStart=-π/2, arcEnd=-π  → exit (1400, mergeY)
  //   ∵ FY==SY (대칭) → fP2y==sP2y → 두 curve2 출구가 정확히 동일점 수렴
  // ════════════════════════════════════════════════════════════════
  private buildSEC5(): void {
    const R     = 60;    // 모든 커브 반지름 (SEC2/SEC4와 통일)
    const GAP   = 60;    // 파이프 내부 폭
    const color = 0x0088cc;

    const FX = this.sec4FastX;  // FAST 수직파이프 중심 X (≈637)
    const FY = this.sec4FastY;  // FAST/SLOW 수직파이프 하단 Y (≈2228, FY==SY 수학적 보장)
    const SX = this.sec4SlowX;  // SLOW 수직파이프 중심 X (≈2163)
    const SY = this.sec4SlowY;  // (FY와 동일)

    // ═══════════════════════════════════════════════════════
    // FAST 경로: 하향→우향→하향 (S-커브로 중앙 X=1400 도달)
    // ═══════════════════════════════════════════════════════

    // ── Curve1-F: 하향→우향 ──────────────────────────────────────────
    // center=(FX+R, FY), arcStart=π, arcEnd=π/2
    // 입구: (FX+R+R*cos(π), FY+R*sin(π)) = (FX, FY) ← FAST 수직파이프 하단 ✓
    // 출구: (FX+R, FY+R) ≈ (697, 2288), 방향: 우향
    this.createPipe(FX + R, FY, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: Math.PI, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // ── Pipe-F: 우향 경사 파이프 (slope 0.04 rad) ────────────────────
    // 시작: curve1-F 출구 = (FX+R, FY+R)
    // 끝: Curve2-F 입구 x=1340, y 계산
    const fP1x = FX + R;                                         // ≈697
    const fP1y = FY + R;                                         // ≈2288
    const fP2x = 1340;
    const fP2y = fP1y + (fP2x - fP1x) * Math.tan(0.04);        // ≈2314
    this.createPipe(fP1x, fP1y, fP2x, fP2y, { gap: GAP, color });

    // ── Curve2-F: 우향→하향 ──────────────────────────────────────────
    // center=(fP2x, fP2y+R) = (1340, fP2y+60)
    // arcStart=-π/2 (상단=fP2x좌표 입구), arcEnd=0 (우측=출구)
    // 입구: center+(R*cos(-π/2), R*sin(-π/2)) = (fP2x, fP2y) ← Pipe-F 끝 ✓
    // 출구: (fP2x+R, fP2y+R) = (1400, fP2y+R), 방향: 하향
    // skipOuterWall: outer arc(R=90)가 파이프 내부(X=1370~1430)를 관통하므로 제거
    const HALF   = GAP / 2;                // = 30
    const mergeY = fP2y + R;              // 두 curve2가 만나는 Y 좌표 (≈2374)
    this.createPipe(fP2x, mergeY, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: 0,
      gap: GAP, color, skipOuterWall: true,
    });
    // 마감벽 (ㅡ) — outer arc 제거로 열린 상단 빈공간을 수평선으로 밀봉
    // Y = fP2y - HALF (= Pipe-F 상단벽 끝 높이), X: fP2x → fP2x+R+HALF
    this.createFloor(fP2x, fP2y - HALF, fP2x + R + HALF, fP2y - HALF, color);

    // ═══════════════════════════════════════════════════════
    // SLOW 경로: 하향→좌향→하향 (S-커브로 중앙 X=1400 도달)
    // ═══════════════════════════════════════════════════════

    // ── Curve1-S: 하향→좌향 ──────────────────────────────────────────
    // center=(SX-R, SY), arcStart=0, arcEnd=π/2
    // 입구: (SX-R+R, SY) = (SX, SY) ← SLOW 수직파이프 하단 ✓
    // 출구: (SX-R, SY+R) ≈ (2103, 2288), 방향: 좌향
    this.createPipe(SX - R, SY, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: 0, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // ── Pipe-S: 좌향 경사 파이프 (slope 0.04 rad) ────────────────────
    // 시작: curve1-S 출구 = (SX-R, SY+R)
    // 끝: Curve2-S 입구 x=1460, y 계산
    // ∵ FY==SY, (fP2x-fP1x)==(sP1x-sP2x)=643 → sP2y==fP2y (대칭 보장)
    const sP1x = SX - R;                                         // ≈2103
    const sP1y = SY + R;                                         // ≈2288 (== fP1y)
    const sP2x = 1460;
    const sP2y = sP1y + (sP1x - sP2x) * Math.tan(0.04);        // ≈2314 (== fP2y)
    this.createPipe(sP1x, sP1y, sP2x, sP2y, { gap: GAP, color });

    // ── Curve2-S: 좌향→하향 ──────────────────────────────────────────
    // center=(sP2x, sP2y+R) = (1460, sP2y+60)
    // arcStart=-π/2 (상단=sP2x입구), arcEnd=-π (좌측=출구)
    // 입구: (sP2x, sP2y) ← Pipe-S 끝 ✓
    // 출구: (sP2x-R, sP2y+R) = (1400, sP2y+R) = (1400, mergeY) ← Curve2-F와 동일 수렴점 ✓
    // skipOuterWall: outer arc(R=90)가 파이프 내부(X=1370~1430)를 관통하므로 제거
    this.createPipe(sP2x, sP2y + R, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color, skipOuterWall: true,
    });
    // 마감벽 (ㅡ) — outer arc 제거로 열린 상단 빈공간을 수평선으로 밀봉
    // Y = sP2y - HALF, X: sP2x-R-HALF → sP2x
    this.createFloor(sP2x - R - HALF, sP2y - HALF, sP2x, sP2y - HALF, color);

    // ═══════════════════════════════════════════════════════
    // 합류 수직파이프 + 윈드밀
    // ═══════════════════════════════════════════════════════

    // ── 수직 슈트: mergeY → sec5ExitY ───────────────────────────────
    // FAST/SLOW curve2 모두 (1400, mergeY)에서 하향 출구 → 수직 파이프로 직결
    const MID_X   = 1400;
    const chuteY2 = mergeY + 110;   // ≈2484
    this.createPipe(MID_X, mergeY, MID_X, chuteY2, {
      direction: 'vertical', gap: GAP, color,
    });

    // ── 윈드밀 (수직 슈트 하단) ──────────────────────────────────────
    // 반지름 22 < GAP/2=30 → 날개~벽 간격 8px. 끼임방지: 간격 > 구슬반지름(10px)? ←
    // 8px < 10px이므로 r=20으로 설정: 간격=10px 정확히 → 경계에서 통과
    this.createWindmill(MID_X, chuteY2 - 30, 20, 4, 1.5);

    // ── 섹션 센서 + 출구 저장 ───────────────────────────────────────
    this.createSectionSensor(MID_X, mergeY + 40, GAP + 20, 30, 'sec5');
    this.sec5ExitX = MID_X;
    this.sec5ExitY = chuteY2;
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 6: 카오스 존 (Y: 1705 → 2290) — 통합 좌향 슬로프
  // ════════════════════════════════════════════════════════════════
  private buildSEC6(): void {
    // TODO: 파이프 기반 재구현 예정
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 7: 두 번째 분기 VORTEX/SPRINT (Y: 2270 → 2640)
  // ════════════════════════════════════════════════════════════════
  private buildSEC7(): void {
    // TODO: 파이프 기반 재구현 예정
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 8: 파이널 스프린트 (Y: 2640 → 2900)
  // ════════════════════════════════════════════════════════════════
  private buildSEC8(): void {
    // TODO: 파이프 기반 재구현 예정
  }

  // ─── Finish Line ─────────────────────────────

  private buildFinishLine(): void {
    // TODO: 파이프 기반 재구현 시 FINISH 센서 재배치 예정
  }

  // ─── Update Loop (graphics sync) ─────────────

  private setupUpdateLoop(): void {
    this.updateHandler = () => {
      for (const obs of this.obstacles) {
        const angle = obs.body.getAngle();
        obs.gfxContainer.rotation = angle;

        if (obs.type === 'hammer') {
          const jl = obs.body.getJointList();
          if (jl && jl.joint instanceof RevoluteJoint) {
            const rj = jl.joint;
            const a = obs.body.getAngle();
            const currentSpeed = rj.getMotorSpeed();
            if (a > 0.7 && currentSpeed > 0) rj.setMotorSpeed(-3.0);
            else if (a < -0.7 && currentSpeed < 0) rj.setMotorSpeed(3.0);
          }
        }
      }
    };
    this.physics.onBeforeUpdate(this.updateHandler);
  }

  // ─── Cleanup ──────────────────────────────────

  destroy(): void {
    for (const joint of this.joints) this.physics.destroyJoint(joint);
    this.joints.length = 0;
    for (const body of this.bodies) this.physics.removeBodies(body);
    this.bodies.length = 0;
    this.obstacles.length = 0;
    this.sectionSensors.length = 0;
    this.updateHandler = null;
    this.finishSensor = null;
  }
}
