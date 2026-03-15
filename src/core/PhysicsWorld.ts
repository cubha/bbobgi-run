import Matter from 'matter-js';

/**
 * Matter.js abstraction layer.
 * Used by marble race and pachinko modes.
 * Wraps Engine/World to enable future Planck.js migration if needed.
 */
export class PhysicsWorld {
  readonly engine: Matter.Engine;
  readonly world: Matter.World;

  constructor(gravity = { x: 0, y: 1 }) {
    this.engine = Matter.Engine.create({
      gravity,
    });
    this.world = this.engine.world;
  }

  /** Step the physics simulation */
  update(delta: number): void {
    Matter.Engine.update(this.engine, delta * 16.667); // normalize to ~60fps
  }

  /** Add bodies to the world */
  addBodies(...bodies: Matter.Body[]): void {
    Matter.Composite.add(this.world, bodies);
  }

  /** Remove bodies from the world */
  removeBodies(...bodies: Matter.Body[]): void {
    Matter.Composite.remove(this.world, bodies);
  }

  /** Create a static rectangle (wall/floor) */
  static createWall(x: number, y: number, width: number, height: number): Matter.Body {
    return Matter.Bodies.rectangle(x, y, width, height, { isStatic: true });
  }

  /** Create a dynamic circle (marble/ball) */
  static createBall(x: number, y: number, radius: number, options?: Matter.IBodyDefinition): Matter.Body {
    return Matter.Bodies.circle(x, y, radius, {
      restitution: 0.6,
      friction: 0.1,
      ...options,
    });
  }

  /** Create a static circle (pin) */
  static createPin(x: number, y: number, radius: number): Matter.Body {
    return Matter.Bodies.circle(x, y, radius, { isStatic: true });
  }

  /** Clean up */
  destroy(): void {
    Matter.World.clear(this.world, false);
    Matter.Engine.clear(this.engine);
  }
}
