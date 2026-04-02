import { Container, Graphics } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 지름길 갭 세그먼트 — 바닥에 구멍을 뚫어 역전 기회 제공.
 * 구슬이 갭을 통해 아래 섹션으로 낙하하면 지름길.
 * params:
 *   floorWidth — 전체 바닥 폭 (px, default 400)
 *   gapWidth   — 중앙 구멍 폭 (px, default 35)
 *   thick      — 바닥 두께 (px, default 12)
 */
export class ShortcutGapSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const floorWidth = Number(this.params['floorWidth'] ?? 400);
    const gapWidth = Number(this.params['gapWidth'] ?? 35);
    const thick = Number(this.params['thick'] ?? 12);

    const halfFloor = floorWidth / 2;
    const halfGap = gapWidth / 2;

    // 좌측 바닥
    const leftW = halfFloor - halfGap;
    if (leftW > 0) {
      this.addWall(
        physics,
        this.originX - halfGap - leftW / 2,
        this.originY,
        leftW,
        thick,
        { restitution: 0.2, friction: 0.02, label: 'shortcut-floor-left' },
        COLORS.secondary,
      );
    }

    // 우측 바닥
    const rightW = halfFloor - halfGap;
    if (rightW > 0) {
      this.addWall(
        physics,
        this.originX + halfGap + rightW / 2,
        this.originY,
        rightW,
        thick,
        { restitution: 0.2, friction: 0.02, label: 'shortcut-floor-right' },
        COLORS.secondary,
      );
    }

    // 갭 시각 표시 — 깜빡이는 화살표 (정적 그래픽)
    const gapGfx = new Graphics();
    // 갭 영역 하이라이트
    gapGfx.rect(this.originX - halfGap, this.originY - thick / 2, gapWidth, thick);
    gapGfx.fill({ color: COLORS.gold, alpha: 0.15 });
    // 하향 화살표
    const arrowY = this.originY + thick / 2 + 4;
    gapGfx.moveTo(this.originX - 6, arrowY);
    gapGfx.lineTo(this.originX + 6, arrowY);
    gapGfx.lineTo(this.originX, arrowY + 8);
    gapGfx.closePath();
    gapGfx.fill({ color: COLORS.gold, alpha: 0.5 });
    this.container.addChild(gapGfx);

    this.updateBounds(
      this.originX - halfFloor,
      this.originY - thick / 2,
      this.originX + halfFloor,
      this.originY + thick / 2 + 12,
    );

    parent.addChild(this.container);
  }
}
