import { Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { Marble } from '@entities/Marble';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { ChaosEffect } from '@effects/ChaosEffect';
import type { GameConfig, GameResult, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  COUNTDOWN_SEC,
  CHAOS_SEC,
  TENSION_SEC,
  SLOWMO_SEC,
  GAME_DURATION_SEC,
  SLOWMO_RATE,
  FONT_DISPLAY,
} from '@utils/constants';

type RacePhase = 'countdown' | 'racing' | 'chaos' | 'tension' | 'slowmo' | 'done';

/** Track layout constants (design resolution 390×844) */
const TRACK = {
  /** Left wall x */
  leftX: 30,
  /** Right wall x */
  rightX: 360,
  /** Top start area y */
  startY: 100,
  /** Bottom finish y */
  finishY: 780,
  /** Wall thickness */
  wallThick: 12,
  /** Ramp width */
  rampWidth: 280,
  /** Ramp height/thickness */
  rampThick: 14,
  /** Number of zigzag ramps */
  rampCount: 8,
  /** Ramp angle in radians */
  rampAngle: 0.35,
  /** Vertical spacing between ramps */
  rampSpacing: 85,
} as const;

/**
 * Marble Race game scene — physics-based zigzag track with Matter.js.
 * 30-second timeline matching HorseRaceScene phases.
 */
export class MarbleRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  private physics: PhysicsWorld | null = null;
  private marbles: Marble[] = [];
  private finishOrder: Marble[] = [];
  private totalElapsed = 0;
  private phase: RacePhase = 'countdown';

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();
  private chaos: ChaosEffect | null = null;

  private readonly trackContainer = new Container();
  private readonly marbleContainer = new Container();
  private readonly uiContainer = new Container();
  private rankLabels: Text[] = [];

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private chaosApplied = false;
  private chaosObstacles: Matter.Body[] = [];
  private prevRankIds: number[] = [];
  private finishSensor: Matter.Body | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    if (!this.config) return;

    this.physics = new PhysicsWorld({ x: 0, y: 1.2 });

    this.container.addChild(this.trackContainer);
    this.container.addChild(this.marbleContainer);
    this.container.addChild(this.uiContainer);

    this.buildTrack();
    this.buildMarbles();
    this.buildHUD();
    this.buildRankLabels();
    this.setupCollisionDetection();
    this.startCountdown();
  }

  update(_delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = _delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') return;

    // Phase transitions
    if (this.totalElapsed >= GAME_DURATION_SEC) {
      this.endRace();
      return;
    }
    if (this.phase !== 'slowmo' && this.totalElapsed >= SLOWMO_SEC) {
      this.enterSlowmo();
    } else if (this.phase === 'chaos' && this.totalElapsed >= TENSION_SEC) {
      this.phase = 'tension';
      this.setPhaseLabel('');
      this.removeChaosObstacles();
    } else if (!this.chaosApplied && this.totalElapsed >= CHAOS_SEC) {
      this.applyChaos();
    }

    // Physics step
    if (this.phase === 'slowmo') {
      // Slowmo: skip some physics frames (call update less often)
      if (Math.random() < SLOWMO_RATE) {
        this.physics.update();
      }
    } else {
      this.physics.update();
    }

    // Sync marble sprites with physics bodies
    for (const marble of this.marbles) {
      marble.sync();
    }

    // Update timer bar
    const raceElapsed = this.totalElapsed - COUNTDOWN_SEC;
    const raceTotal = GAME_DURATION_SEC - COUNTDOWN_SEC;
    const progress = Math.max(0, Math.min(1, 1 - raceElapsed / raceTotal));
    this.updateTimerBar(progress);

    // Update rankings
    const sorted = this.getSortedByProgress();
    this.checkRankChanges(sorted);
    this.prevRankIds = sorted.map((m) => m.player.id);
    this.updateRankLabels(sorted);

    // Check if all finished
    if (this.finishOrder.length === this.marbles.length) {
      this.endRace();
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

  private buildTrack(): void {
    if (!this.physics) return;

    // Full background
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill(COLORS.background);
    this.trackContainer.addChild(bg);

    // Track area background
    const trackBg = new Graphics();
    trackBg.rect(TRACK.leftX, TRACK.startY - 20, TRACK.rightX - TRACK.leftX, TRACK.finishY - TRACK.startY + 40);
    trackBg.fill({ color: 0x0d2020 });
    this.trackContainer.addChild(trackBg);

    const cx = (TRACK.leftX + TRACK.rightX) / 2;

    // Left wall
    const leftWall = PhysicsWorld.createWall(
      TRACK.leftX, (TRACK.startY + TRACK.finishY) / 2,
      TRACK.wallThick, TRACK.finishY - TRACK.startY + 60,
    );
    this.physics.addBodies(leftWall);
    this.drawStaticBody(leftWall, 0x224422);

    // Right wall
    const rightWall = PhysicsWorld.createWall(
      TRACK.rightX, (TRACK.startY + TRACK.finishY) / 2,
      TRACK.wallThick, TRACK.finishY - TRACK.startY + 60,
    );
    this.physics.addBodies(rightWall);
    this.drawStaticBody(rightWall, 0x224422);

    // Zigzag ramps
    for (let i = 0; i < TRACK.rampCount; i++) {
      const direction = i % 2 === 0 ? 1 : -1;
      const rampX = cx + direction * 15;
      const rampY = TRACK.startY + 60 + i * TRACK.rampSpacing;
      const angle = TRACK.rampAngle * direction;

      const ramp = PhysicsWorld.createWall(rampX, rampY, TRACK.rampWidth, TRACK.rampThick, {
        angle,
        restitution: 0.3,
        friction: 0.01,
        frictionStatic: 0,  // 정지마찰 제거 — 구슬 멈춤 방지
      });
      this.physics.addBodies(ramp);
      this.drawRamp(ramp, i);
    }

    // Floor at bottom
    const floor = PhysicsWorld.createWall(
      cx, TRACK.finishY + 30,
      TRACK.rightX - TRACK.leftX, TRACK.wallThick,
    );
    this.physics.addBodies(floor);

    // Finish line visual
    this.drawFinishLine();

    // Finish sensor (invisible, detects marble arrival)
    this.finishSensor = PhysicsWorld.createSensor(
      cx, TRACK.finishY,
      TRACK.rightX - TRACK.leftX, 10,
      'finish',
    );
    this.physics.addBodies(this.finishSensor);
  }

  private drawStaticBody(body: Matter.Body, color: number): void {
    const verts = body.vertices;
    const g = new Graphics();
    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      g.lineTo(verts[i].x, verts[i].y);
    }
    g.closePath();
    g.fill({ color, alpha: 0.8 });
    this.trackContainer.addChild(g);
  }

  private drawRamp(body: Matter.Body, index: number): void {
    const verts = body.vertices;
    const g = new Graphics();
    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      g.lineTo(verts[i].x, verts[i].y);
    }
    g.closePath();

    // Alternate ramp colors for visual interest
    const colors = [0x1a3a2a, 0x1a2a3a, 0x2a1a3a, 0x3a2a1a];
    g.fill({ color: colors[index % colors.length], alpha: 0.9 });

    // Ramp edge glow
    g.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      g.lineTo(verts[i].x, verts[i].y);
    }
    g.closePath();
    g.stroke({ color: 0x336633, width: 1, alpha: 0.6 });

    this.trackContainer.addChild(g);
  }

  private drawFinishLine(): void {
    const y = TRACK.finishY;
    const sqSize = 6;

    for (let x = TRACK.leftX + TRACK.wallThick / 2; x < TRACK.rightX - TRACK.wallThick / 2; x += sqSize) {
      for (let row = 0; row < 2; row++) {
        const isWhite = (Math.floor((x - TRACK.leftX) / sqSize) + row) % 2 === 0;
        const sq = new Graphics();
        sq.rect(x, y - sqSize + row * sqSize, sqSize, sqSize);
        sq.fill({ color: isWhite ? 0xffffff : 0x111111, alpha: isWhite ? 0.9 : 0.6 });
        this.trackContainer.addChild(sq);
      }
    }

    // Gold glow
    const glow = new Graphics();
    glow.moveTo(TRACK.leftX, y);
    glow.lineTo(TRACK.rightX, y);
    glow.stroke({ color: COLORS.gold, width: 2, alpha: 0.4 });
    this.trackContainer.addChild(glow);

    // GOAL label
    const goalLabel = new Text({
      text: 'GOAL',
      style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: COLORS.gold },
    });
    goalLabel.anchor.set(0.5, 1);
    goalLabel.x = (TRACK.leftX + TRACK.rightX) / 2;
    goalLabel.y = y - sqSize - 2;
    this.trackContainer.addChild(goalLabel);
  }

  private buildMarbles(): void {
    if (!this.config || !this.physics) return;
    const { players } = this.config;
    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    const spacing = Math.min(24, (TRACK.rightX - TRACK.leftX - 40) / players.length);

    players.forEach((player, i) => {
      const offset = (i - (players.length - 1) / 2) * spacing;
      const x = cx + offset;
      const y = TRACK.startY + 10;

      const marble = new Marble(player, x, y);
      this.physics!.addBodies(marble.body);
      this.marbles.push(marble);
      this.marbleContainer.addChild(marble.container);
    });

    this.prevRankIds = players.map((p) => p.id);
  }

  private buildHUD(): void {
    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, TRACK.startY - 20);
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
      text: '구슬 레이스',
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
  }

  private buildRankLabels(): void {
    this.marbles.forEach(() => {
      const label = new Text({
        text: '',
        style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
      });
      label.anchor.set(0.5, 1);
      this.uiContainer.addChild(label);
      this.rankLabels.push(label);
    });
  }

  private setupCollisionDetection(): void {
    if (!this.physics) return;

    this.physics.onCollisionStart((event) => {
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const sensor = bodies.find((b) => b.label === 'finish');
        const marbleBody = bodies.find((b) => b !== sensor && !b.isStatic);

        if (sensor && marbleBody) {
          const marble = this.marbles.find((m) => m.body === marbleBody);
          if (marble && !marble.finished) {
            marble.markFinished(this.totalElapsed);
            this.finishOrder.push(marble);
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
      this.phase = 'racing';
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
    this.chaos.play(this.uiContainer, (TRACK.startY - 20) / 2 + 12);
    this.shaker.shake(this.marbleContainer, 5, 6);

    // Chaos event: change gravity + add obstacles
    this.physics.setGravity(0.4, 0.8);

    // Add 2 random obstacles
    const cx = (TRACK.leftX + TRACK.rightX) / 2;
    for (let i = 0; i < 2; i++) {
      const obstX = cx + (i === 0 ? -40 : 40);
      const obstY = TRACK.startY + 200 + i * 180;
      const obstacle = PhysicsWorld.createWall(obstX, obstY, 60, 10, {
        angle: (i === 0 ? 0.5 : -0.5),
        restitution: 0.8,
      });
      this.physics.addBodies(obstacle);
      this.chaosObstacles.push(obstacle);

      // Visual
      const g = new Graphics();
      g.rect(-30, -5, 60, 10);
      g.fill({ color: COLORS.primary, alpha: 0.7 });
      g.position.set(obstX, obstY);
      g.rotation = i === 0 ? 0.5 : -0.5;
      g.label = `chaos-obstacle-${i}`;
      this.trackContainer.addChild(g);
    }
  }

  private removeChaosObstacles(): void {
    if (!this.physics) return;

    // Reset gravity
    this.physics.setGravity(0, 1.2);

    // Remove obstacle bodies
    for (const body of this.chaosObstacles) {
      this.physics.removeBodies(body);
    }
    this.chaosObstacles = [];

    // Remove obstacle visuals
    const toRemove = this.trackContainer.children.filter(
      (c) => typeof c.label === 'string' && c.label.startsWith('chaos-obstacle'),
    );
    for (const child of toRemove) {
      this.trackContainer.removeChild(child);
    }
  }

  private enterSlowmo(): void {
    this.phase = 'slowmo';
    this.setPhaseLabel('🎬 슬로우모션');
    this.sound?.play('slowmo');
    this.slowMo = new SlowMotionEffect(this.container);
    this.slowMo.activate(0.4);
    this.shaker.shake(this.container, 7, 10);
  }

  private endRace(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.slowMo?.deactivate();
    this.sound?.play('finish');

    const rankings = this.buildRankings();
    this.endCallback?.({
      mode: 'marble',
      rankings,
      seed: this.config?.seed ?? 0,
      pickMode: this.config!.pickMode,
    });
  }

  // ─── Runtime helpers ──────────────────────────

  private getSortedByProgress(): Marble[] {
    // Sort by Y position (lower = further along track = better)
    // Finished marbles come first in finish order
    return [...this.marbles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.body.position.y - a.body.position.y;
    });
  }

  private checkRankChanges(sorted: Marble[]): void {
    if (this.prevRankIds.length !== sorted.length) return;
    for (let newRank = 0; newRank < sorted.length; newRank++) {
      const marble = sorted[newRank];
      if (!marble) continue;
      const oldRank = this.prevRankIds.indexOf(marble.player.id);
      if (oldRank !== -1 && Math.abs(oldRank - newRank) >= 2) {
        this.shaker.shake(this.marbleContainer, 3, 4);
        break;
      }
    }
  }

  private updateRankLabels(sorted: Marble[]): void {
    for (let rank = 0; rank < sorted.length; rank++) {
      const marble = sorted[rank];
      if (!marble) continue;
      const idx = this.marbles.indexOf(marble);
      const label = this.rankLabels[idx];
      if (!label) continue;
      label.text = `${rank + 1}위`;
      label.x = marble.container.x;
      label.y = marble.container.y - marble.radius - 4;
    }
  }

  private buildRankings(): RankingEntry[] {
    const sorted = this.getSortedByProgress();
    return sorted.map((marble, i) => ({
      player: marble.player,
      rank: i + 1,
      finishTime: marble.finished ? marble.finishTime : undefined,
    }));
  }
}
