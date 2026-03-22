import { Container, Graphics, Text } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import { Horse } from '@entities/Horse';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { ChaosEffect } from '@effects/ChaosEffect';
import type { GameConfig, GameResult, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  COLORS,
  PLAYER_COLORS,
  OVAL_TRACK,
  COUNTDOWN_SEC,
  CHAOS_SEC,
  TENSION_SEC,
  SLOWMO_SEC,
  GAME_DURATION_SEC,
  SLOWMO_RATE,
  FONT_DISPLAY,
  FONT_BODY,
} from '@utils/constants';

type RacePhase = 'countdown' | 'racing' | 'chaos' | 'tension' | 'slowmo' | 'done';

/**
 * Horse Race game scene — oval/dome track, 30-second timeline with phases.
 */
export class HorseRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  private horses: Horse[] = [];
  private finishOrder: Horse[] = [];
  private totalElapsed = 0;
  private phase: RacePhase = 'countdown';

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();
  private chaos: ChaosEffect | null = null;

  private readonly trackContainer = new Container();
  private readonly horseContainer = new Container();
  private readonly uiContainer = new Container();
  private rankLabels: Text[] = [];

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private chaosApplied = false;
  private prevRankIds: number[] = [];

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    if (!this.config) return;

    this.container.addChild(this.trackContainer);
    this.container.addChild(this.horseContainer);
    this.container.addChild(this.uiContainer);

    this.buildTrack();
    this.buildHorses();
    this.buildHUD();
    this.buildRankLabels();
    this.startCountdown();
  }

  update(delta: number): void {
    if (this.phase === 'done') return;

    const dt = delta / 60;
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
    } else if (!this.chaosApplied && this.totalElapsed >= CHAOS_SEC) {
      this.applyChaos();
    }

    // Update horses
    const speedMult = this.phase === 'slowmo' ? SLOWMO_RATE : 1;
    for (const horse of this.horses) {
      horse.update(dt * speedMult);
      if (horse.finished && !this.finishOrder.includes(horse)) {
        this.finishOrder.push(horse);
      }
    }

    // Update timer bar
    const raceElapsed = this.totalElapsed - COUNTDOWN_SEC;
    const raceTotal = GAME_DURATION_SEC - COUNTDOWN_SEC;
    const progress = Math.max(0, Math.min(1, 1 - raceElapsed / raceTotal));
    this.updateTimerBar(progress);

    const sorted = this.getSortedByProgress();
    this.checkRankChanges(sorted);
    this.prevRankIds = sorted.map((h) => h.player.id);
    this.updateRankLabels(sorted);

    if (this.finishOrder.length === this.horses.length) {
      this.endRace();
    }
  }

  override destroy(): void {
    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.chaos?.destroy();
    super.destroy();
  }

  // ─── Build ───────────────────────────────────

  private buildTrack(): void {
    const { players } = this.config!;
    const { cx, cy, rx, ry, laneWidth } = OVAL_TRACK;
    const nLanes = players.length;
    const outerR = ry + nLanes * laneWidth; // vertical outer radius

    // Full background
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, cy + outerR + 80);
    bg.fill(COLORS.background);
    this.trackContainer.addChild(bg);

    // Layer 1: Audience area (dark gray, outermost ellipse)
    const audience = new Graphics();
    audience.ellipse(cx, cy, (outerR + 60) * (rx / ry), outerR + 60);
    audience.fill({ color: 0x2a2a2a });
    this.trackContainer.addChild(audience);

    // Layer 2: Track surface (sandy/dirt, covers lane area)
    const track = new Graphics();
    track.ellipse(cx, cy, outerR * (rx / ry), outerR);
    track.fill({ color: 0xc4a060 });
    this.trackContainer.addChild(track);

    // Layer 3: Inner grass (covers interior of innermost lane)
    const grass = new Graphics();
    grass.ellipse(cx, cy, rx * 0.7, ry * 0.7);
    grass.fill({ color: 0x2d7a3a });
    this.trackContainer.addChild(grass);

    // Layer 4: Lane divider lines (thin ellipses at each lane boundary)
    for (let i = 0; i <= nLanes; i++) {
      const laneR = ry + i * laneWidth;
      const divider = new Graphics();
      divider.ellipse(cx, cy, laneR * (rx / ry), laneR);
      divider.stroke({ color: 0xffffff, width: 0.5, alpha: 0.3 });
      this.trackContainer.addChild(divider);
    }

    // Player name labels around inner grass
    players.forEach((player, i) => {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const angle = Math.PI + (i / nLanes) * (Math.PI * 0.6) - Math.PI * 0.3;
      const labelR = ry * 0.5;
      const label = new Text({
        text: player.name,
        style: { fontFamily: FONT_BODY, fontSize: 9, fontWeight: '700', fill: color },
      });
      label.anchor.set(0.5, 0.5);
      label.x = cx + labelR * Math.cos(angle) * (rx / ry);
      label.y = cy + labelR * Math.sin(angle);
      this.trackContainer.addChild(label);
    });

    // Layer 5: Finish/start line at theta=PI (leftmost point, checkered)
    this.buildOvalFinishLine(nLanes);
  }

  private buildOvalFinishLine(nLanes: number): void {
    const { cx, cy, rx, ry, laneWidth } = OVAL_TRACK;

    // At theta=PI: x = cx - laneRadius*(rx/ry), y = cy for all lanes
    // Inner lane (i=0) is closest to center; outermost is further left
    const innerX = cx - ry * (rx / ry);                           // = cx - rx = 50
    const outerX = cx - (ry + nLanes * laneWidth) * (rx / ry);    // further left

    const lineLeft = Math.min(innerX, outerX);
    const lineWidth = Math.abs(innerX - outerX);
    const sqSize = 6;
    const lineHeight = 20;
    const startY = cy - lineHeight / 2;

    for (let fy = 0; fy < lineHeight; fy += sqSize) {
      for (let fx = 0; fx < lineWidth; fx += sqSize) {
        const isWhite = (Math.floor(fy / sqSize) + Math.floor(fx / sqSize)) % 2 === 0;
        const sq = new Graphics();
        sq.rect(lineLeft + fx, startY + fy, sqSize, sqSize);
        sq.fill({ color: isWhite ? 0xffffff : 0x111111, alpha: isWhite ? 0.95 : 0.7 });
        this.trackContainer.addChild(sq);
      }
    }

    // GOAL label above finish line
    const goalLabel = new Text({
      text: 'GOAL',
      style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: COLORS.gold },
    });
    goalLabel.anchor.set(0.5, 1);
    goalLabel.x = lineLeft + lineWidth / 2;
    goalLabel.y = startY - 3;
    this.trackContainer.addChild(goalLabel);
  }

  private buildHUD(): void {
    const { hudHeight } = OVAL_TRACK;

    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, hudHeight);
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
      text: '경마',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = 26;
    this.uiContainer.addChild(title);

    // Phase label (shown during chaos/tension/slowmo)
    this.phaseLabel = new Text({
      text: '',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 14,
        fill: COLORS.primary,
      },
    });
    this.phaseLabel.anchor.set(1, 0);
    this.phaseLabel.x = DESIGN_WIDTH - 14;
    this.phaseLabel.y = 26;
    this.uiContainer.addChild(this.phaseLabel);

    // Player name strip in HUD (compact row)
    const { players } = this.config!;
    players.forEach((player, i) => {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const label = new Text({
        text: player.name,
        style: { fontFamily: FONT_BODY, fontSize: 9, fontWeight: '700', fill: color },
      });
      label.x = 14 + (i % 5) * 70;
      label.y = 46 + Math.floor(i / 5) * 12;
      this.uiContainer.addChild(label);
    });
  }

  private buildHorses(): void {
    const { players, seed = 0 } = this.config!;
    players.forEach((player, i) => {
      const horse = new Horse(player, i, seed + player.id * 1000);
      this.horses.push(horse);
      this.horseContainer.addChild(horse.container);
    });
    this.prevRankIds = players.map((p) => p.id);
  }

  private buildRankLabels(): void {
    this.horses.forEach(() => {
      const label = new Text({
        text: '',
        style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: COLORS.gold },
      });
      label.anchor.set(0.5, 1);
      this.uiContainer.addChild(label);
      this.rankLabels.push(label);
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
    this.chaosApplied = true;
    this.phase = 'chaos';
    this.setPhaseLabel('💥 카오스!');
    this.sound?.play('chaos');

    this.chaos = new ChaosEffect();
    this.chaos.play(this.uiContainer, OVAL_TRACK.hudHeight / 2 + 12);
    this.shaker.shake(this.horseContainer, 5, 6);
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
      mode: 'horse',
      rankings,
      seed: this.config?.seed ?? 0,
      pickMode: this.config!.pickMode,
    });
  }

  // ─── Runtime helpers ──────────────────────────

  private getSortedByProgress(): Horse[] {
    return [...this.horses].sort((a, b) => b.progress - a.progress);
  }

  private checkRankChanges(sorted: Horse[]): void {
    if (this.prevRankIds.length !== sorted.length) return;
    for (let newRank = 0; newRank < sorted.length; newRank++) {
      const horse = sorted[newRank];
      if (!horse) continue;
      const oldRank = this.prevRankIds.indexOf(horse.player.id);
      if (oldRank !== -1 && Math.abs(oldRank - newRank) >= 2) {
        this.shaker.shake(this.horseContainer, 3, 4);
        break;
      }
    }
  }

  private updateRankLabels(sorted: Horse[]): void {
    for (let rank = 0; rank < sorted.length; rank++) {
      const horse = sorted[rank];
      if (!horse) continue;
      const idx = this.horses.indexOf(horse);
      const label = this.rankLabels[idx];
      if (!label) continue;
      label.text = `${rank + 1}위`;
      label.x = horse.container.x;
      label.y = horse.container.y - 16;
    }
  }

  private buildRankings(): RankingEntry[] {
    const sorted = this.getSortedByProgress();
    const unfinished = sorted.filter((h) => !h.finished);

    const result: RankingEntry[] = [];
    this.finishOrder.forEach((horse, i) => {
      result.push({ player: horse.player, rank: i + 1 });
    });
    unfinished.forEach((horse, i) => {
      result.push({ player: horse.player, rank: this.finishOrder.length + i + 1 });
    });
    return result;
  }
}
