import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from '@core/BaseScene';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SeededRandom } from '@utils/random';
import type { GameConfig, GameResult, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  COLORS,
  PLAYER_COLORS,
  FONT_DISPLAY,
  FONT_BODY,
} from '@utils/constants';

/** Horizontal rung connecting columns col ↔ col+1 at given row */
interface Rung {
  col: number;
  row: number;
}

// ─── Layout constants ─────────────────────────────────────────────
const ROWS = 10;
const TOP_Y = 130;    // top of ladder area
const BOT_Y = 710;    // bottom of ladder area
const LEFT_X = 28;    // leftmost column x
const RIGHT_X = 362;  // rightmost column x
const TRACE_SEC = 11; // tracing animation duration (seconds)
const HOLD_SEC = 2.8; // pause after tracing before scene transition

/**
 * Ladder Game scene — randomly generated sadalitagi with GSAP line-tracing animation.
 *
 * Timeline: 3s countdown → TRACE_SEC tracing → HOLD_SEC result reveal → ResultScene
 */
export class LadderScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;

  private countdown: CountdownEffect | null = null;
  private timelines: gsap.core.Timeline[] = [];
  private delayedCall: gsap.core.Tween | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  async init(): Promise<void> {
    if (!this.config) return;

    const { players, seed = 0 } = this.config;
    const n = players.length;
    const rng = new SeededRandom(seed + 9999);

    const rungs = this.generateRungs(n, rng);
    const mapping = this.computeMapping(n, rungs);

    this.buildBackground();
    this.buildHUD();
    this.buildLadder(n, rungs, mapping);

    this.countdown = new CountdownEffect(this.container);
    this.countdown.play(() => {
      this.countdown = null;
      this.sound?.play('race-start');
      this.startTracing(n, rungs, mapping);
    });
  }

  update(_delta: number): void {
    // GSAP-driven
  }

  override destroy(): void {
    this.countdown?.destroy();
    this.countdown = null;
    this.delayedCall?.kill();
    this.delayedCall = null;
    for (const tl of this.timelines) tl.kill();
    this.timelines.length = 0;
    super.destroy();
  }

  // ─── Ladder Generation ────────────────────────────────────────────

  private generateRungs(n: number, rng: SeededRandom): Rung[] {
    const rungs: Rung[] = [];
    for (let row = 0; row < ROWS; row++) {
      const occupied = new Set<number>();
      for (let col = 0; col < n - 1; col++) {
        if (occupied.has(col) || occupied.has(col + 1)) continue;
        if (rng.next() < 0.42) {
          rungs.push({ col, row });
          occupied.add(col);
          occupied.add(col + 1);
        }
      }
    }
    return rungs;
  }

  /** Returns mapping[startCol] = finalCol (bijection). */
  private computeMapping(n: number, rungs: Rung[]): number[] {
    const mapping: number[] = [];
    for (let startCol = 0; startCol < n; startCol++) {
      let col = startCol;
      for (let row = 0; row < ROWS; row++) {
        const rung = rungs.find((r) => r.row === row && (r.col === col || r.col + 1 === col));
        if (rung) {
          col = rung.col === col ? rung.col + 1 : rung.col;
        }
      }
      mapping[startCol] = col;
    }
    return mapping;
  }

  /** Returns path waypoints (x, y) for the player starting at startCol. */
  private getPathPoints(
    startCol: number,
    n: number,
    rungs: Rung[],
  ): { x: number; y: number }[] {
    const colX = (c: number): number =>
      n === 1 ? (LEFT_X + RIGHT_X) / 2 : LEFT_X + (c * (RIGHT_X - LEFT_X)) / (n - 1);
    const rowSpacing = (BOT_Y - TOP_Y) / ROWS;
    const rungY = (r: number): number => TOP_Y + (r + 0.5) * rowSpacing;

    const pts: { x: number; y: number }[] = [];
    let col = startCol;
    pts.push({ x: colX(col), y: TOP_Y });

    for (let row = 0; row < ROWS; row++) {
      const ry = rungY(row);
      const rung = rungs.find((r) => r.row === row && (r.col === col || r.col + 1 === col));
      if (rung) {
        pts.push({ x: colX(col), y: ry });
        col = rung.col === col ? rung.col + 1 : rung.col;
        pts.push({ x: colX(col), y: ry });
      }
    }
    pts.push({ x: colX(col), y: BOT_Y });
    return pts;
  }

  // ─── Build ────────────────────────────────────────────────────────

  private buildBackground(): void {
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, 844);
    bg.fill(COLORS.background);
    this.container.addChild(bg);
  }

  private buildHUD(): void {
    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, TOP_Y - 10);
    hudBg.fill({ color: 0x080810 });
    this.container.addChild(hudBg);

    // Timer bar bg
    const timerBg = new Graphics();
    timerBg.roundRect(14, 10, DESIGN_WIDTH - 28, 7, 3);
    timerBg.fill({ color: 0x222233, alpha: 0.9 });
    this.container.addChild(timerBg);

    // Timer bar fill (animated after countdown)
    const timerFill = new Graphics();
    timerFill.roundRect(14, 10, DESIGN_WIDTH - 28, 7, 3);
    timerFill.fill({ color: COLORS.gold, alpha: 0.9 });
    this.container.addChild(timerFill);

    // Store for animation
    (timerFill as Graphics & { __isTimer: boolean }).__isTimer = true;
    gsap.to(timerFill, {
      pixi: { scaleX: 0 },
      transformOrigin: 'left center',
      duration: TRACE_SEC,
      delay: 3.2, // after countdown
      ease: 'none',
    });

    const title = new Text({
      text: '사다리타기',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = 26;
    this.container.addChild(title);
  }

  private buildLadder(n: number, rungs: Rung[], mapping: number[]): void {
    const { players, pickMode } = this.config!;

    const colX = (c: number): number =>
      n === 1 ? (LEFT_X + RIGHT_X) / 2 : LEFT_X + (c * (RIGHT_X - LEFT_X)) / (n - 1);
    const rowSpacing = (BOT_Y - TOP_Y) / ROWS;
    const rungY = (r: number): number => TOP_Y + (r + 0.5) * rowSpacing;

    const ladderContainer = new Container();
    this.container.addChild(ladderContainer);

    // Vertical lines
    for (let col = 0; col < n; col++) {
      const line = new Graphics();
      line.moveTo(colX(col), TOP_Y);
      line.lineTo(colX(col), BOT_Y);
      line.stroke({ color: 0x334455, width: 2 });
      ladderContainer.addChild(line);
    }

    // Horizontal rungs (dim, pre-drawn)
    for (const rung of rungs) {
      const ry = rungY(rung.row);
      const g = new Graphics();
      g.moveTo(colX(rung.col), ry);
      g.lineTo(colX(rung.col + 1), ry);
      g.stroke({ color: 0x445577, width: 2 });
      ladderContainer.addChild(g);
    }

    // Determine featured rank column for highlighting
    const featuredRank = pickMode === 'first' ? 1 : n;
    // Which bottom col has the featured rank?
    // mapping[startCol] = finalCol, rank = finalCol + 1
    // So featured bottom col = featuredRank - 1
    const featuredBottomCol = featuredRank - 1;
    // Which player starts at the col whose mapping leads to featuredBottomCol?
    const featuredStartCol = mapping.indexOf(featuredBottomCol);

    // Player name labels (top)
    const fontSize = n <= 4 ? 13 : n <= 6 ? 11 : 9;
    for (let col = 0; col < n; col++) {
      const color = PLAYER_COLORS[players[col].id % PLAYER_COLORS.length];
      const label = new Text({
        text: players[col].name.slice(0, 5),
        style: { fontFamily: FONT_BODY, fontSize, fontWeight: '700', fill: color },
      });
      label.anchor.set(0.5, 1);
      label.x = colX(col);
      label.y = TOP_Y - 6;
      ladderContainer.addChild(label);

      // Top dot
      const dot = new Graphics();
      dot.circle(colX(col), TOP_Y, 5);
      dot.fill({ color: col === featuredStartCol ? COLORS.gold : color });
      ladderContainer.addChild(dot);
    }

    // Rank labels (bottom): "1등" ... "n등"
    for (let col = 0; col < n; col++) {
      const rank = col + 1;
      const isFeatured = col === featuredBottomCol;
      const isFirst = rank === 1;
      const isLast = rank === n;
      const labelColor = isFirst ? COLORS.gold : isLast ? COLORS.primary : COLORS.textDim;

      const label = new Text({
        text: rank === 1 ? '🥇' : rank === n ? '💸' : `${rank}위`,
        style: { fontFamily: FONT_BODY, fontSize: isFeatured ? 16 : 12, fill: labelColor },
      });
      label.anchor.set(0.5, 0);
      label.x = colX(col);
      label.y = BOT_Y + 6;
      ladderContainer.addChild(label);

      // Bottom dot
      const dot = new Graphics();
      dot.circle(colX(col), BOT_Y, 5);
      dot.fill({ color: isFeatured ? (pickMode === 'first' ? COLORS.gold : COLORS.primary) : 0x445577 });
      ladderContainer.addChild(dot);
    }
  }

  // ─── Tracing Animation ────────────────────────────────────────────

  private startTracing(n: number, rungs: Rung[], mapping: number[]): void {
    const { players } = this.config!;
    let completedCount = 0;

    for (let col = 0; col < n; col++) {
      const player = players[col];
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const pts = this.getPathPoints(col, n, rungs);

      this.animateTracer(pts, color, TRACE_SEC, () => {
        completedCount++;
        if (completedCount === n) {
          this.onTracingComplete(mapping);
        }
      });
    }
  }

  private animateTracer(
    points: { x: number; y: number }[],
    color: number,
    totalDuration: number,
    onComplete: () => void,
  ): void {
    const tracerContainer = new Container();
    this.container.addChild(tracerContainer);

    const line = new Graphics();
    tracerContainer.addChild(line);

    const dot = new Graphics();
    dot.circle(0, 0, 6);
    dot.fill({ color });
    dot.stroke({ color: 0xffffff, width: 1.5 });
    tracerContainer.addChild(dot);

    dot.position.set(points[0].x, points[0].y);

    const completedPts: { x: number; y: number }[] = [{ ...points[0] }];
    const segCount = points.length - 1;
    const segDur = totalDuration / segCount;

    const tl = gsap.timeline({ onComplete });
    this.timelines.push(tl);

    for (let i = 0; i < segCount; i++) {
      const from = points[i];
      const to = points[i + 1];
      const proxy = { t: 0 };

      tl.to(proxy, {
        t: 1,
        duration: segDur,
        ease: 'none',
        onUpdate() {
          const cx = from.x + (to.x - from.x) * proxy.t;
          const cy = from.y + (to.y - from.y) * proxy.t;
          dot.position.set(cx, cy);

          line.clear();
          const drawPts = [...completedPts, { x: cx, y: cy }];
          if (drawPts.length >= 2) {
            line.moveTo(drawPts[0].x, drawPts[0].y);
            for (let j = 1; j < drawPts.length; j++) {
              line.lineTo(drawPts[j].x, drawPts[j].y);
            }
            line.stroke({ color, width: 3, alpha: 0.9 });
          }
        },
        onComplete() {
          completedPts.push({ ...to });
        },
      });
    }
  }

  private onTracingComplete(mapping: number[]): void {
    this.sound?.play('finish');
    // Flash result announcement
    const { pickMode, players } = this.config!;
    const featuredRank = pickMode === 'first' ? 1 : players.length;
    const featuredBottomCol = featuredRank - 1;
    const featuredStartCol = mapping.indexOf(featuredBottomCol);

    this.showResultFlash(
      players[featuredStartCol]?.name ?? '',
      pickMode === 'first',
    );

    this.delayedCall = gsap.delayedCall(HOLD_SEC, () => {
      this.endGame(mapping);
    });
  }

  private showResultFlash(name: string, isWin: boolean): void {
    const overlay = new Graphics();
    overlay.rect(0, 370, DESIGN_WIDTH, 120);
    overlay.fill({ color: isWin ? 0x1a1400 : 0x1a0000, alpha: 0 });
    this.container.addChild(overlay);

    const emoji = isWin ? '🏆' : '⚡';
    const label = isWin ? `${name} 1등!` : `${name} 꼴등!`;
    const col = isWin ? COLORS.gold : COLORS.primary;

    const flash = new Text({
      text: `${emoji} ${label}`,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 28,
        fill: col,
        dropShadow: { color: col, blur: 20, distance: 0, angle: 0, alpha: 0.8 },
      },
    });
    flash.anchor.set(0.5);
    flash.x = DESIGN_WIDTH / 2;
    flash.y = 425;
    flash.alpha = 0;
    flash.scale.set(0.5);
    this.container.addChild(flash);

    const tl = gsap.timeline();
    this.timelines.push(tl);
    tl.to(overlay, { pixi: { alpha: 0.9 }, duration: 0.2 })
      .to(flash, { alpha: 1, pixi: { scaleX: 1, scaleY: 1 }, duration: 0.4, ease: 'back.out(1.7)' }, '<');
  }

  // ─── End ──────────────────────────────────────────────────────────

  private endGame(mapping: number[]): void {
    if (!this.config || !this.endCallback) return;

    const { players, pickMode, seed = 0 } = this.config;
    const rankings: RankingEntry[] = players.map((player, col) => ({
      player,
      rank: (mapping[col] ?? col) + 1,
    }));

    this.endCallback({
      mode: 'ladder',
      rankings,
      seed,
      pickMode,
    });
  }
}
