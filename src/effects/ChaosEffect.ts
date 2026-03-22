import { Container, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, DESIGN_WIDTH, FONT_DISPLAY } from '@utils/constants';

export class ChaosEffect {
  private tween: gsap.core.Tween | null = null;

  play(parent: Container, y: number): void {
    const chaosText = new Text({
      text: '💥 카오스!',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 28,
        fill: COLORS.primary,
        dropShadow: { color: COLORS.primary, blur: 12, distance: 0, angle: 0, alpha: 0.8 },
      },
    });
    chaosText.anchor.set(0.5);
    chaosText.x = DESIGN_WIDTH / 2;
    chaosText.y = y;
    parent.addChild(chaosText);

    this.tween = gsap.to(chaosText, {
      alpha: 0,
      y: chaosText.y - 45,
      duration: 2.2,
      ease: 'power2.out',
      onComplete: () => {
        if (chaosText.parent) chaosText.parent.removeChild(chaosText);
      },
    });
  }

  destroy(): void {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
  }
}
