import { Container, Graphics, Text } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import { Horse } from '@entities/Horse';
import type { HorseEventType } from '@entities/Horse';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { ChaosEffect } from '@effects/ChaosEffect';
import type { GameConfig, GameResult, RankingEntry, TrackParams } from '@/types';
import { SeededRandom } from '@utils/random';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  PLAYER_COLORS,
  HORSE_LAYOUT,
  computeTrackParams,
  SLOWMO_RATE,
  FONT_DISPLAY,
  FONT_BODY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

type RacePhase = 'countdown' | 'racing' | 'chaos' | 'tension' | 'slowmo' | 'done';

export class HorseRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

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
  private readonly rankPanelContainer = new Container();

  private trackParams: TrackParams | null = null;
  private progressBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private chaosApplied = false;
  private slowmoTriggered = false;
  private lastPickSlowmoTimer = -1;
  private prevRankIds: number[] = [];

  // Rank panel
  private rankCards: { bg: Graphics; nameLabel: Text; rankLabel: Text; eventLabel: Text }[] = [];

  // Random event system
  private rng: SeededRandom = new SeededRandom(Date.now());
  private eventCheckTimer: number = 3.0;
  private eventFlashLabel: Text | null = null;
  private eventFlashTimer: number = 0;

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

    this.rng = new SeededRandom((this.config.seed ?? 0) + 99999);
    this.trackParams = computeTrackParams(this.config.players.length, this.config.lapCount);

    this.container.addChild(this.trackContainer);
    this.container.addChild(this.horseContainer);
    this.container.addChild(this.uiContainer);
    this.container.addChild(this.rankPanelContainer);

    this.buildTrack();
    this.buildHorses();
    this.buildHUD();
    this.buildRankPanel();
    this.startCountdown();
  }

  update(delta: number): void {
    if (this.phase === 'done') return;

    const dt = delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') return;

    const speedMult = this.phase === 'slowmo' ? SLOWMO_RATE : 1;
    for (const horse of this.horses) {
      horse.update(dt * speedMult);
      if (horse.finished && !this.finishOrder.includes(horse)) {
        this.finishOrder.push(horse);
      }
    }

    const sorted = this.getSortedByProgress();
    const leader = sorted[0];
    const trailer = sorted[sorted.length - 1];
    const leaderProgress = leader?.progress ?? 0;
    const trailerProgress = trailer?.progress ?? 0;
    const pickMode = this.config!.pickMode;

    // Progress-based phase transitions
    if (this.phase !== 'slowmo' && !this.slowmoTriggered) {
      const shouldSlowmo = pickMode === 'first'
        ? leaderProgress >= 0.99
        : this.finishOrder.length >= this.horses.length - 1;
      if (shouldSlowmo) {
        this.slowmoTriggered = true;
        this.enterSlowmo();
        if (pickMode === 'last') this.lastPickSlowmoTimer = 2.5;
      }
    }

    // 꼴등뽑기: slowmo 연출 후 타이머 만료 시 종료
    if (this.lastPickSlowmoTimer > 0) {
      this.lastPickSlowmoTimer -= dt;
      if (this.lastPickSlowmoTimer <= 0) {
        this.endRace();
        return;
      }
    }
    if (this.phase === 'chaos' && leaderProgress >= 0.75) {
      this.phase = 'tension';
      this.setPhaseLabel('');
    } else if (!this.chaosApplied && leaderProgress >= 0.50) {
      this.applyChaos();
    }

    // Random events (chaos phase: halved interval)
    if (this.phase === 'racing' || this.phase === 'chaos' || this.phase === 'tension') {
      this.eventCheckTimer -= dt;
      if (this.eventCheckTimer <= 0) {
        this.tryTriggerRandomEvent();
        const isChaos = this.phase === 'chaos';
        this.eventCheckTimer = isChaos
          ? this.rng.range(1.0, 2.0)
          : this.rng.range(2.0, 4.0);
      }
    }

    // Event flash fade
    if (this.eventFlashLabel && this.eventFlashTimer > 0) {
      this.eventFlashTimer -= dt;
      this.eventFlashLabel.alpha = Math.max(0, this.eventFlashTimer / 1.5);
      if (this.eventFlashTimer <= 0) this.eventFlashLabel.text = '';
    }

    // End condition
    if (pickMode === 'first' && this.finishOrder.length >= 1) {
      this.endRace();
      return;
    }
    // 꼴등뽑기 종료는 위 lastPickSlowmoTimer 타이머로 처리

    // Progress bar
    const barProgress = pickMode === 'first' ? leaderProgress : trailerProgress;
    this.updateProgressBar(barProgress);

    this.checkRankChanges(sorted);
    this.prevRankIds = sorted.map((h) => h.player.id);
    this.updateRankPanel(sorted);
  }

  override destroy(): void {
    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.chaos?.destroy();
    super.destroy();
  }

  // ─── Build ───────────────────────────────────

  private buildTrack(): void {
    const tp = this.trackParams!;
    const { players } = this.config!;
    const nLanes = players.length;
    const { cx, cy, ry, laneWidth, ratio } = tp;
    const innerR = ry;
    const outerR = ry + nLanes * laneWidth;

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill({ color: 0x0a1a0a });
    this.trackContainer.addChild(bg);

    // Outer stands
    const standsR = outerR + 28;
    const stands = new Graphics();
    stands.ellipse(cx, cy, standsR * ratio, standsR);
    stands.fill({ color: 0x1a2e1a });
    this.trackContainer.addChild(stands);

    // Track surface
    const trackSurface = new Graphics();
    trackSurface.ellipse(cx, cy, outerR * ratio, outerR);
    trackSurface.fill({ color: 0xb8895a });
    this.trackContainer.addChild(trackSurface);

    // Dirt texture
    const dirtGfx = new Graphics();
    const localRng = { v: 42 };
    const rand = () => { localRng.v = (localRng.v * 1664525 + 1013904223) & 0x7fffffff; return localRng.v / 0x7fffffff; };
    for (let i = 0; i < 240; i++) {
      const angle = rand() * Math.PI * 2;
      const r = innerR + rand() * (outerR - innerR);
      const dx = r * Math.cos(angle) * ratio;
      const dy = r * Math.sin(angle);
      dirtGfx.rect(cx + dx - 1, cy + dy - 1, 2, 2);
      dirtGfx.fill({ color: 0x8a6035, alpha: 0.35 });
    }
    this.trackContainer.addChild(dirtGfx);

    // Inner field
    const infield = new Graphics();
    infield.ellipse(cx, cy, innerR * ratio, innerR);
    infield.fill({ color: 0x1e6b2e });
    this.trackContainer.addChild(infield);

    const infieldStripe = new Graphics();
    infieldStripe.ellipse(cx, cy, innerR * ratio * 0.72, innerR * 0.72);
    infieldStripe.fill({ color: 0x247a36 });
    this.trackContainer.addChild(infieldStripe);

    // Lane dividers
    for (let i = 1; i < nLanes; i++) {
      const laneR = ry + i * laneWidth;
      const divider = new Graphics();
      const totalSegs = 48;
      for (let s = 0; s < totalSegs; s++) {
        if (s % 3 === 2) continue;
        const a0 = (s / totalSegs) * Math.PI * 2;
        const a1 = ((s + 0.8) / totalSegs) * Math.PI * 2;
        divider.moveTo(cx + laneR * Math.cos(a0) * ratio, cy + laneR * Math.sin(a0));
        divider.lineTo(cx + laneR * Math.cos(a1) * ratio, cy + laneR * Math.sin(a1));
      }
      divider.stroke({ color: 0xffffff, width: 0.8, alpha: 0.25 });
      this.trackContainer.addChild(divider);
    }

    // Rail fences
    const outerRail = new Graphics();
    outerRail.ellipse(cx, cy, outerR * ratio, outerR);
    outerRail.stroke({ color: 0xf0f0e0, width: 2.5 });
    this.trackContainer.addChild(outerRail);

    const innerRail = new Graphics();
    innerRail.ellipse(cx, cy, innerR * ratio, innerR);
    innerRail.stroke({ color: 0xf0f0e0, width: 2.5 });
    this.trackContainer.addChild(innerRail);

    this.buildStartingGate(nLanes);
    this.buildOvalFinishLine(nLanes);

    // Lane numbers
    players.forEach((player, i) => {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const laneR = ry + (i + 0.5) * laneWidth;
      const angle = Math.PI + 0.03;
      const numLabel = new Text({
        text: `${i + 1}`,
        style: { fontFamily: FONT_BODY, fontSize: 7, fontWeight: '700', fill: color },
      });
      numLabel.anchor.set(0.5, 0.5);
      numLabel.x = cx + laneR * Math.cos(angle) * ratio;
      numLabel.y = cy + laneR * Math.sin(angle);
      this.trackContainer.addChild(numLabel);
    });

    // Infield logo
    const logoText = new Text({
      text: '뽑기런',
      style: { fontFamily: FONT_DISPLAY, fontSize: 13, fill: 0x4aae5e },
    });
    logoText.alpha = 0.6;
    logoText.anchor.set(0.5, 0.5);
    logoText.x = cx;
    logoText.y = cy;
    this.trackContainer.addChild(logoText);
  }

  private buildStartingGate(nLanes: number): void {
    const { cx, cy, ry, laneWidth, ratio } = this.trackParams!;

    const innerX = cx - ry * ratio;
    const outerX = cx - (ry + nLanes * laneWidth) * ratio;
    const gateLeft = Math.min(innerX, outerX) - 4;
    const gateWidth = Math.abs(innerX - outerX) + 8;

    const gate = new Graphics();
    gate.rect(gateLeft, cy - 2.5, gateWidth, 5);
    gate.fill({ color: 0xffec27, alpha: 0.85 });
    this.trackContainer.addChild(gate);

    for (let i = 0; i <= nLanes; i++) {
      const laneR = ry + i * laneWidth;
      const px = cx - laneR * ratio;
      const post = new Graphics();
      post.rect(px - 1.5, cy - 12, 3, 24);
      post.fill({ color: 0xfff1e8 });
      this.trackContainer.addChild(post);
    }

    const startLabel = new Text({
      text: 'START',
      style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
    });
    startLabel.anchor.set(0.5, 1);
    startLabel.x = gateLeft + gateWidth / 2;
    startLabel.y = cy - 14;
    this.trackContainer.addChild(startLabel);
  }

  private buildOvalFinishLine(nLanes: number): void {
    const { cx, cy, ry, laneWidth, ratio } = this.trackParams!;

    const finishAngle = Math.PI + 0.12;
    const innerR = ry;
    const outerR = ry + nLanes * laneWidth;

    const innerX = cx + innerR * Math.cos(finishAngle) * ratio;
    const innerY = cy + innerR * Math.sin(finishAngle);
    const outerX = cx + outerR * Math.cos(finishAngle) * ratio;
    const outerY = cy + outerR * Math.sin(finishAngle);

    const dx = outerX - innerX;
    const dy = outerY - innerY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;

    const sqSize = 5;
    const numSq = Math.ceil(len / sqSize);
    const lineThick = 4;

    for (let s = 0; s < numSq; s++) {
      const t = s / numSq;
      const bx = innerX + dx * t;
      const by = innerY + dy * t;
      const isWhite = s % 2 === 0;
      const sq = new Graphics();
      sq.poly([
        bx + nx * lineThick, by + ny * lineThick,
        bx - nx * lineThick, by - ny * lineThick,
        bx + dx / numSq - nx * lineThick, by + dy / numSq - ny * lineThick,
        bx + dx / numSq + nx * lineThick, by + dy / numSq + ny * lineThick,
      ]);
      sq.fill({ color: isWhite ? 0xffffff : 0x111111, alpha: isWhite ? 0.95 : 0.75 });
      this.trackContainer.addChild(sq);
    }

    const goalLabel = new Text({
      text: 'GOAL',
      style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
    });
    goalLabel.anchor.set(0.5, 1);
    goalLabel.x = innerX + nx * (lineThick + 10);
    goalLabel.y = innerY + ny * (lineThick + 10) - 2;
    this.trackContainer.addChild(goalLabel);
  }

  // ─── HUD (top 60px) ─────────────────────────

  private buildHUD(): void {
    const hudH = HORSE_LAYOUT.hudH;
    const pickMode = this.config!.pickMode;
    const isFirst = pickMode === 'first';

    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, hudH);
    hudBg.fill({ color: 0x080810 });
    this.uiContainer.addChild(hudBg);

    // Mode label
    const modeLabel = new Text({
      text: isFirst ? '🥇 1등 찾기' : '💀 꼴등 찾기',
      style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: isFirst ? COLORS.gold : COLORS.primary },
    });
    modeLabel.x = 14;
    modeLabel.y = 6;
    this.uiContainer.addChild(modeLabel);

    // Progress bar label
    const barLabel = new Text({
      text: isFirst ? '선두' : '최하위',
      style: { fontFamily: FONT_BODY, fontSize: 8, fill: COLORS.textDim },
    });
    barLabel.anchor.set(1, 0.5);
    barLabel.x = DESIGN_WIDTH - 14;
    barLabel.y = 10;
    this.uiContainer.addChild(barLabel);

    // Progress bar
    const barBg = new Graphics();
    barBg.rect(14, 24, DESIGN_WIDTH - 28, 5);
    barBg.fill({ color: COLORS.secondary, alpha: 0.8 });
    this.uiContainer.addChild(barBg);

    this.progressBar = new Graphics();
    this.uiContainer.addChild(this.progressBar);
    this.updateProgressBar(0);

    // Phase label
    this.phaseLabel = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: COLORS.primary },
    });
    this.phaseLabel.anchor.set(0.5, 0);
    this.phaseLabel.x = DESIGN_WIDTH / 2;
    this.phaseLabel.y = 36;
    this.uiContainer.addChild(this.phaseLabel);

    // Lap indicator
    const lapLabel = new Text({
      text: `${this.trackParams!.laps}바퀴`,
      style: { fontFamily: FONT_BODY, fontSize: 8, fill: COLORS.textDim },
    });
    lapLabel.anchor.set(1, 0);
    lapLabel.x = DESIGN_WIDTH - 14;
    lapLabel.y = 36;
    this.uiContainer.addChild(lapLabel);

    // Event flash
    this.eventFlashLabel = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.gold },
    });
    this.eventFlashLabel.anchor.set(0.5, 0.5);
    this.eventFlashLabel.x = DESIGN_WIDTH / 2;
    this.eventFlashLabel.y = HORSE_LAYOUT.trackTop + 24;
    this.eventFlashLabel.alpha = 0;
    this.uiContainer.addChild(this.eventFlashLabel);
  }

  // ─── Rank Panel (bottom 264px) ──────────────

  private buildRankPanel(): void {
    const { rankTop, rankH } = HORSE_LAYOUT;
    const { players } = this.config!;

    // Background
    const panelBg = new Graphics();
    panelBg.rect(0, rankTop, DESIGN_WIDTH, rankH);
    panelBg.fill({ color: 0x080810 });
    this.rankPanelContainer.addChild(panelBg);

    // Separator
    const sep = new Graphics();
    sep.rect(14, rankTop + 1, DESIGN_WIDTH - 28, 1);
    sep.fill({ color: COLORS.darkGray, alpha: 0.6 });
    this.rankPanelContainer.addChild(sep);

    // Title
    const title = new Text({
      text: '현재 순위',
      style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = rankTop + 8;
    this.rankPanelContainer.addChild(title);

    // Rank cards
    const cardTop = rankTop + 26;
    const cardH = Math.min(22, Math.floor((rankH - 34) / players.length));

    players.forEach((player, i) => {
      const y = cardTop + i * cardH;
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

      const cardBg = new Graphics();
      cardBg.rect(12, y, DESIGN_WIDTH - 24, cardH - 2);
      cardBg.fill({ color: 0x111122, alpha: 0.8 });
      this.rankPanelContainer.addChild(cardBg);

      // Color pip
      const pip = new Graphics();
      pip.rect(16, y + 3, 4, cardH - 8);
      pip.fill({ color });
      this.rankPanelContainer.addChild(pip);

      // Rank
      const rankLabel = new Text({
        text: `${i + 1}`,
        style: { fontFamily: FONT_DISPLAY, fontSize: 10, fill: COLORS.gold },
      });
      rankLabel.anchor.set(0.5, 0.5);
      rankLabel.x = 36;
      rankLabel.y = y + cardH / 2 - 1;
      this.rankPanelContainer.addChild(rankLabel);

      // Name
      const nameLabel = new Text({
        text: player.name,
        style: { fontFamily: FONT_BODY, fontSize: 10, fontWeight: '700', fill: color },
      });
      nameLabel.anchor.set(0, 0.5);
      nameLabel.x = 50;
      nameLabel.y = y + cardH / 2 - 1;
      this.rankPanelContainer.addChild(nameLabel);

      // Event status
      const eventLabel = new Text({
        text: '',
        style: { fontFamily: FONT_BODY, fontSize: 8, fill: COLORS.textDim },
      });
      eventLabel.anchor.set(1, 0.5);
      eventLabel.x = DESIGN_WIDTH - 18;
      eventLabel.y = y + cardH / 2 - 1;
      this.rankPanelContainer.addChild(eventLabel);

      this.rankCards.push({ bg: cardBg, nameLabel, rankLabel, eventLabel });
    });
  }

  private buildHorses(): void {
    const tp = this.trackParams!;
    const { players, seed = 0 } = this.config!;
    players.forEach((player, i) => {
      const horse = new Horse(player, i, seed + player.id * 1000, tp);
      this.horses.push(horse);
      this.horseContainer.addChild(horse.container);
    });
    this.prevRankIds = players.map((p) => p.id);
  }

  // ─── HUD Updates ──────────────────────────────

  private updateProgressBar(progress: number): void {
    if (!this.progressBar) return;
    const barWidth = DESIGN_WIDTH - 28;
    this.progressBar.clear();
    if (progress <= 0) return;
    const color = progress >= 0.88 ? COLORS.primary : progress >= 0.5 ? COLORS.orange : COLORS.gold;
    this.progressBar.rect(14, 24, barWidth * Math.min(progress, 1), 5);
    this.progressBar.fill({ color, alpha: 0.9 });
  }

  private setPhaseLabel(text: string): void {
    if (this.phaseLabel) this.phaseLabel.text = text;
  }

  private updateRankPanel(sorted: Horse[]): void {
    const isFirst = this.config!.pickMode === 'first';
    for (let rank = 0; rank < sorted.length; rank++) {
      const horse = sorted[rank];
      if (!horse) continue;
      const idx = this.horses.indexOf(horse);
      const card = this.rankCards[idx];
      if (!card) continue;

      card.rankLabel.text = `${rank + 1}`;
      const isTarget = (isFirst && rank === 0) || (!isFirst && rank === sorted.length - 1);
      card.rankLabel.style.fill = isTarget ? COLORS.primary : COLORS.gold;

      const evt = horse.currentEvent;
      if (evt === 'wipeout') {
        card.eventLabel.text = '⭐ 넘어짐';
        card.eventLabel.style.fill = COLORS.gold;
      } else if (evt === 'nitro') {
        card.eventLabel.text = '🔥 NITRO';
        card.eventLabel.style.fill = COLORS.orange;
      } else if (evt === 'reverse') {
        card.eventLabel.text = '?! 역주행';
        card.eventLabel.style.fill = COLORS.primary;
      } else if (horse.finished) {
        card.eventLabel.text = '🏁 완주';
        card.eventLabel.style.fill = COLORS.brightGreen;
      } else {
        card.eventLabel.text = `${Math.round(horse.progress * 100)}%`;
        card.eventLabel.style.fill = COLORS.textDim;
      }
    }
  }

  // ─── Phase Handlers ───────────────────────────

  private startCountdown(): void {
    const tp = this.trackParams!;
    this.countdown = new CountdownEffect(this.container, this._scaleInfo ?? undefined);
    this.countdown.play(() => {
      this.phase = 'racing';
      this.countdown = null;
      this.totalElapsed = 0;
      this.sound?.play('race-start');
    }, tp.cx, tp.cy);
  }

  private applyChaos(): void {
    this.chaosApplied = true;
    this.phase = 'chaos';
    this.setPhaseLabel('💥 카오스!');
    this.sound?.play('chaos');

    this.chaos = new ChaosEffect();
    this.chaos.play(this.uiContainer, HORSE_LAYOUT.hudH / 2 + 12);
    this.shaker.shake(this.horseContainer, 5, 6);
  }

  private enterSlowmo(): void {
    this.phase = 'slowmo';
    this.setPhaseLabel('🎬 슬로우모션');
    this.sound?.play('slowmo');
    this.slowMo = new SlowMotionEffect(this.container, this._scaleInfo ?? undefined);
    this.slowMo.activate(0.4);
    this.shaker.shake(this.container, 7, 10);
  }

  private tryTriggerRandomEvent(): void {
    const eligible = this.horses.filter((h) => !h.finished && h.currentEvent === 'none');
    if (eligible.length === 0) return;

    const idx = Math.floor(this.rng.range(0, eligible.length));
    const horse = eligible[idx];
    if (!horse) return;

    const roll = this.rng.range(0, 1);
    let eventType: HorseEventType;
    if (roll < 0.40) {
      eventType = 'nitro';
    } else if (roll < 0.75) {
      eventType = 'wipeout';
    } else {
      eventType = 'reverse';
    }

    horse.triggerEvent(eventType);
    this.showEventFlash(horse.player.name, eventType);
    this.sound?.play(eventType === 'wipeout' ? 'chaos' : 'race-start');
  }

  private showEventFlash(playerName: string, eventType: HorseEventType): void {
    if (!this.eventFlashLabel) return;
    const icon = eventType === 'nitro' ? '🔥' : eventType === 'wipeout' ? '⭐' : '?!';
    const label = eventType === 'nitro' ? 'NITRO' : eventType === 'wipeout' ? '넘어짐!' : '역주행!';
    this.eventFlashLabel.text = `${icon} ${playerName} ${label}`;
    this.eventFlashLabel.style.fill =
      eventType === 'nitro' ? COLORS.orange : eventType === 'reverse' ? COLORS.primary : COLORS.gold;
    this.eventFlashLabel.alpha = 1.0;
    this.eventFlashTimer = 1.5;

    if (eventType === 'wipeout' || eventType === 'reverse') {
      this.shaker.shake(this.horseContainer, 4, 5);
    }
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
