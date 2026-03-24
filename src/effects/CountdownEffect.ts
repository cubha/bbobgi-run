import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT, FONT_DISPLAY } from '@utils/constants';
import { fullScreenRect, type ScaleInfo } from '@utils/responsive';

const NUMBER_COLORS = [COLORS.blue, COLORS.gold, COLORS.primary];

export class CountdownEffect {
  private container: Container;
  private parent: Container;
  private timeline: gsap.core.Timeline | null = null;
  private scaleInfo: ScaleInfo | null = null;

  constructor(parent: Container, scaleInfo?: ScaleInfo) {
    this.parent = parent;
    this.scaleInfo = scaleInfo ?? null;
    this.container = new Container();
    this.parent.addChild(this.container);
  }

  play(onComplete: () => void, centerX?: number, centerY?: number): void {
    const cx = centerX ?? DESIGN_WIDTH / 2;
    const cy = centerY ?? DESIGN_HEIGHT / 2;
    // Dark overlay — covers entire canvas including letterbox
    const overlay = new Graphics();
    if (this.scaleInfo) {
      const r = fullScreenRect(this.scaleInfo);
      overlay.rect(r.x, r.y, r.w, r.h);
    } else {
      overlay.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    }
    overlay.fill({ color: 0x000000, alpha: 0.55 });
    overlay.alpha = 0;
    this.container.addChild(overlay);

    this.timeline = gsap.timeline({
      onComplete: () => {
        this.removeContainer();
        onComplete();
      },
    });

    this.timeline.to(overlay, { alpha: 1, duration: 0.2 });

    const numbers = ['3', '2', '1'];

    numbers.forEach((num, idx) => {
      const accentColor = NUMBER_COLORS[idx];
      const boxSize = 120;

      // Dot-style: square backdrop instead of circle
      const ring = new Graphics();
      ring.rect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
      ring.fill({ color: accentColor, alpha: 0.12 });
      ring.rect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
      ring.stroke({ color: accentColor, width: 2, alpha: 0.7 });
      ring.position.set(cx, cy);
      ring.alpha = 0;
      ring.scale.set(2);
      this.container.addChild(ring);

      // Number text
      const text = new Text({
        text: num,
        style: {
          fontFamily: FONT_DISPLAY,
          fontSize: 100,
          fill: accentColor,
          dropShadow: { color: accentColor, blur: 0, distance: 2, angle: Math.PI / 2, alpha: 0.8 },
        },
      });
      text.anchor.set(0.5);
      text.position.set(cx, cy);
      text.alpha = 0;
      text.scale.set(1.8);
      this.container.addChild(text);

      this.timeline!
        .set([ring, text], { alpha: 0, pixi: { scaleX: 1.8, scaleY: 1.8 } })
        .to([ring, text], {
          alpha: 1,
          pixi: { scaleX: 1, scaleY: 1 },
          duration: 0.35,
          ease: 'back.out(1.5)',
        })
        .to([ring, text], {
          alpha: 0,
          pixi: { scaleX: 0.7, scaleY: 0.7 },
          duration: 0.4,
          ease: 'power2.in',
        }, '+=0.2');
    });

    // GO text — dot-style square ring
    const goBoxSize = 160;
    const goRing = new Graphics();
    goRing.rect(-goBoxSize / 2, -goBoxSize / 2, goBoxSize, goBoxSize);
    goRing.fill({ color: COLORS.gold, alpha: 0.15 });
    goRing.rect(-goBoxSize / 2, -goBoxSize / 2, goBoxSize, goBoxSize);
    goRing.stroke({ color: COLORS.gold, width: 2, alpha: 0.8 });
    goRing.position.set(cx, cy);
    goRing.alpha = 0;
    this.container.addChild(goRing);

    const goText = new Text({
      text: '출발!',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 88,
        fill: COLORS.gold,
        dropShadow: { color: COLORS.gold, blur: 0, distance: 2, angle: Math.PI / 2, alpha: 0.9 },
      },
    });
    goText.anchor.set(0.5);
    goText.position.set(cx, cy);
    goText.alpha = 0;
    goText.scale.set(0.5);
    this.container.addChild(goText);

    this.timeline
      .set([goRing, goText], { alpha: 0 })
      .set(goText, { pixi: { scaleX: 0.5, scaleY: 0.5 } })
      .to([goRing, goText], { alpha: 1, duration: 0.05, ease: 'none' })
      .to(goText, { pixi: { scaleX: 1.3, scaleY: 1.3 }, duration: 0.45, ease: 'back.out(1.5)' }, '<')
      .to([goRing, goText], { alpha: 0, duration: 0.3, ease: 'power2.in' })
      .to(overlay, { alpha: 0, duration: 0.25 }, '<');
  }

  private removeContainer(): void {
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
  }

  destroy(): void {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
    this.removeContainer();
    this.container.destroy({ children: true });
  }
}
