import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 경사 램프 세그먼트.
 * params:
 *   width     — 램프 폭 (px)
 *   angle     — 경사 각도 절댓값 (radians)
 *   direction — 기울기 방향: 1 = 좌→우 기울기, -1 = 우→좌 기울기
 */
export class RampSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const width = Number(this.params['width'] ?? 280);
    const angle = Number(this.params['angle'] ?? 0.35);
    const direction = Number(this.params['direction'] ?? 1);
    const thick = 14;

    // 경사 방향에 따라 부호 반전
    const signedAngle = -angle * direction;

    this.addWall(
      physics,
      this.originX,
      this.originY,
      width,
      thick,
      {
        angle: signedAngle,
        restitution: 0.18,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
        label: 'ramp',
      },
      COLORS.secondary,
    );

    parent.addChild(this.container);

    this.updateBounds(
      this.originX - width / 2,
      this.originY - thick / 2,
      this.originX + width / 2,
      this.originY + thick / 2,
    );
  }
}
