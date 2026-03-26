import { Container, Text } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS, FONT_DISPLAY } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * V자 웨지 병목 세그먼트.
 * params:
 *   passWidth  — 중앙 통과 가능 폭 (px)
 *   wedgeAngle — 웨지 기울기 (radians)
 *   width      — 전체 트랙 폭 (px)
 */
export class BottleneckSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const passWidth = Number(this.params['passWidth'] ?? 60);
    const wedgeAngle = Number(this.params['wedgeAngle'] ?? 0.45);
    const width = Number(this.params['width'] ?? 300);
    const wedgeLen = 90;
    const thick = 12;

    const halfPass = passWidth / 2;

    // 좌측 웨지 벽 (우하향)
    const leftCx = this.originX - halfPass - (wedgeLen * Math.cos(wedgeAngle)) / 2;
    const leftCy = this.originY - (wedgeLen * Math.sin(wedgeAngle)) / 2;
    this.addWall(
      physics,
      leftCx,
      leftCy,
      wedgeLen,
      thick,
      {
        angle: wedgeAngle,
        restitution: 0.25,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
        label: 'bottleneck-left',
      },
      COLORS.purple,
    );

    // 우측 웨지 벽 (좌하향, 대칭)
    const rightCx = this.originX + halfPass + (wedgeLen * Math.cos(wedgeAngle)) / 2;
    const rightCy = this.originY - (wedgeLen * Math.sin(wedgeAngle)) / 2;
    this.addWall(
      physics,
      rightCx,
      rightCy,
      wedgeLen,
      thick,
      {
        angle: -wedgeAngle,
        restitution: 0.25,
        friction: 0.02,
        frictionStatic: 0,
        chamfer: { radius: 2 },
        label: 'bottleneck-right',
      },
      COLORS.purple,
    );

    // 중앙 kick-bump 핀
    this.addPin(physics, this.originX, this.originY + 20, 8, COLORS.primary);

    // "▼ NARROW ▼" 라벨
    const label = new Text({
      text: '▼ NARROW ▼',
      style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.primary },
    });
    label.anchor.set(0.5, 1);
    label.alpha = 0.8;
    label.x = this.originX;
    label.y = this.originY - 10;
    this.container.addChild(label);

    parent.addChild(this.container);

    this.updateBounds(
      this.originX - width / 2,
      this.originY - wedgeLen * Math.sin(wedgeAngle),
      this.originX + width / 2,
      this.originY + 30,
    );
  }
}
