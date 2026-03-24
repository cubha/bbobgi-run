import { GameApplication } from '@core/Application';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { ResultScene } from '@scenes/ResultScene';
import { HorseRaceScene } from '@scenes/games/HorseRaceScene';
import { MarbleRaceScene } from '@scenes/games/MarbleRaceScene';
import { LadderScene } from '@scenes/games/LadderScene';
import { PachinkoScene } from '@scenes/games/PachinkoScene';
import type { GameConfig, GameResult, GameMode } from './types';
import type { BaseScene } from '@core/BaseScene';

import type { ScaleInfo } from '@utils/responsive';

type GameScene = BaseScene & {
  setConfig: (c: GameConfig) => void;
  setEndCallback: (cb: (r: GameResult) => void) => void;
  setScaleInfo?: (s: ScaleInfo) => void;
};

async function main() {
  const container = document.getElementById('game-container');
  if (!container) throw new Error('#game-container not found');

  const app = await GameApplication.create(container);

  /** Last used config — restored when returning to main menu */
  let lastConfig: GameConfig | null = null;

  /** Create the appropriate game scene based on mode */
  function createGameScene(mode: GameMode): GameScene {
    switch (mode) {
      case 'horse': return new HorseRaceScene();
      case 'marble': return new MarbleRaceScene();
      case 'ladder': return new LadderScene();
      case 'pachinko': return new PachinkoScene();
    }
  }

  /** Navigate to main menu, optionally restoring previous config + players */
  async function showMenu(prevConfig?: GameConfig) {
    const menu = new MainMenuScene(app);
    if (prevConfig) {
      menu.setInitialPlayers(prevConfig.players);
      menu.setInitialConfig(prevConfig);
    }
    menu.setStartCallback((config: GameConfig) => {
      startGame(config);
    });
    await app.scenes.transition(menu);
  }

  /** Start a game with given config */
  async function startGame(config: GameConfig) {
    lastConfig = config;
    const scene = createGameScene(config.mode);
    scene.setConfig(config);
    scene.setEndCallback((result: GameResult) => {
      showResult(result);
    });
    scene.setSound(app.sound);
    scene.setScaleInfo?.(app.scaleInfo);
    await app.scenes.transition(scene);
  }

  /** Show result screen */
  async function showResult(result: GameResult) {
    app.record.saveResult(result).catch(console.warn);

    const scene = new ResultScene();
    scene.setResult(result);
    scene.setRecord(app.record);
    scene.setReplayCallback(() => {
      const prevPlayers = result.rankings.map((r) => r.player);
      const prevConfig = lastConfig ? { ...lastConfig, players: prevPlayers } : undefined;
      showMenu(prevConfig);
    });
    scene.setSound(app.sound);
    await app.scenes.transition(scene);
  }

  // Boot
  await showMenu();
}

main().catch(console.error);
