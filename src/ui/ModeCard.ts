import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, FONT_DISPLAY, FONT_BODY } from '@utils/constants';
import type { GameMode, GameModeInfo } from '@/types';

export interface ModeCardOptions {
  modeInfo: GameModeInfo;
  selected: boolean;
  active: boolean;
  onClick: (mode: GameMode) => void;
}

const CARD_WIDTH = 172;
const CARD_HEIGHT = 125;

const MODE_EMOJIS: Record<GameMode, string> = {
  horse: '🐎',
  marble: '🔮',
  ladder: '🪜',
  pachinko: '🎰',
};

/**
 * Game mode selection card — emoji + title + subtitle + inactive overlay.
 */
export class ModeCard {
  private readonly _container: Container;
  private readonly borderLine: Graphics;
  private readonly modeInfo: GameModeInfo;
  private readonly active: boolean;
  private readonly onClick: (mode: GameMode) => void;
  private _selected: boolean;
  private _hovered: boolean = false;
  private _baseY: number | null = null;

  constructor(options: ModeCardOptions) {
    this.modeInfo = options.modeInfo;
    this._selected = options.selected;
    this.active = options.active;
    this.onClick = options.onClick;

    this._container = new Container();

    // Card shadow (dot offset)
    const shadow = new Graphics();
    shadow.rect(2, 2, CARD_WIDTH, CARD_HEIGHT);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    this._container.addChild(shadow);

    // Card body
    const cardBg = new Graphics();
    cardBg.rect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    cardBg.fill({ color: COLORS.accent });
    this._container.addChild(cardBg);

    // Border line
    this.borderLine = new Graphics();
    this._container.addChild(this.borderLine);
    this.drawBorder();

    // Emoji
    const emojiText = new Text({
      text: MODE_EMOJIS[this.modeInfo.mode],
      style: { fontSize: 28 },
    });
    emojiText.anchor.set(0.5);
    emojiText.position.set(CARD_WIDTH / 2, 24);
    this._container.addChild(emojiText);

    // Title
    const title = new Text({
      text: this.modeInfo.title,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 18,
        fill: COLORS.text,
      },
    });
    title.anchor.set(0.5);
    title.position.set(CARD_WIDTH / 2, 56);
    this._container.addChild(title);

    // Subtitle
    const subtitle = new Text({
      text: this.modeInfo.subtitle,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 10,
        fill: COLORS.textDim,
      },
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(CARD_WIDTH / 2, 75);
    this._container.addChild(subtitle);

    // Description
    const desc = new Text({
      text: this.modeInfo.description,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 11,
        fill: this.active ? COLORS.text : COLORS.textDim,
        wordWrap: true,
        wordWrapWidth: CARD_WIDTH - 16,
        align: 'center',
      },
    });
    desc.alpha = 0.7;
    desc.anchor.set(0.5);
    desc.position.set(CARD_WIDTH / 2, 100);
    this._container.addChild(desc);

    // Inactive overlay
    if (!this.active) {
      const overlay = new Graphics();
      overlay.rect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      overlay.fill({ color: 0x000000, alpha: 0.55 });
      this._container.addChild(overlay);

      const comingSoon = new Text({
        text: '준비 중',
        style: {
          fontFamily: FONT_DISPLAY,
          fontSize: 15,
          fill: COLORS.textDim,
        },
      });
      comingSoon.anchor.set(0.5);
      comingSoon.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
      this._container.addChild(comingSoon);

      this._container.alpha = 0.65;
    }

    // Interaction
    if (this.active) {
      this._container.eventMode = 'static';
      this._container.cursor = 'pointer';
      this._container.on('pointertap', () => this.onClick(this.modeInfo.mode));
      this._container.on('pointerover', () => {
        if (!this._selected) {
          this._hovered = true;
          this.drawBorder();
        }
      });
      this._container.on('pointerout', () => {
        this._hovered = false;
        this.drawBorder();
      });
    } else {
      this._container.eventMode = 'none';
    }
  }

  get container(): Container {
    return this._container;
  }

  setSelected(selected: boolean): void {
    if (this._baseY === null) this._baseY = this._container.y;
    this._selected = selected;
    this._hovered = false;
    this.drawBorder();
    if (selected) {
      gsap.to(this._container, { y: this._baseY - 2, duration: 0.15, ease: 'power2.out' });
    } else {
      gsap.to(this._container, { y: this._baseY, duration: 0.15, ease: 'power2.out' });
    }
  }

  private drawBorder(): void {
    this.borderLine.clear();

    if (this._selected) {
      this.borderLine.rect(-2, -2, CARD_WIDTH + 4, CARD_HEIGHT + 4);
      this.borderLine.stroke({ width: 2, color: COLORS.primary, alpha: 0.9 });
    } else if (this._hovered) {
      this.borderLine.rect(-2, -2, CARD_WIDTH + 4, CARD_HEIGHT + 4);
      this.borderLine.stroke({ width: 2, color: COLORS.textDim, alpha: 0.7 });
    }
  }
}
