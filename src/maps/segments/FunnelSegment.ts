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

    // 좌벽: 상단점 → 하단점
    const leftTopX = this.originX - topWidth / 2;
    const leftTopY = this.originY;
    const leftBotX = this.originX - bottomWidth / 2;
    const leftBotY = this.originY + height;

    // 벽 중심 = 상하단 점의 중간
    const leftCx = (leftTopX + leftBotX) / 2;
    const leftCy = (leftTopY + leftBotY) / 2;
    const leftDx = leftBotX - leftTopX;
    const leftDy = leftBotY - leftTopY;
    const wallLen = Math.sqrt(leftDx * leftDx + leftDy * leftDy);
    const leftAngle = Math.atan2(leftDy, leftDx);

    this.addWall(
      physics,
      leftCx,
      leftCy,
      wallLen,
      thick,
      {
        angle: leftAngle,
        restitution: 0.35,
        friction: 0.005,
        label: 'funnel-left',
      },
      COLORS.purple,
    );

    // 우벽: 대칭
    const rightTopX = this.originX + topWidth / 2;
    const rightTopY = this.originY;
    const rightBotX = this.originX + bottomWidth / 2;
    const rightBotY = this.originY + height;

    const rightCx = (rightTopX + rightBotX) / 2;
    const rightCy = (rightTopY + rightBotY) / 2;
    const rightDx = rightBotX - rightTopX;
    const rightDy = rightBotY - rightTopY;
    const rightAngle = Math.atan2(rightDy, rightDx);

    this.addWall(
      physics,
      rightCx,
      rightCy,
      wallLen,
      thick,
      {
        angle: rightAngle,
        restitution: 0.35,
        friction: 0.005,
        label: 'funnel-right',
      },
      COLORS.purple,
    );

    // 하단 중앙 kick-bump 핀 (끼임 방지)
    this.addPin(
      physics,
      this.originX,
      this.originY + height + 6,
      4,
      COLORS.purple,
    );

    parent.addChild(this.container);

    // 입/출구 포트 설정
    this.setEntry(this.originX, this.originY, Math.PI / 2, topWidth);
    this.setExit(this.originX, this.originY + height, Math.PI / 2, bottomWidth);

    this.updateBounds(
      this.originX - topWidth / 2,
      this.originY,
      this.originX + topWidth / 2,
      this.originY + height + 13,
    );
  }
}
