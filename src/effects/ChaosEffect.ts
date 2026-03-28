import { Container, Text } from 'pixi.js';
import { GlitchFilter } from 'pixi-filters/glitch';
import { gsap } from 'gsap';
import { COLORS, DESIGN_WIDTH, FONT_DISPLAY } from '@utils/constants';

export class ChaosEffect {
  private tween: gsap.core.Tween | null = null;
  private glitch: GlitchFilter | null = null;
  private glitchTimer: ReturnType<typeof setTimeout> | null = null;

  play(parent: Container, y: number): void {
    const chaosText = new Text({
      text: '💥 카오스!',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 28,
        fill: COLORS.primary,
        dropShadow: { color: COLORS.primary, blur: 0, distance: 2, angle: Math.PI / 2, alpha: 0.8 },
      },
    });
    chaosText.anchor.set(0.5);
    chaosText.x = DESIGN_WIDTH / 2;
    chaosText.y = y;
    parent.addChild(chaosText);

    // GlitchFilter 효과 (0.5초)
    this.glitch = new GlitchFilter({ slices: 10, offset: 5 });
    parent.filters = [this.glitch];
    this.glitchTimer = setTimeout(() => {
      parent.filters = [];
      this.glitch = null;
    }, 500);

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
    if (this.glitchTimer) {
      clearTimeout(this.glitchTimer);
      this.glitchTimer = null;
    }
    this.glitch = null;
  }
}
