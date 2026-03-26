import { Container, Text } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS, FONT_DISPLAY } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 교대 선반 계단 세그먼트.
 * params:
 *   steps       — 계단 수
 *   stepSpacing — 계단 수직 간격 (px)
 *   shelfWidth  — 각 선반 폭 (px)
 */
export class StaircaseSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const steps = Number(this.params['steps'] ?? 5);
    const stepSpacing = Number(this.params['stepSpacing'] ?? 50);
    const shelfWidth = Number(this.params['shelfWidth'] ?? 140);
    const thick = 12;

    for (let i = 0; i < steps; i++) {
      // 좌우 교대 배치: 짝수 = 왼쪽, 홀수 = 오른쪽
      const dir = i % 2 === 0 ? -1 : 1;

      // 트랙 중심에서 dir 방향으로 오프셋
      const shelfOffsetX = dir * (shelfWidth * 0.2);
      const x = this.originX + shelfOffsetX;
      const y = this.originY + i * stepSpacing;

      // 약간의 기울기로 구슬이 중앙으로 모이도록 유도
      const tiltAngle = dir * 0.06;

      this.addWall(
        physics,
        x,
        y,
        shelfWidth,
        thick,
        {
          angle: tiltAngle,
          restitution: 0.2,
          friction: 0.02,
          frictionStatic: 0,
          chamfer: { radius: 2 },
          label: `staircase-step-${i}`,
        },
        i % 2 === 0 ? COLORS.brown : COLORS.darkGray,
      );
    }

    // "▼ STEP DROP ▼" 라벨
    const totalHeight = (steps - 1) * stepSpacing;
    const label = new Text({
      text: '▼ STEP DROP ▼',
      style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
    });
    label.anchor.set(0.5, 0.5);
    label.alpha = 0.7;
    label.x = this.originX;
    label.y = this.originY + totalHeight / 2;
    this.container.addChild(label);

    parent.addChild(this.container);

    this.updateBounds(
      this.originX - shelfWidth / 2 - shelfWidth * 0.2,
      this.originY - thick / 2,
      this.originX + shelfWidth / 2 + shelfWidth * 0.2,
      this.originY + totalHeight + thick / 2,
    );
  }
}
