import { Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld } from '@core/PhysicsWorld';
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

type GamePhase = 'countdown' | 'dropping' | 'chaos' | 'tension' | 'slowmo' | 'done';

/** Board layout constants */
const BOARD = {
  leftX: 25,
  rightX: 365,
  topY: 100,
  bottomY: 740,
  pinRadius: 4,
  ballRadius: 8,
  pinRows: 10,
  pinCols: 12,
  pinSpacingX: 28,
  pinSpacingY: 50,
  wallThick: 10,
  slotHeight: 40,
  dropAreaY: 80,
} as const;

/** Pachinko timing */
const PACHINKO_DURATION_SEC = 25;
const PACHINKO_CHAOS_SEC = 15;
const PACHINKO_TENSION_SEC = 20;
const PACHINKO_SLOWMO_SEC = 23;

interface PachinkoBall {
  body: Matter.Body;
  gfx: Container;
  player: Player;
  finished: boolean;
  slotIndex: number;
  finishTime: number;
}

/**
 * Pachinko game scene — balls fall through pin grid into ranked slots.
 * ~25 second timeline with countdown + drop + chaos + slowmo.
 */
export class PachinkoScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  private physics: PhysicsWorld | null = null;
  private balls: PachinkoBall[] = [];
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
  private chaosApplied = false;
  private dropIndex = 0;
  private dropTimer = 0;
  private slotCount = 0;
  private slotSensors: Matter.Body[] = [];
  private slotLabels: Text[] = [];

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    if (!this.config) return;

    this.rng = new SeededRandom(this.config.seed);
    this.physics = new PhysicsWorld({ x: 0, y: 1 });
    this.slotCount = this.config.players.length;

    this.container.addChild(this.boardContainer);
    this.container.addChild(this.ballContainer);
    this.container.addChild(this.uiContainer);

    this.buildBoard();
    this.buildHUD();
    this.setupCollisionDetection();
    this.startCountdown();
  }

  update(_delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = _delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') return;

    // Phase transitions
    if (this.totalElapsed >= PACHINKO_DURATION_SEC + COUNTDOWN_SEC) {
      this.endGame();
      return;
    }

    const gameElapsed = this.totalElapsed - COUNTDOWN_SEC;

    if (this.phase !== 'slowmo' && gameElapsed >= PACHINKO_SLOWMO_SEC) {
      this.enterSlowmo();
    } else if (this.phase === 'chaos' && gameElapsed >= PACHINKO_TENSION_SEC) {
      this.phase = 'tension';
      this.setPhaseLabel('');
      this.physics.setGravity(0, 1);
    } else if (!this.chaosApplied && gameElapsed >= PACHINKO_CHAOS_SEC) {
      this.applyChaos();
    }

    // Drop balls sequentially in the first few seconds
    if (this.dropIndex < this.balls.length) {
      this.dropTimer += dt;
      const dropInterval = Math.max(0.3, 2.0 / this.balls.length);
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
      if (!ball.body.isStatic) {
        ball.gfx.x = ball.body.position.x;
        ball.gfx.y = ball.body.position.y;
        ball.gfx.rotation = ball.body.angle;
      }
    }

    // Update timer
    const totalGame = PACHINKO_DURATION_SEC;
    const progress = Math.max(0, Math.min(1, 1 - gameElapsed / totalGame));
    this.updateTimerBar(progress);

    // Check all landed
    if (this.balls.every((b) => b.finished)) {
      this.endGame();
    }
  }

  override destroy(): void {
    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.chaos?.destroy();
    this.physics?.destroy();
    this.physics = null;
    super.destroy();
  }

  // ─── Build ───────────────────────────────────

  private buildBoard(): void {
    if (!this.physics || !this.config) return;

    // Full background
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill(COLORS.background);
    this.boardContainer.addChild(bg);

    // Board area
    const boardBg = new Graphics();
    boardBg.rect(BOARD.leftX, BOARD.topY - 10, BOARD.rightX - BOARD.leftX, BOARD.bottomY - BOARD.topY + 60);
    boardBg.fill({ color: 0x0a1520 });
    this.boardContainer.addChild(boardBg);

    const boardWidth = BOARD.rightX - BOARD.leftX;
    const cx = (BOARD.leftX + BOARD.rightX) / 2;

    // Left wall
    this.physics.addBodies(PhysicsWorld.createWall(
      BOARD.leftX, (BOARD.topY + BOARD.bottomY) / 2,
      BOARD.wallThick, BOARD.bottomY - BOARD.topY + 80,
    ));
    // Right wall
    this.physics.addBodies(PhysicsWorld.createWall(
      BOARD.rightX, (BOARD.topY + BOARD.bottomY) / 2,
      BOARD.wallThick, BOARD.bottomY - BOARD.topY + 80,
    ));

    // Draw walls
    const wallGfx = new Graphics();
    wallGfx.rect(BOARD.leftX - BOARD.wallThick / 2, BOARD.topY - 10, BOARD.wallThick, BOARD.bottomY - BOARD.topY + 60);
    wallGfx.rect(BOARD.rightX - BOARD.wallThick / 2, BOARD.topY - 10, BOARD.wallThick, BOARD.bottomY - BOARD.topY + 60);
    wallGfx.fill({ color: 0x1a2a3a, alpha: 0.8 });
    this.boardContainer.addChild(wallGfx);

    // Pins — zigzag grid
    const pinStartX = BOARD.leftX + BOARD.wallThick + 20;
    const pinStartY = BOARD.topY + 30;
    const usableWidth = boardWidth - BOARD.wallThick * 2 - 40;

    for (let row = 0; row < BOARD.pinRows; row++) {
      const isOffset = row % 2 === 1;
      const cols = isOffset ? BOARD.pinCols - 1 : BOARD.pinCols;
      const actualSpacing = usableWidth / (BOARD.pinCols - 1);
      const offsetX = isOffset ? actualSpacing / 2 : 0;

      for (let col = 0; col < cols; col++) {
        const px = pinStartX + offsetX + col * actualSpacing;
        const py = pinStartY + row * BOARD.pinSpacingY;

        const pin = PhysicsWorld.createPin(px, py, BOARD.pinRadius);
        this.physics.addBodies(pin);

        // Draw pin
        const pinGfx = new Graphics();
        pinGfx.circle(px, py, BOARD.pinRadius);
        pinGfx.fill({ color: 0x4488aa, alpha: 0.9 });
        pinGfx.circle(px - 1, py - 1, BOARD.pinRadius * 0.4);
        pinGfx.fill({ color: 0x88ccee, alpha: 0.5 });
        this.boardContainer.addChild(pinGfx);
      }
    }

    // Bottom floor
    this.physics.addBodies(PhysicsWorld.createWall(
      cx, BOARD.bottomY + BOARD.slotHeight + 10,
      boardWidth, BOARD.wallThick,
    ));

    // Slot dividers + sensors
    this.buildSlots(cx, boardWidth);

    // Create ball objects (but don't add to physics yet — dropped sequentially)
    this.createBalls(cx);
  }

  private buildSlots(_cx: number, boardWidth: number): void {
    if (!this.physics || !this.config) return;

    const slotWidth = (boardWidth - BOARD.wallThick * 2) / this.slotCount;
    const slotStartX = BOARD.leftX + BOARD.wallThick / 2;
    const slotY = BOARD.bottomY;

    // Rank labels (1st slot = rank 1, etc.) — shuffle for fairness
    const rankOrder = Array.from({ length: this.slotCount }, (_, i) => i + 1);
    this.rng!.shuffle(rankOrder);

    for (let i = 0; i <= this.slotCount; i++) {
      const divX = slotStartX + i * slotWidth;

      // Divider wall
      if (i > 0 && i < this.slotCount) {
        const divider = PhysicsWorld.createWall(divX, slotY + BOARD.slotHeight / 2, 4, BOARD.slotHeight);
        this.physics.addBodies(divider);
      }

      // Divider visual
      if (i <= this.slotCount) {
        const divGfx = new Graphics();
        divGfx.rect(divX - 1, slotY, 2, BOARD.slotHeight);
        divGfx.fill({ color: 0x336655, alpha: 0.8 });
        this.boardContainer.addChild(divGfx);
      }
    }

    // Slot sensors + labels
    for (let i = 0; i < this.slotCount; i++) {
      const sensorX = slotStartX + (i + 0.5) * slotWidth;
      const sensorY = slotY + BOARD.slotHeight / 2;
      const rank = rankOrder[i];

      const sensor = PhysicsWorld.createSensor(
        sensorX, sensorY,
        slotWidth - 6, BOARD.slotHeight - 4,
        `slot-${rank}`,
      );
      this.physics.addBodies(sensor);
      this.slotSensors.push(sensor);

      // Slot background color (gold for 1st, red for last, gradient between)
      const slotBg = new Graphics();
      slotBg.rect(slotStartX + i * slotWidth + 1, slotY + 1, slotWidth - 2, BOARD.slotHeight - 2);
      const slotColor = rank === 1 ? 0x2a2a00 : rank === this.slotCount ? 0x2a0000 : 0x0a1520;
      slotBg.fill({ color: slotColor, alpha: 0.6 });
      this.boardContainer.addChild(slotBg);

      // Rank label
      const label = new Text({
        text: `${rank}등`,
        style: {
          fontFamily: FONT_BODY,
          fontSize: 10,
          fontWeight: '700',
          fill: rank === 1 ? COLORS.gold : rank === this.slotCount ? COLORS.primary : COLORS.textDim,
        },
      });
      label.anchor.set(0.5);
      label.x = sensorX;
      label.y = slotY + BOARD.slotHeight / 2;
      this.boardContainer.addChild(label);
      this.slotLabels.push(label);
    }
  }

  private createBalls(cx: number): void {
    if (!this.config) return;
    const { players } = this.config;

    players.forEach((player) => {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const x = cx;
      const y = BOARD.dropAreaY;

      // Create physics body (will be added to world on drop)
      const body = PhysicsWorld.createBall(x, y, BOARD.ballRadius, {
        restitution: 0.5,
        friction: 0.005,
        frictionAir: 0.015,
      });
      // Keep ball static until drop
      Matter.Body.setStatic(body, true);

      // Visual
      const gfx = new Container();

      const circle = new Graphics();
      circle.circle(0, 0, BOARD.ballRadius);
      circle.fill({ color });
      circle.circle(-2, -2, BOARD.ballRadius * 0.4);
      circle.fill({ color: 0xffffff, alpha: 0.3 });
      gfx.addChild(circle);

      const nameText = new Text({
        text: player.name,
        style: { fontFamily: FONT_BODY, fontSize: 7, fontWeight: '700', fill: color },
      });
      nameText.anchor.set(0.5, 0);
      nameText.y = BOARD.ballRadius + 1;
      gfx.addChild(nameText);

      gfx.x = x;
      gfx.y = y;
      gfx.visible = false;
      this.ballContainer.addChild(gfx);

      this.balls.push({
        body,
        gfx,
        player,
        finished: false,
        slotIndex: -1,
        finishTime: 0,
      });
    });
  }

  private dropBall(index: number): void {
    if (!this.physics || !this.rng) return;
    const ball = this.balls[index];
    if (!ball) return;

    // Randomize drop x position
    const cx = (BOARD.leftX + BOARD.rightX) / 2;
    const spread = (BOARD.rightX - BOARD.leftX) * 0.3;
    const dropX = cx + this.rng.range(-spread, spread);

    Matter.Body.setStatic(ball.body, false);
    Matter.Body.setPosition(ball.body, { x: dropX, y: BOARD.dropAreaY });
    Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
    this.physics.addBodies(ball.body);
    ball.gfx.visible = true;
    ball.gfx.x = dropX;
    ball.gfx.y = BOARD.dropAreaY;
  }

  private buildHUD(): void {
    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, BOARD.topY - 10);
    hudBg.fill({ color: 0x080810 });
    this.uiContainer.addChild(hudBg);

    // Timer bar background
    const timerBgBar = new Graphics();
    timerBgBar.roundRect(14, 10, DESIGN_WIDTH - 28, 7, 3);
    timerBgBar.fill({ color: 0x222233, alpha: 0.9 });
    this.uiContainer.addChild(timerBgBar);

    // Timer bar fill
    this.timerBar = new Graphics();
    this.uiContainer.addChild(this.timerBar);
    this.updateTimerBar(1);

    // Title
    const title = new Text({
      text: '파친코',
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

    // Player list (who's dropped)
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

  private setupCollisionDetection(): void {
    if (!this.physics) return;

    this.physics.onCollisionStart((event) => {
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const sensor = bodies.find((b) => typeof b.label === 'string' && b.label.startsWith('slot-'));
        const ballBody = bodies.find((b) => b !== sensor && !b.isStatic);

        if (sensor && ballBody) {
          const ball = this.balls.find((b) => b.body === ballBody && !b.finished);
          if (ball) {
            // Extract rank from label "slot-N"
            const rank = parseInt(sensor.label.split('-')[1], 10);
            ball.finished = true;
            ball.slotIndex = rank;
            ball.finishTime = this.totalElapsed;

            // Stop the ball
            Matter.Body.setStatic(ballBody, true);
          }
        }
      }
    });
  }

  // ─── HUD Updates ──────────────────────────────

  private updateTimerBar(progress: number): void {
    if (!this.timerBar) return;
    const barWidth = DESIGN_WIDTH - 28;
    this.timerBar.clear();
    if (progress <= 0) return;
    const color = progress > 0.35 ? COLORS.gold : COLORS.primary;
    this.timerBar.roundRect(14, 10, barWidth * progress, 7, 3);
    this.timerBar.fill({ color, alpha: 0.9 });
  }

  private setPhaseLabel(text: string): void {
    if (this.phaseLabel) this.phaseLabel.text = text;
  }

  // ─── Phase Handlers ───────────────────────────

  private startCountdown(): void {
    this.countdown = new CountdownEffect(this.container);
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

    // Shift gravity sideways
    this.physics.setGravity(0.5, 0.8);
  }

  private enterSlowmo(): void {
    this.phase = 'slowmo';
    this.setPhaseLabel('🎬 슬로우모션');
    this.sound?.play('slowmo');
    this.slowMo = new SlowMotionEffect(this.container);
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

  // ─── Rankings ──────────────────────────────────

  private buildRankings(): RankingEntry[] {
    // Balls that landed in slots get the rank of their slot
    // Balls that didn't land get ranks after all landed balls
    const landed = this.balls.filter((b) => b.finished).sort((a, b) => a.finishTime - b.finishTime);
    const unfinished = this.balls.filter((b) => !b.finished);

    // Map slot ranks — each ball's slotIndex IS its rank
    const rankings: RankingEntry[] = [];
    for (const ball of landed) {
      rankings.push({
        player: ball.player,
        rank: ball.slotIndex,
        finishTime: ball.finishTime,
      });
    }

    // Unfinished balls get lowest ranks
    const maxLandedRank = landed.length > 0
      ? Math.max(...landed.map((b) => b.slotIndex))
      : 0;
    unfinished.forEach((ball, i) => {
      rankings.push({
        player: ball.player,
        rank: maxLandedRank + i + 1,
      });
    });

    // Sort by rank ascending
    rankings.sort((a, b) => a.rank - b.rank);

    // Re-assign sequential ranks (1, 2, 3...)
    rankings.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    return rankings;
  }
}
