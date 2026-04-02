import { Container, Graphics } from 'pixi.js';
import { PhysicsWorld, Vec2, BoxShape, type Body } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 회전 물레방아 상승 장치.
 * 구슬을 아래에서 위로 끌어올리는 kinematic 회전 날개 구조물.
 *
 * params:
 *   radius       — 물레방아 반지름 (default 100)
 *   speed        — 회전 속도 radians/frame (default 0.02)
 *   channelWidth — 좌우 가이드 채널 폭 (default 60)
 *   bladeCount   — 날개 수 (default 4)
 */
export class WheelLiftSegment extends BaseSegment {
  private wheelBody: Body | null = null;
  private updateHandler: (() => void) | null = null;

  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const radius = Number(this.params['radius'] ?? 100);
    const speed = Number(this.params['speed'] ?? 0.02);
    const channelWidth = Number(this.params['channelWidth'] ?? 60);
    const bladeCount = Number(this.params['bladeCount'] ?? 4);

    const cx = this.originX;
    const cy = this.originY;

    const bladeLength = radius * 1.8;
    const bladeThick = 10;

    // 1. 단일 kinematic body — 날개를 fixture로 붙임
    this.wheelBody = physics.createKinematicBody(cx, cy);
    this.bodies.push(this.wheelBody);

    for (let i = 0; i < bladeCount; i++) {
      const angle = i * ((Math.PI * 2) / bladeCount);
      this.wheelBody.createFixture(
        new BoxShape(bladeLength / 2, bladeThick / 2, new Vec2(0, 0), angle),
        { restitution: 0.5, friction: 0.3 },
      );
    }

    // 2. angular velocity 설정 — 물리 엔진이 자동 회전 (speed rad/frame → rad/s)
    this.wheelBody.setAngularVelocity(speed * 180);

    // 3. 날개 Graphics (컨테이너 통째로 body 각도에 동기화)
    const wheelGfxContainer = new Container();
    wheelGfxContainer.position.set(cx, cy);
    for (let i = 0; i < bladeCount; i++) {
      const angle = i * ((Math.PI * 2) / bladeCount);
      const g = new Graphics();
      g.rect(-bladeLength / 2, -bladeThick / 2, bladeLength, bladeThick);
      g.fill({ color: COLORS.brightGreen, alpha: 0.9 });
      g.rotation = angle;
      wheelGfxContainer.addChild(g);
    }
    this.container.addChild(wheelGfxContainer);

    // 4. 좌우 가이드 벽
    const wallThick = 12;
    const wallHeight = radius * 2.5;
    const halfChannel = channelWidth / 2;

    this.addWall(
      physics,
      cx - halfChannel - wallThick / 2,
      cy,
      wallThick,
      wallHeight,
      { restitution: 0.2, friction: 0.05, label: 'wheel-guide-left' },
      COLORS.green,
    );
    this.addWall(
      physics,
      cx + halfChannel + wallThick / 2,
      cy,
      wallThick,
      wallHeight,
      { restitution: 0.2, friction: 0.05, label: 'wheel-guide-right' },
      COLORS.green,
    );

    // 5. 상단 출구 경사 레일
    const rampLen = 60;
    const rampAngle = 0.4;
    const exitY = cy - radius - 10;

    this.addWall(
      physics,
      cx - halfChannel / 2 - (rampLen * Math.cos(rampAngle)) / 2,
      exitY - (rampLen * Math.sin(rampAngle)) / 2,
      rampLen,
      wallThick,
      { angle: -rampAngle, restitution: 0.2, friction: 0.05, label: 'wheel-exit-left' },
      COLORS.green,
    );
    this.addWall(
      physics,
      cx + halfChannel / 2 + (rampLen * Math.cos(rampAngle)) / 2,
      exitY - (rampLen * Math.sin(rampAngle)) / 2,
      rampLen,
      wallThick,
      { angle: rampAngle, restitution: 0.2, friction: 0.05, label: 'wheel-exit-right' },
      COLORS.green,
    );

    // 6. 중심축 Graphics
    const axle = new Graphics();
    axle.circle(0, 0, 8);
    axle.fill({ color: 0xffffff, alpha: 1.0 });
    axle.position.set(cx, cy);
    this.container.addChild(axle);

    // 7. 그래픽 동기화 핸들러 (물리는 자동, 그래픽 rotation만 sync)
    const wheel = this.wheelBody;
    this.updateHandler = () => {
      wheelGfxContainer.rotation = wheel.getAngle();
    };
    physics.onBeforeUpdate(this.updateHandler);

    parent.addChild(this.container);

    // 입/출구 포트 설정
    // 입구 = 하단 (아래에서 구슬 진입), 출구 = 상단 우측 경사 레일 끝
    this.setEntry(cx, cy + radius, Math.PI / 2, channelWidth);
    this.setExit(cx + halfChannel, exitY, -Math.PI / 4, channelWidth);

    this.updateBounds(
      cx - halfChannel - wallThick,
      cy - wallHeight / 2,
      cx + halfChannel + wallThick,
      cy + wallHeight / 2,
    );
  }

  override destroy(physics: PhysicsWorld): void {
    this.updateHandler = null;
    this.wheelBody = null;
    super.destroy(physics);
  }
}
