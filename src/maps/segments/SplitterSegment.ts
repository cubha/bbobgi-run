import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 분기점(Y자) 세그먼트.
 * 중앙 역삼각형(위로 뾰족)으로 구슬을 좌/우 경로로 분리한다.
 * params:
 *   splitWidth — 좌우 경로 간 거리 (px)
 *   wedgeAngle — 중앙 삼각형 반각 (radians)
 */
export class SplitterSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const splitWidth = Number(this.params['splitWidth'] ?? 160);
    const wedgeAngle = Number(this.params['wedgeAngle'] ?? 0.5);
    const thick = 10;

    // 역삼각형 높이 (꼭짓점에서 바닥까지)
    const wedgeHeight = (splitWidth / 2) * Math.tan(Math.PI / 2 - wedgeAngle);
    const slopeLen = (splitWidth / 2) / Math.cos(Math.PI / 2 - wedgeAngle);

    // 좌측면: 중심 꼭짓점에서 좌하향
    const leftCx = this.originX - splitWidth / 4;
    const leftCy = this.originY + wedgeHeight / 2;

    this.addWall(
      physics,
      leftCx,
      leftCy,
      slopeLen,
      thick,
      {
        angle: wedgeAngle,
        restitution: 0.25,
        friction: 0.02,
        label: 'splitter-left',
      },
      COLORS.orange,
    );

    // 우측면: 대칭
    const rightCx = this.originX + splitWidth / 4;
    const rightCy = this.originY + wedgeHeight / 2;

    this.addWall(
      physics,
      rightCx,
      rightCy,
      slopeLen,
      thick,
      {
        angle: -wedgeAngle,
        restitution: 0.25,
        friction: 0.02,
        label: 'splitter-right',
      },
      COLORS.orange,
    );

    // 양쪽 가이드 벽 — 갈라진 구슬을 경로로 유도
    const guideLen = 80;   // 60→80: 더 긴 가이드로 확실한 유도
    const guideY = this.originY + wedgeHeight + 25;

    // 좌측 가이드 벽
    this.addWall(
      physics,
      this.originX - splitWidth / 2,
      guideY,
      thick,
      guideLen,
      {
        restitution: 0.2,
        friction: 0.02,
        label: 'splitter-guide-left',
      },
      COLORS.orange,
    );

    // 우측 가이드 벽
    this.addWall(
      physics,
      this.originX + splitWidth / 2,
      guideY,
      thick,
      guideLen,
      {
        restitution: 0.2,
        friction: 0.02,
        label: 'splitter-guide-right',
      },
      COLORS.orange,
    );

    parent.addChild(this.container);

    this.updateBounds(
      this.originX - splitWidth / 2 - thick / 2,
      this.originY,
      this.originX + splitWidth / 2 + thick / 2,
      guideY + guideLen / 2,
    );
  }
}
