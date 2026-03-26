import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 깔때기(합류/수렴) 세그먼트.
 * V자 형태로 구슬을 중앙으로 모은다.
 * params:
 *   topWidth    — 상단 폭 (px)
 *   bottomWidth — 하단 폭 (px)
 *   height      — 높이 (px)
 */
export class FunnelSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const topWidth = Number(this.params['topWidth'] ?? 300);
    const bottomWidth = Number(this.params['bottomWidth'] ?? 60);
    const height = Number(this.params['height'] ?? 200);
    const thick = 12;

    const dx = (topWidth - bottomWidth) / 2;
    const wallLen = Math.sqrt(dx * dx + height * height);
    const angle = Math.atan2(height, dx);

    // 좌벽: 좌상 → 중앙하 방향 (시계방향 기울기)
    const leftCx = this.originX - topWidth / 2 + dx / 2;
    const leftCy = this.originY + height / 2;

    this.addWall(
      physics,
      leftCx,
      leftCy,
      wallLen,
      thick,
      {
        angle: angle - Math.PI / 2,
        restitution: 0.35,
        friction: 0.005,       // 마찰 최소화 — 구슬이 벽에 달라붙지 않도록
        frictionStatic: 0,
        chamfer: { radius: 2 },
        label: 'funnel-left',
      },
      COLORS.purple,
    );

    // 우벽: 대칭
    const rightCx = this.originX + topWidth / 2 - dx / 2;
    const rightCy = this.originY + height / 2;

    this.addWall(
      physics,
      rightCx,
      rightCy,
      wallLen,
      thick,
      {
        angle: -(angle - Math.PI / 2),
        restitution: 0.35,
        friction: 0.005,
        frictionStatic: 0,
        chamfer: { radius: 2 },
        label: 'funnel-right',
      },
      COLORS.purple,
    );

    // 하단 중앙 kick-bump 핀 (끼임 방지, 작은 핀으로 밀어냄)
    this.addPin(
      physics,
      this.originX,
      this.originY + height + 6,
      4,
      COLORS.purple,
    );

    parent.addChild(this.container);

    this.updateBounds(
      this.originX - topWidth / 2,
      this.originY,
      this.originX + topWidth / 2,
      this.originY + height + 13,
    );
  }
}
