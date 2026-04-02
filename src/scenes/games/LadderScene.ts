import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from '@core/BaseScene';
import { CountdownEffect } from '@effects/CountdownEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { SeededRandom } from '@utils/random';
import type { GameConfig, GameResult, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  PLAYER_COLORS,
  FONT_DISPLAY,
  FONT_BODY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

/** Horizontal rung connecting col ↔ col+span */
interface Rung {
  col: number;
  row: number;
  span: number; // 1 = adjacent, 2 = skip one column
}

interface WarpPoint {
  row: number;
  fromCol: number;
  toCol: number;
}

interface BurstMarker {
  row: number;
  col: number;
}

interface PathPoint {
  x: number;
  y: number;
  row: number;         // -1 = start
  isWarp: boolean;     // teleport segment (no line drawn)
  rungGraphic: Graphics | null;
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const ROWS = 25;
const TOP_Y = 100;
const BOT_Y = 740;
const LEFT_X = 28;
const RIGHT_X = 362;
const TRACE_SEC = 14;
const HOLD_SEC = 2.8;
/** Base pixels-per-second for normal-speed vertical traversal */
const BASE_PPS = (BOT_Y - TOP_Y) / TRACE_SEC;

/**
 * Ladder Game scene — complex sadalitagi with chaos events, variable-speed
 * tracing, warp portals and bridge-burst effects.
 *
 * Timeline: 3s countdown → TRACE_SEC tracing (chaos at ~40%) → HOLD_SEC result reveal → ResultScene
 */
export class LadderScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

  private countdown: CountdownEffect | null = null;
  private timelines: gsap.core.Timeline[] = [];
  private delayedCalls: gsap.core.Tween[] = [];
  private shakeEffect: ShakeEffect | null = null;

  setConfig(config: GameConfig): void {
    this.config = config;
  }

  setEndCallback(cb: (result: GameResult) => void): void {
    this.endCallback = cb;
  }

  setScaleInfo(s: ScaleInfo): void {
    this._scaleInfo = s;
  }

  async init(): Promise<void> {
    if (!this.config) return;

    const { players, seed = 0 } = this.config;
    const n = players.length;
    const rng = new SeededRandom(seed + 9999);

    const rungs = this.generateRungs(n, rng);
    const warps = this.generateWarps(n, rng);
    const bursts = this.generateBurstMarkers(n, rng);
    const mapping = this.computeMapping(n, rungs, warps);

    this.buildBackground();
    this.buildHUD();
    const { rungGraphics, ladderContainer } = this.buildLadder(n, rungs, warps, bursts, mapping);

    this.countdown = new CountdownEffect(this.container, this._scaleInfo ?? undefined);
    this.countdown.play(() => {
      this.countdown = null;
      this.sound?.play('race-start');
      this.startTracing(n, rungs, warps, bursts, mapping, rungGraphics, ladderContainer);
    });
  }

  update(_delta: number): void {
    // GSAP-driven
  }

  override destroy(): void {
    this.countdown?.destroy();
    this.countdown = null;
    this.shakeEffect?.destroy();
    this.shakeEffect = null;
    for (const dc of this.delayedCalls) dc.kill();
    this.delayedCalls.length = 0;
    for (const tl of this.timelines) tl.kill();
    this.timelines.length = 0;
    super.destroy();
  }

  // ─── Generation ───────────────────────────────────────────────────────────

  private generateRungs(n: number, rng: SeededRandom): Rung[] {
    const rungs: Rung[] = [];
    const allowMultiple = n >= 6;

    for (let row = 0; row < ROWS; row++) {
      const occupied = new Set<number>();
      let rungsInRow = 0;
      const maxRungs = allowMultiple ? 2 : 1;

      for (let col = 0; col < n - 1; col++) {
        if (rungsInRow >= maxRungs) break;
        if (occupied.has(col)) continue;
        if (rng.next() < 0.70) {
          // 20% chance for span-2 rung (skip one column)
          const canSpan2 =
            rng.next() < 0.20 &&
            col + 2 < n &&
            !occupied.has(col + 1) &&
            !occupied.has(col + 2);
          const span = canSpan2 ? 2 : 1;

          if (span === 1 && occupied.has(col + 1)) continue;

          rungs.push({ col, row, span });
          occupied.add(col);
          for (let s = 1; s <= span; s++) occupied.add(col + s);
          rungsInRow++;
        }
      }
    }
    return rungs;
  }

  /** Place 0–1 warp portals in rows 7–9 (requires n ≥ 3). */
  private generateWarps(n: number, rng: SeededRandom): WarpPoint[] {
    if (n < 3) return [];
    const warps: WarpPoint[] = [];

    for (const row of [7, 8, 9]) {
      if (warps.length >= 1) break;
      if (rng.next() < 0.6) {
        const fromCol = Math.floor(rng.next() * n);
        const candidates: number[] = [];
        for (let c = 0; c < n; c++) {
          if (Math.abs(c - fromCol) >= 2) candidates.push(c);
        }
        if (candidates.length > 0) {
          const toCol = candidates[Math.floor(rng.next() * candidates.length)];
          warps.push({ row, fromCol, toCol });
        }
      }
    }
    return warps;
  }

  /** Place 0–1 burst (bomb) markers in rows 17–19. */
  private generateBurstMarkers(n: number, rng: SeededRandom): BurstMarker[] {
    if (n < 2) return [];
    const markers: BurstMarker[] = [];

    for (const row of [17, 18, 19]) {
      if (markers.length >= 1) break;
      if (rng.next() < 0.6) {
        const col = Math.floor(rng.next() * n);
        markers.push({ row, col });
      }
    }
    return markers;
  }

  /** Returns mapping[startCol] = finalCol (bijection), accounting for warps. */
  private computeMapping(n: number, rungs: Rung[], warps: WarpPoint[]): number[] {
    const mapping: number[] = [];

    for (let startCol = 0; startCol < n; startCol++) {
      let col = startCol;
      for (let row = 0; row < ROWS; row++) {
        const warp = warps.find((w) => w.row === row && w.fromCol === col);
        if (warp) {
          col = warp.toCol;
          continue; // skip normal rung processing at warp row
        }
        const rung = rungs.find(
          (r) => r.row === row && (r.col === col || r.col + r.span === col),
        );
        if (rung) {
          col = rung.col === col ? rung.col + rung.span : rung.col;
        }
      }
      mapping[startCol] = col;
    }
    return mapping;
  }

  // ─── Layout helpers ───────────────────────────────────────────────────────

  private colX(col: number, n: number): number {
    return n === 1 ? (LEFT_X + RIGHT_X) / 2 : LEFT_X + (col * (RIGHT_X - LEFT_X)) / (n - 1);
  }

  private rungY(row: number): number {
    return TOP_Y + (row + 0.5) * ((BOT_Y - TOP_Y) / ROWS);
  }

  /** Speed multiplier for a given row (higher = faster tracer). */
  private rowFactor(row: number): number {
    if (row >= ROWS - 3) return 0.3;  // last 3 rows: slow motion
    if (row >= 20) return 1.5;         // rows 20–21: accelerated
    return 1.0;
  }

  // ─── Path computation ─────────────────────────────────────────────────────

  private getPathPoints(
    startCol: number,
    n: number,
    rungs: Rung[],
    warps: WarpPoint[],
    rungGraphics: Map<string, Graphics>,
  ): PathPoint[] {
    const pts: PathPoint[] = [];
    let col = startCol;
    pts.push({ x: this.colX(col, n), y: TOP_Y, row: -1, isWarp: false, rungGraphic: null });

    for (let row = 0; row < ROWS; row++) {
      const ry = this.rungY(row);

      // Warp takes priority over rungs
      const warp = warps.find((w) => w.row === row && w.fromCol === col);
      if (warp) {
        pts.push({ x: this.colX(col, n), y: ry, row, isWarp: false, rungGraphic: null });
        pts.push({ x: this.colX(warp.toCol, n), y: ry, row, isWarp: true, rungGraphic: null });
        col = warp.toCol;
        continue;
      }

      const rung = rungs.find(
        (r) => r.row === row && (r.col === col || r.col + r.span === col),
      );
      if (rung) {
        const rungKey = `${rung.col}-${rung.row}`;
        const rg = rungGraphics.get(rungKey) ?? null;
        pts.push({ x: this.colX(col, n), y: ry, row, isWarp: false, rungGraphic: null });
        const newCol = rung.col === col ? rung.col + rung.span : rung.col;
        pts.push({ x: this.colX(newCol, n), y: ry, row, isWarp: false, rungGraphic: rg });
        col = newCol;
      }
    }

    pts.push({ x: this.colX(col, n), y: BOT_Y, row: ROWS - 1, isWarp: false, rungGraphic: null });
    return pts;
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  private buildBackground(): void {
    const bg = new Graphics();
    bg.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    bg.fill(COLORS.background);
    this.container.addChild(bg);
  }

  private buildHUD(): void {
    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, TOP_Y - 10);
    hudBg.fill({ color: 0x080810 });
    this.container.addChild(hudBg);

    const timerBg = new Graphics();
    timerBg.rect(14, 10, DESIGN_WIDTH - 28, 7);
    timerBg.fill({ color: COLORS.secondary, alpha: 0.9 });
    this.container.addChild(timerBg);

    const timerFill = new Graphics();
    timerFill.rect(14, 10, DESIGN_WIDTH - 28, 7);
    timerFill.fill({ color: COLORS.gold, alpha: 0.9 });
    this.container.addChild(timerFill);

    gsap.to(timerFill.scale, {
      x: 0,
      duration: TRACE_SEC,
      delay: 3.2,
      ease: 'none',
    });
    timerFill.pivot.x = 0;

    const title = new Text({
      text: '사다리타기',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = 26;
    this.container.addChild(title);
  }

  private buildLadder(
    n: number,
    rungs: Rung[],
    warps: WarpPoint[],
    bursts: BurstMarker[],
    mapping: number[],
  ): { rungGraphics: Map<string, Graphics>; ladderContainer: Container } {
    const { players, pickMode } = this.config!;
    const ladderContainer = new Container();
    this.container.addChild(ladderContainer);

    // Vertical lines
    for (let col = 0; col < n; col++) {
      const line = new Graphics();
      line.moveTo(this.colX(col, n), TOP_Y);
      line.lineTo(this.colX(col, n), BOT_Y);
      line.stroke({ color: 0x334455, width: 2 });
      ladderContainer.addChild(line);
    }

    // Horizontal rungs
    const rungGraphics = new Map<string, Graphics>();
    for (const rung of rungs) {
      const ry = this.rungY(rung.row);
      const x1 = this.colX(rung.col, n);
      const x2 = this.colX(rung.col + rung.span, n);
      const g = new Graphics();

      if (rung.span === 2) {
        // Gold dashed style for long rungs
        const segs = 6;
        for (let s = 0; s < segs; s++) {
          if (s % 2 === 0) {
            const sx = x1 + (x2 - x1) * (s / segs);
            const ex = x1 + (x2 - x1) * ((s + 0.8) / segs);
            g.moveTo(sx, ry);
            g.lineTo(ex, ry);
          }
        }
        g.stroke({ color: COLORS.gold, width: 2.5 });
      } else {
        g.moveTo(x1, ry);
        g.lineTo(x2, ry);
        g.stroke({ color: 0x445577, width: 2 });
      }

      ladderContainer.addChild(g);
      rungGraphics.set(`${rung.col}-${rung.row}`, g);
    }

    // Warp portal markers (rows 7–9)
    for (const warp of warps) {
      const ry = this.rungY(warp.row);
      this.addWarpMarker(ladderContainer, this.colX(warp.fromCol, n), ry);
    }

    // Burst bomb markers (rows 17–19)
    for (const burst of bursts) {
      const ry = this.rungY(burst.row);
      this.addBurstMarker(ladderContainer, this.colX(burst.col, n), ry);
    }

    // Player name labels + top dots
    const featuredRank = pickMode === 'first' ? 1 : n;
    const featuredBottomCol = featuredRank - 1;
    const featuredStartCol = mapping.indexOf(featuredBottomCol);
    const fontSize = n <= 4 ? 13 : n <= 6 ? 11 : 9;

    for (let col = 0; col < n; col++) {
      const color = PLAYER_COLORS[players[col].id % PLAYER_COLORS.length];
      const label = new Text({
        text: players[col].name.slice(0, 5),
        style: { fontFamily: FONT_BODY, fontSize, fontWeight: '700', fill: color },
      });
      label.anchor.set(0.5, 1);
      label.x = this.colX(col, n);
      label.y = TOP_Y - 6;
      ladderContainer.addChild(label);

      const dot = new Graphics();
      dot.circle(this.colX(col, n), TOP_Y, 5);
      dot.fill({ color: col === featuredStartCol ? COLORS.gold : color });
      ladderContainer.addChild(dot);
    }

    // Rank labels + bottom dots
    for (let col = 0; col < n; col++) {
      const rank = col + 1;
      const isFeatured = col === featuredBottomCol;
      const labelColor = rank === 1 ? COLORS.gold : rank === n ? COLORS.primary : COLORS.textDim;

      const label = new Text({
        text: rank === 1 ? '🥇' : rank === n ? '💸' : `${rank}위`,
        style: { fontFamily: FONT_BODY, fontSize: isFeatured ? 16 : 12, fill: labelColor },
      });
      label.anchor.set(0.5, 0);
      label.x = this.colX(col, n);
      label.y = BOT_Y + 6;
      ladderContainer.addChild(label);

      const dot = new Graphics();
      dot.circle(this.colX(col, n), BOT_Y, 5);
      dot.fill({
        color: isFeatured ? (pickMode === 'first' ? COLORS.gold : COLORS.primary) : 0x445577,
      });
      ladderContainer.addChild(dot);
    }

    return { rungGraphics, ladderContainer };
  }

  private addWarpMarker(parent: Container, x: number, y: number): void {
    const g = new Graphics();
    g.circle(x, y, 8);
    g.fill({ color: 0x9b59b6, alpha: 0.9 });
    g.stroke({ color: 0xcc88ff, width: 1.5 });
    parent.addChild(g);

    gsap.to(g, {
      alpha: 0.5,
      yoyo: true,
      repeat: -1,
      duration: 0.8,
      ease: 'sine.inOut',
    });
    gsap.to(g.scale, {
      x: 1.35,
      y: 1.35,
      yoyo: true,
      repeat: -1,
      duration: 0.8,
      ease: 'sine.inOut',
    });
  }

  private addBurstMarker(parent: Container, x: number, y: number): void {
    const g = new Graphics();
    g.rect(x - 6, y - 6, 12, 12);
    g.fill({ color: COLORS.primary, alpha: 0.9 });
    g.stroke({ color: COLORS.orange, width: 2 });
    parent.addChild(g);

    gsap.to(g, {
      alpha: 0.45,
      yoyo: true,
      repeat: -1,
      duration: 0.5,
      ease: 'sine.inOut',
    });
    gsap.to(g.scale, {
      x: 1.25,
      y: 1.25,
      yoyo: true,
      repeat: -1,
      duration: 0.5,
      ease: 'sine.inOut',
    });
  }

  // ─── Tracing ──────────────────────────────────────────────────────────────

  private startTracing(
    n: number,
    rungs: Rung[],
    warps: WarpPoint[],
    bursts: BurstMarker[],
    mapping: number[],
    rungGraphics: Map<string, Graphics>,
    ladderContainer: Container,
  ): void {
    const { players } = this.config!;
    let completedCount = 0;

    // Bridge Burst visual effect triggers at ~40% of trace time
    if (bursts.length > 0) {
      const burstCall = gsap.delayedCall(TRACE_SEC * 0.4, () => {
        this.triggerBurstEffect(ladderContainer);
      });
      this.delayedCalls.push(burstCall);
    }

    for (let col = 0; col < n; col++) {
      const player = players[col];
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const pts = this.getPathPoints(col, n, rungs, warps, rungGraphics);

      this.animateTracer(pts, color, () => {
        completedCount++;
        if (completedCount === n) {
          this.onTracingComplete(mapping);
        }
      });
    }
  }

  /** Visual-only burst: shake + warning flash. Path was pre-computed. */
  private triggerBurstEffect(ladderContainer: Container): void {
    this.shakeEffect = new ShakeEffect();
    this.shakeEffect.shake(ladderContainer, 5, 4);

    // 0.5s pre-warning blink on the container
    gsap.fromTo(
      ladderContainer,
      { alpha: 0.6 },
      { alpha: 1, yoyo: true, repeat: 3, duration: 0.12, ease: 'none' },
    );
  }

  private animateTracer(
    points: PathPoint[],
    color: number,
    onComplete: () => void,
  ): void {
    const tracerContainer = new Container();
    this.container.addChild(tracerContainer);

    const line = new Graphics();
    tracerContainer.addChild(line);

    const dot = new Graphics();
    dot.rect(-6, -6, 12, 12);
    dot.fill({ color });
    dot.stroke({ color: COLORS.text, width: 2 });
    tracerContainer.addChild(dot);
    dot.position.set(points[0].x, points[0].y);

    const completedPts: { x: number; y: number }[] = [{ x: points[0].x, y: points[0].y }];
    const tl = gsap.timeline({ onComplete });
    this.timelines.push(tl);

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];

      if (to.isWarp) {
        // Warp: hide dot, jump position, pop back in
        const dummy = { v: 0 };
        tl.to(dummy, {
          v: 1,
          duration: 0.15,
          ease: 'power2.in',
          onStart: () => {
            dot.alpha = 0;
          },
          onComplete: () => {
            dot.position.set(to.x, to.y);
            completedPts.push({ x: to.x, y: to.y });
            dot.scale.set(2.5);
            dot.alpha = 0;
            gsap.to(dot, { alpha: 1, duration: 0.3, ease: 'back.out(2)' });
            gsap.to(dot.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
          },
        });
        continue;
      }

      const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
      const factor = this.rowFactor(to.row >= 0 ? to.row : 0);
      const segDur = Math.max(0.04, (dist / BASE_PPS) / factor);

      const proxy = { t: 0 };
      const capFrom = { x: from.x, y: from.y };
      const capTo = { x: to.x, y: to.y };
      const capRung = to.rungGraphic;

      tl.to(proxy, {
        t: 1,
        duration: segDur,
        ease: 'none',
        onUpdate: () => {
          const cx = capFrom.x + (capTo.x - capFrom.x) * proxy.t;
          const cy = capFrom.y + (capTo.y - capFrom.y) * proxy.t;
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
        onComplete: () => {
          completedPts.push({ x: capTo.x, y: capTo.y });
          if (capRung) {
            // Pulse the rung when crossed
            capRung.scale.set(1);
            gsap.to(capRung.scale, {
              x: 1.5,
              y: 1.5,
              yoyo: true,
              repeat: 1,
              duration: 0.15,
              ease: 'power2.out',
            });
          }
        },
      });
    }
  }

  // ─── Result ───────────────────────────────────────────────────────────────

  private onTracingComplete(mapping: number[]): void {
    this.sound?.play('finish');
    const { pickMode, players } = this.config!;
    const featuredRank = pickMode === 'first' ? 1 : players.length;
    const featuredBottomCol = featuredRank - 1;
    const featuredStartCol = mapping.indexOf(featuredBottomCol);

    this.showResultFlash(players[featuredStartCol]?.name ?? '', pickMode === 'first');

    const endCall = gsap.delayedCall(HOLD_SEC, () => {
      this.endGame(mapping);
    });
    this.delayedCalls.push(endCall);
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
        dropShadow: { color: col, blur: 0, distance: 2, angle: Math.PI / 2, alpha: 0.8 },
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
    tl.to(overlay, { alpha: 0.9, duration: 0.2 })
      .to(flash, { alpha: 1, duration: 0.4, ease: 'back.out(1.7)' }, '<')
      .to(flash.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(1.7)' }, '<');
  }

  // ─── End ──────────────────────────────────────────────────────────────────

  private endGame(mapping: number[]): void {
    if (!this.config || !this.endCallback) return;
    const { players, pickMode, seed = 0 } = this.config;
    const rankings: RankingEntry[] = players.map((player, col) => ({
      player,
      rank: (mapping[col] ?? col) + 1,
    }));
    this.endCallback({ mode: 'ladder', rankings, seed, pickMode });
  }
}
