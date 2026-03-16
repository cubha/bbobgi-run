import { Container, Text, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from '@core/BaseScene';
import type { GameResult, RankingEntry } from '@/types';
import { COLORS, DESIGN_WIDTH, PLAYER_COLORS, FONT_DISPLAY, FONT_BODY } from '@utils/constants';
import { Button } from '@ui/Button';
import { ConfettiEffect } from '@effects/ConfettiEffect';
import { DotGridBackground } from '@ui/DotGridBackground';
import { SectionLabel } from '@ui/SectionLabel';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Result screen with dramatic winner/loser reveal + confetti.
 * 'first' → gold celebration + confetti shower
 * 'last'  → red penalty + lightning shake
 */
export class ResultScene extends BaseScene {
  private result: GameResult | null = null;
  private onReplay: (() => void) | null = null;
  private tweens: gsap.core.Tween[] = [];
  private confetti: ConfettiEffect | null = null;

  setResult(result: GameResult): void {
    this.result = result;
  }

  setReplayCallback(cb: () => void): void {
    this.onReplay = cb;
  }

  async init(): Promise<void> {
    if (!this.result) return;

    const { rankings, pickMode } = this.result;
    const winner = rankings.find((r) => r.rank === 1);
    const loser = rankings.find((r) => r.rank === rankings.length);

    this.buildBackground(pickMode === 'first');

    if (pickMode === 'first') {
      if (winner) this.buildWinnerSection(winner.player.name);
      this.buildConfetti();
    } else {
      if (loser) this.buildLoserSection(loser.player.name);
    }

    this.buildRankingList(rankings);
    this.buildReplayButton();
  }

  update(_delta: number): void {
    // GSAP-driven
  }

  override destroy(): void {
    for (const tw of this.tweens) tw.kill();
    this.tweens.length = 0;
    this.confetti?.destroy();
    this.confetti = null;
    this.result = null;
    this.onReplay = null;
    super.destroy();
  }

  /** Track a gsap tween so it can be killed on destroy */
  private tween(target: gsap.TweenTarget, vars: gsap.TweenVars): gsap.core.Tween {
    const tw = gsap.to(target, vars);
    this.tweens.push(tw);
    return tw;
  }

  // ─── Background ───────────────────────────────

  private buildBackground(isWin: boolean): void {
    const bg = new DotGridBackground({
      dotColor: isWin ? 0x444400 : 0x440000,
      dotAlpha: 0.3,
      accentColor: isWin ? COLORS.gold : COLORS.primary,
    });
    this.container.addChild(bg.container);
  }

  // ─── Winner Section ───────────────────────────

  private buildWinnerSection(name: string): void {
    const header = new Graphics();
    header.rect(0, 3, DESIGN_WIDTH, 210);
    header.fill({ color: 0x1a1400 });
    this.container.addChild(header);

    // Gold radial glow
    for (let i = 3; i >= 1; i--) {
      const glow = new Graphics();
      glow.circle(DESIGN_WIDTH / 2, 80, i * 55);
      glow.fill({ color: COLORS.gold, alpha: 0.04 });
      this.container.addChild(glow);
    }

    const trophy = new Text({ text: '🏆', style: { fontSize: 64 } });
    trophy.anchor.set(0.5);
    trophy.position.set(DESIGN_WIDTH / 2, 60);
    trophy.alpha = 0;
    trophy.scale.set(0.4);
    this.container.addChild(trophy);

    const winLabel = new Text({
      text: '1등 당첨!',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: '700',
        fill: COLORS.gold,
        letterSpacing: 6,
      },
    });
    winLabel.anchor.set(0.5);
    winLabel.position.set(DESIGN_WIDTH / 2, 118);
    winLabel.alpha = 0;
    this.container.addChild(winLabel);

    const nameText = new Text({
      text: name,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 42,
        fill: COLORS.gold,
        dropShadow: { color: COLORS.gold, blur: 20, distance: 0, angle: 0, alpha: 0.7 },
      },
    });
    nameText.anchor.set(0.5);
    nameText.position.set(DESIGN_WIDTH / 2, 163);
    nameText.alpha = 0;
    nameText.scale.set(0.5);
    this.container.addChild(nameText);

    const congrats = new Text({
      text: '축하합니다! 🎉',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 18,
        fill: COLORS.text,
      },
    });
    congrats.anchor.set(0.5);
    congrats.position.set(DESIGN_WIDTH / 2, 208);
    congrats.alpha = 0;
    this.container.addChild(congrats);

    // Staggered entry animations
    this.tween(trophy, { alpha: 1, pixi: { scaleX: 1, scaleY: 1 }, duration: 0.5, delay: 0.1, ease: 'back.out(1.7)' });
    this.tween(winLabel, { alpha: 1, duration: 0.4, delay: 0.35 });
    this.tween(nameText, { alpha: 1, pixi: { scaleX: 1, scaleY: 1 }, duration: 0.55, delay: 0.5, ease: 'back.out(1.7)' });
    this.tween(congrats, { alpha: 1, duration: 0.4, delay: 0.8 });

    // Trophy bounce loop
    this.tween(trophy, { y: trophy.y - 6, duration: 1.2, delay: 1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }

  // ─── Loser Section ────────────────────────────

  private buildLoserSection(name: string): void {
    const header = new Graphics();
    header.rect(0, 3, DESIGN_WIDTH, 210);
    header.fill({ color: 0x1a0000 });
    this.container.addChild(header);

    // Red radial glow
    for (let i = 3; i >= 1; i--) {
      const glow = new Graphics();
      glow.circle(DESIGN_WIDTH / 2, 80, i * 55);
      glow.fill({ color: COLORS.primary, alpha: 0.04 });
      this.container.addChild(glow);
    }

    const lightning = new Text({ text: '⚡', style: { fontSize: 64 } });
    lightning.anchor.set(0.5);
    lightning.position.set(DESIGN_WIDTH / 2, 60);
    lightning.alpha = 0;
    lightning.scale.set(0.4);
    this.container.addChild(lightning);

    const loseLabel = new Text({
      text: '꼴등 확정!',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: '700',
        fill: COLORS.primary,
        letterSpacing: 6,
      },
    });
    loseLabel.anchor.set(0.5);
    loseLabel.position.set(DESIGN_WIDTH / 2, 118);
    loseLabel.alpha = 0;
    this.container.addChild(loseLabel);

    const nameText = new Text({
      text: name,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 42,
        fill: COLORS.primary,
        dropShadow: { color: COLORS.primary, blur: 20, distance: 0, angle: 0, alpha: 0.7 },
      },
    });
    nameText.anchor.set(0.5);
    nameText.position.set(DESIGN_WIDTH / 2, 163);
    nameText.alpha = 0;
    nameText.scale.set(0.5);
    this.container.addChild(nameText);

    const penalty = new Text({
      text: '당신이 쏩니다! 💸',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 19,
        fill: COLORS.text,
      },
    });
    penalty.anchor.set(0.5);
    penalty.position.set(DESIGN_WIDTH / 2, 208);
    penalty.alpha = 0;
    this.container.addChild(penalty);

    // Animations
    this.tween(lightning, { alpha: 1, pixi: { scaleX: 1, scaleY: 1 }, duration: 0.4, delay: 0.1, ease: 'back.out(1.7)' });
    this.tween(loseLabel, { alpha: 1, duration: 0.35, delay: 0.3 });
    this.tween(nameText, { alpha: 1, pixi: { scaleX: 1, scaleY: 1 }, duration: 0.5, delay: 0.45, ease: 'back.out(1.7)' });
    this.tween(penalty, { alpha: 1, duration: 0.4, delay: 0.75 });

    // Shake name after reveal
    this.tween(nameText, {
      x: `+=${7}`,
      repeat: 7,
      yoyo: true,
      duration: 0.06,
      delay: 0.9,
      ease: 'none',
      onComplete: () => { nameText.x = DESIGN_WIDTH / 2; },
    });

    // Lightning flicker
    this.tween(lightning, { alpha: 0.3, duration: 0.15, delay: 0.9, repeat: 5, yoyo: true, ease: 'none' });
  }

  // ─── Confetti ─────────────────────────────────

  private buildConfetti(): void {
    this.confetti = new ConfettiEffect(this.container);
    this.confetti.play();
  }

  // ─── Ranking list ─────────────────────────────

  private buildRankingList(rankings: RankingEntry[]): void {
    const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
    const startY = 224;

    this.container.addChild(
      new SectionLabel({ text: '최종 순위', y: startY, accentAlpha: 0.6 }).container,
    );

    sorted.forEach((entry, i) => {
      const rowY = startY + 22 + i * 46;
      const playerColor = PLAYER_COLORS[entry.player.id % PLAYER_COLORS.length];
      const isTop3 = entry.rank <= 3;

      // Row container — starts off-screen for slide-in animation
      const rowContainer = new Container();
      rowContainer.y = rowY;
      rowContainer.x = DESIGN_WIDTH + 20;
      this.container.addChild(rowContainer);

      // Row background
      const rowBg = new Graphics();
      rowBg.roundRect(14, 0, DESIGN_WIDTH - 28, 38, 10);
      rowBg.fill({ color: COLORS.accent, alpha: 0.85 });
      rowContainer.addChild(rowBg);

      // Left color accent strip
      const strip = new Graphics();
      strip.roundRect(14, 0, 4, 38, 2);
      strip.fill({ color: playerColor, alpha: 0.8 });
      rowContainer.addChild(strip);

      // Medal / rank label
      const rankText = MEDALS[entry.rank - 1] ?? `${entry.rank}위`;
      const rankLabel = new Text({
        text: rankText,
        style: {
          fontFamily: FONT_BODY,
          fontSize: isTop3 ? 20 : 13,
          fontWeight: 'bold',
          fill: entry.rank === 1 ? COLORS.gold : COLORS.textDim,
        },
      });
      rankLabel.anchor.set(0, 0.5);
      rankLabel.x = 26;
      rankLabel.y = 19;
      rowContainer.addChild(rankLabel);

      // Player name
      const nameLabel = new Text({
        text: entry.player.name,
        style: {
          fontFamily: FONT_DISPLAY,
          fontSize: 17,
          fill: playerColor,
        },
      });
      nameLabel.anchor.set(0, 0.5);
      nameLabel.x = 68;
      nameLabel.y = 19;
      rowContainer.addChild(nameLabel);

      // Slide-in animation
      this.tween(rowContainer, {
        x: 0,
        duration: 0.38,
        delay: 0.35 + i * 0.09,
        ease: 'back.out(1.2)',
      });
    });
  }

  // ─── Replay button ────────────────────────────

  private buildReplayButton(): void {
    const rankCount = this.result?.rankings.length ?? 0;
    const listBottom = 224 + 22 + rankCount * 46 + 16;
    const btnY = Math.max(listBottom, 718);

    const btn = new Button({
      label: '한 판 더! 🎲',
      width: 366,
      height: 54,
      color: COLORS.secondary,
      colorEnd: 0x1a5090,
      onClick: () => this.onReplay?.(),
    });
    btn.container.x = 12;
    btn.container.y = btnY;
    this.container.addChild(btn.container);

    // Fade in
    btn.container.alpha = 0;
    this.tween(btn.container, {
      alpha: 1,
      duration: 0.4,
      delay: 0.5 + rankCount * 0.09,
      ease: 'power2.out',
    });
  }
}
