import { BaseScene } from '@core/BaseScene';
import type { GameConfig, GameResult } from '@/types';

/**
 * Ladder Game scene — auto-generated ladder with line-tracing animation.
 *
 * TODO: Implement in /sh-dev-loop Phase 3
 */
export class LadderScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    // TODO: Implement ladder game
  }

  update(_delta: number): void {
    // TODO: Animate line tracing
  }
}
