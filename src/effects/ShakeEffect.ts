import { Container } from 'pixi.js';
import { gsap } from 'gsap';

export class ShakeEffect {
  private timeline: gsap.core.Timeline | null = null;

  destroy(): void {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
  }

  shake(target: Container, amplitude: number = 5, repeats: number = 6): void {
    if (this.timeline) {
      this.timeline.kill();
    }

    const originalX = target.x;
    const originalY = target.y;

    this.timeline = gsap.timeline({
      onComplete: () => {
        target.x = originalX;
        target.y = originalY;
      },
    });

    for (let i = 0; i < repeats; i++) {
      const direction = i % 2 === 0 ? 1 : -1;
      const decay = 1 - i / repeats;

      this.timeline.to(target, {
        x: originalX + amplitude * direction * decay,
        y: originalY + amplitude * 0.5 * -direction * decay,
        duration: 0.05,
        ease: 'none',
      });
    }

    this.timeline.to(target, {
      x: originalX,
      y: originalY,
      duration: 0.05,
      ease: 'none',
    });
  }
}
