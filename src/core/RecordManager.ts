import Dexie, { type Table } from 'dexie';
import type { GameMode, GameRecord, GameResult, PlayerStats } from '@/types';

class GameRecordDB extends Dexie {
  records!: Table<GameRecord, number>;

  constructor() {
    super('bbobgi-run');
    this.version(1).stores({ records: '++id, mode, pickMode, playedAt' });
  }
}

export class RecordManager {
  private db: GameRecordDB;

  constructor() {
    this.db = new GameRecordDB();
  }

  async saveResult(result: GameResult): Promise<number> {
    const players = result.rankings.map((r) => r.player);
    const record: GameRecord = {
      mode: result.mode,
      pickMode: result.pickMode,
      players,
      rankings: result.rankings,
      seed: result.seed,
      playedAt: Date.now(),
    };
    const id = await this.db.records.add(record);
    return id as number;
  }

  async getRecentRecords(limit = 20): Promise<GameRecord[]> {
    return this.db.records.orderBy('playedAt').reverse().limit(limit).toArray();
  }

  async getPlayerStats(name: string): Promise<PlayerStats> {
    const normalizedName = name.trim().toLowerCase();
    const all = await this.db.records.toArray();

    let totalGames = 0;
    let wins = 0;
    let losses = 0;

    for (const record of all) {
      const entry = record.rankings.find(
        (r) => r.player.name.trim().toLowerCase() === normalizedName,
      );
      if (!entry) continue;

      totalGames++;
      if (entry.rank === 1) wins++;
      if (entry.rank === record.rankings.length) losses++;
    }

    return {
      name,
      totalGames,
      wins,
      losses,
      winRate: totalGames === 0 ? 0 : wins / totalGames,
    };
  }

  async getOverallStats(): Promise<{ totalGames: number; byMode: Record<GameMode, number> }> {
    const all = await this.db.records.toArray();
    const byMode: Record<GameMode, number> = {
      horse: 0,
      marble: 0,
      ladder: 0,
      pachinko: 0,
    };
    for (const record of all) {
      byMode[record.mode]++;
    }
    return { totalGames: all.length, byMode };
  }

  async clearAll(): Promise<void> {
    await this.db.records.clear();
  }
}
