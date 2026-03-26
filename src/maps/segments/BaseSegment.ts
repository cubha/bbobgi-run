import { Container, Graphics } from 'pixi.js';
import type Matter from 'matter-js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import type { SegmentBounds, SegmentType, TrackSegment, TrackSegmentDef } from '@maps/types';

export abstract class BaseSegment implements TrackSegment {
  readonly id: string;
  readonly type: SegmentType;
  readonly container = new Container();
  readonly bodies: Matter.Body[] = [];
  bounds: SegmentBounds;

  protected originX: number;
  protected originY: number;
  protected params: Record<string, number | string | boolean>;

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
    opts: Matter.IChamferableBodyDefinition,
    color: number,
  ): Matter.Body {
    const body = PhysicsWorld.createWall(x, y, w, h, opts);
    physics.addBodies(body);
    this.bodies.push(body);
    this.drawBody(body, color);
    return body;
  }

  /** Helper: 정적 원 바디 (핀) */
  protected addPin(
    physics: PhysicsWorld,
    x: number,
    y: number,
    radius: number,
    color: number,
  ): Matter.Body {
    const body = PhysicsWorld.createBall(x, y, radius, {
      isStatic: true,
      restitution: 0.55,
      friction: 0.05,
      label: 'pin',
    });
    physics.addBodies(body);
    this.bodies.push(body);
    const g = new Graphics();
    g.circle(0, 0, radius);
    g.fill({ color });
    g.position.set(x, y);
    this.container.addChild(g);
    return body;
  }

  protected drawBody(body: Matter.Body, color: number, alpha = 0.9): void {
    const verts = body.vertices;
    const g = new Graphics();
    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
    g.closePath();
    g.fill({ color, alpha });
    this.container.addChild(g);
  }

  protected updateBounds(left: number, top: number, right: number, bottom: number): void {
    this.bounds = { left, top, right, bottom };
  }
}
