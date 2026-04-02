import {
  World, Vec2, CircleShape, BoxShape, ChainShape, EdgeShape,
  RevoluteJoint, PrismaticJoint,
  type Body, type Fixture, type Contact, type Joint,
  type BodyDef, type FixtureOpt, type Vec2Value,
  type RevoluteJointOpt, type PrismaticJointOpt,
} from 'planck';

/** Fixed physics timestep in seconds (60Hz) */
const FIXED_DT = 1 / 60;
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 10;

export interface WallOptions {
  angle?: number;
  restitution?: number;
  friction?: number;
  isSensor?: boolean;
  label?: string;
}

export interface BallOptions {
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  label?: string;
}

/**
 * Planck.js (Box2D) abstraction layer.
 * Used by marble race and pachinko modes.
 *
 * Rules:
 * - Always use fixed timestep (FIXED_DT), never pass variable delta
 * - PixiJS Ticker drives the loop
 * - Sprite anchor must be (0.5, 0.5) for position sync
 * - Gravity: positive y = downward (same as PixiJS screen coords)
 */
export class PhysicsWorld {
  readonly world: World;
  private readonly contactListeners: Array<{
    name: string;
    handler: (contact: Contact) => void;
  }> = [];
  private readonly _beforeUpdateHandlers: Array<() => void> = [];

  constructor(gravity = { x: 0, y: 980 }) {
    this.world = new World(new Vec2(gravity.x, gravity.y));
    this.world.setAllowSleeping(false);
  }

  /** Step the physics simulation with fixed timestep (4 sub-steps for CCD) */
  update(deltaScale = 1): void {
    for (const h of this._beforeUpdateHandlers) h();
    const subSteps = 4;
    const dt = (FIXED_DT * deltaScale) / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.world.step(dt, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    }
  }

  // ─── Body Factory Methods ───────────────────────

  /** Create a static rectangle body (wall/floor/ramp) — auto-added to world */
  createWall(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: WallOptions,
  ): Body {
    const body = this.world.createBody({
      type: 'static',
      position: new Vec2(x, y),
      angle: options?.angle ?? 0,
    });
    body.createFixture(new BoxShape(width / 2, height / 2), {
      friction: options?.friction ?? 0.3,
      restitution: options?.restitution ?? 0,
      isSensor: options?.isSensor ?? false,
    });
    if (options?.label) body.setUserData({ label: options.label });
    return body;
  }

  /** Create a dynamic circle body (marble/ball) — auto-added to world */
  createBall(x: number, y: number, radius: number, options?: BallOptions): Body {
    const body = this.world.createDynamicBody({
      position: new Vec2(x, y),
      bullet: true,
      linearDamping: options?.linearDamping ?? 0.01,
      allowSleep: false,
    });
    body.createFixture(new CircleShape(radius), {
      density: 1.0,
      restitution: options?.restitution ?? 0.3,
      friction: options?.friction ?? 0.01,
    });
    if (options?.label) body.setUserData({ label: options.label });
    if (options?.mass !== undefined) {
      const md = { mass: 0, center: new Vec2(0, 0), I: 0 };
      body.getMassData(md);
      md.mass = options.mass;
      body.setMassData(md);
    }
    return body;
  }

  /** Create a static circle body (pin) — auto-added to world */
  createPin(x: number, y: number, radius: number): Body {
    const body = this.world.createBody({
      type: 'static',
      position: new Vec2(x, y),
    });
    body.createFixture(new CircleShape(radius), {
      restitution: 0.5,
      friction: 0.02,
    });
    return body;
  }

  /** Create a sensor rectangle (for checkpoint/finish detection) — auto-added to world */
  createSensor(x: number, y: number, width: number, height: number, label: string): Body {
    const body = this.world.createBody({
      type: 'static',
      position: new Vec2(x, y),
    });
    body.createFixture(new BoxShape(width / 2, height / 2), { isSensor: true });
    body.setUserData({ label });
    return body;
  }

  // ─── Chain / Joint APIs (신규) ──────────────────

  /** Create a ChainShape static body (curved rails, U-turns, spirals) */
  createChain(vertices: Vec2Value[], loop = false, friction = 0.3): Body {
    const body = this.world.createBody({ type: 'static' });
    const chain = new ChainShape(vertices.map(v => new Vec2(v.x, v.y)), loop);
    body.createFixture(chain, { friction });
    return body;
  }

  /** Create a kinematic body (for motorized rotation — windmill, waterwheel) */
  createKinematicBody(x: number, y: number, opts?: Partial<BodyDef>): Body {
    return this.world.createKinematicBody({ position: new Vec2(x, y), ...opts });
  }

  /** Create a dynamic body */
  createDynamicBody(x: number, y: number, opts?: Partial<BodyDef>): Body {
    return this.world.createDynamicBody({ position: new Vec2(x, y), ...opts });
  }

  /** Create a static body */
  createStaticBody(x: number, y: number, angle = 0): Body {
    return this.world.createBody({ type: 'static', position: new Vec2(x, y), angle });
  }

  /** Create a RevoluteJoint (windmill, seesaw, waterwheel) */
  createRevoluteJoint(
    bodyA: Body,
    bodyB: Body,
    anchor: Vec2Value,
    opts?: Partial<RevoluteJointOpt>,
  ): Joint {
    const joint = new RevoluteJoint(
      {
        enableMotor: opts?.enableMotor ?? false,
        motorSpeed: opts?.motorSpeed ?? 0,
        maxMotorTorque: opts?.maxMotorTorque ?? 1000,
        ...opts,
      },
      bodyA,
      bodyB,
      new Vec2(anchor.x, anchor.y),
    );
    return this.world.createJoint(joint)!;
  }

  /** Create a PrismaticJoint (elevator, sliding platform) */
  createPrismaticJoint(
    bodyA: Body,
    bodyB: Body,
    anchor: Vec2Value,
    axis: Vec2Value,
    opts?: Partial<PrismaticJointOpt>,
  ): Joint {
    const joint = new PrismaticJoint(
      {
        enableMotor: opts?.enableMotor ?? false,
        motorSpeed: opts?.motorSpeed ?? 0,
        maxMotorForce: opts?.maxMotorForce ?? 1000,
        ...opts,
      },
      bodyA,
      bodyB,
      new Vec2(anchor.x, anchor.y),
      new Vec2(axis.x, axis.y),
    );
    return this.world.createJoint(joint)!;
  }

  /** Destroy a joint */
  destroyJoint(joint: Joint): void {
    this.world.destroyJoint(joint);
  }

  // ─── Legacy compat (no-ops — bodies are auto-added) ─────

  /** @deprecated Bodies are now auto-added to world. This is a no-op. */
  addBodies(..._bodies: Body[]): void {
    // No-op: Planck bodies are added to world on creation
  }

  /** Remove bodies from the world */
  removeBodies(...bodies: Body[]): void {
    for (const body of bodies) {
      if (body) this.world.destroyBody(body);
    }
  }

  // ─── Events ─────────────────────────────────────

  /** Register a begin-contact event handler */
  onCollisionStart(handler: (contact: Contact) => void): void {
    this.world.on('begin-contact', handler);
    this.contactListeners.push({ name: 'begin-contact', handler });
  }

  /** Register a before-update handler (called before each step) */
  onBeforeUpdate(handler: () => void): void {
    this._beforeUpdateHandlers.push(handler);
  }

  /** Set gravity dynamically (for chaos events) */
  setGravity(x: number, y: number): void {
    this.world.setGravity(new Vec2(x, y));
  }

  // ─── Cleanup ────────────────────────────────────

  /** Clean up — remove all event handlers, destroy all bodies */
  destroy(): void {
    for (const { name, handler } of this.contactListeners) {
      this.world.off(name as 'begin-contact', handler);
    }
    this.contactListeners.length = 0;
    this._beforeUpdateHandlers.length = 0;

    let body = this.world.getBodyList();
    while (body) {
      const next = body.getNext();
      this.world.destroyBody(body);
      body = next;
    }
  }
}

// ─── Re-export Planck types for consumers ───
export {
  Vec2, CircleShape, BoxShape, ChainShape, EdgeShape,
  RevoluteJoint, PrismaticJoint,
};
export type {
  Body, Fixture, Contact, Joint,
  BodyDef, FixtureOpt, Vec2Value,
  RevoluteJointOpt, PrismaticJointOpt,
};
