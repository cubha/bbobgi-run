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
    this.buildTestPipe();
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
      const outerBody = this.physics.createChain(outerPts, false, 0.01);
      this.bodies.push(outerBody); walls.push(outerBody);

      // 내부 채널 배경 (도넛 섹터)
      const gFill = new Graphics();
      gFill.moveTo(cx + innerR * Math.cos(arcStart), cy + innerR * Math.sin(arcStart));
      gFill.arc(cx, cy, innerR, arcStart, arcEnd);
      gFill.lineTo(cx + outerR * Math.cos(arcEnd), cy + outerR * Math.sin(arcEnd));
      gFill.arc(cx, cy, outerR, arcEnd, arcStart, true);
      gFill.closePath();
      gFill.fill({ color: 0x1a1a2e, alpha: 0.25 });
      this.worldContainer.addChild(gFill);

      // 내벽/외벽 스트로크
      const gInner = new Graphics();
      gInner.moveTo(innerPts[0].x, innerPts[0].y);
      for (let i = 1; i < innerPts.length; i++) gInner.lineTo(innerPts[i].x, innerPts[i].y);
      gInner.stroke({ width: V5_FLOOR_THICK, color, alpha: 0.9 });
      this.worldContainer.addChild(gInner);

      const gOuter = new Graphics();
      gOuter.moveTo(outerPts[0].x, outerPts[0].y);
      for (let i = 1; i < outerPts.length; i++) gOuter.lineTo(outerPts[i].x, outerPts[i].y);
      gOuter.stroke({ width: V5_FLOOR_THICK, color, alpha: 0.9 });
      this.worldContainer.addChild(gOuter);

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
    // 출구 폭 240px (x:920~1160), 하단 y=300
    this.createFloor(600, 80, 920, 300, 0x3366ff);    // 좌측 경사벽
    this.createFloor(1480, 80, 1160, 300, 0x3366ff);  // 우측 경사벽

    // ── 구간B: 핀존 ───────────────────────────────
    // 좌우벽: 깔때기 하단(y=300) ~ 핀존 하단(y=380)
    this.createWall(920, 300, 380);    // 좌벽: x=920, y=300~380
    this.createWall(1160, 300, 380);   // 우벽: x=1160, y=300~380

    // 핀 12개 (간격 52px, r=8 — 4/4/4 배치)
    this.createPin(960, 320, 8);    // 1행
    this.createPin(1012, 320, 8);
    this.createPin(1064, 320, 8);
    this.createPin(1116, 320, 8);
    this.createPin(986, 347, 8);    // 2행 (오프셋)
    this.createPin(1038, 347, 8);
    this.createPin(1090, 347, 8);
    this.createPin(1142, 347, 8);
    this.createPin(960, 374, 8);    // 3행
    this.createPin(1012, 374, 8);
    this.createPin(1064, 374, 8);
    this.createPin(1116, 374, 8);

    // ── 구간C: 수직 통로 → SEC2 자유낙하 ──────────
    // 좌벽 x=920, 우벽 x=1160, y=380~470, 하단 열림
    this.createPipe(1040, 380, 1040, 470, { direction: 'vertical', gap: 240 });

    // Section 1 sensor
    this.createSectionSensor(1040, 350, 240, 120, 'sec1');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 2: S-채널 3단 (Y: 370 → 770)
  // ════════════════════════════════════════════════════════════════
  private buildSEC2(): void {
    // SEC2: 단일 경사로 (캐치벽 없음) — 9개 마블 동시 통과
    // (900,350) → (1775,770): 플링코 중앙 위에서 끝남
    // 마블이 경사 끝에서 자연 비행 → SEC3 플링코 우측벽 충돌 → 플링코 진입
    this.createFloor(900, 350, 1775, 770, 0x336633);
    this.createWall(900, 300, 780);        // 좌측 경계벽

    // sec2 센서: x=1100, 마블 중심 y≈434
    // (1100에서 y_floor=446, surface=443, marble_center=443-cos(25°)*10≈434)
    this.createSectionSensor(1100, 434, 200, 40, 'sec2');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 3: 플링코 보드 (Y: 760 → 1310)
  // ════════════════════════════════════════════════════════════════
  private buildSEC3(): void {
    // 넓은 플링코 (x=800~1950, 1150px — 9마블 동시 수용)
    // 진입 가이드
    this.createFloor(680, 720, 800, 840, 0x663366);    // 좌측 진입 가이드
    this.createFloor(2080, 720, 1950, 840, 0x663366);  // 우측 진입 가이드

    // 좌우 경계벽 (y=840→1310, 펀치 없이 SEC4 합류점까지 연장)
    this.createWall(800, 840, 1310);
    this.createWall(1950, 840, 1310);

    // 핀 배열: 5줄, 1150px 폭에 넓은 간격 (T-07 셔플용 랜덤성 유지)
    for (let row = 0; row < 5; row++) {
      const cols = row % 2 === 0 ? 8 : 7;
      const startX = row % 2 === 0 ? 870 : 940;
      const y = 880 + row * 50;
      for (let col = 0; col < cols; col++) {
        this.createPin(startX + col * 145, y, 5);
      }
    }

    // 하단: 직접 SEC4 합류 깔때기로 수렴 (별도 슬로프 없음 — buildSEC4에 통합)

    // Section 3 sensor (플링코 전폭 — x=800~1950 커버)
    this.createSectionSensor(1375, 1000, 1100, 80, 'sec3');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 4: 첫 번째 분기 FAST/SAFE (Y: 1160 → 1700)
  // ════════════════════════════════════════════════════════════════
  private buildSEC4(): void {
    // 진입 깔때기 (플링코 벽 하단 y=1160에서 직접 시작)
    this.createFloor(800, 1160, 1060, 1310, 0x996600);
    this.createFloor(1950, 1160, 1140, 1310, 0x996600);

    // 분기 핀
    this.createPin(1100, 1320, 8, 0xffff00);

    // FAST 경로 (좌측 경사) — 슈트 없음, 넓은 개방 출구
    this.createFloor(1060, 1325, 620, 1540, 0xff4444);
    this.createWall(1065, 1310, 1340);
    this.createPin(880, 1400, 5);
    this.createPin(770, 1450, 5);

    // SAFE 경로 (우측 경사) — 슈트 없음, x=1540에서 종료 (컨테이너 우벽 내부)
    this.createFloor(1140, 1325, 1540, 1530, 0x44aa44);
    this.createWall(1135, 1310, 1340);
    this.createSeesaw(1350, 1430, 80);

    // 컨테이너 벽: 우벽=x=1555 (SEC5 바닥 우끝과 일치 → 갭 없음)
    this.createWall(610, 1525, 1705);   // 좌측 컨테이너 벽
    this.createWall(1555, 1525, 1705);  // 우측 컨테이너 벽 (SEC5 바닥 우끝 x=1555 정렬)

    // Section 4 sensors
    this.createSectionSensor(1100, 1350, 200, 30, 'sec4');
    this.createSectionSensor(830, 1450, 200, 30, 'sec4-fast');
    this.createSectionSensor(1380, 1450, 200, 30, 'sec4-safe');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 5: 자유낙하 구간 (Y: 1700 → 1705, 컨테이너 출구 센서만)
  // ════════════════════════════════════════════════════════════════
  private buildSEC5(): void {
    // 마블이 컨테이너(x=610-1555, y=1525-1700)에서 자유낙하
    // 바닥/슬로프 없이 SEC6 통합 슬로프로 직결
    // Section 5 sensor: 컨테이너 하단 출구 전체 커버 (모든 마블 통과)
    this.createSectionSensor(1082, 1715, 945, 40, 'sec5');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 6: 카오스 존 (Y: 1705 → 2290) — 통합 좌향 슬로프
  // ════════════════════════════════════════════════════════════════
  private buildSEC6(): void {
    // 통합 슬로프: 컨테이너 우측 출구(1555,1705) → 수직 낙하 입구(345,1970)
    // 경사 12.4° 좌향 하강 — FAST(x≈700) / SAFE(x≈1540) 자연 스태거 발생
    // 중력이 좌측 방향으로 작용 → 우측 캐치벽 없음, 파일업 불발생
    this.createFloor(1555, 1705, 345, 1970, 0x662200);
    // 좌측 경계벽 (y=1700 ~ 2120): 고속 마블이 슬로프 좌끝(345,1970) 뚫는 것 방지
    this.createWall(345, 1700, 2120);
    // 우측 경계벽 (x=1555, y=1705~2250): 슬로프 우끝 이탈 방지
    this.createWall(1555, 1705, 2250);

    // 수직 낙하 구간 (폭 200px — 9마블 충분 수용)
    this.createWall(545, 1970, 2120);

    // CH2: 좌→우 하강 → SEC7 (catch wall 없음 — 우끝에서 자연낙하로 SEC7 깔때기 진입)
    this.createFloor(345, 2120, 1100, 2250, 0x662200);

    // Section 6 sensor (통합 슬로프 좌측 하단 — 모든 마블 통과)
    this.createSectionSensor(700, 1882, 300, 30, 'sec6');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 7: 두 번째 분기 VORTEX/SPRINT (Y: 2270 → 2640)
  // ════════════════════════════════════════════════════════════════
  private buildSEC7(): void {
    // 광폭 진입 깔때기: CH2 출구(y=2250) 전체 폭 커버 → 마블 탈출 불가
    // x=300~1020 (좌측), x=1600~1180 (우측) → y=2250에서 2340까지 수렴
    this.createFloor(300, 2250, 1020, 2340, 0x333399);   // 좌측 광폭 깔때기
    this.createFloor(1600, 2250, 1180, 2340, 0x333399);  // 우측 광폭 깔때기
    // 외벽: 깔때기 하단~합류 구간 (VORTEX/SPRINT 경로 안전 경계)
    this.createWall(300, 2340, 2640);    // 좌측 외벽
    this.createWall(1600, 2340, 2640);   // 우측 외벽

    // 분기점
    this.createPin(1100, 2355, 8, 0xffff00);

    // VORTEX 경로 (좌측, 지그재그 4단) — 밀폐 파이프
    this.createPipe(1020, 2360, 700, 2410, { gap: 40, color: 0x6666ff });
    this.createWall(1025, 2350, 2365);
    this.createWall(695, 2405, 2430);
    this.createPipe(700, 2420, 950, 2470, { gap: 40, color: 0x6666ff });
    this.createWall(955, 2465, 2490);
    this.createPipe(950, 2480, 700, 2530, { gap: 40, color: 0x6666ff });
    this.createWall(695, 2525, 2555);
    this.createPipe(700, 2545, 900, 2580, { gap: 40, color: 0x6666ff });

    // SPRINT 경로 (우측, 직선 급경사)
    this.createFloor(1180, 2360, 1500, 2500, 0xffaa00);
    this.createWall(1175, 2350, 2365);
    // SPRINT windmill: y=2388으로 올려서 블레이드 끝(y=2404) ↔ 대리석 상단(y≈2411) gap=7px
    this.createWindmill(1350, 2388, 16, 3, 2.0);
    this.createFloor(1500, 2500, 1300, 2580, 0xffaa00);
    this.createWall(1505, 2495, 2510);

    // 합류 깔때기
    this.createFloor(900, 2585, 1020, 2620, 0x333399);
    this.createFloor(1300, 2585, 1180, 2620, 0x333399);
    this.createFloor(1020, 2625, 1180, 2625, 0x333399);
    this.createWall(1020, 2615, 2630);
    this.createWall(1180, 2615, 2630);

    // Section 7 sensor
    this.createSectionSensor(1100, 2385, 200, 30, 'sec7');
    // Branch sensors
    this.createSectionSensor(870, 2440, 200, 30, 'sec7-vortex');
    this.createSectionSensor(1350, 2440, 200, 30, 'sec7-sprint');
  }

  // ════════════════════════════════════════════════════════════════
  // SEC 8: 파이널 스프린트 (Y: 2640 → 2900)
  // ════════════════════════════════════════════════════════════════
  private buildSEC8(): void {
    // 가속 채널 (좌→우)
    this.createFloor(1020, 2640, 1800, 2760, 0x990000);
    this.createWall(1020, 2615, 2645);         // 높은쪽 벽

    // 시소 게이트
    this.createSeesaw(1500, 2720, 80);

    // 병목 — 수직 파이프
    this.createPipe(1760, 2760, 1760, 2810, { direction: 'vertical', gap: 80, color: 0x990000 });

    // 수직 하강 → FINISH — 수직 파이프
    this.createPipe(1760, 2810, 1760, 2880, { direction: 'vertical', gap: 80, color: 0x990000 });
    this.createFloor(1720, 2880, 1800, 2880, 0x990000);

    // Section 8 sensor
    this.createSectionSensor(1760, 2700, 200, 30, 'sec8');
  }

  // ─── Finish Line ─────────────────────────────

  private buildFinishLine(): void {
    // FINISH 센서 (x:1720~1800, y:2875~2905)
    this.finishSensor = this.physics.createSensor(1760, 2885, 80, 30, 'finish');
    this.bodies.push(this.finishSensor);

    // 체커보드 패턴
    const finishGfx = new Graphics();
    const tileSize = 10;
    for (let x = 1720; x < 1800; x += tileSize) {
      for (let row = 0; row < 2; row++) {
        const isWhite = ((x - 1720) / tileSize + row) % 2 === 0;
        finishGfx.rect(x, 2878 + row * tileSize, tileSize, tileSize);
        finishGfx.fill({ color: isWhite ? 0xffffff : 0x000000, alpha: 0.8 });
      }
    }
    this.worldContainer.addChild(finishGfx);

    const label = new Text({ text: 'FINISH', style: { fontFamily: FONT_DISPLAY, fontSize: 16, fill: COLORS.gold } });
    label.anchor.set(0.5, 0);
    label.position.set(1760, 2858);
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

  // ─── Test ─────────────────────────────────────

  /** 직선 파이프 동작 확인용 — 필요 시 build()에서 제거 */
  private buildTestPipe(): void {
    this.createPipe(50, 150, 500, 150, { gap: 40, color: 0x00ffff });
    const label = new Text({
      text: '▶ createPipe TEST (수평)',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: 0x00ffff },
    });
    label.position.set(50, 120);
    this.worldContainer.addChild(label);
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
