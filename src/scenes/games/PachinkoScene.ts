import { Container, Graphics, Text } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld, Vec2, CircleShape, BoxShape, type Body } from '@core/PhysicsWorld';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { ChaosEffect } from '@effects/ChaosEffect';
import { SeededRandom } from '@utils/random';
import type { GameConfig, GameResult, RankingEntry, Player } from '@/types';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  PLAYER_COLORS,
  COUNTDOWN_SEC,
  SLOWMO_RATE,
  FONT_DISPLAY,
  FONT_BODY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

type GamePhase = 'countdown' | 'dropping' | 'chaos' | 'tension' | 'slowmo' | 'done';

/** Board layout constants */
const BOARD = {
  leftX: 20,
  rightX: 370,
  topY: 100,
  pinGridBottomY: 580,
  funnelTopY: 590,
  funnelBottomY: 760,
  goalY: 790,
  goalWidth: 26,       // ~1.4× ball diameter (ball=9)
  pinRadius: 4,
  ballRadius: 9,
  pinRows: 10,
  pinCols: 12,
  pinSpacingY: 48,
  wallThick: 12,
  dropAreaY: 82,
} as const;

/** Pachinko timing (game-elapsed seconds, after countdown) */
const PACHINKO_DURATION_SEC = 25;
const PACHINKO_GATE1_SEC = 5;
const PACHINKO_GATE2_SEC = 15;
const PACHINKO_CHAOS_SEC = 15;
const PACHINKO_TENSION_SEC = 20;
const PACHINKO_SLOWMO_SEC = 23;

const BUMPER_RADIUS = 14;
const SPINNER_W = 60;
const SPINNER_H = 8;

interface PachinkoBall {
  body: Body;
  gfx: Container;
  player: Player;
  finished: boolean;
  finishTime: number;
}

interface Bumper {
  body: Body;
  gfx: Graphics;
  overcharged: boolean;
}

interface Spinner {
  body: Body;
  gfx: Graphics;
}

interface Gate {
  body: Body;
  gfx: Graphics;
  open: boolean;
}

/**
 * Pachinko scene — balls fall through pin grid + devices into a single funnel goal.
 * Arrival order = ranking. Supports multiple balls per player (config.ballCount).
 */
export class PachinkoScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

  private physics: PhysicsWorld | null = null;
  private balls: PachinkoBall[] = [];
  private finishOrder: Player[] = [];  // first-ball-wins: player added once
  private totalElapsed = 0;
  private phase: GamePhase = 'countdown';
  private rng: SeededRandom | null = null;

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();
  private chaos: ChaosEffect | null = null;

  private readonly boardContainer = new Container();
  private readonly ballContainer = new Container();
  private readonly uiContainer = new Container();

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private goalSensor: Body | null = null;
  private rankLabel: Text | null = null;

  private chaosApplied = false;
  private bumperOvercharged = false;
  private gate1Done = false;
  private gate2Done = false;
  private dropIndex = 0;
  private dropTimer = 0;

  private bumpers: Bumper[] = [];
  private spinners: Spinner[] = [];
  private gates: Gate[] = [];

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  setScaleInfo(s: ScaleInfo): void {
    this._scaleInfo = s;
  }

  async init(): Promise<void> {
    if (!this.config) return;

    this.rng = new SeededRandom(this.config.seed);
    this.physics = new PhysicsWorld({ x: 0, y: 980 });

    this.container.addChild(this.boardContainer);
    this.container.addChild(this.ballContainer);
    this.container.addChild(this.uiContainer);

    this.buildBoard();
    this.buildHUD();
    this.setupPhysicsHandlers();
    this.startCountdown();
  }

  update(_delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = _delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') return;

    // End condition
    if (this.totalElapsed >= PACHINKO_DURATION_SEC + COUNTDOWN_SEC) {
      this.endGame();
      return;
    }

    const gameElapsed = this.totalElapsed - COUNTDOWN_SEC;

    // Phase transitions
    if (this.phase !== 'slowmo' && gameElapsed >= PACHINKO_SLOWMO_SEC) {
      this.enterSlowmo();
    } else if (this.phase === 'chaos' && gameElapsed >= PACHINKO_TENSION_SEC) {
      this.phase = 'tension';
      this.setPhaseLabel('');
      this.physics.setGravity(0, 980);
    } else if (!this.chaosApplied && gameElapsed >= PACHINKO_CHAOS_SEC) {
      this.applyChaos();
    }

    // Gate events
    if (!this.gate1Done && gameElapsed >= PACHINKO_GATE1_SEC) {
      this.gate1Done = true;
      this.toggleGates();
    }
    if (!this.gate2Done && gameElapsed >= PACHINKO_GATE2_SEC) {
      this.gate2Done = true;
      this.toggleGates();
    }

    // Drop balls sequentially
    if (this.dropIndex < this.balls.length) {
      this.dropTimer += dt;
      const dropInterval = Math.max(0.2, 1.8 / this.balls.length);
      if (this.dropTimer >= dropInterval) {
        this.dropTimer -= dropInterval;
        this.dropBall(this.dropIndex);
        this.dropIndex++;
      }
    }

    // Physics step
    if (this.phase === 'slowmo') {
      if (Math.random() < SLOWMO_RATE) {
        this.physics.update();
      }
    } else {
      this.physics.update();
    }

    // Sync ball sprites
    for (const ball of this.balls) {
      if (!ball.body.isStatic()) {
        const pos = ball.body.getPosition();
        ball.gfx.x = pos.x;
        ball.gfx.y = pos.y;
        ball.gfx.rotation = ball.body.getAngle();
      }
    }

    // Sync spinner sprites
    for (const spinner of this.spinners) {
      spinner.gfx.rotation = spinner.body.getAngle();
    }

    // Sync gate sprites
    for (const gate of this.gates) {
      gate.gfx.visible = !gate.open;
    }

    // Timer bar
    const progress = Math.max(0, Math.min(1, 1 - gameElapsed / PACHINKO_DURATION_SEC));
    this.updateTimerBar(progress);

    // All balls finished?
    const allPlayersDone = this.config!.players.every((p) =>
      this.finishOrder.some((fp) => fp.id === p.id),
    );
    if (allPlayersDone) {
      this.endGame();
    }
  }

  override destroy(): void {
    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.chaos?.destroy();
    if (this.goalSensor) {
      this.physics?.removeBodies(this.goalSensor);
      this.goalSensor = null;
    }
    this.physics?.destroy();
    this.physics = null;
    super.destroy();
  }

  // ─── Build Board ──────────────────────────────

  private buildBoard(): void {
    if (!this.physics || !this.config) return;

    const boardWidth = BOARD.rightX - BOARD.leftX;
    const cx = (BOARD.leftX + BOARD.rightX) / 2;

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill(COLORS.background);
    this.boardContainer.addChild(bg);

    // Board panel
    const boardBg = new Graphics();
    boardBg.rect(BOARD.leftX, BOARD.topY - 10, boardWidth, BOARD.funnelBottomY - BOARD.topY + 30);
    boardBg.fill({ color: 0x050d18 });
    this.boardContainer.addChild(boardBg);

    // Left/right walls
    const wallH = BOARD.funnelBottomY - BOARD.topY + 40;
    const wallMidY = (BOARD.topY + BOARD.funnelBottomY) / 2;
    this.physics.createWall(BOARD.leftX, wallMidY, BOARD.wallThick, wallH);
    this.physics.createWall(BOARD.rightX, wallMidY, BOARD.wallThick, wallH);

    // Wall visuals
    const wallGfx = new Graphics();
    wallGfx.rect(BOARD.leftX - BOARD.wallThick / 2, BOARD.topY - 10, BOARD.wallThick, wallH);
    wallGfx.rect(BOARD.rightX - BOARD.wallThick / 2, BOARD.topY - 10, BOARD.wallThick, wallH);
    wallGfx.fill({ color: 0x1a3050, alpha: 0.9 });
    this.boardContainer.addChild(wallGfx);

    // Pin grid (zigzag)
    this.buildPins(boardWidth);

    // Devices
    this.buildDevices(cx, boardWidth);

    // Funnel + goal
    this.buildFunnelGoal(cx, boardWidth);

    // Balls
    this.createBalls(cx);
  }

  private buildPins(boardWidth: number): void {
    if (!this.physics) return;

    const pinStartX = BOARD.leftX + BOARD.wallThick + 18;
    const pinStartY = BOARD.topY + 28;
    const usableWidth = boardWidth - BOARD.wallThick * 2 - 36;

    for (let row = 0; row < BOARD.pinRows; row++) {
      const isOffset = row % 2 === 1;
      const cols = isOffset ? BOARD.pinCols - 1 : BOARD.pinCols;
      const actualSpacing = usableWidth / (BOARD.pinCols - 1);
      const offsetX = isOffset ? actualSpacing / 2 : 0;

      for (let col = 0; col < cols; col++) {
        const px = pinStartX + offsetX + col * actualSpacing;
        const py = pinStartY + row * BOARD.pinSpacingY;

        this.physics.createPin(px, py, BOARD.pinRadius);

        const pinGfx = new Graphics();
        pinGfx.circle(px, py, BOARD.pinRadius);
        pinGfx.fill({ color: 0x4488aa, alpha: 0.9 });
        pinGfx.circle(px - 1, py - 1, BOARD.pinRadius * 0.4);
        pinGfx.fill({ color: 0x88ccee, alpha: 0.5 });
        this.boardContainer.addChild(pinGfx);
      }
    }
  }

  private buildDevices(cx: number, boardWidth: number): void {
    if (!this.physics || !this.rng) return;

    // Device placement — fixed positions in pin grid gaps
    const deviceZoneY1 = BOARD.topY + 80;
    const deviceZoneY2 = BOARD.topY + 200;
    const deviceZoneY3 = BOARD.topY + 340;
    const innerLeft = BOARD.leftX + BOARD.wallThick + 30;
    const innerRight = BOARD.rightX - BOARD.wallThick - 30;

    // Bumpers (2)
    const bumperPositions = [
      { x: cx - 60 + this.rng.range(-15, 15), y: deviceZoneY1 + this.rng.range(-10, 10) },
      { x: cx + 60 + this.rng.range(-15, 15), y: deviceZoneY2 + this.rng.range(-10, 10) },
    ];
    for (const pos of bumperPositions) {
      this.addBumper(pos.x, pos.y);
    }

    // Spinners (2)
    const spinnerPositions = [
      { x: cx + this.rng.range(-40, 40), y: deviceZoneY2 + 60 },
      { x: cx + this.rng.range(-40, 40), y: deviceZoneY3 + 20 },
    ];
    for (const pos of spinnerPositions) {
      this.addSpinner(pos.x, pos.y);
    }

    // Gates (2) — placed horizontally, partially blocking the path
    const gateY1 = BOARD.topY + 160;
    const gateY2 = BOARD.topY + 300;
    this.addGate(innerLeft + (boardWidth - BOARD.wallThick * 2 - 60) * 0.25, gateY1, 55);
    this.addGate(innerRight - (boardWidth - BOARD.wallThick * 2 - 60) * 0.25, gateY2, 55);
  }

  private addBumper(x: number, y: number): void {
    if (!this.physics) return;

    const body = this.physics.createStaticBody(x, y);
    body.createFixture(new CircleShape(BUMPER_RADIUS), { restitution: 1.5, friction: 0 });
    body.setUserData({ label: 'bumper' });

    const gfx = new Graphics();
    gfx.circle(x, y, BUMPER_RADIUS);
    gfx.fill({ color: 0xcc2222, alpha: 0.9 });
    gfx.circle(x, y, BUMPER_RADIUS * 0.55);
    gfx.fill({ color: 0xff6666, alpha: 0.7 });
    this.boardContainer.addChild(gfx);

    this.bumpers.push({ body, gfx, overcharged: false });
  }

  private addSpinner(x: number, y: number): void {
    if (!this.physics) return;

    const body = this.physics.createStaticBody(x, y);
    body.createFixture(new BoxShape(SPINNER_W / 2, SPINNER_H / 2), { friction: 0, restitution: 0.3 });
    body.setUserData({ label: 'spinner' });

    const gfx = new Graphics();
    gfx.rect(-SPINNER_W / 2, -SPINNER_H / 2, SPINNER_W, SPINNER_H);
    gfx.fill({ color: 0x2266cc, alpha: 0.9 });
    gfx.x = x;
    gfx.y = y;
    this.boardContainer.addChild(gfx);

    this.spinners.push({ body, gfx });
  }

  private addGate(x: number, y: number, width: number): void {
    if (!this.physics) return;

    const body = this.physics.createWall(x, y, width, 8);

    const gfx = new Graphics();
    gfx.rect(x - width / 2, y - 4, width, 8);
    gfx.fill({ color: 0x22aa44, alpha: 0.9 });
    this.boardContainer.addChild(gfx);

    this.gates.push({ body, gfx, open: false });
  }

  private buildFunnelGoal(cx: number, boardWidth: number): void {
    if (!this.physics) return;

    // Funnel angled walls converging to goalWidth hole
    const funnelTopLeft = BOARD.leftX + BOARD.wallThick;
    const funnelTopRight = BOARD.rightX - BOARD.wallThick;
    const holeLeft = cx - BOARD.goalWidth / 2;
    const holeRight = cx + BOARD.goalWidth / 2;
    const funnelH = BOARD.funnelBottomY - BOARD.funnelTopY;

    // Left funnel wall
    const leftWallLen = Math.sqrt(
      Math.pow(cx - BOARD.goalWidth / 2 - funnelTopLeft, 2) + Math.pow(funnelH, 2),
    );
    const leftAngle = Math.atan2(funnelH, holeLeft - funnelTopLeft);
    const leftFunnelX = (funnelTopLeft + holeLeft) / 2;
    const leftFunnelY = (BOARD.funnelTopY + BOARD.funnelBottomY) / 2;
    this.physics.createWall(leftFunnelX, leftFunnelY, leftWallLen, 8, {
      angle: leftAngle,
    });

    // Right funnel wall
    const rightWallLen = Math.sqrt(
      Math.pow(funnelTopRight - holeRight, 2) + Math.pow(funnelH, 2),
    );
    const rightAngle = Math.atan2(funnelH, funnelTopRight - holeRight) * -1;
    const rightFunnelX = (funnelTopRight + holeRight) / 2;
    const rightFunnelY = (BOARD.funnelTopY + BOARD.funnelBottomY) / 2;
    this.physics.createWall(rightFunnelX, rightFunnelY, rightWallLen, 8, {
      angle: rightAngle,
    });

    // Floor below funnel (with gap = goal hole)
    const floorY = BOARD.funnelBottomY + 4;
    const leftFloorW = holeLeft - (BOARD.leftX + BOARD.wallThick);
    const rightFloorW = (BOARD.rightX - BOARD.wallThick) - holeRight;
    if (leftFloorW > 0) {
      this.physics.createWall(BOARD.leftX + BOARD.wallThick + leftFloorW / 2, floorY, leftFloorW, 8);
    }
    if (rightFloorW > 0) {
      this.physics.createWall(holeRight + rightFloorW / 2, floorY, rightFloorW, 8);
    }

    // Draw funnel visual
    const funnelGfx = new Graphics();
    // Left funnel
    funnelGfx.moveTo(funnelTopLeft, BOARD.funnelTopY);
    funnelGfx.lineTo(holeLeft, BOARD.funnelBottomY);
    funnelGfx.stroke({ color: 0x2244aa, width: 4, alpha: 0.9 });
    // Right funnel
    funnelGfx.moveTo(funnelTopRight, BOARD.funnelTopY);
    funnelGfx.lineTo(holeRight, BOARD.funnelBottomY);
    funnelGfx.stroke({ color: 0x2244aa, width: 4, alpha: 0.9 });
    this.boardContainer.addChild(funnelGfx);

    // Goal hole highlight
    const goalGfx = new Graphics();
    goalGfx.rect(holeLeft, BOARD.funnelBottomY, BOARD.goalWidth, 20);
    goalGfx.fill({ color: COLORS.gold, alpha: 0.3 });
    this.boardContainer.addChild(goalGfx);

    // GOAL label
    const goalText = new Text({
      text: 'GOAL',
      style: { fontFamily: FONT_DISPLAY, fontSize: 10, fill: COLORS.gold, fontWeight: '700' },
    });
    goalText.anchor.set(0.5, 0);
    goalText.x = cx;
    goalText.y = BOARD.funnelBottomY + 2;
    this.boardContainer.addChild(goalText);

    // Sensor body
    this.goalSensor = this.physics.createSensor(cx, BOARD.goalY, BOARD.goalWidth + 10, 30, 'goal');

    // Rank display area below goal
    this.rankLabel = new Text({
      text: '',
      style: { fontFamily: FONT_BODY, fontSize: 11, fill: COLORS.text, fontWeight: '700', align: 'center', wordWrap: true, wordWrapWidth: boardWidth - 20 },
    });
    this.rankLabel.anchor.set(0.5, 0);
    this.rankLabel.x = cx;
    this.rankLabel.y = BOARD.goalY + 20;
    this.boardContainer.addChild(this.rankLabel);

    // Unused variable suppression
    void boardWidth;
  }

  private createBalls(cx: number): void {
    if (!this.config) return;
    const { players } = this.config;
    const ballCount = this.config.ballCount ?? 1;

    for (const player of players) {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

      for (let bi = 0; bi < ballCount; bi++) {
        const x = cx;
        const y = BOARD.dropAreaY;

        const body = this.physics!.createBall(x, y, BOARD.ballRadius, {
          restitution: 0.5,
          friction: 0.005,
          linearDamping: 0.015,
          label: `ball-${player.id}-${bi}`,
        });
        body.setType('static');

        const gfx = new Container();
        const circle = new Graphics();
        circle.circle(0, 0, BOARD.ballRadius);
        circle.fill({ color });
        circle.rect(-BOARD.ballRadius + 2, -BOARD.ballRadius + 2, 3, 3);
        circle.fill({ color: COLORS.text, alpha: 0.6 });
        gfx.addChild(circle);

        // Show name only on first ball
        if (bi === 0) {
          const nameText = new Text({
            text: player.name.slice(0, 2),
            style: { fontFamily: FONT_BODY, fontSize: 7, fontWeight: '700', fill: COLORS.text },
          });
          nameText.anchor.set(0.5, 0.5);
          gfx.addChild(nameText);
        }

        gfx.x = x;
        gfx.y = y;
        gfx.visible = false;
        this.ballContainer.addChild(gfx);

        this.balls.push({ body, gfx, player, finished: false, finishTime: 0 });
      }
    }
  }

  private dropBall(index: number): void {
    if (!this.physics || !this.rng) return;
    const ball = this.balls[index];
    if (!ball) return;

    const cx = (BOARD.leftX + BOARD.rightX) / 2;
    const spread = (BOARD.rightX - BOARD.leftX) * 0.28;
    const dropX = cx + this.rng.range(-spread, spread);

    ball.body.setType('dynamic');
    ball.body.setPosition(new Vec2(dropX, BOARD.dropAreaY));
    ball.body.setLinearVelocity(new Vec2(this.rng.range(-1, 1), 1));
    ball.gfx.visible = true;
    ball.gfx.x = dropX;
    ball.gfx.y = BOARD.dropAreaY;
  }

  // ─── Physics Handlers ─────────────────────────

  private setupPhysicsHandlers(): void {
    if (!this.physics) return;

    // Collision: goal sensor + bumpers
    this.physics.onCollisionStart((contact) => {
      const bodyA = contact.getFixtureA().getBody();
      const bodyB = contact.getFixtureB().getBody();
      const labelA = (bodyA.getUserData() as { label?: string } | null)?.label ?? '';
      const labelB = (bodyB.getUserData() as { label?: string } | null)?.label ?? '';

      // Goal detection
      const isGoalA = labelA === 'goal';
      const isGoalB = labelB === 'goal';
      if (isGoalA || isGoalB) {
        const ballBody = isGoalA ? bodyB : bodyA;
        const ball = this.balls.find((b) => b.body === ballBody && !b.finished);
        if (ball) {
          ball.finished = true;
          ball.finishTime = this.totalElapsed;
          if (!this.finishOrder.some((p) => p.id === ball.player.id)) {
            this.finishOrder.push(ball.player);
            this.updateRankLabel();
          }
          ballBody.setType('static');
        }
      }

      // Bumper hit — apply repulsion
      const isBumperA = labelA === 'bumper';
      const isBumperB = labelB === 'bumper';
      if (isBumperA || isBumperB) {
        const bumperBody = isBumperA ? bodyA : bodyB;
        const ballBody = isBumperA ? bodyB : bodyA;
        const ball = this.balls.find((b) => b.body === ballBody && !b.finished);
        if (ball) {
          const bumper = this.bumpers.find((bm) => bm.body === bumperBody);
          const ballPos = ballBody.getPosition();
          const bumperPos = bumperBody.getPosition();
          const dx = ballPos.x - bumperPos.x;
          const dy = ballPos.y - bumperPos.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const mult = bumper?.overcharged ? 2 : 1;
          ballBody.setLinearVelocity(new Vec2(
            (dx / len) * 8 * mult,
            (dy / len) * 8 * mult,
          ));
        }
      }
    });

    // Before-update: spinner rotation + speed floor
    this.physics.onBeforeUpdate(() => {
      // Rotate spinners
      for (const spinner of this.spinners) {
        spinner.body.setAngle(spinner.body.getAngle() + 0.05);
      }

      // Speed floor — prevent stuck balls
      for (const ball of this.balls) {
        if (ball.finished) continue;
        const vel = ball.body.getLinearVelocity();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (speed < 0.5 && speed > 0) {
          ball.body.setLinearVelocity(new Vec2((vel.x / speed) * 0.5, (vel.y / speed) * 0.5));
        } else if (speed === 0 && !ball.body.isStatic()) {
          ball.body.setLinearVelocity(new Vec2(this.rng!.range(-0.5, 0.5), 1));
        }
      }
    });
  }

  // ─── Devices ──────────────────────────────────

  private toggleGates(): void {
    for (const gate of this.gates) {
      gate.open = !gate.open;
      gate.body.setActive(!gate.open);
    }
  }

  private overchargeBumpers(): void {
    if (this.bumperOvercharged) return;
    this.bumperOvercharged = true;
    for (const bumper of this.bumpers) {
      bumper.overcharged = true;
      // Redraw bumper white
      const pos = bumper.body.getPosition();
      bumper.gfx.clear();
      bumper.gfx.circle(pos.x, pos.y, BUMPER_RADIUS);
      bumper.gfx.fill({ color: COLORS.text, alpha: 0.95 });
      bumper.gfx.circle(pos.x, pos.y, BUMPER_RADIUS * 0.55);
      bumper.gfx.fill({ color: COLORS.primary, alpha: 0.8 });
    }
  }

  // ─── HUD ──────────────────────────────────────

  private buildHUD(): void {
    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, BOARD.topY - 10);
    hudBg.fill({ color: 0x060810 });
    this.uiContainer.addChild(hudBg);

    // Timer bar background
    const timerBgBar = new Graphics();
    timerBgBar.rect(14, 10, DESIGN_WIDTH - 28, 7);
    timerBgBar.fill({ color: COLORS.secondary, alpha: 0.9 });
    this.uiContainer.addChild(timerBgBar);

    this.timerBar = new Graphics();
    this.uiContainer.addChild(this.timerBar);
    this.updateTimerBar(1);

    // Title
    const ballCount = this.config?.ballCount ?? 1;
    const title = new Text({
      text: `파친코${ballCount > 1 ? ` (공×${ballCount})` : ''}`,
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = 26;
    this.uiContainer.addChild(title);

    // Phase label
    this.phaseLabel = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.primary },
    });
    this.phaseLabel.anchor.set(1, 0);
    this.phaseLabel.x = DESIGN_WIDTH - 14;
    this.phaseLabel.y = 26;
    this.uiContainer.addChild(this.phaseLabel);

    // Player dots
    const { players } = this.config!;
    players.forEach((player, i) => {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const dot = new Graphics();
      dot.circle(0, 0, 4);
      dot.fill({ color });
      dot.x = 14 + i * 22;
      dot.y = 50;
      this.uiContainer.addChild(dot);

      const name = new Text({
        text: player.name.slice(0, 2),
        style: { fontFamily: FONT_BODY, fontSize: 7, fill: color },
      });
      name.anchor.set(0.5, 0);
      name.x = dot.x;
      name.y = 56;
      this.uiContainer.addChild(name);
    });
  }

  private updateTimerBar(progress: number): void {
    if (!this.timerBar) return;
    const barWidth = DESIGN_WIDTH - 28;
    this.timerBar.clear();
    if (progress <= 0) return;
    const color = progress > 0.35 ? COLORS.gold : COLORS.primary;
    this.timerBar.rect(14, 10, barWidth * progress, 7);
    this.timerBar.fill({ color, alpha: 0.9 });
  }

  private setPhaseLabel(text: string): void {
    if (this.phaseLabel) this.phaseLabel.text = text;
  }

  private updateRankLabel(): void {
    if (!this.rankLabel) return;
    const lines = this.finishOrder.map((p, i) => `${i + 1}등: ${p.name}`).join('  ');
    this.rankLabel.text = lines;
  }

  // ─── Phase Handlers ───────────────────────────

  private startCountdown(): void {
    this.countdown = new CountdownEffect(this.container, this._scaleInfo ?? undefined);
    this.countdown.play(() => {
      this.phase = 'dropping';
      this.countdown = null;
      this.totalElapsed = COUNTDOWN_SEC;
      this.sound?.play('race-start');
    });
  }

  private applyChaos(): void {
    if (!this.physics) return;
    this.chaosApplied = true;
    this.phase = 'chaos';
    this.setPhaseLabel('💥 카오스!');
    this.sound?.play('chaos');

    this.chaos = new ChaosEffect();
    this.chaos.play(this.uiContainer, (BOARD.topY - 10) / 2 + 12);
    this.shaker.shake(this.ballContainer, 5, 6);

    // Gravity shift
    this.physics.setGravity(400, 900);

    // Bumper overcharge after first arrival (or trigger now if some already done)
    if (this.finishOrder.length > 0) {
      this.overchargeBumpers();
    }
  }

  private enterSlowmo(): void {
    this.phase = 'slowmo';
    this.setPhaseLabel('🎬 슬로우모션');
    this.sound?.play('slowmo');
    this.slowMo = new SlowMotionEffect(this.container, this._scaleInfo ?? undefined);
    this.slowMo.activate(0.4);
    this.shaker.shake(this.container, 7, 10);
  }

  private endGame(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.slowMo?.deactivate();
    this.sound?.play('finish');

    const rankings = this.buildRankings();
    this.endCallback?.({
      mode: 'pachinko',
      rankings,
      seed: this.config?.seed ?? 0,
      pickMode: this.config!.pickMode,
    });
  }

  // ─── Rankings ─────────────────────────────────

  private buildRankings(): RankingEntry[] {
    const rankings: RankingEntry[] = [];

    // finishOrder = arrival order (first ball per player)
    this.finishOrder.forEach((player, i) => {
      const ball = this.balls.find((b) => b.player.id === player.id && b.finished);
      rankings.push({ player, rank: i + 1, finishTime: ball?.finishTime });
    });

    // Players who never arrived get last ranks
    const remaining = this.config!.players.filter(
      (p) => !this.finishOrder.some((fp) => fp.id === p.id),
    );
    remaining.forEach((player, i) => {
      rankings.push({ player, rank: this.finishOrder.length + i + 1 });
    });

    return rankings;
  }
}
