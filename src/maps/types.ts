import type { Container } from 'pixi.js';
import type { Body } from '@core/PhysicsWorld';
import type { PhysicsWorld } from '@core/PhysicsWorld';

// ─── Segment Types ───────────────────────────

export type SegmentType =
  | 'funnel'
  | 'spiral'
  | 'splitter'
  | 'pinzone'
  | 'bottleneck'
  | 'ramp'
  | 'staircase'
  | 'channel'
  | 'curved'
  | 'wheelLift'
  | 'trampoline'
  | 'windmill'
  | 'shortcutGap'
  | 'seesaw';

/** Map layout data — defines one segment placement */
export interface TrackSegmentDef {
  id: string;
  type: SegmentType;
  originX: number;
  originY: number;
  params: Record<string, number | string | boolean>;
}

/** 세그먼트 연결 포트 — 입구/출구 좌표 */
export interface SegmentPort {
  x: number;
  y: number;
  /** 흐름 방향 (radians, 0=right, π/2=down) */
  angle: number;
  /** 통로 폭 (px) */
  width: number;
}

/** Bounding rectangle for culling */
export interface SegmentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Runtime segment instance built from a TrackSegmentDef */
export interface TrackSegment {
  readonly id: string;
  readonly type: SegmentType;
  readonly bounds: SegmentBounds;
  readonly container: Container;
  readonly bodies: Body[];

  /** Create physics bodies and graphics, add to world and container */
  build(physics: PhysicsWorld, parent: Container): void;

  /** Remove all bodies and graphics */
  destroy(physics: PhysicsWorld): void;

  /** 입구 포트 — build() 호출 후 유효 */
  getEntry(): SegmentPort;

  /** 출구 포트 — build() 호출 후 유효 */
  getExit(): SegmentPort;
}

// ─── Camera Types ────────────────────────────

export type CameraMode = 'group' | 'leader' | 'free';

// ─── Track Layout ────────────────────────────

/** Checkpoint definition for progress tracking */
export interface CheckpointDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Progress direction within this section: '+x' | '-x' | '+y' */
  progressDir: '+x' | '-x' | '+y';
}

/** Global track constants */
export interface TrackLayout {
  worldWidth: number;
  worldHeight: number;
  startX?: number;
  startY: number;
  finishX?: number;
  finishY: number;
  wallThick: number;
  rampThick: number;
  pinRadius: number;
  segments: TrackSegmentDef[];
  checkpoints?: CheckpointDef[];
}
