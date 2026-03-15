import { BaseScene } from '@core/BaseScene';
import type { GameConfig, GameResult } from '@/types';

/**
 * Pachinko game scene — balls fall through pins into slots using Matter.js.
 *
 * TODO: Implement in /sh-dev-loop Phase 2
 */
export class PachinkoScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    // TODO: Implement pachinko
  }

  update(_delta: number): void {
    // TODO: Step physics, check slot arrivals
  }
}
