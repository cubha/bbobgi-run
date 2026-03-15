import { BaseScene } from '@core/BaseScene';
import type { GameConfig, GameResult, RankingEntry } from '@/types';

/**
 * Horse Race game scene — horizontal scrolling race with random speed changes.
 * No physics engine needed, pure random speed variation.
 *
 * TODO: Implement in /sh-dev-loop Phase 1
 */
export class HorseRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    // TODO: Implement horse race
  }

  update(_delta: number): void {
    // TODO: Update horse positions, check finish
  }

  /** Ends the game with generated rankings */
  protected finishGame(): void {
    const result = this.generateResult();
    this.endCallback?.(result);
  }

  private generateResult(): GameResult {
    if (!this.config) throw new Error('GameConfig not set');

    const rankings: RankingEntry[] = this.config.players
      .map((player, i) => ({ player, rank: i + 1 }))
      .sort(() => Math.random() - 0.5)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    return {
      mode: 'horse',
      rankings,
      seed: this.config.seed ?? 0,
    };
  }
}
