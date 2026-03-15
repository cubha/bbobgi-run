import { Container, Text, Graphics } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import type { GameMode, GameConfig, Player } from '@/types';
import { GAME_MODES } from '@/types';
import { COLORS, MIN_PLAYERS, MAX_PLAYERS } from '@utils/constants';

/**
 * Main init screen — mode selection + name input + start button.
 * Uses HTML overlay for name input (IME-safe).
 */
export class MainMenuScene extends BaseScene {
  private selectedMode: GameMode = 'horse';
  private players: Player[] = [];
  private onStart: ((config: GameConfig) => void) | null = null;

  /** Set callback for when the game starts */
  setStartCallback(cb: (config: GameConfig) => void): void {
    this.onStart = cb;
  }

  async init(): Promise<void> {
    this.buildTitle();
    this.buildModeCards();
    this.buildNameInput();
    this.buildStartButton();
  }

  update(_delta: number): void {
    // Menu is mostly event-driven, no per-frame updates needed
  }

  private buildTitle(): void {
    const title = new Text({
      text: '1등꼴등 게임',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 32,
        fontWeight: 'bold',
        fill: COLORS.text,
      },
    });
    title.anchor.set(0.5, 0);
    title.x = this.container.width || 195;
    title.y = 40;
    this.container.addChild(title);
  }

  private buildModeCards(): void {
    const cardsContainer = new Container();
    cardsContainer.y = 100;

    GAME_MODES.forEach((modeInfo, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const card = this.createModeCard(modeInfo.mode, modeInfo.title, modeInfo.subtitle, modeInfo.recommended);
      card.x = col * 185 + 15;
      card.y = row * 160;
      cardsContainer.addChild(card);
    });

    this.container.addChild(cardsContainer);
  }

  private createModeCard(mode: GameMode, title: string, subtitle: string, recommended: boolean): Container {
    const card = new Container();
    card.eventMode = 'static';
    card.cursor = 'pointer';

    const isSelected = mode === this.selectedMode;

    const bg = new Graphics();
    bg.roundRect(0, 0, 170, 140, 12);
    bg.fill({ color: isSelected ? COLORS.secondary : COLORS.accent, alpha: isSelected ? 1 : 0.6 });
    bg.stroke({ color: isSelected ? COLORS.primary : 0x333333, width: isSelected ? 3 : 1 });
    card.addChild(bg);

    const titleText = new Text({
      text: title,
      style: { fontFamily: 'sans-serif', fontSize: 20, fontWeight: 'bold', fill: COLORS.text },
    });
    titleText.x = 15;
    titleText.y = 50;
    card.addChild(titleText);

    const subText = new Text({
      text: subtitle,
      style: { fontFamily: 'sans-serif', fontSize: 12, fill: COLORS.textDim },
    });
    subText.x = 15;
    subText.y = 80;
    card.addChild(subText);

    if (recommended) {
      const badge = new Text({
        text: '추천',
        style: { fontFamily: 'sans-serif', fontSize: 10, fontWeight: 'bold', fill: COLORS.gold },
      });
      badge.x = 15;
      badge.y = 15;
      card.addChild(badge);
    }

    card.on('pointertap', () => {
      this.selectedMode = mode;
      // Rebuild cards to reflect selection
      const parent = card.parent;
      if (parent) {
        const y = parent.y;
        this.container.removeChild(parent);
        this.buildModeCards();
        const newCards = this.container.children[this.container.children.length - 1];
        if (newCards) newCards.y = y;
      }
    });

    return card;
  }

  private buildNameInput(): void {
    // TODO: Implement HTML overlay name input with chip UI
    // For now, placeholder text
    const placeholder = new Text({
      text: `참가자 이름을 입력하세요 (${MIN_PLAYERS}~${MAX_PLAYERS}명)`,
      style: { fontFamily: 'sans-serif', fontSize: 14, fill: COLORS.textDim },
    });
    placeholder.x = 15;
    placeholder.y = 460;
    this.container.addChild(placeholder);
  }

  private buildStartButton(): void {
    const btn = new Container();
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.y = 700;
    btn.x = 15;

    const bg = new Graphics();
    bg.roundRect(0, 0, 360, 56, 12);
    bg.fill({ color: COLORS.primary });
    btn.addChild(bg);

    const label = new Text({
      text: '시작!',
      style: { fontFamily: 'sans-serif', fontSize: 22, fontWeight: 'bold', fill: COLORS.text },
    });
    label.anchor.set(0.5);
    label.x = 180;
    label.y = 28;
    btn.addChild(label);

    btn.on('pointertap', () => {
      // TODO: Validate player count >= MIN_PLAYERS
      if (this.players.length < MIN_PLAYERS) {
        // Temporary: add dummy players for testing
        this.players = [
          { id: 1, name: '플레이어1' },
          { id: 2, name: '플레이어2' },
          { id: 3, name: '플레이어3' },
        ];
      }

      this.onStart?.({
        mode: this.selectedMode,
        players: this.players,
      });
    });

    this.container.addChild(btn);
  }
}
