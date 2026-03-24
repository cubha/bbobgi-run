import { Application as PixiApp, TextureStyle } from 'pixi.js';
import { SceneManager } from './SceneManager';
import { SoundManager } from './SoundManager';
import { InputManager } from './InputManager';
import { RecordManager } from './RecordManager';
import { COLORS } from '@utils/constants';
import { calculateScale, type ScaleInfo } from '@utils/responsive';

/**
 * Main application wrapper.
 * Initializes PixiJS, creates managers, and starts the game loop.
 */
export class GameApplication {
  readonly pixi: PixiApp;
  readonly scenes: SceneManager;
  readonly sound: SoundManager;
  readonly input: InputManager;
  readonly record: RecordManager;

  private _scaleInfo: ScaleInfo;

  private constructor(pixi: PixiApp) {
    this.pixi = pixi;
    this.scenes = new SceneManager(pixi.stage);
    this.sound = new SoundManager();
    this.input = new InputManager();
    this.record = new RecordManager();
    this._scaleInfo = calculateScale(pixi.screen.width, pixi.screen.height);
    this.applyScale();
  }

  /** Async factory — PixiJS v8 requires async init */
  static async create(container: HTMLElement): Promise<GameApplication> {
    // 픽셀아트: nearest neighbor 텍스처 필터링 (텍스처 생성 전 설정 필수)
    TextureStyle.defaultOptions.scaleMode = 'nearest';

    const pixi = new PixiApp();

    await pixi.init({
      background: COLORS.background,
      resizeTo: container,
      antialias: false,
      resolution: 1,
      autoDensity: true,
      roundPixels: true,
    });

    // 픽셀아트: CSS 업스케일 시 선명한 픽셀 유지
    pixi.canvas.style.imageRendering = 'pixelated';
    container.appendChild(pixi.canvas);

    const app = new GameApplication(pixi);

    // Resize listener
    pixi.renderer.on('resize', (width: number, height: number) => {
      app._scaleInfo = calculateScale(width, height);
      app.applyScale();
    });

    // Main game loop
    pixi.ticker.add((ticker) => {
      app.scenes.update(ticker.deltaTime);
    });

    return app;
  }

  private applyScale(): void {
    const { scale, offsetX, offsetY } = this._scaleInfo;
    this.pixi.stage.scale.set(scale);
    this.pixi.stage.position.set(offsetX, offsetY);
  }

  /** Current scale info for responsive layout */
  get scaleInfo(): ScaleInfo {
    return this._scaleInfo;
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
