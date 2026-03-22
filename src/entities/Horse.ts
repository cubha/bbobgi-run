import { Container, Graphics, Text } from 'pixi.js';
import { SeededRandom } from '@utils/random';
import { OVAL_TRACK, PLAYER_COLORS } from '@utils/constants';
import type { Player } from '@/types';

export class Horse {
  readonly container: Container;
  readonly player: Player;

  private rng: SeededRandom;
  private _finished: boolean = false;
  private currentSpeed: number;
  private speedTimer: number = 0;
  private readonly baseSpeed: number;
  private readonly color: number;
  private bodyGfx: Graphics;
  private elapsed: number = 0;

  // Oval track fields
  private theta: number = Math.PI;    // start angle (left-center of oval)
  private totalAngle: number = 0;     // cumulative rotation angle
  private readonly laneRadius: number; // this horse's lane radius (vertical semi-axis)

  constructor(player: Player, laneIndex: number, seed: number) {
    this.player = player;
    this.rng = new SeededRandom(seed);
    this.color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

    // laneRadius: base ry + lane offset
    this.laneRadius = OVAL_TRACK.ry + laneIndex * OVAL_TRACK.laneWidth;

    // baseSpeed: 0.08~0.12 rad/sec (upscaled from 0.015~0.025)
    this.baseSpeed = this.rng.range(0.08, 0.12);
    this.currentSpeed = this.baseSpeed;

    this.container = new Container();
    this.bodyGfx = new Graphics();
    this.container.addChild(this.bodyGfx);

    // Name label below the horse
    const nameText = new Text({
      text: player.name,
      style: {
        fontFamily: 'Noto Sans KR, sans-serif',
        fontSize: 10,
        fontWeight: '700',
        fill: this.color,
      },
    });
    nameText.anchor.set(0.5, 0);
    nameText.y = 16;
    this.container.addChild(nameText);

    this.drawHorse(0);
    this.container.x = this.x;
    this.container.y = this.y;
  }

  // x/y getters: parametric ellipse with lane-scaled radii
  get x(): number {
    return OVAL_TRACK.cx + this.laneRadius * Math.cos(this.theta) * (OVAL_TRACK.rx / OVAL_TRACK.ry);
  }

  get y(): number {
    return OVAL_TRACK.cy + this.laneRadius * Math.sin(this.theta);
  }

  // progress: cumulative angle / (2π * laps)
  get progress(): number {
    return this.totalAngle / (Math.PI * 2 * OVAL_TRACK.laps);
  }

  get finished(): boolean {
    return this._finished;
  }

  update(delta: number): void {
    if (this._finished) return;

    this.elapsed += delta;
    this.speedTimer += delta;

    // Every 0.5s, apply noise to speed
    if (this.speedTimer >= 0.5) {
      this.speedTimer -= 0.5;
      const noise = this.rng.range(-0.025, 0.025);
      this.currentSpeed = Math.max(0.04, Math.min(0.175, this.baseSpeed + noise));
    }

    // Advance theta (clockwise in math convention)
    const dTheta = this.currentSpeed * delta;
    this.theta -= dTheta;
    this.totalAngle += dTheta;

    if (this.totalAngle >= Math.PI * 2 * OVAL_TRACK.laps) {
      this._finished = true;
    }

    this.container.x = this.x;
    this.container.y = this.y;

    // Rotate container to face direction of motion
    this.container.rotation = Math.atan2(
      -this.laneRadius * Math.cos(this.theta),
      this.laneRadius * Math.sin(this.theta) * (OVAL_TRACK.rx / OVAL_TRACK.ry),
    );

    this.drawHorse(this.elapsed);
  }

  reset(): void {
    this.theta = Math.PI;
    this.totalAngle = 0;
    this._finished = false;
    this.currentSpeed = this.baseSpeed;
    this.speedTimer = 0;
    this.elapsed = 0;
    this.container.x = this.x;
    this.container.y = this.y;
    this.container.rotation = 0;
    this.drawHorse(0);
  }

  private drawHorse(time: number): void {
    const g = this.bodyGfx;
    g.clear();

    const legPhase = Math.sin(time * 9);
    const color = this.color;
    const dark = this.darken(color, 0.4);

    // Shadow beneath horse
    g.ellipse(2, 14, 14, 4);
    g.fill({ color: 0x000000, alpha: 0.3 });

    // Body — ellipse
    g.ellipse(0, 0, 16, 10);
    g.fill({ color });

    // Body shading (top highlight)
    g.ellipse(-2, -3, 10, 5);
    g.fill({ color: 0xffffff, alpha: 0.15 });

    // Neck
    g.moveTo(12, -5);
    g.lineTo(18, -10);
    g.stroke({ color, width: 5 });

    // Head — rounded
    g.roundRect(14, -16, 12, 9, 3);
    g.fill({ color });

    // Eye
    g.circle(22, -13, 1.5);
    g.fill({ color: 0x000000 });

    // Ear
    g.moveTo(18, -15);
    g.lineTo(16, -20);
    g.lineTo(21, -17);
    g.fill({ color: dark });

    // Tail — flowing
    g.moveTo(-16, -2);
    g.quadraticCurveTo(-26, 2 + legPhase * 3, -24, 8 + legPhase * 2);
    g.stroke({ color: dark, width: 3 });

    // Mane
    g.moveTo(10, -8);
    g.quadraticCurveTo(6, -14, 3, -10);
    g.stroke({ color: dark, width: 2.5 });

    // Legs
    const lf = legPhase * 5;
    const lb = -legPhase * 5;

    g.moveTo(8, 8);  g.lineTo(8 + lf, 20);  g.stroke({ color, width: 2.5 });
    g.moveTo(11, 8); g.lineTo(11 - lf, 20); g.stroke({ color, width: 2.5 });
    g.moveTo(-6, 8); g.lineTo(-6 + lb, 20); g.stroke({ color, width: 2.5 });
    g.moveTo(-3, 8); g.lineTo(-3 - lb, 20); g.stroke({ color, width: 2.5 });

    // Hooves
    g.roundRect(8 + lf - 2, 18, 5, 3, 1);   g.fill({ color: dark });
    g.roundRect(11 - lf - 2, 18, 5, 3, 1);  g.fill({ color: dark });
    g.roundRect(-6 + lb - 2, 18, 5, 3, 1);  g.fill({ color: dark });
    g.roundRect(-3 - lb - 2, 18, 5, 3, 1);  g.fill({ color: dark });
  }

  private darken(color: number, amount: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount));
    const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount));
    const b = Math.max(0, (color & 0xff) - Math.round(255 * amount));
    return (r << 16) | (g << 8) | b;
  }
}
