import { Container } from 'pixi.js';
import type { BaseScene } from './BaseScene';

/**
 * Manages scene transitions.
 * Coordinator pattern: loads scenes in, updates active scene, removes old scenes.
 */
export class SceneManager {
  private currentScene: BaseScene | null = null;
  readonly stage: Container;

  constructor(stage: Container) {
    this.stage = stage;
  }

  /** Transition to a new scene, destroying the old one */
  async transition(nextScene: BaseScene): Promise<void> {
    if (this.currentScene) {
      this.currentScene.exit();
      this.stage.removeChild(this.currentScene.container);
    }

    this.currentScene = nextScene;
    this.stage.addChild(nextScene.container);
    await nextScene.enter();
  }

  /** Called every frame — delegates to current scene */
  update(delta: number): void {
    if (this.currentScene?.isActive) {
      this.currentScene.update(delta);
    }
  }

  /** Get current active scene */
  get active(): BaseScene | null {
    return this.currentScene;
  }
}
