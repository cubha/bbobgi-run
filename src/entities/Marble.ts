import { Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { PLAYER_COLORS, FONT_BODY } from '@utils/constants';
import type { Player } from '@/types';

const MARBLE_RADIUS = 8;

/**
 * Marble entity — links a Matter.js circle body to a PixiJS Container.
 * Syncs position/rotation every frame via sync().
 */
export class Marble {
  readonly container: Container;
  readonly player: Player;
  readonly body: Matter.Body;
  readonly radius: number;
  readonly color: number;

  private bodyGfx: Graphics;
  private nameLabel: Text;
  private _finished = false;
  private _finishTime = 0;

  constructor(player: Player, x: number, y: number, options?: Matter.IBodyDefinition) {
    this.player = player;
    this.radius = MARBLE_RADIUS;
    this.color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

    // Physics body
    this.body = PhysicsWorld.createBall(x, y, this.radius, options);

    // PixiJS container
    this.container = new Container();

    // Marble circle with gradient-like highlight
    this.bodyGfx = new Graphics();
    this.drawMarble();
    this.container.addChild(this.bodyGfx);

    // Name label
    this.nameLabel = new Text({
      text: player.name,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 8,
        fontWeight: '700',
        fill: this.color,
      },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = this.radius + 2;
    this.container.addChild(this.nameLabel);

    // Initial position
    this.container.x = x;
    this.container.y = y;
  }

  get finished(): boolean {
    return this._finished;
  }

  get finishTime(): number {
    return this._finishTime;
  }

  /** Mark this marble as finished */
  markFinished(time: number): void {
    this._finished = true;
    this._finishTime = time;
  }

  /** Sync PixiJS container position/rotation with Matter.js body */
  sync(): void {
    this.container.x = this.body.position.x;
    this.container.y = this.body.position.y;
    this.bodyGfx.rotation = this.body.angle;
  }

  private drawMarble(): void {
    const g = this.bodyGfx;
    const r = this.radius;

    // Shadow
    g.ellipse(1, 2, r, r * 0.6);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // Main circle
    g.circle(0, 0, r);
    g.fill({ color: this.color });

    // Inner highlight (glossy effect)
    g.circle(-r * 0.25, -r * 0.25, r * 0.45);
    g.fill({ color: 0xffffff, alpha: 0.3 });

    // Small specular dot
    g.circle(-r * 0.3, -r * 0.35, r * 0.15);
    g.fill({ color: 0xffffff, alpha: 0.6 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
