import { Container, Text, Graphics } from 'pixi.js';
import type { PlayerStats, GameMode } from '@/types';
import { COLORS, DESIGN_WIDTH, FONT_BODY, FONT_DISPLAY } from '@utils/constants';
import { SectionLabel } from '@ui/SectionLabel';

interface StatsPanelOptions {
  playerStats: PlayerStats[];
  overallStats: { totalGames: number; byMode: Record<GameMode, number> };
  y: number;
}

const MODE_LABEL: Record<GameMode, string> = {
  horse: '경마',
  marble: '구슬',
  ladder: '사다리',
  pachinko: '파친코',
};

export class StatsPanel {
  readonly container: Container;
  readonly height: number;

  constructor(options: StatsPanelOptions) {
    const { playerStats, overallStats, y } = options;

    this.container = new Container();
    this.container.y = y;

    let currentY = 0;

    // Section header
    const sectionLabel = new SectionLabel({ text: '전적 기록', y: currentY, accentAlpha: 0.6 });
    this.container.addChild(sectionLabel.container);
    currentY += 22;

    if (overallStats.totalGames === 0) {
      // Empty state
      const emptyText = new Text({
        text: '아직 기록이 없어요',
        style: {
          fontFamily: FONT_BODY,
          fontSize: 13,
          fill: COLORS.textDim,
        },
      });
      emptyText.anchor.set(0.5, 0);
      emptyText.x = DESIGN_WIDTH / 2;
      emptyText.y = currentY;
      this.container.addChild(emptyText);
      currentY += 24;
    } else {
      // Overall stats row
      const modeBreakdown = (Object.keys(MODE_LABEL) as GameMode[])
        .map((m) => `${MODE_LABEL[m]}${overallStats.byMode[m]}`)
        .join(' / ');
      const overallText = new Text({
        text: `전체: ${overallStats.totalGames}게임 (${modeBreakdown})`,
        style: {
          fontFamily: FONT_BODY,
          fontSize: 11,
          fill: COLORS.textDim,
        },
      });
      overallText.x = 24;
      overallText.y = currentY;
      this.container.addChild(overallText);
      currentY += 20;

      // Player rows
      for (const stats of playerStats) {
        const rowH = 30;

        // Row background
        const rowBg = new Graphics();
        rowBg.rect(14, currentY, DESIGN_WIDTH - 28, rowH);
        rowBg.fill({ color: COLORS.accent, alpha: 0.8 });
        this.container.addChild(rowBg);

        // Name
        const nameText = new Text({
          text: stats.name,
          style: {
            fontFamily: FONT_DISPLAY,
            fontSize: 14,
            fill: COLORS.text,
          },
        });
        nameText.anchor.set(0, 0.5);
        nameText.x = 24;
        nameText.y = currentY + rowH / 2;
        this.container.addChild(nameText);

        // Stat string
        const statStr = `${stats.totalGames}전 ${stats.wins}승 ${stats.losses}패 | 승률 ${Math.round(stats.winRate * 100)}%`;
        const statColor =
          stats.winRate >= 0.5 ? COLORS.gold : stats.winRate < 0.3 ? COLORS.primary : COLORS.textDim;

        const statText = new Text({
          text: statStr,
          style: {
            fontFamily: FONT_BODY,
            fontSize: 11,
            fill: statColor,
          },
        });
        statText.anchor.set(1, 0.5);
        statText.x = DESIGN_WIDTH - 20;
        statText.y = currentY + rowH / 2;
        this.container.addChild(statText);

        currentY += rowH + 4;
      }
    }

    this.height = currentY;
  }
}
