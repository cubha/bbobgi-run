import { Application as PixiApp } from 'pixi.js';
import { SceneManager } from './SceneManager';
import { SoundManager } from './SoundManager';
import { InputManager } from './InputManager';
import { COLORS } from '@utils/constants';

/**
 * Main application wrapper.
 * Initializes PixiJS, creates managers, and starts the game loop.
 */
export class GameApplication {
  readonly pixi: PixiApp;
  readonly scenes: SceneManager;
  readonly sound: SoundManager;
  readonly input: InputManager;

  private constructor(pixi: PixiApp) {
    this.pixi = pixi;
    this.scenes = new SceneManager(pixi.stage);
    this.sound = new SoundManager();
    this.input = new InputManager();
  }

  /** Async factory — PixiJS v8 requires async init */
  static async create(container: HTMLElement): Promise<GameApplication> {
    const pixi = new PixiApp();

    await pixi.init({
      background: COLORS.background,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });

    container.appendChild(pixi.canvas);

    const app = new GameApplication(pixi);

    // Main game loop
    pixi.ticker.add((ticker) => {
      app.scenes.update(ticker.deltaTime);
    });

    return app;
  }

  /** Get canvas dimensions */
  get screen() {
    return this.pixi.screen;
  }

  /** Clean up everything */
  destroy(): void {
    this.input.destroy();
    this.sound.stopAll();
    this.pixi.destroy(true, { children: true });
  }
}
