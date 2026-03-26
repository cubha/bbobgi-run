import { Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { PLAYER_COLORS, FONT_BODY } from '@utils/constants';
import { DUMMY_COLORS } from '@maps/TrackData';
import type { Player } from '@/types';

/** 더미 구슬 색상 순환 카운터 */
let dummyColorIndex = 0;

/** 더미 색상 인덱스 초기화 (새 레이스 시작 시 호출) */
export const resetDummyColorIndex = (): void => {
  dummyColorIndex = 0;
};

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
  private _retired = false;
  private _isDummy: boolean;

  constructor(
    player: Player,
    x: number,
    y: number,
    radius = 12,
    options?: Matter.IBodyDefinition,
  ) {
    this.player = player;
    this.radius = radius;
    this._isDummy = player.isDummy === true;

    // 더미 구슬은 회색 계열, 일반 구슬은 플레이어 색상
    if (this._isDummy) {
      this.color = DUMMY_COLORS[dummyColorIndex % DUMMY_COLORS.length];
      dummyColorIndex++;
    } else {
      this.color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
    }

    // Physics body — 더미 구슬은 mass를 0.7배로 설정
    const bodyOptions: Matter.IBodyDefinition = this._isDummy
      ? { ...options, mass: (options?.mass ?? 1) * 0.7 }
      : { ...options };
    this.body = PhysicsWorld.createBall(x, y, this.radius, bodyOptions);

    // PixiJS container
    this.container = new Container();

    // Marble circle with pixel-art style
    this.bodyGfx = new Graphics();
    this.drawMarble();
    this.container.addChild(this.bodyGfx);

    // Name label
    this.nameLabel = new Text({
      text: player.name,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 10,
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

  get retired(): boolean {
    return this._retired;
  }

  get isDummy(): boolean {
    return this._isDummy;
  }

  /** Mark this marble as finished */
  markFinished(time: number): void {
    this._finished = true;
    this._finishTime = time;
  }

  /** Mark this marble as retired (stuck/out-of-bounds) */
  markRetired(): void {
    this._retired = true;
    this._finished = true;
    this._finishTime = Infinity;
    this.container.alpha = 0.3;
  }

  /** Sync PixiJS container position/rotation with Matter.js body */
  sync(): void {
    this.container.x = this.body.position.x;
    this.container.y = this.body.position.y;
    this.bodyGfx.rotation = this.body.angle;
  }

  /** 벽 경계 클램프 (좌우 이탈 방지) */
  clampToBounds(minX: number, maxX: number): void {
    const x = this.body.position.x;
    const r = this.radius;
    if (x - r < minX) {
      Matter.Body.setPosition(this.body, { x: minX + r, y: this.body.position.y });
      Matter.Body.setVelocity(this.body, { x: Math.abs(this.body.velocity.x) * 0.5, y: this.body.velocity.y });
    } else if (x + r > maxX) {
      Matter.Body.setPosition(this.body, { x: maxX - r, y: this.body.position.y });
      Matter.Body.setVelocity(this.body, { x: -Math.abs(this.body.velocity.x) * 0.5, y: this.body.velocity.y });
    }
  }

  private drawMarble(): void {
    const g = this.bodyGfx;
    const r = this.radius;
    const dark = this.darken(this.color, 0.4);

    // Shadow (offset rect — pixel-art style)
    g.rect(-r + 2, -r + 2, r * 2, r * 2);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // Main square (dot-style)
    g.rect(-r, -r, r * 2, r * 2);
    g.fill({ color: this.color });

    // Top-left highlight (2px dot)
    g.rect(-r + 2, -r + 2, 4, 4);
    g.fill({ color: 0xffffff, alpha: 0.8 });

    // Bottom-right shadow dot
    g.rect(r - 4, r - 4, 4, 4);
    g.fill({ color: dark });
  }

  private darken(color: number, amount: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount));
    const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount));
    const b = Math.max(0, (color & 0xff) - Math.round(255 * amount));
    return (r << 16) | (g << 8) | b;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
