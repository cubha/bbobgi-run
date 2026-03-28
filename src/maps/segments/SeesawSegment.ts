import { Container, Graphics } from 'pixi.js';
import { PhysicsWorld, BoxShape, type Body, type Joint } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 시소 세그먼트 — RevoluteJoint 기반 기울어지는 판.
 * 구슬 무게에 따라 좌우로 기울어져 순위 변동 유발.
 * params:
 *   width     — 시소 판 폭 (px, default 120)
 *   thick     — 판 두께 (px, default 10)
 *   pivotH    — 피벗 삼각형 높이 (px, default 20)
 */
export class SeesawSegment extends BaseSegment {
  private beamBody: Body | null = null;
  private joint: Joint | null = null;
  private beamGfx: Graphics | null = null;
  private updateHandler: (() => void) | null = null;

  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const width = Number(this.params['width'] ?? 120);
    const thick = Number(this.params['thick'] ?? 10);
    const pivotH = Number(this.params['pivotH'] ?? 20);

    const cx = this.originX;
    const cy = this.originY;

    // 1. 피벗 앵커 (static body)
    const pivot = physics.createStaticBody(cx, cy);
    this.bodies.push(pivot);

    // 2. 시소 판 (dynamic body)
    this.beamBody = physics.createDynamicBody(cx, cy, {
      angularDamping: 2.0,
    });
    this.beamBody.createFixture(new BoxShape(width / 2, thick / 2), {
      density: 0.005,
      restitution: 0.3,
      friction: 0.1,
    });
    this.bodies.push(this.beamBody);

    // 3. RevoluteJoint — 기울기 제한 ±0.4 rad (~23°)
    this.joint = physics.createRevoluteJoint(
      pivot,
      this.beamBody,
      { x: cx, y: cy },
      {
        enableLimit: true,
        lowerAngle: -0.4,
        upperAngle: 0.4,
      },
    );

    // 4. 피벗 삼각형 Graphics
    const pivotGfx = new Graphics();
    pivotGfx.moveTo(cx - 12, cy + pivotH);
    pivotGfx.lineTo(cx + 12, cy + pivotH);
    pivotGfx.lineTo(cx, cy - 2);
    pivotGfx.closePath();
    pivotGfx.fill({ color: COLORS.darkGray, alpha: 0.9 });
    this.container.addChild(pivotGfx);

    // 5. 시소 판 Graphics (매 프레임 angle 동기화)
    this.beamGfx = new Graphics();
    this.beamGfx.rect(-width / 2, -thick / 2, width, thick);
    this.beamGfx.fill({ color: COLORS.orange, alpha: 0.9 });
    // 네온 엣지
    this.beamGfx.rect(-width / 2, -thick / 2, width, 1);
    this.beamGfx.fill({ color: 0xffffff, alpha: 0.15 });
    this.beamGfx.position.set(cx, cy);
    this.container.addChild(this.beamGfx);

    // 6. 그래픽 동기화 핸들러
    const beam = this.beamBody;
    const gfx = this.beamGfx;
    this.updateHandler = () => {
      gfx.rotation = beam.getAngle();
    };
    physics.onBeforeUpdate(this.updateHandler);

    this.updateBounds(
      cx - width / 2,
      cy - thick / 2 - 5,
      cx + width / 2,
      cy + pivotH,
    );

    parent.addChild(this.container);
  }

  override destroy(physics: PhysicsWorld): void {
    if (this.joint) {
      physics.destroyJoint(this.joint);
      this.joint = null;
    }
    this.updateHandler = null;
    this.beamBody = null;
    this.beamGfx = null;
    super.destroy(physics);
  }
}
