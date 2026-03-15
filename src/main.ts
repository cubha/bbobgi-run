import { GameApplication } from '@core/Application';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { ResultScene } from '@scenes/ResultScene';
import { HorseRaceScene } from '@scenes/games/HorseRaceScene';
import { MarbleRaceScene } from '@scenes/games/MarbleRaceScene';
import { LadderScene } from '@scenes/games/LadderScene';
import { PachinkoScene } from '@scenes/games/PachinkoScene';
import type { GameConfig, GameResult, GameMode } from './types';
import { BaseScene } from '@core/BaseScene';

async function main() {
  const container = document.getElementById('game-container');
  if (!container) throw new Error('#game-container not found');

  const app = await GameApplication.create(container);

  /** Create the appropriate game scene based on mode */
  function createGameScene(mode: GameMode): BaseScene & { setConfig: (c: GameConfig) => void; setEndCallback: (cb: (r: GameResult) => void) => void } {
    switch (mode) {
      case 'horse': return new HorseRaceScene();
      case 'marble': return new MarbleRaceScene();
      case 'ladder': return new LadderScene();
      case 'pachinko': return new PachinkoScene();
    }
  }

  /** Navigate to main menu */
  async function showMenu() {
    const menu = new MainMenuScene();
    menu.setStartCallback((config: GameConfig) => {
      startGame(config);
    });
    await app.scenes.transition(menu);
  }

  /** Start a game with given config */
  async function startGame(config: GameConfig) {
    const scene = createGameScene(config.mode);
    scene.setConfig(config);
    scene.setEndCallback((result: GameResult) => {
      showResult(result);
    });
    await app.scenes.transition(scene);
  }

  /** Show result screen */
  async function showResult(result: GameResult) {
    const scene = new ResultScene();
    scene.setResult(result);
    scene.setReplayCallback(() => {
      showMenu();
    });
    await app.scenes.transition(scene);
  }

  // Start with main menu
  await showMenu();
}

main().catch(console.error);
