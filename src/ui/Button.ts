import { Container, Graphics, Text, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, FONT_DISPLAY } from '@utils/constants';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  color?: number;
  colorEnd?: number;
  onClick: () => void;
}

/**
 * Reusable button with gradient background, glow on hover, GSAP press animation.
 */
export class Button {
  readonly container: Container;

  private readonly bg: Graphics;
  private readonly glowBg: Graphics;
  private readonly text: Text;
  private readonly color: number;
  private readonly colorEnd: number;
  private readonly btnWidth: number;
  private readonly btnHeight: number;
  private readonly onClick: () => void;
  private _disabled = false;

  constructor(options: ButtonOptions) {
    const {
      label,
      width = 200,
      height = 52,
      color = COLORS.primary,
      colorEnd,
      onClick,
    } = options;

    this.color = color;
    this.colorEnd = colorEnd ?? this.lighten(color, 0.15);
    this.btnWidth = width;
    this.btnHeight = height;
    this.onClick = onClick;

    this.container = new Container();

    // Glow background (slightly larger, same color at low alpha)
    this.glowBg = new Graphics();
    this.drawGlow(0);
    this.container.addChild(this.glowBg);

    // Main button background (gradient)
    this.bg = new Graphics();
    this.drawBg();
    this.container.addChild(this.bg);

    // Highlight overlay — thin bright strip at top
    const highlight = new Graphics();
    highlight.roundRect(3, 2, width - 6, height / 3, 8);
    highlight.fill({ color: 0xffffff, alpha: 0.12 });
    this.container.addChild(highlight);

    // Label
    this.text = new Text({
      text: label,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 20,
        fontWeight: 'bold',
        fill: COLORS.text,
        dropShadow: { color: 0x000000, blur: 4, distance: 2, angle: Math.PI / 2, alpha: 0.6 },
      },
    });
    this.text.anchor.set(0.5);
    this.text.position.set(this.btnWidth / 2, this.btnHeight / 2);
    this.container.addChild(this.text);

    // Interaction
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    this.container.on('pointerover', this.handleOver, this);
    this.container.on('pointerout', this.handleOut, this);
    this.container.on('pointerdown', this.handleDown, this);
    this.container.on('pointerup', this.handleUp, this);
    this.container.on('pointerupoutside', this.handleUp, this);
    this.container.on('pointertap', this.handleTap, this);
  }

  private drawBg(): void {
    this.bg.clear();
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: this.colorEnd },
        { offset: 1, color: this.color },
      ],
    });
    this.bg.roundRect(0, 0, this.btnWidth, this.btnHeight, 14);
    this.bg.fill(gradient);
    // Border
    this.bg.roundRect(0, 0, this.btnWidth, this.btnHeight, 14);
    this.bg.stroke({ color: this.lighten(this.color, 0.25), width: 1.5, alpha: 0.6 });
  }

  private drawGlow(alpha: number): void {
    this.glowBg.clear();
    if (alpha <= 0) return;
    for (let i = 3; i >= 1; i--) {
      const expand = i * 4;
      this.glowBg.roundRect(-expand, -expand, this.btnWidth + expand * 2, this.btnHeight + expand * 2, 14 + expand);
      this.glowBg.fill({ color: this.color, alpha: (alpha * 0.12) / i });
    }
  }

  private lighten(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
    const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
    return (r << 16) | (g << 8) | b;
  }

  private handleOver(): void {
    if (this._disabled) return;
    this.drawGlow(1);
    gsap.to(this.container.scale, { x: 1.02, y: 1.02, duration: 0.15, ease: 'power2.out' });
  }

  private handleOut(): void {
    if (this._disabled) return;
    this.drawGlow(0);
    gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
  }

  private handleDown(): void {
    if (this._disabled) return;
    gsap.to(this.container.scale, { x: 0.95, y: 0.95, duration: 0.08, ease: 'power2.out' });
  }

  private handleUp(): void {
    if (this._disabled) return;
    gsap.to(this.container.scale, { x: 1.02, y: 1.02, duration: 0.18, ease: 'back.out(2)' });
  }

  private handleTap(): void {
    if (this._disabled) return;
    this.onClick();
  }

  enable(): void {
    this._disabled = false;
    this.container.alpha = 1;
    this.container.cursor = 'pointer';
    this.container.eventMode = 'static';
    this.drawBg();
  }

  disable(): void {
    this._disabled = true;
    this.container.alpha = 0.4;
    this.container.cursor = 'default';
    this.container.eventMode = 'none';
  }
}
