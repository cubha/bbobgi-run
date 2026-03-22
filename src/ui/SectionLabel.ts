import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONT_BODY } from '@utils/constants';

export interface SectionLabelOptions {
  text: string;
  y: number;
  accentColor?: number;
  accentAlpha?: number;
}

export class SectionLabel {
  readonly container: Container;

  constructor(options: SectionLabelOptions) {
    const { text, y, accentColor = COLORS.primary, accentAlpha = 1 } = options;

    this.container = new Container();
    this.container.y = y;

    // Left accent bar
    const bar = new Graphics();
    bar.rect(14, 1, 3, 14);
    bar.fill({ color: accentColor, alpha: accentAlpha });
    this.container.addChild(bar);

    const label = new Text({
      text: text.toUpperCase(),
      style: {
        fontFamily: FONT_BODY,
        fontSize: 12,
        fontWeight: '700',
        fill: COLORS.textDim,
        letterSpacing: 2,
      },
    });
    label.x = 24;
    label.y = 0;
    this.container.addChild(label);
  }
}
