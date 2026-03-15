import { Howl } from 'howler';

/**
 * Howler.js wrapper for game sound effects and BGM.
 * Lazy-loads sounds on first use.
 */
export class SoundManager {
  private sounds = new Map<string, Howl>();
  private bgm: Howl | null = null;

  /** Register a sound effect */
  register(key: string, src: string, options?: { volume?: number; loop?: boolean }): void {
    if (this.sounds.has(key)) return;
    this.sounds.set(
      key,
      new Howl({
        src: [src],
        volume: options?.volume ?? 1.0,
        loop: options?.loop ?? false,
      }),
    );
  }

  /** Play a registered sound effect */
  play(key: string): void {
    this.sounds.get(key)?.play();
  }

  /** Set BGM and play it */
  playBGM(src: string, volume = 0.5): void {
    this.stopBGM();
    this.bgm = new Howl({ src: [src], volume, loop: true });
    this.bgm.play();
  }

  /** Stop BGM */
  stopBGM(): void {
    this.bgm?.stop();
    this.bgm = null;
  }

  /** Change BGM playback rate (for tension acceleration) */
  setBGMRate(rate: number): void {
    this.bgm?.rate(rate);
  }

  /** Stop all sounds */
  stopAll(): void {
    this.stopBGM();
    this.sounds.forEach((s) => s.stop());
  }
}
