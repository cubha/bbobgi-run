import type { TrackLayout } from './types';

/**
 * V3 Marble Run — Adventure Course (2400×3200px)
 *
 * 뱀형 2D 경로: START(중앙) → 우측채널 → U턴(우) → 좌측채널 → 물레방아(좌↑)
 *              → 출구채널(우) → 나선(우↓) → 장애물(좌) → 분기(중앙↓)
 *              → 합류 → 우측스프린트 → 병목 → FINISH(우)
 *
 * SEC 1: 출발 깔때기        (1200,140) → (1200,300)   ↓
 * SEC 2: 우측 채널          (1200,350) → (2050,520)   →
 * SEC 3: U턴 + 좌측 복귀   (2050,520) → (500,720)    ↻ ←
 * SEC 4: 물레방아 상승      (500,720)  → (1500,950)   ↓ ↑ →
 * SEC 5: 나선 하강          (1500,950) → (1200,1650)  ⚲ ↙
 * SEC 6: 장애물 + 분기      (1200,1700)→ (1000,2600)  ← ↓ → ↓
 * SEC 7: 최종 스프린트      (1000,2650)→ (1800,3080)  → ↓
 */
export const TRACK_V3: TrackLayout = {
  worldWidth: 2400,
  worldHeight: 3200,
  startX: 1200,
  startY: 80,
  finishX: 1800,
  finishY: 3080,
  wallThick: 24,
  rampThick: 14,
  pinRadius: 7,
  segments: [
    // ══════════════════════════════════════════════
    // SEC 1: 출발 깔때기 (y=80~300)
    // ══════════════════════════════════════════════
    {
      id: 's1-funnel',
      type: 'funnel',
      originX: 1200,
      originY: 100,
      params: { topWidth: 800, bottomWidth: 300, height: 180 },
    },

    // ══════════════════════════════════════════════
    // SEC 2: 우측 밀폐 채널 (1200,350) → (2050,520)
    // signedAngle 부호 수정으로 direction=1이 올바르게 우측 하향
    // ══════════════════════════════════════════════
    {
      id: 's2-ch-right',
      type: 'channel',
      originX: 1625,
      originY: 435,
      params: {
        width: 900,
        angle: 0.20,
        direction: 1,
        channelGap: 55,
        noCeiling: true,
      },
    },
    // 채널 내부 핀 (속도 차별화)
    {
      id: 's2-pin1',
      type: 'pinzone',
      originX: 1500,
      originY: 440,
      params: { cols: 3, rows: 2, spacing: 30, width: 200 },
    },

    // ══════════════════════════════════════════════
    // SEC 3: U턴 + 좌측 복귀
    // 3a. U턴 곡선: center=(2050,620), r=100, 반원(↻)
    // 3b. 좌측 채널: (2050,720) → (500,720) 수평이동
    // ══════════════════════════════════════════════
    {
      id: 's3-uturn',
      type: 'curved',
      originX: 2050,
      originY: 620,
      params: {
        radius: 100,
        startAngle: -1.5708,  // -π/2 (12시)
        sweepAngle: 3.1416,   // π (반원)
        channelWidth: 55,
        direction: 'cw',
      },
    },
    // 좌측 복귀 채널: (2050,720) → (500,720) 수평
    {
      id: 's3-ch-left',
      type: 'channel',
      // 중심 = ((2050+500)/2, 730)
      // signedAngle 수정으로 direction=-1이 올바르게 좌측 하향
      originX: 1275,
      originY: 730,
      params: {
        width: 1550,
        angle: 0.03,      // 좌측이 낮음
        direction: -1,     // 우→좌
        channelGap: 55,
      },
    },
    // 풍차 장애물 (채널 내)
    {
      id: 's3-windmill-1',
      type: 'windmill',
      originX: 1600,
      originY: 730,
      params: { radius: 25, speed: 0.03, bladeCount: 4 },
    },
    {
      id: 's3-windmill-2',
      type: 'windmill',
      originX: 900,
      originY: 730,
      params: { radius: 25, speed: -0.025, bladeCount: 4 },
    },

    // ══════════════════════════════════════════════
    // SEC 4: 물레방아 리프트
    // 4a. 진입 깔때기: (500,720) → (400,900) 하향
    // 4b. 물레방아: (400,900) ↑ (400,800) 상승!
    // 4c. 출구 채널: (400,800) → (1500,950) 우측이동
    // ══════════════════════════════════════════════
    {
      id: 's4-funnel-entry',
      type: 'funnel',
      originX: 450,
      originY: 770,
      params: { topWidth: 350, bottomWidth: 120, height: 120 },
    },
    {
      id: 's4-wheellift',
      type: 'wheelLift',
      originX: 400,
      originY: 1000,
      params: { radius: 100, speed: 0.025, channelWidth: 60, bladeCount: 4 },
    },
    // 출구 채널: (520,880) → (1500,950) — 물레방아 우측 출구에서 시작
    {
      id: 's4-ch-exit',
      type: 'channel',
      // 중심 = ((520+1500)/2, (880+950)/2) = (1010, 915)
      // 좌측 시작: x=520 (물레방아 채널 x=370~430 우측으로 이격)
      originX: 1010,
      originY: 915,
      params: {
        width: 980,
        angle: 0.07,
        direction: 1,
        channelGap: 55,
      },
    },

    // ══════════════════════════════════════════════
    // SEC 5: 나선 하강 + 나선 출구
    // 5a. 나선: center=(1700,1200), 2.5회전 하강 500px
    // 5b. 출구: (1700,1500) → (1200,1650) 좌하향
    // ══════════════════════════════════════════════
    {
      id: 's5-spiral',
      type: 'spiral',
      originX: 1700,
      originY: 1050,
      params: { radius: 160, turns: 2.5, direction: 'cw', dropPerTurn: 180 },
    },
    // 나선 출구 채널: (1700,1500) → (1200,1650) 좌하향
    {
      id: 's5-ch-exit',
      type: 'channel',
      originX: 1450,
      originY: 1575,
      params: {
        width: 530,
        angle: 0.30,
        direction: -1,
        channelGap: 55,
      },
    },
    {
      id: 's5-trampoline',
      type: 'trampoline',
      originX: 1300,
      originY: 1620,
      params: { width: 150, bouncePower: 1.3 },
    },

    // ══════════════════════════════════════════════
    // SEC 6: 장애물 골목 + 분기
    // 6a. 좌측 이동: (1200,1700) → (300,1800) 풍차+시소+트램폴린
    // 6b. 하강: (300,1800) → (300,2050)
    // 6c. 우측 진입: (300,2050) → (1000,2150) → 분기 → 합류
    // ══════════════════════════════════════════════
    {
      id: 's6-funnel-entry',
      type: 'funnel',
      originX: 1200,
      originY: 1680,
      params: { topWidth: 600, bottomWidth: 300, height: 80 },
    },
    // 좌측 이동 채널: (1200,1780) → (350,1860)
    {
      id: 's6-ch-left',
      type: 'channel',
      originX: 775,
      originY: 1820,
      params: {
        width: 880,
        angle: 0.10,
        direction: -1,
        channelGap: 55,
      },
    },
    {
      id: 's6-windmill',
      type: 'windmill',
      originX: 900,
      originY: 1820,
      params: { radius: 25, speed: 0.035, bladeCount: 4 },
    },
    {
      id: 's6-seesaw',
      type: 'seesaw',
      originX: 600,
      originY: 1840,
      params: { width: 120, thick: 10, pivotH: 20 },
    },
    // 하강: (350,1860) → (350,2050)
    {
      id: 's6-ch-drop',
      type: 'channel',
      originX: 350,
      originY: 1955,
      params: {
        width: 200,
        angle: 1.40,       // 거의 수직
        direction: 1,
        channelGap: 55,
      },
    },
    // 우측 진입: (350,2050) → (1000,2150)
    {
      id: 's6-ch-right',
      type: 'channel',
      originX: 675,
      originY: 2100,
      params: {
        width: 670,
        angle: 0.15,
        direction: 1,
        channelGap: 55,
      },
    },
    // 분기
    {
      id: 's6-splitter',
      type: 'splitter',
      originX: 1000,
      originY: 2200,
      params: { splitWidth: 500, wedgeAngle: 0.4 },
    },
    // A경로 (좌): 급경사+핀 (고위험고속)
    {
      id: 's6-ch-fast',
      type: 'channel',
      originX: 800,
      originY: 2320,
      params: { width: 350, angle: 0.50, direction: -1, channelGap: 50 },
    },
    {
      id: 's6-pins-fast',
      type: 'pinzone',
      originX: 750,
      originY: 2380,
      params: { cols: 3, rows: 2, spacing: 30, width: 200 },
    },
    // B경로 (우): 완경사 (안전저속)
    {
      id: 's6-ch-safe',
      type: 'channel',
      originX: 1200,
      originY: 2320,
      params: { width: 350, angle: 0.15, direction: 1, channelGap: 55 },
    },
    // 합류
    {
      id: 's6-merge',
      type: 'funnel',
      originX: 1000,
      originY: 2480,
      params: { topWidth: 800, bottomWidth: 250, height: 100 },
    },

    // ══════════════════════════════════════════════
    // SEC 7: 최종 스프린트 + 결승
    // 7a. 우측 가속: (1000,2650) → (1800,2800)
    // 7b. 병목: (1800,2800) → (1800,2920)
    // 7c. 피니시 채널: (1800,2920) → (1800,3080)
    // ══════════════════════════════════════════════
    {
      id: 's7-ch-sprint',
      type: 'channel',
      // 중심 = ((1000+1800)/2, (2650+2800)/2) = (1400, 2725)
      originX: 1400,
      originY: 2725,
      params: {
        width: 830,
        angle: 0.19,
        direction: 1,
        channelGap: 60,
      },
    },
    {
      id: 's7-windmill-gate',
      type: 'windmill',
      originX: 1500,
      originY: 2730,
      params: { radius: 30, speed: 0.04, bladeCount: 4 },
    },
    {
      id: 's7-bottleneck',
      type: 'bottleneck',
      originX: 1800,
      originY: 2870,
      params: { passWidth: 100, wedgeAngle: 0.35 },
    },
    // 피니시 하강 채널
    {
      id: 's7-ch-finish',
      type: 'channel',
      originX: 1800,
      originY: 2980,
      params: {
        width: 180,
        angle: 1.40,       // 거의 수직
        direction: 1,
        channelGap: 60,
      },
    },
  ],
  checkpoints: [
    { id: 'cp-s2', x: 2050, y: 520,  width: 200, height: 20, progressDir: '+x' },
    { id: 'cp-s3', x: 500,  y: 720,  width: 200, height: 20, progressDir: '-x' },
    { id: 'cp-s4', x: 1500, y: 950,  width: 200, height: 20, progressDir: '+x' },
    { id: 'cp-s5', x: 1200, y: 1650, width: 200, height: 20, progressDir: '+y' },
    { id: 'cp-s6', x: 1000, y: 2600, width: 200, height: 20, progressDir: '+y' },
  ],
};

/** Marble radius for V3 large map */
export const MARBLE_RADIUS_V3 = 14;

/**
 * V2 Marble Run track — 1200px x 4000px (레거시)
 */
export const TRACK_V2: TrackLayout = {
  worldWidth: 1200,
  worldHeight: 4000,
  startX: 600,
  startY: 80,
  finishX: 600,
  finishY: 3800,
  wallThick: 20,
  rampThick: 14,
  pinRadius: 6,
  segments: [
    { id: 'start-funnel', type: 'funnel', originX: 600, originY: 30, params: { topWidth: 700, bottomWidth: 400, height: 200 } },
    { id: 'ramp-z2-1', type: 'ramp', originX: 600, originY: 310, params: { width: 900, angle: 0.18, direction: 1 } },
    { id: 'ramp-z2-2', type: 'ramp', originX: 600, originY: 520, params: { width: 900, angle: 0.18, direction: -1 } },
    { id: 'ramp-z2-3', type: 'ramp', originX: 600, originY: 730, params: { width: 900, angle: 0.20, direction: 1 } },
    { id: 'ramp-z2-4', type: 'ramp', originX: 600, originY: 940, params: { width: 900, angle: 0.20, direction: -1 } },
    { id: 'ramp-z2-5', type: 'ramp', originX: 600, originY: 1150, params: { width: 900, angle: 0.22, direction: 1 } },
    { id: 'ramp-z2-6', type: 'ramp', originX: 600, originY: 1360, params: { width: 900, angle: 0.22, direction: -1 } },
    { id: 'funnel-z3', type: 'funnel', originX: 600, originY: 1530, params: { topWidth: 600, bottomWidth: 200, height: 250 } },
    { id: 'bottleneck-z3', type: 'bottleneck', originX: 600, originY: 1820, params: { passWidth: 120, wedgeAngle: 0.3 } },
    { id: 'ramp-z4-1', type: 'ramp', originX: 600, originY: 1950, params: { width: 850, angle: 0.22, direction: 1 } },
    { id: 'ramp-z4-2', type: 'ramp', originX: 600, originY: 2130, params: { width: 850, angle: 0.24, direction: -1 } },
    { id: 'ramp-z4-3', type: 'ramp', originX: 600, originY: 2310, params: { width: 850, angle: 0.24, direction: 1 } },
    { id: 'ramp-z4-4', type: 'ramp', originX: 600, originY: 2490, params: { width: 850, angle: 0.26, direction: -1 } },
    { id: 'ramp-z4-5', type: 'ramp', originX: 600, originY: 2670, params: { width: 850, angle: 0.26, direction: 1 } },
    { id: 'splitter-z5', type: 'splitter', originX: 600, originY: 2850, params: { splitWidth: 500, wedgeAngle: 0.4 } },
    { id: 'ramp-z5-a1', type: 'ramp', originX: 320, originY: 2990, params: { width: 350, angle: 0.30, direction: -1 } },
    { id: 'ramp-z5-a2', type: 'ramp', originX: 320, originY: 3120, params: { width: 350, angle: 0.30, direction: 1 } },
    { id: 'ramp-z5-b1', type: 'ramp', originX: 880, originY: 2990, params: { width: 350, angle: 0.16, direction: 1 } },
    { id: 'ramp-z5-b2', type: 'ramp', originX: 880, originY: 3120, params: { width: 350, angle: 0.16, direction: -1 } },
    { id: 'funnel-z5-merge', type: 'funnel', originX: 600, originY: 3240, params: { topWidth: 800, bottomWidth: 250, height: 200 } },
    { id: 'ramp-finale-1', type: 'ramp', originX: 600, originY: 3520, params: { width: 800, angle: 0.28, direction: 1 } },
    { id: 'bottleneck-finale', type: 'bottleneck', originX: 600, originY: 3700, params: { passWidth: 100, wedgeAngle: 0.35 } },
  ],
  checkpoints: [
    { id: 'cp-zone1', x: 600, y: 250, width: 1200, height: 20, progressDir: '+y' },
    { id: 'cp-zone2', x: 600, y: 1500, width: 1200, height: 20, progressDir: '+y' },
    { id: 'cp-zone3', x: 600, y: 2800, width: 1200, height: 20, progressDir: '+y' },
    { id: 'cp-finish', x: 600, y: 3800, width: 1200, height: 20, progressDir: '+y' },
  ],
};

export const MARBLE_RADIUS_V2 = 12;
export const MIN_MARBLES = 6;
export const DUMMY_SYMBOLS = ['●', '○', '◆', '◇'] as const;
export const DUMMY_COLORS = [0x808080, 0xa0a0a0, 0x909090, 0xb0b0b0] as const;
