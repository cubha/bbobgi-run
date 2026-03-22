import { Container, Graphics } from 'pixi.js';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '@utils/constants';

export interface DotGridBackgroundOptions {
  dotColor?: number;
  dotAlpha?: number;
  accentColor?: number;
  showBottomBar?: boolean;
}

export class DotGridBackground {
  readonly container: Container;

  constructor(options: DotGridBackgroundOptions = {}) {
    const {
      dotColor = 0x3344aa,
      dotAlpha = 0.25,
      accentColor = COLORS.primary,
      showBottomBar = false,
    } = options;

    this.container = new Container();

    // Base background
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill(COLORS.background);
    this.container.addChild(bg);

    // Dot grid pattern
    const dots = new Graphics();
    for (let y = 16; y < DESIGN_HEIGHT; y += 28) {
      for (let x = 16; x < DESIGN_WIDTH; x += 28) {
        dots.circle(x, y, 1);
        dots.fill({ color: dotColor, alpha: dotAlpha });
      }
    }
    this.container.addChild(dots);

    // Top accent bar
    const topBar = new Graphics();
    topBar.rect(0, 0, DESIGN_WIDTH, 3);
    topBar.fill({ color: accentColor });
    this.container.addChild(topBar);

    // Optional bottom accent bar
    if (showBottomBar) {
      const bottomBar = new Graphics();
      bottomBar.rect(0, DESIGN_HEIGHT - 3, DESIGN_WIDTH, 3);
      bottomBar.fill({ color: accentColor, alpha: 0.3 });
      this.container.addChild(bottomBar);
    }
  }
}
