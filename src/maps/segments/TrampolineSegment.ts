import { Container, Graphics } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 고탄성 바운스 패드 세그먼트.
 * params:
 *   width       — 패드 폭 (px, 기본 100)
 *   bouncePower — restitution 값 (기본 1.5)
 */
export class TrampolineSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const width = Number(this.params['width'] ?? 100);
    const bouncePower = Number(this.params['bouncePower'] ?? 1.5);
    const thick = 12;
    const springH = 20;

    // 바운스 패드 본체
    this.addWall(
      physics,
      this.originX,
      this.originY,
      width,
      thick,
      {
        restitution: bouncePower,
        friction: 0.01,
        label: 'trampoline',
      },
      COLORS.pink,
    );

    // 스프링 지그재그 패턴 (패드 아래)
    const g = new Graphics();
    const zigCount = 6;
    const zigW = width / zigCount;
    const startX = this.originX - width / 2;
    const startY = this.originY + thick / 2;

    g.moveTo(startX, startY);
    for (let i = 0; i < zigCount; i++) {
      const midX = startX + zigW * i + zigW / 2;
      const endX = startX + zigW * (i + 1);
      g.lineTo(midX, startY + springH);
      g.lineTo(endX, startY);
    }
    g.stroke({ color: COLORS.pink, alpha: 0.5, width: 2 });
    this.container.addChild(g);

    this.updateBounds(
      this.originX - width / 2,
      this.originY - thick / 2,
      this.originX + width / 2,
      this.originY + thick / 2 + springH,
    );

    parent.addChild(this.container);
  }
}
