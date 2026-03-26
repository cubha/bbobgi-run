import type { Container } from 'pixi.js';
import type Matter from 'matter-js';
import type { PhysicsWorld } from '@core/PhysicsWorld';

// ─── Segment Types ───────────────────────────

export type SegmentType =
  | 'funnel'
  | 'spiral'
  | 'splitter'
  | 'pinzone'
  | 'bottleneck'
  | 'ramp'
  | 'staircase';

/** Map layout data — defines one segment placement */
export interface TrackSegmentDef {
  id: string;
  type: SegmentType;
  originX: number;
  originY: number;
  params: Record<string, number | string | boolean>;
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
  readonly bodies: Matter.Body[];

  /** Create physics bodies and graphics, add to world and container */
  build(physics: PhysicsWorld, parent: Container): void;

  /** Remove all bodies and graphics */
  destroy(physics: PhysicsWorld): void;
}

// ─── Camera Types ────────────────────────────

export type CameraMode = 'group' | 'leader' | 'free';

// ─── Track Layout ────────────────────────────

/** Global track constants for the V2 large map */
export interface TrackLayout {
  worldWidth: number;
  worldHeight: number;
  startY: number;
  finishY: number;
  wallThick: number;
  rampThick: number;
  pinRadius: number;
  segments: TrackSegmentDef[];
}
