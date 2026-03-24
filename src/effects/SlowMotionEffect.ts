import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { SLOWMO_RATE, DESIGN_WIDTH, DESIGN_HEIGHT } from '@utils/constants';
import { fullScreenRect, type ScaleInfo } from '@utils/responsive';

export class SlowMotionEffect {
  private parent: Container;
  private vignette: Graphics | null = null;
  private tween: gsap.core.Tween | null = null;
  private scaleInfo: ScaleInfo | null = null;

  constructor(parent: Container, scaleInfo?: ScaleInfo) {
    this.parent = parent;
    this.scaleInfo = scaleInfo ?? null;
  }

  activate(duration: number = 0.5): void {
    gsap.globalTimeline.timeScale(SLOWMO_RATE);

    this.vignette = new Graphics();
    if (this.scaleInfo) {
      const r = fullScreenRect(this.scaleInfo);
      this.vignette.rect(r.x, r.y, r.w, r.h);
    } else {
      this.vignette.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    }
    this.vignette.fill({ color: 0x000000, alpha: 0.4 });
    this.vignette.alpha = 0;
    this.parent.addChild(this.vignette);

    this.tween = gsap.to(this.vignette, {
      alpha: 1,
      duration,
      ease: 'power2.in',
    });
  }

  deactivate(): void {
    gsap.globalTimeline.timeScale(1);

    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }

    if (this.vignette) {
      if (this.vignette.parent) {
        this.vignette.parent.removeChild(this.vignette);
      }
      this.vignette.destroy();
      this.vignette = null;
    }
  }

  destroy(): void {
    this.deactivate();
  }
}
