import { Container, Graphics, Text } from 'pixi.js';
import { PhysicsWorld, type Body } from '@core/PhysicsWorld';
import { COLORS, FONT_DISPLAY, SECTION_COLORS } from '@utils/constants';
import type { TrackLayout, TrackSegmentDef } from './types';
import type { BaseSegment } from './segments/BaseSegment';
import {
  RampSegment,
  PinZoneSegment,
  BottleneckSegment,
  StaircaseSegment,
  FunnelSegment,
  SplitterSegment,
  SpiralSegment,
  ChannelRampSegment,
  CurvedChannelSegment,
  WheelLiftSegment,
  TrampolineSegment,
  WindmillSegment,
  ShortcutGapSegment,
  SeesawSegment,
} from './segments';

/**
 * TrackBuilder — TrackLayout 데이터로부터 물리+그래픽 트랙을 빌드.
 * 세그먼트 배열 → BaseSegment 인스턴스 생성 → build() 호출.
 * 월드 경계 벽, 배경, 피니시라인 포함.
 */
export class TrackBuilder {
  private readonly segments: BaseSegment[] = [];
  private readonly wallBodies: Body[] = [];
  private finishSensor: Body | null = null;
  private readonly layout: TrackLayout;
  private readonly physics: PhysicsWorld;
  private readonly worldContainer: Container;

  constructor(layout: TrackLayout, physics: PhysicsWorld, worldContainer: Container) {
    this.layout = layout;
    this.physics = physics;
    this.worldContainer = worldContainer;
  }

  /** 전체 트랙 빌드: 배경 → 벽 → 세그먼트 → 피니시 → 연결 검증 */
  build(): void {
    this.buildBackground();
    this.buildWalls();
    this.buildSegments();
    this.buildFinishLine();
    this.validateConnections();
  }

  /** 빌드된 세그먼트 인스턴스 목록 반환 (culling용) */
  getSegments(): readonly BaseSegment[] {
    return this.segments;
  }

  /** 피니시 센서 바디 반환 */
  getFinishSensor(): Body | null {
    return this.finishSensor;
  }

  /** 월드 경계 (좌우 벽 안쪽 X 범위) */
  getTrackBounds(): { minX: number; maxX: number } {
    return {
      minX: this.layout.wallThick / 2,
      maxX: this.layout.worldWidth - this.layout.wallThick / 2,
    };
  }

  // ─── Background ─────────────────────────────

  private buildBackground(): void {
    const { worldWidth, worldHeight } = this.layout;

    // 전체 배경
    const bg = new Graphics();
    bg.rect(0, 0, worldWidth, worldHeight);
    bg.fill(COLORS.background);
    this.worldContainer.addChild(bg);

    // 섹션별 배경 밴드
    // 체크포인트 기반 섹션 경계 동적 생성
    const cps = this.layout.checkpoints ?? [];
    const sectionYs = [0, ...cps.map(cp => cp.y), worldHeight];
    // SECTION_COLORS 부족 시 마지막 색 반복
    const safeColor = (i: number) => SECTION_COLORS[Math.min(i, SECTION_COLORS.length - 1)];
    for (let i = 0; i < sectionYs.length - 1; i++) {
      const y0 = sectionYs[i];
      const y1 = sectionYs[i + 1] ?? worldHeight;
      const band = new Graphics();
      band.rect(0, y0, worldWidth, y1 - y0);
      band.fill({ color: safeColor(i), alpha: 0.6 });
      this.worldContainer.addChild(band);

      // 섹션 경계선 (1px)
      if (i > 0) {
        const line = new Graphics();
        line.rect(0, y0, worldWidth, 1);
        line.fill({ color: 0x3a5a7a, alpha: 0.15 });
        this.worldContainer.addChild(line);
      }
    }

    // 격자 패턴 (4px 간격 수평선)
    const grid = new Graphics();
    for (let y = 0; y < worldHeight; y += 40) {
      grid.rect(0, y, worldWidth, 1);
    }
    grid.fill({ color: 0x1a2a3a, alpha: 0.08 });
    this.worldContainer.addChild(grid);
  }

  // ─── Walls ──────────────────────────────────

  private buildWalls(): void {
    const { worldWidth, worldHeight, wallThick } = this.layout;
    const wallH = worldHeight;
    const wallCY = worldHeight / 2;

    // 좌벽
    const leftWall = this.physics.createWall(wallThick / 2, wallCY, wallThick, wallH);
    this.drawWallRect(wallThick / 2, wallCY, wallThick, wallH, 0x224422);
    this.wallBodies.push(leftWall);

    // 우벽
    const rightWall = this.physics.createWall(worldWidth - wallThick / 2, wallCY, wallThick, wallH);
    this.drawWallRect(worldWidth - wallThick / 2, wallCY, wallThick, wallH, 0x224422);
    this.wallBodies.push(rightWall);

    // 천장 (구슬 역주행 방지)
    const ceiling = this.physics.createWall(worldWidth / 2, -wallThick / 2, worldWidth, wallThick);
    this.wallBodies.push(ceiling);

    // 바닥 (구슬 낙하 방지)
    const floor = this.physics.createWall(worldWidth / 2, worldHeight + wallThick / 2, worldWidth, wallThick);
    this.wallBodies.push(floor);
  }

  // ─── Segments ───────────────────────────────

  private buildSegments(): void {
    for (const def of this.layout.segments) {
      const segment = this.createSegment(def);
      if (!segment) continue;
      segment.build(this.physics, this.worldContainer);
      this.segments.push(segment);
    }
  }

  private createSegment(def: TrackSegmentDef): BaseSegment | null {
    switch (def.type) {
      case 'ramp': return new RampSegment(def);
      case 'pinzone': return new PinZoneSegment(def);
      case 'bottleneck': return new BottleneckSegment(def);
      case 'staircase': return new StaircaseSegment(def);
      case 'funnel': return new FunnelSegment(def);
      case 'splitter': return new SplitterSegment(def);
      case 'spiral': return new SpiralSegment(def);
      case 'channel': return new ChannelRampSegment(def);
      case 'curved': return new CurvedChannelSegment(def);
      case 'wheelLift': return new WheelLiftSegment(def);
      case 'trampoline': return new TrampolineSegment(def);
      case 'windmill': return new WindmillSegment(def);
      case 'shortcutGap': return new ShortcutGapSegment(def);
      case 'seesaw': return new SeesawSegment(def);
      default: return null;
    }
  }

  // ─── Finish Line ────────────────────────────

  private buildFinishLine(): void {
    const { worldWidth, finishY, wallThick } = this.layout;
    const trackW = worldWidth - wallThick * 2;
    const cx = worldWidth / 2;

    // 체커보드 피니시라인
    const checker = new Graphics();
    const squareSize = 12;
    const cols = Math.ceil(trackW / squareSize);
    const rows = 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isBlack = (row + col) % 2 === 0;
        checker.rect(
          wallThick + col * squareSize,
          finishY - rows * squareSize / 2 + row * squareSize,
          squareSize,
          squareSize,
        );
        checker.fill({ color: isBlack ? 0x000000 : 0xffffff, alpha: isBlack ? 0.7 : 0.9 });
      }
    }
    this.worldContainer.addChild(checker);

    // FINISH 라벨
    const label = new Text({
      text: '🏁 F I N I S H 🏁',
      style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: COLORS.gold },
    });
    label.anchor.set(0.5, 0);
    label.x = cx;
    label.y = finishY + squareSize + 2;
    this.worldContainer.addChild(label);

    // 피니시 센서
    this.finishSensor = this.physics.createSensor(cx, finishY, trackW, 10, 'finish');
  }

  // ─── Helpers ────────────────────────────────

  private drawWallRect(x: number, y: number, w: number, h: number, color: number): void {
    const g = new Graphics();
    g.rect(-w / 2, -h / 2, w, h);
    g.fill({ color, alpha: 0.9 });
    g.position.set(x, y);
    this.worldContainer.addChild(g);
  }

  // ─── Connection Validation ─────────────────

  /** 인접 세그먼트 exit↔entry 거리 검증 — 주요 경로 세그먼트만 검사 */
  private validateConnections(): void {
    // 연결 검증 대상: 경로를 형성하는 세그먼트 타입만
    const flowTypes = new Set(['funnel', 'channel', 'curved', 'wheelLift', 'spiral']);
    const flowSegments = this.segments.filter(s => flowTypes.has(s.type));

    if (flowSegments.length < 2) return;

    const WARN_THRESHOLD = 50;
    const issues: string[] = [];

    for (let i = 0; i < flowSegments.length - 1; i++) {
      const prev = flowSegments[i];
      const next = flowSegments[i + 1];
      const exit = prev.getExit();
      const entry = next.getEntry();

      const dx = exit.x - entry.x;
      const dy = exit.y - entry.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > WARN_THRESHOLD) {
        issues.push(
          `[TrackBuilder] 연결 오차 ${dist.toFixed(0)}px: ` +
          `${prev.id}.exit(${exit.x.toFixed(0)},${exit.y.toFixed(0)}) → ` +
          `${next.id}.entry(${entry.x.toFixed(0)},${entry.y.toFixed(0)})`,
        );
      }
    }

    for (const msg of issues) console.warn(msg);

    if (issues.length > 0) {
      console.warn(`[TrackBuilder] 연결 검증: ${issues.length}건 오차 발견 (허용: ${WARN_THRESHOLD}px)`);
    }
  }

  /** 모든 세그먼트 + 벽 정리 */
  destroy(): void {
    for (const seg of this.segments) seg.destroy(this.physics);
    this.segments.length = 0;

    for (const body of this.wallBodies) this.physics.removeBodies(body);
    this.wallBodies.length = 0;

    if (this.finishSensor) {
      this.physics.removeBodies(this.finishSensor);
      this.finishSensor = null;
    }
  }
}
