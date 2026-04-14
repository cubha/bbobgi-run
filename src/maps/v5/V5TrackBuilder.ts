import { Container, Graphics, Text } from 'pixi.js';
import { PhysicsWorld, Vec2, BoxShape, type Body, type Joint } from '@core/PhysicsWorld';
import { RevoluteJoint } from 'planck';
import { COLORS, FONT_DISPLAY, SECTION_COLORS } from '@utils/constants';

// ─── V5 World Constants ─────────────────────────
export const V5_WORLD_W = 2200;
export const V5_WORLD_H = 6200; // SEC7 상대좌표화 → SPLIT2 +200 재정렬
export const V5_START_Y = 50;
export const V5_FINISH_Y = 5954; // SEC7 상대좌표화 → SPLIT2 +200 재정렬
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
  { name: 'SEC4: 분기1 FAST/SAFE', y1: 1230, y2: 2100 },
  { name: 'SEC5: 합류 S-커브', y1: 2228, y2: 2484 },
  { name: 'SEC6: 대형 윈드밀', y1: 2484, y2: 2900 },
  { name: 'SEC7: 카오스존', y1: 3100, y2: 3980 },
  { name: 'SEC-SPLIT2: VORTEX/SPRINT 분기', y1: 3980, y2: 5450 },
  { name: 'SEC8: 파이널 스프린트', y1: 5450, y2: 6200 },
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

  private sec5ExitX = 0;
  private sec5ExitY = 0;
  private sec6ExitX = 0;
  private sec6ExitY = 0;
  private sec7ExitY = 0;
  private split2ExitX = 0;
  private split2ExitY = 0;
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
    this.buildSPLIT2();
    this.buildSEC8();
    this.buildFinishLine();
    this.setupUpdateLoop();
  }

  getFinishSensor(): Body | null { return this.finishSensor; }
  getSectionSensors(): Array<{ label: string; body: Body }> { return this.sectionSensors; }
  getTrackBounds(): { minX: number; maxX: number } { return { minX: 10, maxX: V5_WORLD_W - 10 }; }
  getSec5Exit(): { x: number; y: number } { return { x: this.sec5ExitX, y: this.sec5ExitY }; }
  getSec6Exit(): { x: number; y: number } { return { x: this.sec6ExitX, y: this.sec6ExitY }; }

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

  /** Create a small windmill (kinematic body with N spokes) */
  private createWindmill(x: number, y: number, r: number, spokes: number, angVel: number, color: number): void {
    const spkThk = 8;
    const wheelBody = this.physics.createKinematicBody(x, y);
    this.bodies.push(wheelBody);
    for (let i = 0; i < spokes; i++) {
      const a = i * ((Math.PI * 2) / spokes);
      wheelBody.createFixture(
        new BoxShape(r, spkThk / 2, new Vec2(0, 0), a),
        { restitution: 0.4, friction: 0.3 },
      );
    }
    wheelBody.setAngularVelocity(angVel);

    const wheelGfx = new Container();
    wheelGfx.position.set(x, y);
    for (let i = 0; i < spokes; i++) {
      const a = i * ((Math.PI * 2) / spokes);
      const g = new Graphics();
      g.rect(-r, -spkThk / 2, r * 2, spkThk);
      g.fill({ color, alpha: 0.9 });
      g.rotation = a;
      wheelGfx.addChild(g);
    }
    const hub = new Graphics();
    hub.circle(0, 0, 10);
    hub.fill({ color: 0xffffff });
    hub.stroke({ width: 2, color: 0xaaaaaa });
    wheelGfx.addChild(hub);
    this.worldContainer.addChild(wheelGfx);
    this.obstacles.push({ body: wheelBody, gfxContainer: wheelGfx, type: 'windmill' });
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
    const RIGHT    = 2200;
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

    // 하단: 중앙 120px 구멍(x=1850~1970) 개방 → SEC4 GAP=120 파이프와 정합
    // 경사 바닥 — 좌우 끝점 y=BOT-20, 벽 꼭지점과 정합하여 라인 삐져나옴 방지
    this.createFloor(wallX, BOT - 20, 1850, BOT, color);     // 하단 좌측 — 경사 강화
    this.createFloor(1970, BOT, RIGHT, BOT - 20, color);     // 하단 우측 — 경사 강화 (RIGHT=2200)

    // ── 핀 배열 (SEC1과 동일 규격: r=8, x간격=52px, y간격=27px) ────
    // 핀 유효 구역: wallX~RIGHT 내 30px 이격, y=1110~1218
    // 짝수행(7핀): wallX+30, +82, +134, +186, +238, +290, +342
    // 홀수행(6핀): wallX+56, +108, +160, +212, +264, +316 (오프셋 +26)
    const EVEN_COLS = [wallX+30, wallX+82, wallX+134, wallX+186, wallX+238, wallX+290, wallX+342];
    const ODD_COLS  = [wallX+56, wallX+108, wallX+160, wallX+212, wallX+264, wallX+316];

    for (let row = 0; row < 5; row++) {
      const y = 1110 + row * 27;
      const cols = row % 2 === 0 ? EVEN_COLS : ODD_COLS;
      cols.forEach(x => this.createPin(x, y, 8));
    }

    // ── 섹션 센서 ──────────────────────────────────────────────────
    this.createSectionSensor(1980, 1190, 420, 40, 'sec3');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 4: 첫 번째 분기 FAST/SAFE (Y: 1160 → 1700)
  // ════════════════════════════════════════════════════════════════
  private buildSEC4(): void {
    const GAP  = 120;
    const R    = 80;
    const HALF = GAP / 2; // 60

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
    const R_conn = 80;  // GAP=120 → halfGap=60, innerR=R_conn-60≥20 보장
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

    // ── 3단계: 사각형 분기 챔버 (x:800~2000, y:1750~2100) ──────────
    // splitX=1400이 챔버 정중앙에 오도록 좌우 600px 대칭 (BRANCH_GAP=120에 맞게 확장)
    // 챔버 +200px 확장 → 핀존(5행) + 물레방아 수용
    const CHAMBER_L   = 800;
    const CHAMBER_R   = 2000;
    const CHAMBER_TOP = splitY;       // 1750
    const CHAMBER_BOT = splitY + 350; // 2100

    const inletL = splitX - HALF; // 1340 — 전환커브 입구 좌측 (GAP=120)
    const inletR = splitX + HALF; // 1460 — 전환커브 입구 우측 (GAP=120)

    // 상단: 입구(50px) 열고 좌/우 수평벽 (미세경사 +4px — 영구정지 방지)
    this.createFloor(CHAMBER_L, CHAMBER_TOP, inletL, CHAMBER_TOP + 4, 0x996600);
    this.createFloor(inletR, CHAMBER_TOP, CHAMBER_R, CHAMBER_TOP + 4, 0x996600);

    // 좌/우 수직벽 (CHAMBER_BOT=1900까지 — V자 바닥 영역에 출구 개방)
    this.createWall(CHAMBER_L, CHAMBER_TOP, CHAMBER_BOT, 0x996600);
    this.createWall(CHAMBER_R, CHAMBER_TOP, CHAMBER_BOT, 0x996600);

    // ── 4단계: 핀존(5행) + 물레방아 + 역V자 바닥 ────────────────────────
    const BRANCH_GAP  = 120;
    const BRANCH_R    = 80;
    const FAST_GAP    = BRANCH_GAP;
    const SLOW_GAP    = BRANCH_GAP;
    const FAST_R      = 80;
    const SLOW_R      = 80;
    const OVERLAP     = 8;

    // LEFT 출구 중심: x=1100, RIGHT 출구 중심: x=1700
    const LEFT_OUT_X  = 1100;
    const RIGHT_OUT_X = 1700;
    const OUT_HALF    = BRANCH_GAP / 2; // 60

    // 핀존: 5행 × x=1000~1800 (간격 80px), 행간 40px
    // 수평 엣지 간격: 80-16=64px > 20px(구슬직경) ✓, 수직: 40-16=24px > 20px ✓
    const PIN_EVEN_X = [1000,1080,1160,1240,1320,1400,1480,1560,1640,1720,1800];
    const PIN_ODD_X  = [1040,1120,1200,1280,1360,1440,1520,1600,1680,1760];
    for (let row = 0; row < 5; row++) {
      const py   = CHAMBER_TOP + 40 + row * 40; // 1790, 1830, 1870, 1910, 1950
      const cols = row % 2 === 0 ? PIN_EVEN_X : PIN_ODD_X;
      cols.forEach(px => this.createPin(px, py, 8, 0xffcc44));
    }

    // 물레방아: 산봉우리 직상부(x=1400, y=2025) — 핀존 통과 구슬 최종 분기
    // r=60, 6스포크, 엣지간격≈54.8px — 관성 방향과 무관한 랜덤 편향 제공
    this.createWindmill(splitX, CHAMBER_BOT - 75, 60, 6, 3.0, 0x996600);

    // 역V 바닥 4개: 좌벽→LEFT개구부 / 경사좌 / 경사우 / RIGHT개구부→우벽
    // 산봉우리: splitX=1400 (LEFT/RIGHT 중앙), 높이 30px (물레방아 하단 5px 이격)
    this.createFloor(CHAMBER_L, CHAMBER_BOT, LEFT_OUT_X - OUT_HALF, CHAMBER_BOT, 0x996600);
    this.createFloor(LEFT_OUT_X + OUT_HALF, CHAMBER_BOT, splitX, CHAMBER_BOT - 30, 0x996600);
    this.createFloor(splitX, CHAMBER_BOT - 30, RIGHT_OUT_X - OUT_HALF, CHAMBER_BOT, 0x996600);
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
    const fastEY = 2250; // CHAMBER_BOT +200 → 동일 하강각도 유지
    const fastAlpha = Math.atan2(fastEY - fastSY, fastEX - fastSX);
    const fastArcS  = fastAlpha + Math.PI / 2;
    const fastArcE  = Math.PI;
    const fastCx    = fastEX - FAST_R * Math.cos(fastArcS);
    const fastCy    = fastEY - FAST_R * Math.sin(fastArcS);
    // 사선: 시작점 15px 역방향 연장(커브 탄젠트 각도 불일치 ~12.8px 갭 제거) + 끝점 OVERLAP 연장
    const PIPE_OL = 15;
    this.createPipe(
      fastSX - PIPE_OL * Math.cos(fastAlpha),
      fastSY - PIPE_OL * Math.sin(fastAlpha),
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
    const slowEY = 2250; // CHAMBER_BOT +200 → 동일 하강각도 유지
    const slowAlpha = Math.atan2(slowEY - slowSY, slowEX - slowSX);
    const slowArcS  = slowAlpha - Math.PI / 2;
    const slowArcE  = 0;
    const slowCx    = slowEX - SLOW_R * Math.cos(slowArcS);
    const slowCy    = slowEY - SLOW_R * Math.sin(slowArcS);
    // 사선: 시작점 PIPE_OL 역방향 연장(FAST와 동일 패턴, SLOW 대칭) + 끝점 OVERLAP 연장
    this.createPipe(
      slowSX - PIPE_OL * Math.cos(slowAlpha),
      slowSY - PIPE_OL * Math.sin(slowAlpha),
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
    // sec4SlowY removed — FY==SY 수학적 보장으로 sec4FastY만 사용
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 5: FAST/SLOW 합류 S-커브 + 수직 슈트  (Y: sec4FastY → sec5ExitY)
  //
  //   FAST(X≈637) : Curve1(하→우) → 우향파이프 → Curve2(우→하, skipOuter) ─┐
  //                                                                         ├→ (1400, mergeY) → 수직슈트 → SEC6
  //   SLOW(X≈2163): Curve1(하→좌) → 좌향파이프 → Curve2(좌→하, skipOuter) ─┘
  //
  //   Curve2-F: center=(1340, fP2y+R), arcStart=-π/2, arcEnd=0  → exit (1400, mergeY)
  //   Curve2-S: center=(1460, sP2y+R), arcStart=-π/2, arcEnd=-π → exit (1400, mergeY)
  //   ∵ FY==SY → fP2y==sP2y → 두 Curve2 출구가 정확히 (1400, mergeY) 수렴
  // ════════════════════════════════════════════════════════════════
  private buildSEC5(): void {
    const R     = 80;   // GAP=120 → halfGap=60, innerR=20 (marable rolls in 120px channel)
    const GAP   = 120;
    const HALF  = GAP / 2;
    const color = 0x0088cc;

    const FX = this.sec4FastX;   // ≈637
    const FY = this.sec4FastY;   // ≈2228  (FY==SY 수학적 보장)
    const SX = this.sec4SlowX;  // ≈2163

    // ═══════════════════════════════════════════════════════
    // FAST 경로: 하향→우향→하향
    // ═══════════════════════════════════════════════════════

    // Curve1-F: center=(FX+R, FY), arcStart=π→π/2
    this.createPipe(FX + R, FY, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: Math.PI, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // Pipe-F: 우향 경사 (slope 0.04 rad)
    const fP1x = FX + R;
    const fP1y = FY + R;
    const fP2x = 1400 - R;  // Curve2-F exit=(fP2x+R, mergeY)=(1400, mergeY) ✓
    const fP2y = fP1y + (fP2x - fP1x) * Math.tan(0.04);
    this.createPipe(fP1x, fP1y, fP2x, fP2y, { gap: GAP, color });

    // Curve2-F: center=(fP2x, fP2y+R), arcStart=-π/2→0 (skipOuterWall)
    const mergeY = fP2y + R;
    this.createPipe(fP2x, mergeY, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: 0,
      gap: GAP, color, skipOuterWall: true,
    });
    this.createFloor(fP2x, fP2y - HALF, fP2x + R + HALF, fP2y - HALF, color);

    // ═══════════════════════════════════════════════════════
    // SLOW 경로: 하향→좌향→하향
    // ═══════════════════════════════════════════════════════

    // Curve1-S: center=(SX-R, FY), arcStart=0→π/2
    this.createPipe(SX - R, FY, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: 0, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // Pipe-S: 좌향 경사 (slope 0.04 rad, FY==SY → sP2y==fP2y 대칭 보장)
    const sP1x = SX - R;
    const sP1y = FY + R;
    const sP2x = 1400 + R;  // Curve2-S exit=(sP2x-R, mergeY)=(1400, mergeY) ✓
    const sP2y = sP1y + (sP1x - sP2x) * Math.tan(0.04);
    this.createPipe(sP1x, sP1y, sP2x, sP2y, { gap: GAP, color });

    // Curve2-S: center=(sP2x, sP2y+R), arcStart=-π/2→-π (skipOuterWall)
    this.createPipe(sP2x, sP2y + R, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color, skipOuterWall: true,
    });
    this.createFloor(sP2x - R - HALF, sP2y - HALF, sP2x, sP2y - HALF, color);

    // ═══════════════════════════════════════════════════════
    // 합류 수직 슈트 → SEC6 진입
    // ═══════════════════════════════════════════════════════
    const MID_X   = 1400;
    const chuteY2 = mergeY + 72;  // R=80: mergeY≈2412, +72 → sec5ExitY≈2484 유지

    this.createPipe(MID_X, mergeY, MID_X, chuteY2, {
      direction: 'vertical', gap: GAP, color,
    });

    this.createSectionSensor(MID_X, mergeY + 40, GAP + 20, 30, 'sec5');
    this.sec5ExitX = MID_X;
    this.sec5ExitY = chuteY2;
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 6: 대형 윈드밀 박스  (Y: sec5ExitY → sec6ExitY)
  //
  //   SEC4 챔버 진입 패턴과 동일 — 합류파이프가 박스 상단 중앙으로 직결
  //
  //  BOX_L ──────── [입구 1370~1430] ────────── BOX_R   ← BOX_TOP (sec5ExitY)
  //   │                                              │
  //   │          ⊕ 대형 윈드밀 R=150                 │   박스 내부: 윈드밀 지름 300px
  //   │            6-spoke, 1.0 rad/s               │   박스 폭 360px → 83% fill
  //   │                                              │
  //  BOX_L ──────── [출구 1370~1430] ────────── BOX_R   ← BOX_BOT
  //                        ↓ 수직파이프 → SEC7
  // ════════════════════════════════════════════════════════════════
  private buildSEC6(): void {
    const GAP   = 120;
    const HALF  = GAP / 2;   // 60 — 상단 개구부 MID_X±60 (SEC5 합류파이프 GAP=120과 정합)
    const color = 0xcc6600;

    const MID_X   = this.sec5ExitX;   // 1400
    const BOX_TOP = this.sec5ExitY;   // ≈2484

    // ── 박스 치수 ───────────────────────────────────────────────
    const R_W     = 150;               // 윈드밀 반지름
    const MARGIN  = 30;                // 살대 팁 ~ 벽 여유
    const spkLen  = R_W - 10;         // 140px (살대 길이)
    const BOX_L   = MID_X - spkLen - MARGIN;   // ≈1230
    const BOX_R   = MID_X + spkLen + MARGIN;   // ≈1570
    const BOX_H   = 2 * (R_W + MARGIN + 10);   // ≈380px
    const BOX_BOT = BOX_TOP + BOX_H;            // ≈2864

    const WX = MID_X;                  // 1400
    const WY = BOX_TOP + BOX_H / 2;   // ≈2674 (박스 수직 중앙)

    // ── 1) 상단 벽: 합류파이프 진입구(MID_X±30) 개방 ─────────
    this.createFloor(BOX_L, BOX_TOP, MID_X - HALF, BOX_TOP, color);
    this.createFloor(MID_X + HALF, BOX_TOP, BOX_R, BOX_TOP, color);

    // ── 2) 좌/우 외벽 ─────────────────────────────────────────
    this.createWall(BOX_L, BOX_TOP, BOX_BOT, color);
    this.createWall(BOX_R, BOX_TOP, BOX_BOT, color);

    // ── 3) 하단 벽: 출구(MID_X±60) 개방 — SEC3 패턴 경사각으로 중앙 유도 ──
    this.createFloor(BOX_L, BOX_BOT - 20, MID_X - 60, BOX_BOT, color);
    this.createFloor(MID_X + 60, BOX_BOT, BOX_R, BOX_BOT - 20, color);

    // ── 4) 대형 윈드밀 (림 없음, 6-spoke) ────────────────────
    //   살대 간격 ≈ (2π×140/6) ≈ 147px ≫ 구슬 지름 20px → 자유 통과
    //   지름 300px / 박스 폭 340px ≈ 88% fill ("거의 꽉차도록")
    const SPOKE  = 6;
    const spkThk = 12;
    const wheelBody = this.physics.createKinematicBody(WX, WY);
    this.bodies.push(wheelBody);
    for (let i = 0; i < SPOKE; i++) {
      const a = i * ((Math.PI * 2) / SPOKE);
      wheelBody.createFixture(
        new BoxShape(spkLen, spkThk / 2, new Vec2(0, 0), a),
        { restitution: 0.3, friction: 0.5 },
      );
    }
    wheelBody.setAngularVelocity(1.0);

    // 윈드밀 그래픽
    const wheelGfx = new Container();
    wheelGfx.position.set(WX, WY);
    for (let i = 0; i < SPOKE; i++) {
      const a = i * ((Math.PI * 2) / SPOKE);
      const g = new Graphics();
      g.rect(-spkLen, -spkThk / 2, spkLen * 2, spkThk);
      g.fill({ color: COLORS.orange, alpha: 0.9 });
      g.rotation = a;
      wheelGfx.addChild(g);
    }
    const hub = new Graphics();
    hub.circle(0, 0, 18);
    hub.fill({ color: 0xffffff });
    hub.stroke({ width: 3, color: 0xaaaaaa });
    wheelGfx.addChild(hub);
    this.worldContainer.addChild(wheelGfx);
    this.obstacles.push({ body: wheelBody, gfxContainer: wheelGfx, type: 'windmill' });

    // ── 5) 출구 수직 파이프 + 섹션 센서 ─────────────────────
    // BOX_BOT≈2864, EXIT_Y2=2894; +8 OVERLAP → SEC7 Curve1 진입
    const EXIT_Y2 = BOX_BOT + 30;
    this.createPipe(MID_X, BOX_BOT, MID_X, EXIT_Y2 + 8, {
      direction: 'vertical', gap: 120, color,
    });
    this.createSectionSensor(WX, WY, GAP + 20, 40, 'sec6');
    this.sec6ExitX = MID_X;
    this.sec6ExitY = EXIT_Y2;
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 7: 카오스존 — 커브 파이프 연결  (Y: ≈2894 → ≈3774)
  //
  //  GAP=120, R=120 — 전체 섹션 통일
  //
  //  [SEC6 수직출구 (1400,2894)]
  //    ↓ Curve1 (DOWN→LEFT): center=(1280,2894), 0→π/2
  //  [CH1 경사관 (1280,3014→270,3084)] + 장애물
  //    ↓ Curve2 (LEFT→DOWN): center=(270,3204), -π/2→-π
  //  [수직낙하 (150,3204→3334)]
  //    ↓ Curve3 (DOWN→RIGHT): center=(270,3334), π→π/2
  //  [CH2 경사관 (270,3454→1640,3534)] + 장애물
  //    ↓ Curve4 U-턴 (RIGHT→LEFT): center=(1640,3654), -π/2→π/2
  //  [SPLIT2 입구 (1640,3774)]
  //
  // ════════════════════════════════════════════════════════════════
  private buildSEC7(): void {
    const GAP     = 120;
    const R       = 120;
    const OVERLAP = 20;  // 커브-파이프 접점 각도 불일치(~4°) 갭 제거
    const color   = 0xcc2222;
    const B       = this.sec6ExitY;  // 동적 기준점 — SEC6 수직출구 Y (≈3094)

    // ── Curve1: SEC6 수직출구 → CH1 (DOWN→LEFT) ──────────────────
    // center=(1400-R, B) = (1280, B), arcStart=0, arcEnd=π/2
    // entry:(1400,B) ← SEC6 출구 ✓, exit:(1280,B+R)=(1280,B+120) ✓
    this.createPipe(1400 - R, B, 0, 0, {
      direction: 'curve', arcRadius: R, arcStart: 0, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // ── CH1: 우→좌 하강 파이프 (1280,B+120→270,B+190) ──────────
    const ch1Alpha = Math.atan2((B + 190) - (B + 120), 270 - 1280);  // atan2(70,-1010)
    this.createPipe(
      Math.round(1280 - OVERLAP * Math.cos(ch1Alpha)),
      Math.round((B + 120) - OVERLAP * Math.sin(ch1Alpha)),
      Math.round(270  + OVERLAP * Math.cos(ch1Alpha)),
      Math.round((B + 190) + OVERLAP * Math.sin(ch1Alpha)),
      { gap: GAP, color },
    );

    const ch1CY = (x: number) => (B + 120) + 70 * (1280 - x) / 1010;
    this.createWindmill(1100, ch1CY(1100), 48, 4,  2.5, color);
    this.createSeesaw(750, ch1CY(750) + 5, 100);
    this.createWindmill(400, ch1CY(400),  48, 4, -2.5, color);

    // ── Curve2: CH1 → 수직낙하 (LEFT→DOWN) ───────────────────────
    // center=(270, B+310), arcStart=-π/2, arcEnd=-π
    // entry:(270,B+190) LEFT ✓, exit:(150,B+310) DOWN ✓
    this.createPipe(270, B + 310, 0, 0, {
      direction: 'curve', arcRadius: R, arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color,
    });

    // ── 수직 낙하 (150, B+310→B+440) — 양 끝 OVERLAP 연장 ───────
    this.createPipe(150, B + 310 - OVERLAP, 150, B + 440 + OVERLAP, { direction: 'vertical', gap: GAP, color });

    // ── Curve3: 수직낙하 → CH2 (DOWN→RIGHT) ──────────────────────
    // center=(270, B+440), arcStart=π, arcEnd=π/2
    // entry:(150,B+440) DOWN ✓, exit:(270,B+560) RIGHT ✓
    this.createPipe(270, B + 440, 0, 0, {
      direction: 'curve', arcRadius: R, arcStart: Math.PI, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // ── CH2: 좌→우 하강 파이프 (270,B+560→1640,B+640) — 양 끝 OVERLAP 연장
    const ch2Alpha = Math.atan2((B + 640) - (B + 560), 1640 - 270);  // atan2(80,1370)
    this.createPipe(
      Math.round(270  - OVERLAP * Math.cos(ch2Alpha)),
      Math.round((B + 560) - OVERLAP * Math.sin(ch2Alpha)),
      Math.round(1640 + OVERLAP * Math.cos(ch2Alpha)),
      Math.round((B + 640) + OVERLAP * Math.sin(ch2Alpha)),
      { gap: GAP, color },
    );

    const ch2CY = (x: number) => (B + 560) + 80 * (x - 270) / 1370;
    this.createSeesaw(600, ch2CY(600) + 5, 100);
    this.createWindmill(1200, ch2CY(1200), 48, 4, 2.0, color);

    // ── Curve4: CH2 → SPLIT2 입구 U-턴 (RIGHT→DOWN) ─────────────
    // center=(1640, B+760), arcStart=-π/2, arcEnd=π/2 (180° 반원, 우측으로 볼록)
    // entry:(1640,B+640) ✓, exit:(1640,B+880) ✓
    this.createPipe(1640, B + 760, 0, 0, {
      direction: 'curve', arcRadius: R, arcStart: -Math.PI / 2, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    this.createSectionSensor(180, B + 375, 60, 60, 'sec7');
    this.sec7ExitY = B + 880;
  }

  // ════════════════════════════════════════════════════════════════
  // SEC-SPLIT2: VORTEX/SPRINT 두 번째 분기 (Y: 3774 → 5034)
  // GAP=120, R=120, 중앙 X=1100
  //
  //  [진입] Curve4 U-턴 출구(1640,3774) 좌향 (GAP=120 통일)
  //    → 좌향파이프(1640,3774→1220,3814) GAP=120
  //    → LEFT→DOWN 커브: center=(1220,3934), R=120, exit(1100,3934) DOWN
  //    → 수직파이프(1100,3934→4074) GAP=120
  //
  //  [챔버] X=200~2000, Y=4074~4274
  //    상단개구: X=1040~1160 (수직파이프 진입)
  //    하단개구: VORTEX X=590~710, SPRINT X=1490~1610
  //
  //  [VORTEX] S-커브 2단 (파란색, GAP=120)
  //    (650,4274) DOWN→LEFT center=(530,4274) → pipe(530,4394→250,4474)
  //    LEFT→DOWN center=(250,4594) → vertical(130,4594→4714)
  //    DOWN→RIGHT center=(250,4714) → pipe(250,4834→980,4914)
  //    RIGHT→DOWN merge center=(980,5034) skipOuter → exit(1100,5034)
  //
  //  [SPRINT] 직선+windmill (주황색, GAP=120)
  //    (1550,4274) DOWN→RIGHT center=(1670,4274) → pipe(1670,4394→1950,4474)+windmill
  //    RIGHT→DOWN center=(1950,4594) → vertical(2070,4594→4714)
  //    DOWN→LEFT center=(1950,4714) → pipe(1950,4834→1220,4914)
  //    LEFT→DOWN merge center=(1220,5034) skipOuter → exit(1100,5034)
  //
  //  split2ExitX=1100, split2ExitY=5034
  // ════════════════════════════════════════════════════════════════
  private buildSPLIT2(): void {
    const GAP     = 120;
    const R       = 120;
    const PIPE_OL = 20;    // 커브-파이프 탄젠트 불일치 갭 제거 (SEC7 OVERLAP=20 동일 기준)
    const color   = 0x9922cc; // 보라색 (진입 챔버)
    const S7      = this.sec7ExitY;  // 동적 기준점 — SEC7 Curve4 U-턴 출구 Y (≈3974)

    // ── 진입 전환: 좌향파이프(GAP=120) → LEFT→DOWN(GAP=120) → 수직 ──
    // Curve4 출구(1640, S7)부터 GAP=120 통일, OVERLAP=8
    const entryAlpha = Math.atan2((S7 + 40) - S7, 1220 - 1640);  // atan2(40,-420)
    this.createPipe(
      Math.round(1640 - 8 * Math.cos(entryAlpha)),
      Math.round(S7   - 8 * Math.sin(entryAlpha)),
      Math.round(1220 + 8 * Math.cos(entryAlpha)),
      Math.round((S7 + 40) + 8 * Math.sin(entryAlpha)),
      { gap: GAP, color },
    );

    // LEFT→DOWN: center=(1220, S7+160), R=120, arcStart=-π/2, arcEnd=-π
    // entry:(1220, S7+40) LEFT ✓, exit:(1100, S7+160) DOWN ✓
    this.createPipe(1220, S7 + 160, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color,
    });

    // 수직파이프: (1100, S7+160 → S7+300)
    this.createPipe(1100, S7 + 160, 1100, S7 + 300, { direction: 'vertical', gap: GAP, color });

    // ── 챔버: X=200~2000, Y=(S7+300)~(S7+700) ────────────────────
    // 상단벽: 진입구 X=1040~1160 개방 (수직파이프 halfGap=60 기준)
    this.createFloor(200,  S7 + 300, 1040, S7 + 304, color);
    this.createFloor(1160, S7 + 300, 2000, S7 + 304, color);
    this.createWall(200,  S7 + 300, S7 + 700, color);
    this.createWall(2000, S7 + 300, S7 + 700, color);

    // 핀존: 5행 × x=600~1600 (간격 100px), 행간 40px
    // 수평 엣지 간격: 100-16=84px > 20px ✓, 수직: 40-16=24px > 20px ✓
    const SP2_PIN_EVEN_X = [600,700,800,900,1000,1100,1200,1300,1400,1500,1600];
    const SP2_PIN_ODD_X  = [650,750,850,950,1050,1150,1250,1350,1450,1550];
    for (let row = 0; row < 5; row++) {
      const py   = S7 + 326 + row * 40; // S7+326, S7+366, S7+406, S7+446, S7+486
      const cols = row % 2 === 0 ? SP2_PIN_EVEN_X : SP2_PIN_ODD_X;
      cols.forEach(px => this.createPin(px, py, 8, 0xffcc44));
    }

    // 물레방아: 산봉우리 직상부(x=1100, y=S7+606) — 역방향 회전으로 SEC4와 차별화
    this.createWindmill(1100, S7 + 606, 60, 6, -2.5, color);

    // 하단 V자 경사: x=1100 산봉우리(40px) — VORTEX 개구(590~710), SPRINT 개구(1490~1610)
    this.createFloor(200,  S7 + 700, 590,  S7 + 704, color);   // 좌측 평바닥
    this.createFloor(710,  S7 + 700, 1100, S7 + 660, color);   // 좌→산봉우리
    this.createFloor(1100, S7 + 660, 1490, S7 + 700, color);   // 산봉우리→우
    this.createFloor(1610, S7 + 700, 2000, S7 + 704, color);   // 우측 평바닥

    // ── VORTEX 경로 (파란색, GAP=120) ─────────────────────────────
    // 개구 중심: X=650, 하단 Y=S7+700

    // DOWN→LEFT: center=(530, S7+700), R=120, arcStart=0, arcEnd=π/2
    // entry:(650, S7+700) DOWN ✓, exit:(530, S7+820) LEFT ✓
    this.createPipe(530, S7 + 700, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: 0, arcEnd: Math.PI / 2,
      gap: GAP, color: 0x2299ff,
    });

    // 좌향파이프: (530,S7+820→250,S7+900) + PIPE_OL 양단 연장
    const vP1Alpha = Math.atan2((S7 + 900) - (S7 + 820), 250 - 530);  // atan2(80,-280) — slight downward
    this.createPipe(
      Math.round(530  - PIPE_OL * Math.cos(vP1Alpha)),
      Math.round((S7 + 820) - PIPE_OL * Math.sin(vP1Alpha)),
      Math.round(250  + PIPE_OL * Math.cos(vP1Alpha)),
      Math.round((S7 + 900) + PIPE_OL * Math.sin(vP1Alpha)),
      { gap: GAP, color: 0x2299ff });

    // LEFT→DOWN: center=(250, S7+1020), R=120, arcStart=-π/2, arcEnd=-π
    // entry:(250, S7+900) LEFT ✓, exit:(130, S7+1020) DOWN ✓
    this.createPipe(250, S7 + 1020, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color: 0x2299ff,
    });

    // 수직파이프: (130, S7+1020→S7+1140)
    this.createPipe(130, S7 + 1020, 130, S7 + 1140, { direction: 'vertical', gap: GAP, color: 0x2299ff });

    // DOWN→RIGHT: center=(250, S7+1140), R=120, arcStart=π, arcEnd=π/2
    // entry:(130, S7+1140) DOWN ✓, exit:(250, S7+1260) RIGHT ✓
    this.createPipe(250, S7 + 1140, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: Math.PI, arcEnd: Math.PI / 2,
      gap: GAP, color: 0x2299ff,
    });

    // 우향파이프: (250,S7+1260→980,S7+1340) + PIPE_OL 양단 연장
    const vP2Alpha = Math.atan2((S7 + 1340) - (S7 + 1260), 980 - 250);  // atan2(80,730)
    this.createPipe(
      Math.round(250  - PIPE_OL * Math.cos(vP2Alpha)),
      Math.round((S7 + 1260) - PIPE_OL * Math.sin(vP2Alpha)),
      Math.round(980  + PIPE_OL * Math.cos(vP2Alpha)),
      Math.round((S7 + 1340) + PIPE_OL * Math.sin(vP2Alpha)),
      { gap: GAP, color: 0x2299ff });

    // VORTEX merge: RIGHT→DOWN, skipOuterWall
    // center=(980, S7+1460), arcStart=-π/2, arcEnd=0
    // entry:(980, S7+1340) RIGHT ✓, exit:(1100, S7+1460) DOWN ✓
    this.createPipe(980, S7 + 1460, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: 0,
      gap: GAP, color: 0x2299ff, skipOuterWall: true,
    });
    // outer arc 생략으로 생기는 상단 공백 메꿈
    this.createFloor(980, S7 + 1460 - R - GAP / 2, 980 + R + GAP / 2, S7 + 1460 - R - GAP / 2, 0x2299ff);

    // ── SPRINT 경로 (주황색, GAP=120) ─────────────────────────────
    // 개구 중심: X=1550, 하단 Y=S7+700

    // DOWN→RIGHT: center=(1670, S7+700), R=120, arcStart=π, arcEnd=π/2
    // entry:(1550, S7+700) DOWN ✓, exit:(1670, S7+820) RIGHT ✓
    this.createPipe(1670, S7 + 700, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: Math.PI, arcEnd: Math.PI / 2,
      gap: GAP, color: 0xff8800,
    });

    // 우향파이프: (1670,S7+820→1950,S7+900) + PIPE_OL 양단 연장
    const sP1Alpha = Math.atan2((S7 + 900) - (S7 + 820), 1950 - 1670);  // atan2(80,280)
    this.createPipe(
      Math.round(1670 - PIPE_OL * Math.cos(sP1Alpha)),
      Math.round((S7 + 820) - PIPE_OL * Math.sin(sP1Alpha)),
      Math.round(1950 + PIPE_OL * Math.cos(sP1Alpha)),
      Math.round((S7 + 900) + PIPE_OL * Math.sin(sP1Alpha)),
      { gap: GAP, color: 0xff8800 });
    // windmill Y at X=1810: S7+820 + (S7+900-S7-820)*(1810-1670)/(1950-1670) = S7+820+40 = S7+860
    this.createWindmill(1810, S7 + 860, 48, 4, 2.5, 0xff8800);

    // RIGHT→DOWN: center=(1950, S7+1020), R=120, arcStart=-π/2, arcEnd=0
    // entry:(1950, S7+900) RIGHT ✓, exit:(2070, S7+1020) DOWN ✓
    this.createPipe(1950, S7 + 1020, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: 0,
      gap: GAP, color: 0xff8800,
    });

    // 수직파이프: (2070, S7+1020→S7+1140)
    this.createPipe(2070, S7 + 1020, 2070, S7 + 1140, { direction: 'vertical', gap: GAP, color: 0xff8800 });

    // DOWN→LEFT: center=(1950, S7+1140), R=120, arcStart=0, arcEnd=π/2
    // entry:(2070, S7+1140) DOWN ✓, exit:(1950, S7+1260) LEFT ✓
    this.createPipe(1950, S7 + 1140, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: 0, arcEnd: Math.PI / 2,
      gap: GAP, color: 0xff8800,
    });

    // 좌향파이프: (1950,S7+1260→1220,S7+1340) + PIPE_OL 양단 연장
    const sP2Alpha = Math.atan2((S7 + 1340) - (S7 + 1260), 1220 - 1950);  // atan2(80,-730)
    this.createPipe(
      Math.round(1950 - PIPE_OL * Math.cos(sP2Alpha)),
      Math.round((S7 + 1260) - PIPE_OL * Math.sin(sP2Alpha)),
      Math.round(1220 + PIPE_OL * Math.cos(sP2Alpha)),
      Math.round((S7 + 1340) + PIPE_OL * Math.sin(sP2Alpha)),
      { gap: GAP, color: 0xff8800 });

    // SPRINT merge: LEFT→DOWN, skipOuterWall
    // center=(1220, S7+1460), arcStart=-π/2, arcEnd=-π
    // entry:(1220, S7+1340) LEFT ✓, exit:(1100, S7+1460) DOWN ✓
    this.createPipe(1220, S7 + 1460, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color: 0xff8800, skipOuterWall: true,
    });
    // outer arc 생략으로 생기는 상단 공백 메꿈
    this.createFloor(1220 - R - GAP / 2, S7 + 1460 - R - GAP / 2, 1220, S7 + 1460 - R - GAP / 2, 0xff8800);

    // ── 섹션 센서 + 출구 저장 ─────────────────────────────────────
    this.createSectionSensor(1100, S7 + 390, 120, 40, 'sec-split2');
    this.split2ExitX = 1100;
    this.split2ExitY = S7 + 1460;  // VORTEX/SPRINT merge 출구 Y
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 8: 파이널 스프린트 (Y: split2ExitY → V5_FINISH_Y)
  // GAP=120, R=120
  //
  //  split2ExitX/Y = (1100,5434) ← SPLIT2 merge 출구 (SEC7 상대좌표화 반영)
  //
  //  [연결수직] (1100,5434→5554)
  //  [DOWN→LEFT] center=(980,5554), exit(980,5674) LEFT
  //  [파이널스프린트 채널] (980,5674→360,5754) + 시소
  //  [LEFT→DOWN] Curve5: center=(360,5874), exit(240,5874) DOWN
  //  [수직낙하] (240,5874→5954) → FINISH (Y=5954)
  // ════════════════════════════════════════════════════════════════
  private buildSEC8(): void {
    const GAP   = 120;
    const R     = 120;
    const color = 0xffaa00;

    const EX = this.split2ExitX;  // 1100
    const EY = this.split2ExitY;  // ≈5434 (동적 — SEC7 상대좌표화 반영)

    // ── 연결 수직: merge 출구 → sprint 입구 커브 ─────────────────
    this.createPipe(EX, EY, EX, EY + R, { direction: 'vertical', gap: GAP, color });

    // ── DOWN→LEFT: 수직낙하 → 파이널 스프린트 ─────────────────────
    // center=(EX-R, EY+R)=(980,4860), arcStart=0, arcEnd=π/2 (CCW)
    // entry:(1100,4860) DOWN ✓, exit:(980,4980) LEFT ✓
    this.createPipe(EX - R, EY + R, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: 0, arcEnd: Math.PI / 2,
      gap: GAP, color,
    });

    // ── 파이널 스프린트 채널: 우→좌 (980,4980→360,5060) ──────────
    const sprintSX = EX - R;        // 980
    const sprintSY = EY + 2 * R;    // 4980
    const sprintEX = 360;
    const sprintEY = sprintSY + 80; // 5060
    this.createPipe(sprintSX, sprintSY, sprintEX, sprintEY, { gap: GAP, color });

    const sprintCY = (x: number) =>
      sprintSY + (sprintEY - sprintSY) * (sprintSX - x) / (sprintSX - sprintEX);
    this.createSeesaw(Math.round((sprintSX + sprintEX) / 2), sprintCY(Math.round((sprintSX + sprintEX) / 2)) + 5, 60);

    // ── Curve5: 파이널스프린트 → 피니시 수직낙하 (LEFT→DOWN) ──────
    // center=(sprintEX, sprintEY+R)=(360,5180), arcStart=-π/2, arcEnd=-π
    // entry:(360,5180-120)=(360,5060) LEFT ✓, exit:(360-120,5180)=(240,5180) DOWN ✓
    this.createPipe(sprintEX, sprintEY + R, 0, 0, {
      direction: 'curve', arcRadius: R,
      arcStart: -Math.PI / 2, arcEnd: -Math.PI,
      gap: GAP, color,
    });

    // ── 수직 낙하 → FINISH (240,5180→5260) ───────────────────────
    this.createPipe(240, sprintEY + R, 240, V5_FINISH_Y, {
      direction: 'vertical', gap: GAP, color,
    });

    this.createSectionSensor(Math.round((sprintSX + sprintEX) / 2), sprintSY + 20, 200, 40, 'sec8');
  }

  // ─── Finish Line ─────────────────────────────

  private buildFinishLine(): void {
    // 피니시 센서: 수직 낙하 파이프 내부, V5_FINISH_Y=5260 지점
    const finishX = 240;
    const finishY = V5_FINISH_Y; // 5260

    this.finishSensor = this.physics.createSensor(finishX, finishY, 60, 30, 'finish');
    this.bodies.push(this.finishSensor);

    // FINISH 시각화 (노란색 라인 + 텍스트)
    const line = new Graphics();
    line.rect(finishX - 35, finishY - 3, 70, 6);
    line.fill({ color: 0xffdd00, alpha: 0.9 });
    this.worldContainer.addChild(line);

    const label = new Text({
      text: 'FINISH',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: 0xffdd00, fontWeight: 'bold' },
    });
    label.anchor.set(0.5, 1);
    label.x = finishX;
    label.y = finishY - 8;
    this.worldContainer.addChild(label);
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
