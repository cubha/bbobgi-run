import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import type { Player } from '@/types';
import type { BettingManager } from '@core/BettingManager';
import {
  COLORS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  PLAYER_COLORS,
  FONT_DISPLAY,
  FONT_BODY,
} from '@utils/constants';
import { Button } from '@ui/Button';
import { SectionLabel } from '@ui/SectionLabel';

export interface BettingPanelOptions {
  players: Player[];
  bettingManager: BettingManager;
  onComplete: () => void;
  onSkip: () => void;
}

interface PlayerRow {
  container: Container;
  nameText: Text;
  oddsText: Text;
  statusText: Text;
  bg: Graphics;
  playerId: number;
  betPlaced: boolean;
}

export class BettingPanel {
  readonly container: Container;

  private readonly options: BettingPanelOptions;
  private readonly rows: PlayerRow[] = [];
  private totalPoolText: Text | null = null;
  private confirmBtn: Button | null = null;

  constructor(options: BettingPanelOptions) {
    this.options = options;
    this.container = new Container();
    this.container.alpha = 0;
    this.container.y = 40;

    this.buildOverlay();
    this.buildHeader();
    this.buildPlayerList();
    this.buildFooter();

    // Slide + fade in
    gsap.to(this.container, { alpha: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  }

  // ─── Overlay background ──────────────────────

  private buildOverlay(): void {
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill({ color: COLORS.background, alpha: 0.97 });
    this.container.addChild(bg);
  }

  // ─── Header ──────────────────────────────────

  private buildHeader(): void {
    this.container.addChild(new SectionLabel({ text: '베팅', y: 16 }).container);

    const desc = new Text({
      text: '누가 이길까요? 100pt를 걸어보세요!',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fill: COLORS.textDim,
      },
    });
    desc.x = 14;
    desc.y = 40;
    this.container.addChild(desc);

    // Divider
    const divider = new Graphics();
    divider.rect(14, 60, DESIGN_WIDTH - 28, 1);
    divider.fill({ color: COLORS.primary, alpha: 0.3 });
    this.container.addChild(divider);
  }

  // ─── Player list ─────────────────────────────

  private buildPlayerList(): void {
    const startY = 72;
    const rowHeight = 52;
    const { players, bettingManager } = this.options;
    const odds = bettingManager.getOdds();

    players.forEach((player, i) => {
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length] as number;
      const row = this.buildPlayerRow(player, color, odds[player.id] ?? 0, startY + i * rowHeight);
      this.rows.push(row);
      this.container.addChild(row.container);
    });
  }

  private buildPlayerRow(player: Player, color: number, oddsValue: number, y: number): PlayerRow {
    const rowContainer = new Container();
    rowContainer.y = y;

    // Background
    const bg = new Graphics();
    this.drawRowBg(bg, color, false);
    rowContainer.addChild(bg);

    // Color strip (left)
    const strip = new Graphics();
    strip.rect(14, 8, 4, 36);
    strip.fill({ color, alpha: 1 });
    rowContainer.addChild(strip);

    // Player name
    const nameText = new Text({
      text: player.name,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 15,
        fontWeight: '700',
        fill: COLORS.text,
      },
    });
    nameText.x = 26;
    nameText.y = 18;
    rowContainer.addChild(nameText);

    // Odds text (right side)
    const oddsLabel = oddsValue > 0 ? `x${oddsValue.toFixed(1)}` : '-';
    const oddsText = new Text({
      text: oddsLabel,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 14,
        fill: COLORS.gold,
      },
    });
    oddsText.anchor.set(1, 0.5);
    oddsText.x = DESIGN_WIDTH - 60;
    oddsText.y = 26;
    rowContainer.addChild(oddsText);

    // Status text (hidden initially)
    const statusText = new Text({
      text: '✓ 베팅 완료',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fill: color,
        fontWeight: '700',
      },
    });
    statusText.anchor.set(1, 0.5);
    statusText.x = DESIGN_WIDTH - 14;
    statusText.y = 26;
    statusText.alpha = 0;
    rowContainer.addChild(statusText);

    // Interaction
    rowContainer.eventMode = 'static';
    rowContainer.cursor = 'pointer';

    const row: PlayerRow = {
      container: rowContainer,
      nameText,
      oddsText,
      statusText,
      bg,
      playerId: player.id,
      betPlaced: false,
    };

    rowContainer.on('pointertap', () => this.handleBet(row));
    rowContainer.on('pointerover', () => {
      if (!row.betPlaced) {
        gsap.to(rowContainer, { alpha: 0.85, duration: 0.1 });
      }
    });
    rowContainer.on('pointerout', () => {
      gsap.to(rowContainer, { alpha: 1, duration: 0.1 });
    });

    return row;
  }

  private drawRowBg(bg: Graphics, color: number, highlighted: boolean): void {
    bg.clear();
    bg.roundRect(14, 4, DESIGN_WIDTH - 28, 44, 8);
    bg.fill({ color: highlighted ? color : COLORS.accent, alpha: highlighted ? 0.25 : 0.8 });
    bg.roundRect(14, 4, DESIGN_WIDTH - 28, 44, 8);
    bg.stroke({ color, width: 1, alpha: 0.4 });
  }

  private handleBet(row: PlayerRow): void {
    if (row.betPlaced) return;

    const { bettingManager } = this.options;
    const placed = bettingManager.placeBet({
      bettorName: '관전자',
      targetPlayerId: row.playerId,
      amount: 100,
    });
    if (!placed) return;

    row.betPlaced = true;

    // Disable row interaction
    row.container.eventMode = 'none';
    row.container.cursor = 'default';

    // Highlight background
    const playerIndex = this.options.players.findIndex((p) => p.id === row.playerId);
    const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length] as number;
    this.drawRowBg(row.bg, color, true);

    // Show status, hide odds
    gsap.to(row.oddsText, { alpha: 0, duration: 0.15 });
    gsap.to(row.statusText, { alpha: 1, duration: 0.2, delay: 0.1 });

    // Scale pop
    gsap.fromTo(
      row.container.scale,
      { x: 0.97, y: 0.97 },
      { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' },
    );

    this.refreshOdds();
    this.refreshTotalPool();
    this.confirmBtn?.enable();
  }

  // ─── Refresh odds display ─────────────────────

  private refreshOdds(): void {
    const odds = this.options.bettingManager.getOdds();

    for (const row of this.rows) {
      if (row.betPlaced) continue;

      const oddsValue = odds[row.playerId] ?? 0;
      const newLabel = oddsValue > 0 ? `x${oddsValue.toFixed(1)}` : '-';

      // Tween the text value (numeric interpolation for effect)
      const currentOdds = parseFloat(row.oddsText.text.replace('x', '') || '0');
      const targetOdds = oddsValue;
      if (oddsValue > 0) {
        gsap.fromTo(
          { val: currentOdds },
          { val: currentOdds },
          {
            val: targetOdds,
            duration: 0.4,
            ease: 'power2.out',
            onUpdate: function (this: gsap.core.Tween) {
              const v = (this.targets()[0] as { val: number }).val;
              row.oddsText.text = `x${v.toFixed(1)}`;
            },
          },
        );
      } else {
        row.oddsText.text = newLabel;
      }
    }
  }

  // ─── Footer ───────────────────────────────────

  private buildFooter(): void {
    const { players } = this.options;
    const footerY = 72 + players.length * 52 + 12;

    // Total pool display
    const poolBg = new Graphics();
    poolBg.roundRect(14, footerY, DESIGN_WIDTH - 28, 36, 8);
    poolBg.fill({ color: COLORS.accent, alpha: 0.9 });
    this.container.addChild(poolBg);

    const poolLabel = new Text({
      text: '총 배팅:',
      style: { fontFamily: FONT_BODY, fontSize: 13, fill: COLORS.textDim },
    });
    poolLabel.x = 24;
    poolLabel.y = footerY + 10;
    this.container.addChild(poolLabel);

    this.totalPoolText = new Text({
      text: '0pt',
      style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: COLORS.gold },
    });
    this.totalPoolText.anchor.set(1, 0);
    this.totalPoolText.x = DESIGN_WIDTH - 24;
    this.totalPoolText.y = footerY + 10;
    this.container.addChild(this.totalPoolText);

    // Confirm button
    const confirmBtn = new Button({
      label: '베팅 확정! 🎰',
      width: DESIGN_WIDTH - 28,
      height: 54,
      color: COLORS.primary,
      colorEnd: 0xff6080,
      onClick: () => this.handleComplete(),
    });
    confirmBtn.container.x = 14;
    confirmBtn.container.y = footerY + 52;
    confirmBtn.disable();
    this.container.addChild(confirmBtn.container);
    this.confirmBtn = confirmBtn;

    // Skip button
    const skipBtn = new Button({
      label: '건너뛰기',
      width: DESIGN_WIDTH - 28,
      height: 40,
      color: COLORS.accent,
      colorEnd: 0x1e2f50,
      onClick: () => this.handleSkip(),
    });
    skipBtn.container.x = 14;
    skipBtn.container.y = footerY + 114;
    this.container.addChild(skipBtn.container);

    // Skip label style override — make text smaller via internal text property
    const skipText = skipBtn.container.getChildAt(3);
    if (skipText instanceof Text) {
      skipText.style.fontSize = 14;
      skipText.style.fill = COLORS.textDim;
    }
  }

  private refreshTotalPool(): void {
    if (!this.totalPoolText) return;
    const pool = this.options.bettingManager.totalPool;

    const obj = { val: parseFloat(this.totalPoolText.text) || 0 };
    gsap.to(obj, {
      val: pool,
      duration: 0.4,
      ease: 'power2.out',
      onUpdate: () => {
        if (this.totalPoolText) {
          this.totalPoolText.text = `${Math.round(obj.val)}pt`;
        }
      },
    });
  }

  // ─── Handlers ─────────────────────────────────

  private handleComplete(): void {
    gsap.to(this.container, {
      alpha: 0,
      y: -20,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => this.options.onComplete(),
    });
  }

  private handleSkip(): void {
    gsap.to(this.container, {
      alpha: 0,
      y: -20,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => this.options.onSkip(),
    });
  }

  // ─── Lifecycle ────────────────────────────────

  destroy(): void {
    gsap.killTweensOf(this.container);
    for (const row of this.rows) {
      gsap.killTweensOf(row.container);
      gsap.killTweensOf(row.container.scale);
    }
    this.container.destroy({ children: true });
  }
}
