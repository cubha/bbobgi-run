import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, FONT_DISPLAY, FONT_BODY } from '@utils/constants';
import type { PickMode } from '@/types';

export interface PickModeCardOptions {
  pickMode: PickMode;
  selected: boolean;
  onClick: (mode: PickMode) => void;
}

const CARD_WIDTH = 172;
const CARD_HEIGHT = 155;
const STRIP_HEIGHT = 65;

const CARD_DATA: Record<PickMode, { emoji: string; title: string; subtitle: string; accentColor: number; stripColor: number }> = {
  first: {
    emoji: '🏆',
    title: '1등 뽑기',
    subtitle: '1등이 당한다!',
    accentColor: COLORS.gold,
    stripColor: 0x2a1f00,
  },
  last: {
    emoji: '⚡',
    title: '꼴등 뽑기',
    subtitle: '꼴등이 쏜다!',
    accentColor: COLORS.primary,
    stripColor: 0x2a0010,
  },
};

/**
 * Pick mode selection card — top colored strip + emoji + title + subtitle.
 */
export class PickModeCard {
  private readonly _container: Container;
  private readonly borderLine: Graphics;
  private readonly pickMode: PickMode;
  private readonly onClick: (mode: PickMode) => void;
  private _selected: boolean;
  private _hovered: boolean = false;

  constructor(options: PickModeCardOptions) {
    this.pickMode = options.pickMode;
    this._selected = options.selected;
    this.onClick = options.onClick;

    const data = CARD_DATA[this.pickMode];

    this._container = new Container();

    // Card shadow (dot offset)
    const shadow = new Graphics();
    shadow.rect(2, 2, CARD_WIDTH, CARD_HEIGHT);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    this._container.addChild(shadow);

    // Card body background
    const cardBg = new Graphics();
    cardBg.rect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    cardBg.fill({ color: COLORS.accent });
    this._container.addChild(cardBg);

    // Top colored strip
    const strip = new Graphics();
    strip.rect(0, 0, CARD_WIDTH, STRIP_HEIGHT);
    strip.fill({ color: data.stripColor });
    this._container.addChild(strip);

    // Border line (selection/hover indicator)
    this.borderLine = new Graphics();
    this._container.addChild(this.borderLine);
    this.drawBorder();

    // Emoji
    const emoji = new Text({
      text: data.emoji,
      style: { fontSize: 40 },
    });
    emoji.anchor.set(0.5);
    emoji.position.set(CARD_WIDTH / 2, STRIP_HEIGHT / 2 + 2);
    this._container.addChild(emoji);

    // Title
    const title = new Text({
      text: data.title,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 20,
        fill: COLORS.text,
      },
    });
    title.anchor.set(0.5);
    title.position.set(CARD_WIDTH / 2, STRIP_HEIGHT + 24);
    this._container.addChild(title);

    // Subtitle with accent color
    const subtitle = new Text({
      text: data.subtitle,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: '700',
        fill: data.accentColor,
      },
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(CARD_WIDTH / 2, STRIP_HEIGHT + 50);
    this._container.addChild(subtitle);

    // Small decorative line under title
    const deco = new Graphics();
    deco.rect(CARD_WIDTH / 2 - 18, STRIP_HEIGHT + 37, 36, 1.5);
    deco.fill({ color: data.accentColor, alpha: 0.5 });
    this._container.addChild(deco);

    // Interaction
    this._container.eventMode = 'static';
    this._container.cursor = 'pointer';
    this._container.on('pointertap', () => this.onClick(this.pickMode));
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
  }

  get container(): Container {
    return this._container;
  }

  setSelected(selected: boolean): void {
    this._selected = selected;
    this._hovered = false;
    this.drawBorder();
    if (selected) {
      gsap.to(this._container, { y: -2, duration: 0.15, ease: 'power2.out' });
    } else {
      gsap.to(this._container, { y: 0, duration: 0.15, ease: 'power2.out' });
    }
  }

  private drawBorder(): void {
    const data = CARD_DATA[this.pickMode];
    this.borderLine.clear();

    if (this._selected) {
      this.borderLine.rect(-2, -2, CARD_WIDTH + 4, CARD_HEIGHT + 4);
      this.borderLine.stroke({ width: 2, color: data.accentColor, alpha: 1.0 });
    } else if (this._hovered) {
      this.borderLine.rect(-2, -2, CARD_WIDTH + 4, CARD_HEIGHT + 4);
      this.borderLine.stroke({ width: 2, color: data.accentColor, alpha: 0.5 });
    }
  }
}
