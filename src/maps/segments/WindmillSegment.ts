import { Container, Graphics } from 'pixi.js';
import { PhysicsWorld, Vec2, BoxShape, type Body } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 채널 내부 회전 장애물 세그먼트.
 * params:
 *   radius     — 날개 길이 (px, 기본 40)
 *   speed      — 회전 속도 (radians/frame, 기본 0.03)
 *   bladeCount — 날개 수 (기본 4)
 */
export class WindmillSegment extends BaseSegment {
  private windmillBody: Body | null = null;
  private readonly bladeCount: number;
  private readonly speed: number;
  private readonly radius: number;
  private updateHandler: (() => void) | null = null;

  constructor(def: TrackSegmentDef) {
    super(def);
    this.radius = Number(def.params['radius'] ?? 40);
    this.speed = Number(def.params['speed'] ?? 0.03);
    this.bladeCount = Number(def.params['bladeCount'] ?? 4);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const { radius, speed, bladeCount, originX, originY } = this;
    const bladeThick = 12;

    // 1. 단일 kinematic body — 날개를 fixture로 붙임
    this.windmillBody = physics.createKinematicBody(originX, originY);
    this.bodies.push(this.windmillBody);

    for (let i = 0; i < bladeCount; i++) {
      const angle = i * ((Math.PI * 2) / bladeCount);
      this.windmillBody.createFixture(
        new BoxShape(radius, bladeThick / 2, new Vec2(0, 0), angle),
        { restitution: 0.6, friction: 0.1 },
      );
    }

    // 2. angular velocity 설정 — 물리 엔진이 자동 회전 (speed rad/frame → rad/s)
    this.windmillBody.setAngularVelocity(speed * 180);

    // 3. 날개 Graphics (컨테이너 통째로 body 각도에 동기화)
    const windmillGfxContainer = new Container();
    windmillGfxContainer.position.set(originX, originY);
    for (let i = 0; i < bladeCount; i++) {
      const angle = i * ((Math.PI * 2) / bladeCount);
      const g = new Graphics();
      g.rect(-radius, -bladeThick / 2, radius * 2, bladeThick);
      g.fill({ color: COLORS.orange });
      g.rotation = angle;
      windmillGfxContainer.addChild(g);
    }
    this.container.addChild(windmillGfxContainer);

    // 4. 중심축 원
    const hub = new Graphics();
    hub.circle(0, 0, 6);
    hub.fill({ color: 0xffffff });
    hub.position.set(originX, originY);
    this.container.addChild(hub);

    // 5. 그래픽 동기화 핸들러 (물리는 자동, 그래픽 rotation만 sync)
    const windmill = this.windmillBody;
    this.updateHandler = () => {
      windmillGfxContainer.rotation = windmill.getAngle();
    };
    physics.onBeforeUpdate(this.updateHandler);

    this.updateBounds(
      originX - radius,
      originY - radius,
      originX + radius,
      originY + radius,
    );

    parent.addChild(this.container);
  }

  override destroy(physics: PhysicsWorld): void {
    this.updateHandler = null;
    this.windmillBody = null;
    super.destroy(physics);
  }
}
