import type { Bet, BetSettlement, BettingPhase, BettingResult, Player } from '@/types';

export class BettingManager {
  private phase: BettingPhase = 'idle';
  private bets: Bet[] = [];
  private players: Player[] = [];

  // FSM: idle → open
  openBetting(players: Player[]): void {
    if (this.phase !== 'idle') return;
    this.players = players;
    this.phase = 'open';
  }

  // open 상태에서만 베팅 허용
  placeBet(bet: Bet): boolean {
    if (this.phase !== 'open') return false;
    this.bets.push(bet);
    return true;
  }

  // FSM: open → locked
  lockBetting(): void {
    if (this.phase !== 'open') return;
    this.phase = 'locked';
  }

  // FSM: locked → settled, Pari-mutuel 정산
  settle(winnerId: number): BettingResult {
    if (this.phase !== 'locked') {
      return { settlements: [], totalPool: 0 };
    }

    this.phase = 'settled';

    if (this.bets.length === 0) {
      return { settlements: [], totalPool: 0 };
    }

    const pool = this.totalPool;
    const odds = this.getOdds();
    const winnerOdds = odds[winnerId] ?? 0;

    const settlements: BetSettlement[] = this.bets.map((bet) => {
      if (bet.targetPlayerId === winnerId && winnerOdds > 0) {
        return {
          bet,
          won: true,
          payout: bet.amount * winnerOdds,
        };
      }
      return {
        bet,
        won: false,
        payout: 0,
      };
    });

    return { settlements, totalPool: pool };
  }

  // FSM: → idle, bets 초기화
  reset(): void {
    this.phase = 'idle';
    this.bets = [];
    this.players = [];
  }

  get currentPhase(): BettingPhase {
    return this.phase;
  }

  // playerId → 배당률 (Pari-mutuel)
  getOdds(): Record<number, number> {
    const pool = this.totalPool;
    if (pool === 0) return {};

    const odds: Record<number, number> = {};

    for (const player of this.players) {
      const playerPool = this.bets
        .filter((b) => b.targetPlayerId === player.id)
        .reduce((sum, b) => sum + b.amount, 0);

      if (playerPool > 0) {
        odds[player.id] = pool / playerPool;
      } else {
        odds[player.id] = 0;
      }
    }

    return odds;
  }

  get totalPool(): number {
    return this.bets.reduce((sum, b) => sum + b.amount, 0);
  }

  get hasBets(): boolean {
    return this.bets.length > 0;
  }
}
