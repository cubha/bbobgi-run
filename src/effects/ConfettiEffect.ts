import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '@utils/constants';

const CONFETTI_COLORS = [COLORS.gold, COLORS.primary, 0x3498db, 0x2ecc71, 0x9b59b6, 0xf39c12];

export class ConfettiEffect {
  private parent: Container;
  private tweens: gsap.core.Tween[] = [];

  constructor(parent: Container) {
    this.parent = parent;
  }

  play(count: number = 45): void {
    for (let i = 0; i < count; i++) {
      const particle = new Graphics();
      const isRect = i % 3 !== 2;
      if (isRect) {
        particle.rect(-5, -3, 10, 6);
      } else {
        particle.circle(0, 0, 4);
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
          if (particle.parent) particle.parent.removeChild(particle);
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
