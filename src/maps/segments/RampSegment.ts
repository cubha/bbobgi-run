import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 경사 램프 세그먼트 — 마블런 핵심 레일.
 * params:
 *   width     — 램프 폭 (px)
 *   angle     — 경사 각도 절댓값 (radians)
 *   direction — 기울기 방향: 1 = 좌→우(오른쪽이 낮음), -1 = 우→좌(왼쪽이 낮음)
 *   bumper    — true면 낮은 쪽 끝에 수직 범퍼 벽 추가 (기본 true)
 */
export class RampSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const width = Number(this.params['width'] ?? 280);
    const angle = Number(this.params['angle'] ?? 0.2);
    const direction = Number(this.params['direction'] ?? 1);
    const addBumper = this.params['bumper'] !== false;
    const thick = 14;

    // 경사 방향에 따라 부호 반전
    const signedAngle = -angle * direction;

    // 레일 본체
    this.addWall(
      physics,
      this.originX,
      this.originY,
      width,
      thick,
      {
        angle: signedAngle,
        restitution: 0.12,
        friction: 0.15,
        label: 'ramp',
      },
      COLORS.secondary,
    );

    // 낮은 쪽 끝 범퍼 — 구슬이 레일 끝에서 멈추고 낙하하도록
    if (addBumper) {
      const bumperH = 36;
      const bumperW = 14;
      const halfW = width / 2;
      const dropY = Math.sin(angle) * halfW;

      // direction=1: 오른쪽이 낮음 → 오른쪽 끝에 범퍼
      // direction=-1: 왼쪽이 낮음 → 왼쪽 끝에 범퍼
      const bumperX = this.originX + direction * halfW;
      const bumperY = this.originY + dropY - bumperH / 2 + thick / 2;

      this.addWall(
        physics,
        bumperX,
        bumperY,
        bumperW,
        bumperH,
        {
          restitution: 0.4,
          friction: 0.05,
          label: 'ramp-bumper',
        },
        COLORS.gold,
      );
    }

    // Bounds 계산 (범퍼 포함)
    const halfW = width / 2;
    const dropY = Math.sin(angle) * halfW;
    const bumperExtra = addBumper ? 36 : 0;

    this.updateBounds(
      this.originX - halfW - 7,
      this.originY - dropY - bumperExtra / 2,
      this.originX + halfW + 7,
      this.originY + dropY + thick / 2,
    );

    parent.addChild(this.container);
  }
}
