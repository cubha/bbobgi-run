import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { SoundManager } from './SoundManager';

/**
 * Abstract base class for all scenes.
 * Template Method pattern: init() → update(delta) → destroy()
 */
export abstract class BaseScene {
  readonly container: Container;
  protected sound: SoundManager | null = null;
  private _isActive = false;

  constructor() {
    this.container = new Container();
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** Called once when scene is entered. Override to set up sprites/UI. */
  abstract init(): Promise<void>;

  /** Called every frame while scene is active. */
  abstract update(delta: number): void;

  /** Activates the scene */
  async enter(): Promise<void> {
    this._isActive = true;
    this.container.visible = true;
    await this.init();
  }

  /** Deactivates and cleans up the scene */
  exit(): void {
    this._isActive = false;
    this.container.visible = false;
    this.destroy();
  }

  /** Inject SoundManager for audio hooks */
  setSound(s: SoundManager): void {
    this.sound = s;
  }

  /** Override to clean up resources */
  destroy(): void {
    // SlowMotionEffect 등이 비정상 종료 시에도 GSAP 타임스케일 복구
    gsap.globalTimeline.timeScale(1);
    this.container.removeChildren().forEach((child) => child.destroy({ children: true }));
    // 씬 컨테이너 자체도 파괴하여 GPU 리소스 해제
    this.container.destroy();
  }
}
