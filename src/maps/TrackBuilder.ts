import { Container, Graphics, Text } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS, FONT_DISPLAY } from '@utils/constants';
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
} from './segments';

/**
 * TrackBuilder — TrackLayout 데이터로부터 물리+그래픽 트랙을 빌드.
 * 세그먼트 배열 → BaseSegment 인스턴스 생성 → build() 호출.
 * 월드 경계 벽, 배경, 피니시라인 포함.
 */
export class TrackBuilder {
  private readonly segments: BaseSegment[] = [];
  private readonly wallBodies: Matter.Body[] = [];
  private finishSensor: Matter.Body | null = null;
  private readonly layout: TrackLayout;
  private readonly physics: PhysicsWorld;
  private readonly worldContainer: Container;

  constructor(layout: TrackLayout, physics: PhysicsWorld, worldContainer: Container) {
    this.layout = layout;
    this.physics = physics;
    this.worldContainer = worldContainer;
  }

  /** 전체 트랙 빌드: 배경 → 벽 → 세그먼트 → 피니시 */
  build(): void {
    this.buildBackground();
    this.buildWalls();
    this.buildSegments();
    this.buildFinishLine();
  }

  /** 빌드된 세그먼트 인스턴스 목록 반환 (culling용) */
  getSegments(): readonly BaseSegment[] {
    return this.segments;
  }

  /** 피니시 센서 바디 반환 */
  getFinishSensor(): Matter.Body | null {
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

    // 월드 배경
    const bg = new Graphics();
    bg.rect(0, 0, worldWidth, worldHeight);
    bg.fill(COLORS.background);
    this.worldContainer.addChild(bg);

    // 트랙 영역 배경 (약간 밝은 색)
    const trackBg = new Graphics();
    const margin = this.layout.wallThick;
    trackBg.rect(margin, 0, worldWidth - margin * 2, worldHeight);
    trackBg.fill({ color: 0x0d2020 });
    this.worldContainer.addChild(trackBg);
  }

  // ─── Walls ──────────────────────────────────

  private buildWalls(): void {
    const { worldWidth, worldHeight, wallThick } = this.layout;
    const wallH = worldHeight;
    const wallCY = worldHeight / 2;

    // 좌벽
    const leftWall = PhysicsWorld.createWall(wallThick / 2, wallCY, wallThick, wallH);
    this.physics.addBodies(leftWall);
    this.drawStaticBody(leftWall, 0x224422);
    this.wallBodies.push(leftWall);

    // 우벽
    const rightWall = PhysicsWorld.createWall(worldWidth - wallThick / 2, wallCY, wallThick, wallH);
    this.physics.addBodies(rightWall);
    this.drawStaticBody(rightWall, 0x224422);
    this.wallBodies.push(rightWall);

    // 천장 (구슬 역주행 방지)
    const ceiling = PhysicsWorld.createWall(worldWidth / 2, -wallThick / 2, worldWidth, wallThick);
    this.physics.addBodies(ceiling);
    this.wallBodies.push(ceiling);

    // 바닥 (구슬 낙하 방지)
    const floor = PhysicsWorld.createWall(worldWidth / 2, worldHeight + wallThick / 2, worldWidth, wallThick);
    this.physics.addBodies(floor);
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
    this.finishSensor = PhysicsWorld.createSensor(cx, finishY, trackW, 10, 'finish');
    this.physics.addBodies(this.finishSensor);
  }

  // ─── Helpers ────────────────────────────────

  private drawStaticBody(body: Matter.Body, color: number): void {
    const verts = body.vertices;
    const g = new Graphics();
    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
    g.closePath();
    g.fill({ color, alpha: 0.9 });
    this.worldContainer.addChild(g);
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
