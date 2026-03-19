/** Game mode identifiers */
export type GameMode = 'horse' | 'marble' | 'ladder' | 'pachinko';

/** Pick mode — which place to highlight in results */
export type PickMode = 'first' | 'last';

/** Player info */
export interface Player {
  id: number;
  name: string;
}

/** Game configuration passed from MainMenu to GameScene */
export interface GameConfig {
  mode: GameMode;
  players: Player[];
  pickMode: PickMode;
  seed?: number;
}

/** Final ranking result */
export interface RankingEntry {
  player: Player;
  rank: number;
  finishTime?: number;
}

/** Game result passed from GameScene to ResultScene */
export interface GameResult {
  mode: GameMode;
  rankings: RankingEntry[];
  seed: number;
  pickMode: PickMode;
}

// ─── 기록 (Record) ───

export interface GameRecord {
  id?: number;
  mode: GameMode;
  pickMode: PickMode;
  players: Player[];
  rankings: RankingEntry[];
  seed: number;
  playedAt: number;
}

export interface PlayerStats {
  name: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
}

// ─── 베팅 (Betting) ───

export type BettingPhase = 'idle' | 'open' | 'locked' | 'settled';

export interface Bet {
  bettorName: string;
  targetPlayerId: number;
  amount: number;
}

export interface BetSettlement {
  bet: Bet;
  won: boolean;
  payout: number;
}

export interface BettingResult {
  settlements: BetSettlement[];
  totalPool: number;
}

/** Game mode metadata for UI display */
export interface GameModeInfo {
  mode: GameMode;
  title: string;
  subtitle: string;
  description: string;
  recommended: boolean;
}

/** All available game modes */
export const GAME_MODES: GameModeInfo[] = [
  {
    mode: 'horse',
    title: '경마',
    subtitle: 'Horse Racing',
    description: '말들이 트랙을 달린다!',
    recommended: true,
  },
  {
    mode: 'marble',
    title: '구슬 레이스',
    subtitle: 'Marble Race',
    description: '구슬이 물리 트랙을 굴러간다!',
    recommended: true,
  },
  {
    mode: 'ladder',
    title: '사다리타기',
    subtitle: 'Ladder Game',
    description: '빠른 추첨! 사다리를 타고 내려간다',
    recommended: false,
  },
  {
    mode: 'pachinko',
    title: '핀볼/파친코',
    subtitle: 'Pachinko',
    description: '공이 핀에 부딪히며 내려간다!',
    recommended: false,
  },
];
