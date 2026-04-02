import { Container, Graphics } from 'pixi.js';
import { PhysicsWorld, type Body } from '@core/PhysicsWorld';
import type { SegmentBounds, SegmentPort, SegmentType, TrackSegment, TrackSegmentDef } from '@maps/types';

export abstract class BaseSegment implements TrackSegment {
  readonly id: string;
  readonly type: SegmentType;
  readonly container = new Container();
  readonly bodies: Body[] = [];
  bounds: SegmentBounds;

  protected originX: number;
  protected originY: number;
  protected params: Record<string, number | string | boolean>;

  /** 입구/출구 포트 — build() 내에서 setEntry/setExit로 설정 */
  protected _entry: SegmentPort = { x: 0, y: 0, angle: Math.PI / 2, width: 50 };
  protected _exit: SegmentPort = { x: 0, y: 0, angle: Math.PI / 2, width: 50 };

  constructor(def: TrackSegmentDef) {
    this.id = def.id;
    this.type = def.type;
    this.originX = def.originX;
    this.originY = def.originY;
    this.params = def.params;
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  }

  abstract build(physics: PhysicsWorld, parent: Container): void;

  destroy(physics: PhysicsWorld): void {
    for (const body of this.bodies) physics.removeBodies(body);
    this.bodies.length = 0;
    this.container.destroy({ children: true });
  }

  /** Helper: 정적 사각 바디 + Graphics 렌더링 */
  protected addWall(
    physics: PhysicsWorld,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { angle?: number; restitution?: number; friction?: number; label?: string },
    color: number,
  ): Body {
    const body = physics.createWall(x, y, w, h, opts);
    this.bodies.push(body);
    this.drawRect(x, y, w, h, opts.angle ?? 0, color);
    return body;
  }

  /** Helper: 정적 원 바디 (핀) — createPin() 사용 (restitution 0.5, friction 0.02) */
  protected addPin(
    physics: PhysicsWorld,
    x: number,
    y: number,
    radius: number,
    color: number,
  ): Body {
    const body = physics.createPin(x, y, radius);
    this.bodies.push(body);
    const g = new Graphics();
    g.circle(0, 0, radius);
    g.fill({ color });
    g.position.set(x, y);
    this.container.addChild(g);
    return body;
  }

  /** Planck.js용 — body.vertices 없으므로 파라미터로 직접 렌더링 */
  protected drawRect(x: number, y: number, w: number, h: number, angle: number, color: number, alpha = 0.9): void {
    const g = new Graphics();
    g.rect(-w / 2, -h / 2, w, h);
    g.fill({ color, alpha });
    // 네온 엣지: 상단 1px 밝은 라인
    g.rect(-w / 2, -h / 2, w, 1);
    g.fill({ color: 0xffffff, alpha: 0.15 });
    g.position.set(x, y);
    g.rotation = angle;
    this.container.addChild(g);
  }

  protected updateBounds(left: number, top: number, right: number, bottom: number): void {
    this.bounds = { left, top, right, bottom };
  }

  protected setEntry(x: number, y: number, angle: number, width: number): void {
    this._entry = { x, y, angle, width };
  }

  protected setExit(x: number, y: number, angle: number, width: number): void {
    this._exit = { x, y, angle, width };
  }

  getEntry(): SegmentPort {
    return this._entry;
  }

  getExit(): SegmentPort {
    return this._exit;
  }
}
