import { Container, Graphics, Text } from 'pixi.js';
import type { BettingResult, Player } from '@/types';
import { COLORS, DESIGN_WIDTH, FONT_DISPLAY, FONT_BODY } from '@utils/constants';
import { SectionLabel } from '@ui/SectionLabel';

export interface BettingResultPanelOptions {
  bettingResult: BettingResult;
  players: Player[];
  y: number;
}

export class BettingResultPanel {
  readonly container: Container;
  readonly height: number;

  constructor(options: BettingResultPanelOptions) {
    const { bettingResult, players, y } = options;
    const { settlements, totalPool } = bettingResult;
    const playerMap = new Map(players.map((p) => [p.id, p.name]));

    this.container = new Container();

    // Section header
    this.container.addChild(
      new SectionLabel({ text: '베팅 결과', y, accentColor: COLORS.gold, accentAlpha: 0.8 }).container,
    );

    let currentY = y + 22;

    // Total pool display
    const poolBg = new Graphics();
    poolBg.roundRect(14, currentY, DESIGN_WIDTH - 28, 30, 8);
    poolBg.fill({ color: COLORS.accent, alpha: 0.85 });
    this.container.addChild(poolBg);

    const poolText = new Text({
      text: `총 배팅풀: ${totalPool}pt`,
      style: { fontFamily: FONT_BODY, fontSize: 12, fill: COLORS.gold },
    });
    poolText.x = 24;
    poolText.y = currentY + 8;
    this.container.addChild(poolText);

    currentY += 38;

    // Each settlement row
    for (const settlement of settlements) {
      const { bet, won, payout } = settlement;
      const rowBg = new Graphics();
      rowBg.roundRect(14, currentY, DESIGN_WIDTH - 28, 34, 8);
      rowBg.fill({ color: won ? 0x0a2a0a : 0x2a0a0a, alpha: 0.8 });
      rowBg.roundRect(14, currentY, DESIGN_WIDTH - 28, 34, 8);
      rowBg.stroke({ color: won ? 0x2ecc71 : COLORS.primary, width: 1, alpha: 0.4 });
      this.container.addChild(rowBg);

      // Left: bettor → target
      const targetName = playerMap.get(bet.targetPlayerId) ?? `#${bet.targetPlayerId}`;
      const leftText = new Text({
        text: `${bet.bettorName} → ${targetName}  ${bet.amount}pt`,
        style: { fontFamily: FONT_BODY, fontSize: 12, fill: COLORS.textDim },
      });
      leftText.x = 24;
      leftText.y = currentY + 10;
      this.container.addChild(leftText);

      // Right: result
      const resultLabel = won
        ? `+${Math.round(payout)}pt`
        : `-${bet.amount}pt`;
      const resultText = new Text({
        text: resultLabel,
        style: {
          fontFamily: FONT_DISPLAY,
          fontSize: 14,
          fill: won ? 0x2ecc71 : COLORS.primary,
        },
      });
      resultText.anchor.set(1, 0);
      resultText.x = DESIGN_WIDTH - 24;
      resultText.y = currentY + 9;
      this.container.addChild(resultText);

      currentY += 40;
    }

    this.height = currentY - y;
  }
}
