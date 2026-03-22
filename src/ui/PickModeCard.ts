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
const BORDER_RADIUS = 16;

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
  private readonly outerGlow: Graphics;
  private readonly borderLine: Graphics;
  private readonly pickMode: PickMode;
  private readonly onClick: (mode: PickMode) => void;
  private _selected: boolean;

  constructor(options: PickModeCardOptions) {
    this.pickMode = options.pickMode;
    this._selected = options.selected;
    this.onClick = options.onClick;

    const data = CARD_DATA[this.pickMode];

    this._container = new Container();

    // Outer glow layers (shown when selected)
    this.outerGlow = new Graphics();
    this._container.addChild(this.outerGlow);

    // Card shadow
    const shadow = new Graphics();
    shadow.roundRect(4, 6, CARD_WIDTH, CARD_HEIGHT, BORDER_RADIUS);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    this._container.addChild(shadow);

    // Card body background
    const cardBg = new Graphics();
    cardBg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, BORDER_RADIUS);
    cardBg.fill({ color: COLORS.accent });
    this._container.addChild(cardBg);

    // Top colored strip
    const strip = new Graphics();
    // Draw strip clipped to top of card
    strip.roundRect(0, 0, CARD_WIDTH, STRIP_HEIGHT, BORDER_RADIUS);
    strip.fill({ color: data.stripColor });
    // Cover bottom corners of strip (so it only rounds at top)
    const stripFill = new Graphics();
    stripFill.rect(0, BORDER_RADIUS, CARD_WIDTH, STRIP_HEIGHT - BORDER_RADIUS);
    stripFill.fill({ color: data.stripColor });
    this._container.addChild(strip);
    this._container.addChild(stripFill);

    // Subtle strip shimmer
    const shimmer = new Graphics();
    shimmer.roundRect(0, 0, CARD_WIDTH, STRIP_HEIGHT, BORDER_RADIUS);
    shimmer.fill({ color: data.accentColor, alpha: 0.08 });
    this._container.addChild(shimmer);

    // Border line (selection indicator)
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
        gsap.to(this._container.scale, { x: 1.03, y: 1.03, duration: 0.15, ease: 'power2.out' });
        gsap.to(this._container, { alpha: 0.93, duration: 0.1 });
      }
    });
    this._container.on('pointerout', () => {
      gsap.to(this._container.scale, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
      gsap.to(this._container, { alpha: 1, duration: 0.1 });
    });
  }

  get container(): Container {
    return this._container;
  }

  setSelected(selected: boolean): void {
    this._selected = selected;
    this.drawBorder();
    if (selected) {
      gsap.to(this._container.scale, { x: 1.04, y: 1.04, duration: 0.2, ease: 'back.out(2)' });
    } else {
      gsap.to(this._container.scale, { x: 1, y: 1, duration: 0.15, ease: 'power2.out' });
    }
  }

  private drawBorder(): void {
    const data = CARD_DATA[this.pickMode];
    this.outerGlow.clear();
    this.borderLine.clear();

    if (this._selected) {
      // Glow layers
      for (let i = 3; i >= 1; i--) {
        const exp = i * 3;
        this.outerGlow.roundRect(-exp, -exp, CARD_WIDTH + exp * 2, CARD_HEIGHT + exp * 2, BORDER_RADIUS + exp);
        this.outerGlow.fill({ color: data.accentColor, alpha: 0.06 * (4 - i) });
      }
      // Crisp border
      this.borderLine.roundRect(-1.5, -1.5, CARD_WIDTH + 3, CARD_HEIGHT + 3, BORDER_RADIUS + 1.5);
      this.borderLine.stroke({ width: 2.5, color: data.accentColor, alpha: 0.9 });
    }
  }
}
