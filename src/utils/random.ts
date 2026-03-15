/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Deterministic results for the same seed — enables replay and fairness verification.
 */
export class SeededRandom {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? Math.floor(Math.random() * 2147483647);
  }

  /** Returns the current seed value */
  get seed(): number {
    return this.state;
  }

  /** Returns a pseudo-random float in [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a pseudo-random float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns a pseudo-random integer in [min, max] (inclusive) */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Shuffles an array in place (Fisher-Yates) */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
