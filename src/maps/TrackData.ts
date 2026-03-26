import type { TrackLayout } from './types';

/** V2 Marble Run track — 1200px x 4000px, X+Y scroll */
export const TRACK_V2: TrackLayout = {
  worldWidth: 1200,
  worldHeight: 4000,
  startY: 100,
  finishY: 3800,
  wallThick: 14,
  rampThick: 12,
  pinRadius: 6,
  segments: [
    // ── Zone 1: 출발 깔때기 (y=0~200) ──
    {
      id: 'start-funnel',
      type: 'funnel',
      originX: 600,
      originY: 50,
      params: { topWidth: 600, bottomWidth: 280, height: 180 },
    },

    // ── Zone 2: 핀존 A (y=200~600) ──
    {
      id: 'pinzone-a',
      type: 'pinzone',
      originX: 600,
      originY: 280,
      params: { cols: 10, rows: 6, spacing: 55, width: 800 },
    },
    {
      id: 'ramp-a1',
      type: 'ramp',
      originX: 600,
      originY: 560,
      params: { width: 700, angle: 0.18, direction: 1 },
    },

    // ── Zone 3: 1차 분기 (y=600~1400) ──
    {
      id: 'splitter-1',
      type: 'splitter',
      originX: 600,
      originY: 640,
      params: { splitWidth: 500, wedgeAngle: 0.4 },
    },
    {
      id: 'spiral-left',
      type: 'spiral',
      originX: 280,
      originY: 750,
      params: { radius: 140, turns: 1.5, direction: 'ccw', dropPerTurn: 200 },
    },
    {
      id: 'spiral-right',
      type: 'spiral',
      originX: 920,
      originY: 750,
      params: { radius: 140, turns: 1.5, direction: 'cw', dropPerTurn: 200 },
    },
    {
      id: 'ramp-left-exit',
      type: 'ramp',
      originX: 350,
      originY: 1280,
      params: { width: 300, angle: 0.22, direction: 1 },
    },
    {
      id: 'ramp-right-exit',
      type: 'ramp',
      originX: 850,
      originY: 1280,
      params: { width: 300, angle: 0.22, direction: -1 },
    },

    // ── Zone 4: 대형 합류 깔때기 (y=1400~1800) ──
    {
      id: 'merge-funnel',
      type: 'funnel',
      originX: 600,
      originY: 1380,
      params: { topWidth: 800, bottomWidth: 200, height: 250 },
    },
    {
      id: 'bottleneck-1',
      type: 'bottleneck',
      originX: 600,
      originY: 1680,
      params: { passWidth: 100, wedgeAngle: 0.3 },
    },

    // ── Zone 5: 계단식 드롭 + 핀존 B (y=1800~2800) ──
    {
      id: 'ramp-mid-1',
      type: 'ramp',
      originX: 600,
      originY: 1780,
      params: { width: 500, angle: 0.25, direction: 1 },
    },
    {
      id: 'staircase-1',
      type: 'staircase',
      originX: 600,
      originY: 1880,
      params: { steps: 5, stepSpacing: 50, shelfWidth: 350 },
    },
    {
      id: 'pinzone-b',
      type: 'pinzone',
      originX: 600,
      originY: 2200,
      params: { cols: 8, rows: 4, spacing: 50, width: 600 },
    },
    {
      id: 'ramp-mid-2',
      type: 'ramp',
      originX: 600,
      originY: 2450,
      params: { width: 500, angle: 0.28, direction: -1 },
    },
    {
      id: 'ramp-mid-3',
      type: 'ramp',
      originX: 600,
      originY: 2580,
      params: { width: 500, angle: 0.28, direction: 1 },
    },
    {
      id: 'staircase-2',
      type: 'staircase',
      originX: 600,
      originY: 2700,
      params: { steps: 3, stepSpacing: 50, shelfWidth: 300 },
    },

    // ── Zone 6: 2차 분기 (y=2800~3400) ──
    {
      id: 'splitter-2',
      type: 'splitter',
      originX: 600,
      originY: 2880,
      params: { splitWidth: 450, wedgeAngle: 0.45 },
    },
    // A경로: 급경사 + 핀 많음
    {
      id: 'ramp-path-a1',
      type: 'ramp',
      originX: 320,
      originY: 2980,
      params: { width: 250, angle: 0.35, direction: 1 },
    },
    {
      id: 'pinzone-path-a',
      type: 'pinzone',
      originX: 320,
      originY: 3100,
      params: { cols: 5, rows: 3, spacing: 45, width: 300 },
    },
    {
      id: 'ramp-path-a2',
      type: 'ramp',
      originX: 320,
      originY: 3250,
      params: { width: 250, angle: 0.35, direction: -1 },
    },
    // B경로: 완경사 + 핀 적음
    {
      id: 'ramp-path-b1',
      type: 'ramp',
      originX: 880,
      originY: 2980,
      params: { width: 250, angle: 0.18, direction: -1 },
    },
    {
      id: 'ramp-path-b2',
      type: 'ramp',
      originX: 880,
      originY: 3120,
      params: { width: 250, angle: 0.18, direction: 1 },
    },
    {
      id: 'ramp-path-b3',
      type: 'ramp',
      originX: 880,
      originY: 3260,
      params: { width: 250, angle: 0.18, direction: -1 },
    },

    // ── Zone 7: 피날레 합류 + 스프린트 (y=3400~3800) ──
    {
      id: 'final-funnel',
      type: 'funnel',
      originX: 600,
      originY: 3380,
      params: { topWidth: 700, bottomWidth: 200, height: 180 },
    },
    {
      id: 'bottleneck-final',
      type: 'bottleneck',
      originX: 600,
      originY: 3600,
      params: { passWidth: 80, wedgeAngle: 0.35 },
    },
    {
      id: 'ramp-final',
      type: 'ramp',
      originX: 600,
      originY: 3700,
      params: { width: 180, angle: 0.3, direction: 1 },
    },
  ],
};

/** Marble radius for V2 large map */
export const MARBLE_RADIUS_V2 = 12;

/** Minimum total marbles for fun convergence/divergence (dummy fill) */
export const MIN_MARBLES = 6;

/** Dummy marble symbols */
export const DUMMY_SYMBOLS = ['●', '○', '◆', '◇'] as const;

/** Dummy marble colors (gray variants) */
export const DUMMY_COLORS = [0x808080, 0xa0a0a0, 0x909090, 0xb0b0b0] as const;
