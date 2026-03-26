import Matter from 'matter-js';

/** Fixed physics timestep in ms (60Hz) */
const FIXED_DELTA = 1000 / 60;

/**
 * Matter.js abstraction layer.
 * Used by marble race and pachinko modes.
 * Wraps Engine/World to enable future Planck.js migration if needed.
 *
 * Rules (from research):
 * - Always use fixed timestep (FIXED_DELTA), never pass variable delta
 * - Never use Matter.Runner — PixiJS Ticker drives the loop
 * - Sprite anchor must be (0.5, 0.5) for position sync
 * - engine.timing.timeScale must NOT be changed dynamically (Issue #303)
 */
export class PhysicsWorld {
  readonly engine: Matter.Engine;
  readonly world: Matter.World;
  private readonly eventHandlers: Array<{ name: string; handler: (...args: unknown[]) => void }> = [];

  constructor(gravity = { x: 0, y: 1 }) {
    this.engine = Matter.Engine.create({
      gravity,
      positionIterations: 10,  // 기본 6 → 경사면 정확도 향상
      velocityIterations: 8,   // 기본 4 → 속도 계산 안정화
      enableSleeping: false,   // 구슬이 잠들어 중력 무시하는 현상 방지
    });
    this.world = this.engine.world;
  }

  /** Step the physics simulation with fixed timestep (4 sub-steps for CCD) */
  update(deltaScale = 1): void {
    const subSteps = 4;
    const dt = (FIXED_DELTA * deltaScale) / subSteps;
    for (let i = 0; i < subSteps; i++) {
      Matter.Engine.update(this.engine, dt);
    }
  }

  /** Add bodies to the world */
  addBodies(...bodies: Matter.Body[]): void {
    Matter.Composite.add(this.world, bodies);
  }

  /** Remove bodies from the world */
  removeBodies(...bodies: Matter.Body[]): void {
    Matter.Composite.remove(this.world, bodies);
  }

  /** Register a collision start event handler */
  onCollisionStart(handler: (event: Matter.IEventCollision<Matter.Engine>) => void): void {
    Matter.Events.on(this.engine, 'collisionStart', handler);
    this.eventHandlers.push({ name: 'collisionStart', handler: handler as (...args: unknown[]) => void });
  }

  /** Register a beforeUpdate event handler */
  onBeforeUpdate(handler: (event: Matter.IEventTimestamped<Matter.Engine>) => void): void {
    Matter.Events.on(this.engine, 'beforeUpdate', handler);
    this.eventHandlers.push({ name: 'beforeUpdate', handler: handler as (...args: unknown[]) => void });
  }

  /** Set gravity dynamically (for chaos events) */
  setGravity(x: number, y: number): void {
    this.engine.gravity.x = x;
    this.engine.gravity.y = y;
  }

  /** Create a static rectangle (wall/floor/ramp) */
  static createWall(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Matter.IChamferableBodyDefinition,
  ): Matter.Body {
    return Matter.Bodies.rectangle(x, y, width, height, { isStatic: true, ...options });
  }

  /** Create a dynamic circle (marble/ball) */
  static createBall(x: number, y: number, radius: number, options?: Matter.IBodyDefinition): Matter.Body {
    return Matter.Bodies.circle(x, y, radius, {
      restitution: 0.3,    // 0.5 → 0.3: 반발 줄여 역주행/튕김 감소
      friction: 0.01,      // 0.05 → 0.01: 경사면 구름 최적화 (RESEARCH 권장 0.005~0.01)
      frictionAir: 0.01,   // 0.001 → 0.01: 공기저항 증가로 최고속도 제한
      frictionStatic: 0.03,
      ...options,
    });
  }

  /** Create a static circle (pin) */
  static createPin(x: number, y: number, radius: number): Matter.Body {
    return Matter.Bodies.circle(x, y, radius, {
      isStatic: true,
      restitution: 1.0,
      friction: 0,
    });
  }

  /** Create a sensor body (for slot detection) */
  static createSensor(x: number, y: number, width: number, height: number, label: string): Matter.Body {
    return Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      isSensor: true,
      label,
    });
  }

  /** Clean up — remove all event handlers, clear world and engine */
  destroy(): void {
    // Remove all registered event handlers first (prevents GC leak)
    for (const { name, handler } of this.eventHandlers) {
      Matter.Events.off(this.engine, name, handler as (e: unknown) => void);
    }
    this.eventHandlers.length = 0;

    Matter.Composite.clear(this.world, false);
    Matter.Engine.clear(this.engine);
  }
}
