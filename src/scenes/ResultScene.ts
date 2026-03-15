import { Container, Text, Graphics } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import type { GameResult } from '@/types';
import { COLORS, PLAYER_COLORS } from '@utils/constants';

/**
 * Result screen — shows 1st place celebration and last place penalty.
 * Shared across all game modes.
 */
export class ResultScene extends BaseScene {
  private result: GameResult | null = null;
  private onReplay: (() => void) | null = null;

  setResult(result: GameResult): void {
    this.result = result;
  }

  setReplayCallback(cb: () => void): void {
    this.onReplay = cb;
  }

  async init(): Promise<void> {
    if (!this.result) return;

    const { rankings } = this.result;
    const winner = rankings.find((r) => r.rank === 1);
    const loser = rankings.find((r) => r.rank === rankings.length);

    // Winner section
    if (winner) {
      const winnerText = new Text({
        text: `🏆 1등: ${winner.player.name}`,
        style: { fontFamily: 'sans-serif', fontSize: 28, fontWeight: 'bold', fill: COLORS.gold },
      });
      winnerText.anchor.set(0.5, 0);
      winnerText.x = 195;
      winnerText.y = 100;
      this.container.addChild(winnerText);
    }

    // Loser section (the main event!)
    if (loser) {
      const loserBg = new Graphics();
      loserBg.roundRect(30, 200, 330, 120, 16);
      loserBg.fill({ color: 0x330000 });
      this.container.addChild(loserBg);

      const loserText = new Text({
        text: `⚡ 꼴등: ${loser.player.name}`,
        style: { fontFamily: 'sans-serif', fontSize: 32, fontWeight: 'bold', fill: COLORS.primary },
      });
      loserText.anchor.set(0.5, 0);
      loserText.x = 195;
      loserText.y = 220;
      this.container.addChild(loserText);

      const penaltyText = new Text({
        text: '당신이 쏩니다! 💸',
        style: { fontFamily: 'sans-serif', fontSize: 20, fill: COLORS.text },
      });
      penaltyText.anchor.set(0.5, 0);
      penaltyText.x = 195;
      penaltyText.y = 270;
      this.container.addChild(penaltyText);
    }

    // Full ranking
    rankings
      .sort((a, b) => a.rank - b.rank)
      .forEach((entry, i) => {
        const color = PLAYER_COLORS[entry.player.id % PLAYER_COLORS.length];
        const rankText = new Text({
          text: `${entry.rank}위  ${entry.player.name}`,
          style: { fontFamily: 'sans-serif', fontSize: 16, fill: color },
        });
        rankText.x = 50;
        rankText.y = 380 + i * 30;
        this.container.addChild(rankText);
      });

    // Replay button
    this.buildReplayButton();
  }

  update(_delta: number): void {
    // TODO: particle effects, animations
  }

  private buildReplayButton(): void {
    const btn = new Container();
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.y = 700;
    btn.x = 15;

    const bg = new Graphics();
    bg.roundRect(0, 0, 360, 56, 12);
    bg.fill({ color: COLORS.secondary });
    btn.addChild(bg);

    const label = new Text({
      text: '한 판 더? 🎲',
      style: { fontFamily: 'sans-serif', fontSize: 20, fontWeight: 'bold', fill: COLORS.text },
    });
    label.anchor.set(0.5);
    label.x = 180;
    label.y = 28;
    btn.addChild(label);

    btn.on('pointertap', () => {
      this.onReplay?.();
    });

    this.container.addChild(btn);
  }
}
