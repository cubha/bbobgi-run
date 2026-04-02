import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 호형 밀폐 채널 세그먼트 (U턴, 방향전환용).
 * 짧은 직선 벽을 호 위에 배치하여 곡선 채널 경로를 만든다.
 * params:
 *   radius       — 중심에서 채널 중앙까지 반지름 (px, default 120)
 *   startAngle   — 시작 각도 (radians, default 0)
 *   sweepAngle   — 호 각도 (radians, default Math.PI = 반원 U턴)
 *   channelWidth — 채널 내부 폭 (px, default 50)
 *   direction    — 'cw' | 'ccw' (default 'cw')
 */
export class CurvedChannelSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const radius = Number(this.params['radius'] ?? 120);
    const startAngle = Number(this.params['startAngle'] ?? 0);
    const sweepAngle = Number(this.params['sweepAngle'] ?? Math.PI);
    const channelWidth = Number(this.params['channelWidth'] ?? 50);
    const direction = String(this.params['direction'] ?? 'cw');

    const outerR = radius + channelWidth / 2;
    const innerR = radius - channelWidth / 2;
    const thick = 8;

    // 벽 개수: sweepAngle / (PI/8) 이상으로 부드러운 곡선 보장
    const minWallCount = Math.ceil(sweepAngle / (Math.PI / 8));
    const wallCount = Math.max(minWallCount, 8);

    // 방향 부호: cw = +1, ccw = -1
    const dirSign = direction === 'ccw' ? -1 : 1;

    // 각 벽이 커버하는 호 각도
    const angleStep = sweepAngle / wallCount;

    // 벽 길이 = 외벽 호 길이에 맞게 계산 + 1.05 오버랩으로 빈틈 방지
    const outerWallLen = outerR * angleStep * 1.05;
    const innerWallLen = innerR * angleStep * 1.05;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < wallCount; i++) {
      // 각 벽 중앙 각도 (호 중점)
      const angle = startAngle + (i + 0.5) * angleStep * dirSign;

      // 접선 방향: 진행 방향에 수직 = angle + PI/2 (dirSign 적용)
      const tangentAngle = angle + (Math.PI / 2) * dirSign;

      // 외벽 중심 좌표
      const outerX = this.originX + Math.cos(angle) * outerR;
      const outerY = this.originY + Math.sin(angle) * outerR;

      this.addWall(
        physics,
        outerX,
        outerY,
        outerWallLen,
        thick,
        {
          angle: tangentAngle,
          restitution: 0.3,
          friction: 0.01,
          label: 'curved-outer',
        },
        COLORS.blue,
      );

      // 내벽 중심 좌표
      const innerX = this.originX + Math.cos(angle) * innerR;
      const innerY = this.originY + Math.sin(angle) * innerR;

      this.addWall(
        physics,
        innerX,
        innerY,
        innerWallLen,
        thick,
        {
          angle: tangentAngle,
          restitution: 0.3,
          friction: 0.01,
          label: 'curved-inner',
        },
        COLORS.lavender,
      );

      // bounds 추적 (외벽 기준 — 항상 더 넓음)
      if (outerX - outerWallLen < minX) minX = outerX - outerWallLen;
      if (outerX + outerWallLen > maxX) maxX = outerX + outerWallLen;
      if (outerY - thick < minY) minY = outerY - thick;
      if (outerY + thick > maxY) maxY = outerY + thick;
    }

    // 입/출구는 인접 세그먼트와 연결되므로 가이드 벽 생략
    // (가이드 벽이 채널 입/출구를 막아 구슬 통과 불가 이슈 방지)

    // 입/출구 포트 설정
    const entryAngle = startAngle;
    const exitAngle = startAngle + sweepAngle * dirSign;
    const entryX = this.originX + Math.cos(entryAngle) * radius;
    const entryY = this.originY + Math.sin(entryAngle) * radius;
    const exitX = this.originX + Math.cos(exitAngle) * radius;
    const exitY = this.originY + Math.sin(exitAngle) * radius;
    this.setEntry(entryX, entryY, entryAngle + (Math.PI / 2) * dirSign, channelWidth);
    this.setExit(exitX, exitY, exitAngle + (Math.PI / 2) * dirSign, channelWidth);

    parent.addChild(this.container);

    this.updateBounds(
      isFinite(minX) ? minX - thick : this.originX - outerR,
      isFinite(minY) ? minY - thick : this.originY - outerR,
      isFinite(maxX) ? maxX + thick : this.originX + outerR,
      isFinite(maxY) ? maxY + thick : this.originY + outerR,
    );
  }
}
