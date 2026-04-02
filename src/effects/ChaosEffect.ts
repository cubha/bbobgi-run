import { Container, Text } from 'pixi.js';
import { GlitchFilter } from 'pixi-filters/glitch';
import { gsap } from 'gsap';
import { COLORS, DESIGN_WIDTH, FONT_DISPLAY } from '@utils/constants';

export class ChaosEffect {
  private tween: gsap.core.Tween | null = null;
  private glitch: GlitchFilter | null = null;
  private glitchTimer: ReturnType<typeof setTimeout> | null = null;
  private _parent: Container | null = null;

  play(parent: Container, y: number): void {
    this._parent = parent;
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
      parent.filters = null;
      this.glitch = null;
    }, 500);

    this.tween = gsap.to(chaosText, {
      alpha: 0,
      y: chaosText.y - 45,
      duration: 2.2,
      ease: 'power2.out',
      onComplete: () => {
        chaosText.removeFromParent();
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
    // GlitchFilter가 parent에 남아있으면 제거
    if (this.glitch && this._parent) {
      this._parent.filters = (this._parent.filters ?? []).filter(f => f !== this.glitch);
    }
    this.glitch = null;
    this._parent = null;
  }
}
