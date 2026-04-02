import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '@utils/constants';

const CONFETTI_COLORS = [
  COLORS.gold,
  COLORS.primary,
  COLORS.blue,
  COLORS.brightGreen,
  COLORS.pink,
  COLORS.orange,
];

export class ConfettiEffect {
  private parent: Container;
  private tweens: gsap.core.Tween[] = [];

  constructor(parent: Container) {
    this.parent = parent;
  }

  play(count: number = 45): void {
    for (let i = 0; i < count; i++) {
      const particle = new Graphics();
      // Dot-style: all rect pixels (4x4 or 8x4)
      const isWide = i % 3 !== 2;
      if (isWide) {
        particle.rect(-4, -2, 8, 4);
      } else {
        particle.rect(-3, -3, 6, 6);
      }
      particle.fill({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] });
      particle.rotation = Math.random() * Math.PI * 2;
      particle.x = (Math.random() * 0.85 + 0.075) * DESIGN_WIDTH;
      particle.y = -15;
      particle.alpha = 0.9;
      this.parent.addChild(particle);

      const tw = gsap.to(particle, {
        y: DESIGN_HEIGHT + 60,
        x: `+=${(Math.random() - 0.5) * 180}`,
        rotation: particle.rotation + (Math.random() > 0.5 ? 1 : -1) * Math.PI * (3 + Math.random() * 2),
        alpha: 0.75,
        duration: 2.2 + Math.random() * 2,
        delay: 0.6 + Math.random() * 0.9,
        ease: 'none',
        onComplete: () => {
          particle.removeFromParent();
          particle.destroy();
        },
      });
      this.tweens.push(tw);
    }
  }

  destroy(): void {
    for (const tw of this.tweens) tw.kill();
    this.tweens.length = 0;
  }
}
