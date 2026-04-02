import { Container, Text, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from '@core/BaseScene';
import type { GameResult, RankingEntry } from '@/types';
import { COLORS, DESIGN_WIDTH, PLAYER_COLORS, FONT_DISPLAY, FONT_BODY } from '@utils/constants';
import { Button } from '@ui/Button';
import { ConfettiEffect } from '@effects/ConfettiEffect';
import { DotGridBackground } from '@ui/DotGridBackground';
import { SectionLabel } from '@ui/SectionLabel';
import { StatsPanel } from '@ui/StatsPanel';
import type { RecordManager } from '@core/RecordManager';

const MODE_NAMES: Record<string, string> = {
  horse: '경마',
  marble: '구슬 레이스',
  ladder: '사다리타기',
  pachinko: '파친코',
};

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Result screen with dramatic winner/loser reveal + confetti.
 * 'first' → gold celebration + confetti shower
 * 'last'  → red penalty + lightning shake
 */
export class ResultScene extends BaseScene {
  private result: GameResult | null = null;
  private record: RecordManager | null = null;
  private onReplay: (() => void) | null = null;
  private tweens: gsap.core.Tween[] = [];
  private confetti: ConfettiEffect | null = null;
  private statsHeight = 0;

  setResult(result: GameResult): void {
    this.result = result;
  }

  setRecord(record: RecordManager): void {
    this.record = record;
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
      if (winner) this.buildHeroSection({
        name: winner.player.name,
        isWin: true,
        emoji: '🏆',
        label: '1등 당첨!',
        subtitle: '축하합니다! 🎉',
        color: COLORS.gold,
        headerBg: 0x1a1400,
      });
      this.buildConfetti();
      this.sound?.play('result-win');
    } else {
      if (loser) this.buildHeroSection({
        name: loser.player.name,
        isWin: false,
        emoji: '⚡',
        label: '꼴등 확정!',
        subtitle: '당신이 쏩니다! 💸',
        color: COLORS.primary,
        headerBg: 0x1a0000,
      });
      this.sound?.play('result-lose');
    }

    this.buildRankingList(rankings);
    await this.buildStatsSection();
    this.buildReplayButton();
    this.buildShareButton();
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
    this.record = null;
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

  // ─── Hero Section (Winner / Loser 공통) ──────

  private buildHeroSection(config: {
    name: string;
    isWin: boolean;
    emoji: string;
    label: string;
    subtitle: string;
    color: number;
    headerBg: number;
  }): void {
    const { name, isWin, emoji, label, subtitle, color, headerBg } = config;

    const header = new Graphics();
    header.rect(0, 3, DESIGN_WIDTH, 210);
    header.fill({ color: headerBg });
    this.container.addChild(header);

    // Radial glow
    for (let i = 3; i >= 1; i--) {
      const glow = new Graphics();
      glow.circle(DESIGN_WIDTH / 2, 80, i * 55);
      glow.fill({ color, alpha: 0.04 });
      this.container.addChild(glow);
    }

    const icon = new Text({ text: emoji, style: { fontSize: 64 } });
    icon.anchor.set(0.5);
    icon.position.set(DESIGN_WIDTH / 2, 60);
    icon.alpha = 0;
    icon.scale.set(0.4);
    this.container.addChild(icon);

    const labelText = new Text({
      text: label,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: '700',
        fill: color,
        letterSpacing: 6,
      },
    });
    labelText.anchor.set(0.5);
    labelText.position.set(DESIGN_WIDTH / 2, 118);
    labelText.alpha = 0;
    this.container.addChild(labelText);

    const nameText = new Text({
      text: name,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 42,
        fill: color,
        dropShadow: { color, blur: 0, distance: 2, angle: Math.PI / 2, alpha: 0.7 },
      },
    });
    nameText.anchor.set(0.5);
    nameText.position.set(DESIGN_WIDTH / 2, 163);
    nameText.alpha = 0;
    nameText.scale.set(0.5);
    this.container.addChild(nameText);

    const subtitleText = new Text({
      text: subtitle,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: isWin ? 18 : 19,
        fill: COLORS.text,
      },
    });
    subtitleText.anchor.set(0.5);
    subtitleText.position.set(DESIGN_WIDTH / 2, 208);
    subtitleText.alpha = 0;
    this.container.addChild(subtitleText);

    // Staggered entry animations
    this.tween(icon, { alpha: 1, duration: isWin ? 0.5 : 0.4, delay: 0.1, ease: 'back.out(1.7)' });
    this.tween(icon.scale, { x: 1, y: 1, duration: isWin ? 0.5 : 0.4, delay: 0.1, ease: 'back.out(1.7)' });
    this.tween(labelText, { alpha: 1, duration: isWin ? 0.4 : 0.35, delay: isWin ? 0.35 : 0.3 });
    this.tween(nameText, { alpha: 1, duration: isWin ? 0.55 : 0.5, delay: isWin ? 0.5 : 0.45, ease: 'back.out(1.7)' });
    this.tween(nameText.scale, { x: 1, y: 1, duration: isWin ? 0.55 : 0.5, delay: isWin ? 0.5 : 0.45, ease: 'back.out(1.7)' });
    this.tween(subtitleText, { alpha: 1, duration: 0.4, delay: isWin ? 0.8 : 0.75 });

    if (isWin) {
      // Trophy bounce loop
      this.tween(icon, { y: icon.y - 6, duration: 1.2, delay: 1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    } else {
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
      this.tween(icon, { alpha: 0.3, duration: 0.15, delay: 0.9, repeat: 5, yoyo: true, ease: 'none' });
    }
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
      rowBg.rect(14, 0, DESIGN_WIDTH - 28, 38);
      rowBg.fill({ color: COLORS.accent, alpha: 0.85 });
      rowContainer.addChild(rowBg);

      // Left color accent strip
      const strip = new Graphics();
      strip.rect(14, 0, 4, 38);
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

  // ─── Stats Section ────────────────────────────

  private async buildStatsSection(): Promise<void> {
    if (!this.record || !this.result) return;

    const { rankings } = this.result;
    const rankCount = rankings.length;
    const sectionY = 224 + 22 + rankCount * 46 + 16 ;

    const playerNames = rankings.map((r) => r.player.name);
    const [playerStats, overallStats] = await Promise.all([
      Promise.all(playerNames.map((name) => this.record!.getPlayerStats(name))),
      this.record.getOverallStats(),
    ]);

    const panel = new StatsPanel({
      playerStats,
      overallStats,
      y: sectionY,
    });
    this.container.addChild(panel.container);
    this.statsHeight = panel.height + 12;
  }

  // ─── Replay button ────────────────────────────

  private buildReplayButton(): void {
    const rankCount = this.result?.rankings.length ?? 0;
    const listBottom = 224 + 22 + rankCount * 46 + 16  + this.statsHeight;
    const btnY = Math.max(listBottom, 718);

    const btn = new Button({
      label: '한 판 더! 🎲',
      width: 366,
      height: 54,
      color: COLORS.secondary,
      onClick: () => this.onReplay?.(),
    });
    btn.container.x = 12;
    btn.container.y = btnY;
    this.container.addChild(btn.container);

    btn.container.alpha = 0;
    this.tween(btn.container, {
      alpha: 1,
      duration: 0.4,
      delay: 0.5 + rankCount * 0.09,
      ease: 'power2.out',
    });
  }

  // ─── Share button ─────────────────────────────────────────────────

  private buildShareButton(): void {
    const rankCount = this.result?.rankings.length ?? 0;
    const listBottom = 224 + 22 + rankCount * 46 + 16  + this.statsHeight;
    const replayBtnY = Math.max(listBottom, 718);
    const btnY = replayBtnY + 64;

    const btn = new Button({
      label: '결과 공유 📤',
      width: 366,
      height: 46,
      color: 0x1a3040,
      onClick: () => this.shareResult(),
    });
    btn.container.x = 12;
    btn.container.y = btnY;
    this.container.addChild(btn.container);

    btn.container.alpha = 0;
    this.tween(btn.container, {
      alpha: 1,
      duration: 0.4,
      delay: 0.7 + rankCount * 0.09,
      ease: 'power2.out',
    });
  }

  private shareResult(): void {
    if (!this.result) return;
    const { rankings, pickMode, mode } = this.result;
    const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
    const medals = ['🥇', '🥈', '🥉'];
    const modeName = MODE_NAMES[mode] ?? mode;
    const featured =
      pickMode === 'first'
        ? `👑 당첨: ${sorted[0]?.player.name ?? ''}`
        : `💸 꼴등: ${sorted[sorted.length - 1]?.player.name ?? ''}`;

    const lines = [
      '뽑기런 결과 🎲',
      `모드: ${modeName}`,
      '',
      ...sorted.map((r) => `${medals[r.rank - 1] ?? `${r.rank}위`} ${r.player.name}`),
      '',
      featured,
    ];
    const text = lines.join('\n');

    if (typeof navigator.share === 'function') {
      void navigator.share({ title: '뽑기런 결과', text });
    } else {
      void navigator.clipboard.writeText(text).then(() => {
        this.showToast('클립보드에 복사됐어요!');
      });
    }
  }

  private showToast(message: string): void {
    const toast = new Text({
      text: message,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 14,
        fontWeight: '700',
        fill: COLORS.text,
      },
    });
    toast.anchor.set(0.5);
    toast.x = DESIGN_WIDTH / 2;
    toast.y = 50;
    toast.alpha = 0;
    this.container.addChild(toast);

    gsap.timeline({
      onComplete: () => {
        toast.destroy();
      },
    })
      .to(toast, { alpha: 1, y: 40, duration: 0.3, ease: 'power2.out' })
      .to(toast, { alpha: 0, duration: 0.4, delay: 1.2, ease: 'power2.in' });
  }
}
