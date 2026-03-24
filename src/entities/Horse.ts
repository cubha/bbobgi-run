import { Container, Graphics, Text } from 'pixi.js';
import { SeededRandom } from '@utils/random';
import { PLAYER_COLORS, COLORS, FONT_BODY, FONT_DISPLAY } from '@utils/constants';
import type { Player, TrackParams } from '@/types';

export type HorseEventType = 'none' | 'wipeout' | 'nitro' | 'reverse';

const EVENT_DURATION: Record<HorseEventType, number> = {
  none: 0,
  wipeout: 2.0,
  nitro: 2.5,
  reverse: 1.0,
};

const EVENT_ICON: Record<HorseEventType, string> = {
  none: '',
  wipeout: '⭐ 넘어짐!',
  nitro: '🔥 NITRO!',
  reverse: '?! 역주행',
};

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
  private eventIconText: Text;
  private elapsed: number = 0;

  // Oval track fields
  private theta: number = Math.PI;
  private totalAngle: number = 0;
  private readonly laneRadius: number;
  private readonly trackParams: TrackParams;

  // Event state
  private _eventType: HorseEventType = 'none';
  private eventTimer: number = 0;

  constructor(player: Player, laneIndex: number, seed: number, trackParams: TrackParams) {
    this.player = player;
    this.rng = new SeededRandom(seed);
    this.color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
    this.trackParams = trackParams;

    this.laneRadius = trackParams.ry + laneIndex * trackParams.laneWidth;

    // baseSpeed: 0.40~0.58 rad/sec → 2 laps in ~22-31 seconds
    this.baseSpeed = this.rng.range(0.40, 0.58);
    this.currentSpeed = this.baseSpeed;

    this.container = new Container();
    this.bodyGfx = new Graphics();
    this.container.addChild(this.bodyGfx);

    // Event icon above horse
    this.eventIconText = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
    });
    this.eventIconText.anchor.set(0.5, 1);
    this.eventIconText.y = -34;
    this.eventIconText.visible = false;
    this.container.addChild(this.eventIconText);

    // Name label below horse
    const nameText = new Text({
      text: player.name,
      style: { fontFamily: FONT_BODY, fontSize: 10, fontWeight: '700', fill: this.color },
    });
    nameText.anchor.set(0.5, 0);
    nameText.y = 18;
    this.container.addChild(nameText);

    this.drawHorse(0);
    this.container.x = this.x;
    this.container.y = this.y;
  }

  get x(): number {
    return this.trackParams.cx + this.laneRadius * Math.cos(this.theta) * this.trackParams.ratio;
  }

  get y(): number {
    return this.trackParams.cy + this.laneRadius * Math.sin(this.theta);
  }

  get progress(): number {
    return this.totalAngle / (Math.PI * 2 * this.trackParams.laps);
  }

  get finished(): boolean {
    return this._finished;
  }

  get currentEvent(): HorseEventType {
    return this._eventType;
  }

  triggerEvent(type: HorseEventType): void {
    if (this._finished || type === 'none') return;
    this._eventType = type;
    this.eventTimer = EVENT_DURATION[type];
    this.eventIconText.text = EVENT_ICON[type];
    this.eventIconText.style.fill =
      type === 'nitro' ? COLORS.orange : type === 'reverse' ? COLORS.primary : COLORS.gold;
    this.eventIconText.visible = true;
  }

  update(delta: number): void {
    if (this._finished) return;

    this.elapsed += delta;

    // Event countdown
    if (this._eventType !== 'none') {
      this.eventTimer -= delta;
      if (this.eventTimer <= 0) {
        this._eventType = 'none';
        this.eventIconText.visible = false;
      }
    }

    // Speed noise every 0.5s (skip during wipeout)
    if (this._eventType !== 'wipeout') {
      this.speedTimer += delta;
      if (this.speedTimer >= 0.5) {
        this.speedTimer -= 0.5;
        const noise = this.rng.range(-0.06, 0.06);
        this.currentSpeed = Math.max(0.22, Math.min(0.75, this.baseSpeed + noise));
      }
    }

    // Movement physics based on event
    if (this._eventType !== 'wipeout') {
      const dTheta =
        this._eventType === 'nitro'
          ? this.currentSpeed * delta * 3.0
          : this.currentSpeed * delta;

      if (this._eventType === 'reverse') {
        this.theta += dTheta;
        this.totalAngle = Math.max(0, this.totalAngle - dTheta);
      } else {
        this.theta -= dTheta;
        this.totalAngle += dTheta;
      }
    }

    if (this.totalAngle >= Math.PI * 2 * this.trackParams.laps) {
      this._finished = true;
    }

    this.container.x = this.x;
    this.container.y = this.y;
    this.container.rotation = 0;

    // Flip horizontally based on horizontal velocity
    const vx = this.laneRadius * Math.sin(this.theta) * this.trackParams.ratio;
    this.bodyGfx.scale.x = vx >= 0 ? 1 : -1;

    this.drawHorse(this.elapsed);
  }

  reset(): void {
    this.theta = Math.PI;
    this.totalAngle = 0;
    this._finished = false;
    this._eventType = 'none';
    this.eventTimer = 0;
    this.eventIconText.visible = false;
    this.currentSpeed = this.baseSpeed;
    this.speedTimer = 0;
    this.elapsed = 0;
    this.container.x = this.x;
    this.container.y = this.y;
    this.container.rotation = 0;
    this.bodyGfx.scale.x = 1;
    this.drawHorse(0);
  }

  private drawHorse(time: number): void {
    if (this._eventType === 'wipeout') {
      this.drawWipeout(time);
      return;
    }

    const g = this.bodyGfx;
    g.clear();

    const PX = 3;
    const color = this.color;
    const dark = this.darken(color, 0.45);
    const lighter = this.lighten(color, 0.25);

    // 4-frame gallop cycle — faster during nitro
    const fps = this._eventType === 'nitro' ? 20 : 12;
    const frame = Math.floor(time * fps) % 4;

    const GALLOP: [number, number, number, number, number, number, number, number][] = [
      [PX * 2, -PX,    -PX,     PX,    -PX * 2, -PX,    PX,      PX],
      [PX,     -PX * 2, PX,    -PX * 2, -PX,    -PX * 2, -PX,   -PX * 2],
      [-PX,    -PX,     PX * 2, PX,     PX,     -PX,    -PX * 2, PX],
      [PX * 3, -PX * 2, -PX * 2, -PX * 2, -PX * 3, -PX * 2, PX * 2, -PX * 2],
    ];

    const [frx, fry, flx, fly, brx, bry, blx, bly] = GALLOP[frame];
    const bodyBob = (frame === 1 || frame === 3) ? -PX : 0;

    // ── Nitro trail ───────────────────────────────
    if (this._eventType === 'nitro') {
      const trailCount = 4;
      for (let t = 1; t <= trailCount; t++) {
        const trailAlpha = 0.5 - t * 0.1;
        const tx = -t * PX * 4;
        g.rect(tx - 6, -6 + bodyBob, PX * 8, PX * 4);
        g.fill({ color: COLORS.orange, alpha: trailAlpha });
      }
    }

    // ── Shadow ────────────────────────────────────
    g.rect(-15, 14 - bodyBob, 30, PX);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // ── Tail ──────────────────────────────────────
    const tailWave = Math.sin(time * 8) * PX;
    g.rect(-21, -6 + bodyBob + tailWave, PX * 2, PX * 2);
    g.fill({ color: dark });
    g.rect(-18, -3 + bodyBob + tailWave * 0.5, PX * 2, PX * 2);
    g.fill({ color: dark });
    g.rect(-18, 0 + bodyBob, PX, PX * 3);
    g.fill({ color: dark });

    // ── Body ──────────────────────────────────────
    g.rect(-15, -9 + bodyBob, PX * 10, PX * 6);
    g.fill({ color: this._eventType === 'nitro' ? this.lighten(color, 0.15) : color });
    g.rect(-12, -9 + bodyBob, PX * 8, PX);
    g.fill({ color: lighter });

    // ── Neck ──────────────────────────────────────
    g.rect(12, -15 + bodyBob, PX * 3, PX * 3);
    g.fill({ color });

    // ── Head ──────────────────────────────────────
    g.rect(15, -21 + bodyBob, PX * 4, PX * 3);
    g.fill({ color });
    g.rect(24, -18 + bodyBob, PX, PX);
    g.fill({ color: dark });
    g.rect(18, -21 + bodyBob, PX, PX);
    g.fill({ color: 0x111111 });
    g.rect(15, -24 + bodyBob, PX, PX * 2);
    g.fill({ color: dark });

    // ── Mane ──────────────────────────────────────
    const maneWave = Math.sin(time * 7 + 1) * PX * 0.5;
    g.rect(9, -18 + bodyBob + maneWave, PX, PX * 4);
    g.fill({ color: dark });
    g.rect(12, -18 + bodyBob, PX, PX * 2);
    g.fill({ color: dark });

    // ── Legs ──────────────────────────────────────
    const legLen = PX * 5;
    const legY = -3 + bodyBob;

    g.rect(6 + frx,  legY + fry,          PX, legLen); g.fill({ color });
    g.rect(6 + frx,  legY + fry + legLen,  PX, PX);    g.fill({ color: dark });
    g.rect(3 + flx,  legY + fly,           PX, legLen); g.fill({ color: dark });
    g.rect(3 + flx,  legY + fly + legLen,  PX, PX);    g.fill({ color: 0x111111 });
    g.rect(-6 + brx, legY + bry,           PX, legLen); g.fill({ color });
    g.rect(-6 + brx, legY + bry + legLen,  PX, PX);    g.fill({ color: dark });
    g.rect(-9 + blx, legY + bly,           PX, legLen); g.fill({ color: dark });
    g.rect(-9 + blx, legY + bly + legLen,  PX, PX);    g.fill({ color: 0x111111 });

    // ── Jockey ────────────────────────────────────
    const jockeyColor = this.lighten(color, 0.5);
    const jockeyY = -12 + bodyBob;
    g.rect(3,  jockeyY - PX * 3, PX * 4, PX * 3); g.fill({ color: jockeyColor });
    g.rect(9,  jockeyY - PX * 5, PX * 3, PX * 2); g.fill({ color: 0xffffff });
    g.rect(9,  jockeyY - PX * 5, PX * 3, PX);     g.fill({ color: this.darken(jockeyColor, 0.2) });
    g.rect(12, jockeyY - PX * 2, PX * 3, PX);     g.fill({ color: jockeyColor });
  }

  private drawWipeout(time: number): void {
    const g = this.bodyGfx;
    g.clear();

    const PX = 3;
    const color = this.color;
    const dark = this.darken(color, 0.45);

    // Body horizontal (lying on side)
    g.rect(-18, 0, PX * 12, PX * 4);
    g.fill({ color });
    g.rect(-15, 0, PX * 10, PX);
    g.fill({ color: this.lighten(color, 0.2) });

    // Head (flopped to side)
    g.rect(12, -3, PX * 4, PX * 3);
    g.fill({ color });
    g.rect(21, 0, PX, PX);
    g.fill({ color: dark });

    // Eye (X shape = knocked out)
    g.rect(15, -3, PX, PX);
    g.fill({ color: 0x111111 });

    // All 4 legs sticking upward
    g.rect(-12, -PX * 4, PX, PX * 4); g.fill({ color });
    g.rect(-9,  -PX * 3, PX, PX * 3); g.fill({ color: dark });
    g.rect(-3,  -PX * 4, PX, PX * 4); g.fill({ color });
    g.rect(0,   -PX * 3, PX, PX * 3); g.fill({ color: dark });

    // Jockey tumbled off (sitting next to horse, wobbling)
    const jockeyColor = this.lighten(color, 0.5);
    const wobble = Math.sin(time * 6) * PX;
    g.rect(-24, -PX * 3 + wobble, PX * 2, PX * 3); g.fill({ color: jockeyColor });
    g.rect(-24, -PX * 5 + wobble, PX * 2, PX * 2); g.fill({ color: 0xffffff });

    // Spinning stars (4 dots rotating)
    const starAngle = time * 6;
    const STAR_COLOR = COLORS.gold;
    for (let i = 0; i < 4; i++) {
      const sa = starAngle + (i * Math.PI) / 2;
      const sx = Math.round(Math.cos(sa) * 10);
      const sy = Math.round(Math.sin(sa) * 7) - 16;
      g.rect(sx - 2, sy - 2, PX, PX);
      g.fill({ color: STAR_COLOR });
    }
  }

  private darken(color: number, amount: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount));
    const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount));
    const b = Math.max(0, (color & 0xff) - Math.round(255 * amount));
    return (r << 16) | (g << 8) | b;
  }

  private lighten(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
    const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
    return (r << 16) | (g << 8) | b;
  }
}
