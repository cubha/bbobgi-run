import { BaseScene } from '@core/BaseScene';
import type { GameConfig, GameResult } from '@/types';

/**
 * Marble Race game scene — physics-based marble track with Matter.js.
 *
 * TODO: Implement in /sh-dev-loop Phase 2
 */
export class MarbleRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    // TODO: Implement marble race
  }

  update(_delta: number): void {
    // TODO: Step physics, update sprite positions
  }
}
