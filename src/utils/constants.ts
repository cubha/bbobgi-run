/** Design resolution (logical pixels) */
export const DESIGN_WIDTH = 390;
export const DESIGN_HEIGHT = 844;

/** Typography — 도트(픽셀아트) 폰트 */
export const FONT_DISPLAY = 'Galmuri14, Galmuri11, monospace';
export const FONT_BODY = 'Galmuri11, Galmuri14, monospace';

/** Game timing */
export const GAME_DURATION_SEC = 30;
export const LADDER_DURATION_SEC = 20;
export const COUNTDOWN_SEC = 3;
export const CHAOS_SEC = 20;
export const TENSION_SEC = 25;
export const SLOWMO_SEC = 28;
export const SLOWMO_RATE = 0.3;

/** Player limits */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

/** Oval track layout for horse racing (design resolution) */
export const OVAL_TRACK = {
  cx: 195,         // track center x
  cy: 380,         // track center y
  rx: 170,         // horizontal radius (landscape: rx > ry)
  ry: 115,         // vertical radius
  laneWidth: 15,   // width per lane
  laps: 2,         // number of laps
  hudHeight: 62,   // HUD area height at top
} as const;

/** Horse race 3-zone layout */
export const HORSE_LAYOUT = {
  hudH: 60,        // top HUD height
  trackTop: 60,    // track area starts after HUD
  trackH: 520,     // track area height
  rankTop: 580,    // rank panel starts here
  rankH: 264,      // rank panel height (to 844)
  laneWidth: 15,   // lane width per player
  ratio: 1.48,     // landscape aspect ratio (rx/ry)
  laps: 2,
} as const;

/** Compute dynamic track params based on player count and optional lap override */
export function computeTrackParams(nLanes: number, lapCount?: number): import('@/types').TrackParams {
  const halfTrack = HORSE_LAYOUT.trackH / 2;  // 260
  const { laneWidth, ratio, laps } = HORSE_LAYOUT;
  const ry = halfTrack - nLanes * laneWidth;
  const rx = ry * ratio;
  return {
    cx: DESIGN_WIDTH / 2,
    cy: HORSE_LAYOUT.trackTop + halfTrack,
    rx,
    ry,
    laneWidth,
    laps: lapCount ?? laps,
    ratio,
  };
}

/** Colors — PICO-8 기반 도트 팔레트 */
export const COLORS = {
  background: 0x000000,   // PICO-8 #0 Black
  primary: 0xff004d,      // PICO-8 #8 Red
  secondary: 0x1d2b53,    // PICO-8 #1 Dark Blue
  accent: 0x1d2b53,       // PICO-8 #1 Dark Blue
  gold: 0xffec27,         // PICO-8 #10 Yellow
  text: 0xfff1e8,         // PICO-8 #7 White
  textDim: 0xc2c3c7,      // PICO-8 #6 Light Gray
  darkGray: 0x5f574f,     // PICO-8 #5 Dark Gray
  green: 0x008751,        // PICO-8 #3 Dark Green
  brightGreen: 0x00e436,  // PICO-8 #11 Green
  blue: 0x29adff,         // PICO-8 #12 Blue
  lavender: 0x83769c,     // PICO-8 #13 Lavender
  pink: 0xff77a8,         // PICO-8 #14 Pink
  peach: 0xffccaa,        // PICO-8 #15 Peach
  orange: 0xffa300,       // PICO-8 #9 Orange
  purple: 0x7e2553,       // PICO-8 #2 Dark Purple
  brown: 0xab5236,        // PICO-8 #4 Brown
} as const;

/** Player colors — Neon Space 10색 (고대비, 10명 완전 구분) */
export const PLAYER_COLORS = [
  0xdf0772, // Hot Pink
  0xfe546f, // Coral
  0x0bffe6, // Neon Cyan
  0x01cbcf, // Teal
  0xff9e7d, // Salmon
  0xffd080, // Gold Peach
  0x0188a5, // Deep Cyan
  0x3e3264, // Purple
  0xfffdff, // White
  0x352a55, // Dark Violet
] as const;

/** 섹션별 배경 색상 (8섹션) — 어두운 네온 톤 */
export const SECTION_COLORS = [
  0x0d1020,  // SEC 1: 깊은 남색
  0x0d1a2a,  // SEC 2: 다크 블루
  0x0d2020,  // SEC 3: 다크 시안
  0x0a1a10,  // SEC 4: 다크 그린
  0x1a1a0a,  // SEC 5: 다크 올리브
  0x1a0d1a,  // SEC 6: 다크 퍼플
  0x1a0d0d,  // SEC 7: 다크 레드
  0x1a1a00,  // SEC 8: 다크 골드
] as const;
