/** Design resolution (logical pixels) */
export const DESIGN_WIDTH = 390;
export const DESIGN_HEIGHT = 844;

/** Typography */
export const FONT_DISPLAY = 'Black Han Sans, Noto Sans KR, sans-serif';
export const FONT_BODY = 'Noto Sans KR, sans-serif';

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

/** Race track layout (design resolution) */
export const RACE_TRACK = {
  startX: 60,
  finishX: 360,
  topY: 120,
  laneHeight: 64,
} as const;

/** Colors */
export const COLORS = {
  background: 0x0d0d1a,
  primary: 0xff2d55,
  secondary: 0x0f3460,
  accent: 0x16213e,
  gold: 0xffd700,
  text: 0xffffff,
  textDim: 0xaaaaaa,
} as const;

/** Player colors (up to 10) */
export const PLAYER_COLORS = [
  0xe94560, // red
  0x3498db, // blue
  0x2ecc71, // green
  0xf39c12, // orange
  0x9b59b6, // purple
  0x1abc9c, // teal
  0xe67e22, // dark orange
  0xe74c3c, // crimson
  0x2980b9, // dark blue
  0x27ae60, // dark green
] as const;
