import { Container } from 'pixi.js';

/**
 * Abstract base class for all scenes.
 * Template Method pattern: init() → update(delta) → destroy()
 */
export abstract class BaseScene {
  readonly container: Container;
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

  /** Override to clean up resources */
  destroy(): void {
    this.container.removeChildren();
  }
}
