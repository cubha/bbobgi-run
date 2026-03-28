import { Container, Graphics, Text } from 'pixi.js';
import { PhysicsWorld, Vec2, type Body } from '@core/PhysicsWorld';
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
 * Marble entity — links a Planck.js circle body to a PixiJS Container.
 * Syncs position/rotation every frame via sync().
 */
export class Marble {
  readonly container: Container;
  readonly player: Player;
  readonly body: Body;
  readonly radius: number;
  readonly color: number;

  private bodyGfx: Graphics;
  private nameLabel: Text;
  private _finished = false;
  private _finishTime = 0;
  private _retired = false;
  private _isDummy: boolean;

  // 트레일 시스템
  private trailGfx: Graphics;
  private trailPoints: Array<{ x: number; y: number }> = [];
  private static readonly MAX_TRAIL = 6;

  // 1등 글로우
  private leaderGfx: Graphics;
  private _isLeader = false;

  constructor(
    player: Player,
    x: number,
    y: number,
    radius: number,
    physics: PhysicsWorld,
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
    const massOpt = this._isDummy ? { mass: 0.7 } : {};
    this.body = physics.createBall(x, y, this.radius, {
      restitution: 0.4,
      friction: 0.02,
      linearDamping: 0.5,
      ...massOpt,
    });

    // PixiJS container
    this.container = new Container();

    // 트레일 (구슬 아래 레이어)
    this.trailGfx = new Graphics();
    this.container.addChild(this.trailGfx);

    // 1등 글로우 (구슬 아래 레이어)
    this.leaderGfx = new Graphics();
    this.leaderGfx.visible = false;
    this.container.addChild(this.leaderGfx);

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

  /** Sync PixiJS container position/rotation with Planck.js body */
  sync(): void {
    const pos = this.body.getPosition();
    this.container.x = pos.x;
    this.container.y = pos.y;
    this.bodyGfx.rotation = this.body.getAngle();

    // 트레일 업데이트 (더미 제외)
    if (!this._isDummy && !this._retired) {
      this.trailPoints.unshift({ x: 0, y: 0 });
      if (this.trailPoints.length > Marble.MAX_TRAIL) {
        this.trailPoints.length = Marble.MAX_TRAIL;
      }
      this.trailGfx.clear();
      for (let i = 1; i < this.trailPoints.length; i++) {
        const t = this.trailPoints[i];
        if (!t) continue;
        const alpha = 0.3 * (1 - i / Marble.MAX_TRAIL);
        const r = this.radius * (1 - i * 0.1);
        this.trailGfx.circle(t.x - (pos.x - this.container.x), t.y - (pos.y - this.container.y), Math.max(r, 2));
        this.trailGfx.fill({ color: this.color, alpha });
      }
      // 이전 위치를 글로벌 좌표로 오프셋 저장 (다음 프레임에서 container 기준)
      for (let i = this.trailPoints.length - 1; i >= 1; i--) {
        const prev = this.trailPoints[i - 1];
        if (prev) {
          this.trailPoints[i] = { x: prev.x, y: prev.y };
        }
      }
    }
  }

  /** 1등 구슬 글로우 토글 */
  setLeader(isLeader: boolean): void {
    if (this._isLeader === isLeader) return;
    this._isLeader = isLeader;
    this.leaderGfx.clear();
    if (isLeader) {
      this.leaderGfx.circle(0, 0, this.radius * 2);
      this.leaderGfx.fill({ color: this.color, alpha: 0.2 });
      this.leaderGfx.circle(0, 0, this.radius * 1.5);
      this.leaderGfx.fill({ color: 0xffffff, alpha: 0.1 });
      this.leaderGfx.visible = true;
    } else {
      this.leaderGfx.visible = false;
    }
  }

  /** 벽 경계 클램프 (좌우 이탈 방지) */
  clampToBounds(minX: number, maxX: number): void {
    const pos = this.body.getPosition();
    const x = pos.x;
    const r = this.radius;
    if (x - r < minX) {
      this.body.setPosition(new Vec2(minX + r, pos.y));
      const vel = this.body.getLinearVelocity();
      this.body.setLinearVelocity(new Vec2(Math.abs(vel.x) * 0.5, vel.y));
    } else if (x + r > maxX) {
      this.body.setPosition(new Vec2(maxX - r, pos.y));
      const vel = this.body.getLinearVelocity();
      this.body.setLinearVelocity(new Vec2(-Math.abs(vel.x) * 0.5, vel.y));
    }
  }

  private drawMarble(): void {
    const g = this.bodyGfx;
    const r = this.radius;
    const light = this.lighten(this.color, 0.3);
    const dark = this.darken(this.color, 0.4);

    // Shadow
    g.circle(1.5, 1.5, r);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // Main circle
    g.circle(0, 0, r);
    g.fill({ color: this.color });

    // Inner highlight (top-left)
    g.circle(-r * 0.3, -r * 0.3, r * 0.35);
    g.fill({ color: light, alpha: 0.5 });

    // Specular dot
    g.circle(-r * 0.25, -r * 0.25, r * 0.15);
    g.fill({ color: 0xffffff, alpha: 0.7 });

    // Bottom shadow crescent
    g.circle(r * 0.15, r * 0.15, r * 0.7);
    g.fill({ color: dark, alpha: 0.2 });
  }

  private lighten(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
    const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
    return (r << 16) | (g << 8) | b;
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
