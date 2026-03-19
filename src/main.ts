import { GameApplication } from '@core/Application';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { ResultScene } from '@scenes/ResultScene';
import { HorseRaceScene } from '@scenes/games/HorseRaceScene';
import { MarbleRaceScene } from '@scenes/games/MarbleRaceScene';
import { LadderScene } from '@scenes/games/LadderScene';
import { PachinkoScene } from '@scenes/games/PachinkoScene';
import type { GameConfig, GameResult, GameMode, Player, BettingResult } from './types';
import type { BaseScene } from '@core/BaseScene';

type GameScene = BaseScene & {
  setConfig: (c: GameConfig) => void;
  setEndCallback: (cb: (r: GameResult) => void) => void;
};

async function main() {
  const container = document.getElementById('game-container');
  if (!container) throw new Error('#game-container not found');

  const app = await GameApplication.create(container);

  /** Create the appropriate game scene based on mode */
  function createGameScene(mode: GameMode): GameScene {
    switch (mode) {
      case 'horse': return new HorseRaceScene();
      case 'marble': return new MarbleRaceScene();
      case 'ladder': return new LadderScene();
      case 'pachinko': return new PachinkoScene();
    }
  }

  /** Navigate to main menu, optionally preserving players from a previous game */
  async function showMenu(prevPlayers?: Player[]) {
    const menu = new MainMenuScene(app);
    if (prevPlayers && prevPlayers.length > 0) {
      menu.setInitialPlayers(prevPlayers);
    }
    menu.setStartCallback((config: GameConfig) => {
      startGame(config);
    });
    await app.scenes.transition(menu);
  }

  /** Start a game with given config */
  async function startGame(config: GameConfig) {
    app.betting.lockBetting();

    const scene = createGameScene(config.mode);
    scene.setConfig(config);
    scene.setEndCallback((result: GameResult) => {
      const winnerId = result.rankings.find((r) => r.rank === 1)?.player.id;
      const bettingResult =
        winnerId !== undefined && app.betting.hasBets
          ? app.betting.settle(winnerId)
          : null;
      showResult(result, bettingResult);
    });
    scene.setSound(app.sound);
    await app.scenes.transition(scene);
  }

  /** Show result screen */
  async function showResult(result: GameResult, bettingResult?: BettingResult | null) {
    app.record.saveResult(result).catch(console.warn);

    const scene = new ResultScene();
    scene.setResult(result);
    scene.setRecord(app.record);
    if (bettingResult) scene.setBettingResult(bettingResult);
    scene.setReplayCallback(() => {
      showMenu(result.rankings.map((r) => r.player));
    });
    scene.setSound(app.sound);
    await app.scenes.transition(scene);

    app.betting.reset();
  }

  // Boot
  await showMenu();
}

main().catch(console.error);
