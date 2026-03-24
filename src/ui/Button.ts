import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, FONT_DISPLAY } from '@utils/constants';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  color?: number;
  onClick: () => void;
}

/**
 * Dot-style button with solid fill, 3D pixel border, and classic press animation.
 */
export class Button {
  readonly container: Container;

  private readonly bg: Graphics;
  private readonly border: Graphics;
  private readonly text: Text;
  private readonly color: number;
  private readonly btnWidth: number;
  private readonly btnHeight: number;
  private readonly onClick: () => void;
  private _disabled = false;
  private _pressed = false;

  constructor(options: ButtonOptions) {
    const {
      label,
      width = 200,
      height = 52,
      color = COLORS.primary,
      onClick,
    } = options;

    this.color = color;
    this.btnWidth = width;
    this.btnHeight = height;
    this.onClick = onClick;

    this.container = new Container();

    // Main button background (solid rect)
    this.bg = new Graphics();
    this.drawBg();
    this.container.addChild(this.bg);

    // 3D dot-style border overlay
    this.border = new Graphics();
    this.drawBorder(COLORS.textDim);
    this.container.addChild(this.border);

    // Label
    this.text = new Text({
      text: label,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 20,
        fontWeight: 'bold',
        fill: COLORS.text,
        dropShadow: { color: 0x000000, blur: 0, distance: 2, angle: Math.PI / 2, alpha: 0.6 },
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
    this.bg.rect(0, 0, this.btnWidth, this.btnHeight);
    this.bg.fill({ color: this.color });
  }

  private drawBorder(borderColor: number): void {
    this.border.clear();
    const w = this.btnWidth;
    const h = this.btnHeight;
    // Top edge (bright)
    this.border.rect(0, 0, w, 2);
    this.border.fill({ color: borderColor, alpha: 0.9 });
    // Left edge (bright)
    this.border.rect(0, 0, 2, h);
    this.border.fill({ color: borderColor, alpha: 0.9 });
    // Bottom edge (dark)
    this.border.rect(0, h - 2, w, 2);
    this.border.fill({ color: 0x000000, alpha: 0.5 });
    // Right edge (dark)
    this.border.rect(w - 2, 0, 2, h);
    this.border.fill({ color: 0x000000, alpha: 0.5 });
  }

  private handleOver(): void {
    if (this._disabled) return;
    this.drawBorder(COLORS.gold);
  }

  private handleOut(): void {
    if (this._disabled) return;
    this.drawBorder(COLORS.textDim);
    if (this._pressed) {
      this.container.y -= 2;
      this._pressed = false;
    }
  }

  private handleDown(): void {
    if (this._disabled) return;
    this._pressed = true;
    gsap.killTweensOf(this.container);
    this.container.y += 2;
  }

  private handleUp(): void {
    if (this._disabled || !this._pressed) return;
    this._pressed = false;
    gsap.killTweensOf(this.container);
    this.container.y -= 2;
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
    this.drawBorder(COLORS.textDim);
  }

  disable(): void {
    this._disabled = true;
    this.container.alpha = 0.4;
    this.container.cursor = 'default';
    this.container.eventMode = 'none';
  }
}
