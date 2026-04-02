import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 나선(스파이럴) 세그먼트.
 * 짧은 직선 벽을 원형으로 배치하여 나선 경로를 만든다.
 * params:
 *   radius      — 나선 반지름 (px)
 *   turns       — 회전 수
 *   direction   — 'cw' | 'ccw'
 *   dropPerTurn — 회전당 Y 하강 (px)
 */
export class SpiralSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const radius = Number(this.params['radius'] ?? 120);
    const turns = Number(this.params['turns'] ?? 2);
    const direction = String(this.params['direction'] ?? 'cw');
    const dropPerTurn = Number(this.params['dropPerTurn'] ?? 160);

    const innerR = radius * 0.4;  // 0.5→0.4: 내벽~외벽 간격 확대 (끼임 방지)
    const outerR = radius;
    const wallsPerTurn = 16;
    const totalWalls = Math.round(wallsPerTurn * turns);
    const totalAngle = Math.PI * 2 * turns;
    const totalDrop = dropPerTurn * turns;
    const thick = 10;

    // 각 벽 세그먼트의 호 길이로 벽 폭 결정 (구슬 통로 > 30px 보장)
    const outerArc = (outerR * totalAngle) / totalWalls;
    const wallLen = Math.min(outerArc * 0.65, 40);

    const dirSign = direction === 'ccw' ? -1 : 1;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < totalWalls; i++) {
      const t = i / totalWalls;
      const angle = t * totalAngle * dirSign;
      const yDrop = t * totalDrop;

      // 외벽
      const outerX = this.originX + Math.cos(angle) * outerR;
      const outerY = this.originY + Math.sin(angle) * outerR * 0.3 + yDrop;
      const tangentAngle = angle + (Math.PI / 2) * dirSign;

      this.addWall(
        physics,
        outerX,
        outerY,
        wallLen,
        thick,
        {
          angle: tangentAngle,
          restitution: 0.3,
          friction: 0.01,
          label: 'spiral-outer',
        },
        COLORS.blue,
      );

      // 내벽 (교대 배치: 3개에 1개만 — 밀도 낮춰 끼임 방지)
      if (i % 3 === 0) {
        const innerX = this.originX + Math.cos(angle) * innerR;
        // 내벽 Y 압축 비율을 외벽(0.3)보다 낮춰 내벽-외벽 간격 확보
        const innerY = this.originY + Math.sin(angle) * innerR * 0.15 + yDrop;

        this.addWall(
          physics,
          innerX,
          innerY,
          wallLen * 0.7,
          thick,
          {
            angle: tangentAngle,
            restitution: 0.3,
            friction: 0.01,
            label: 'spiral-inner',
          },
          COLORS.lavender,
        );

        if (innerX - wallLen < minX) minX = innerX - wallLen;
        if (innerX + wallLen > maxX) maxX = innerX + wallLen;
        if (innerY - thick < minY) minY = innerY - thick;
        if (innerY + thick > maxY) maxY = innerY + thick;
      }

      if (outerX - wallLen < minX) minX = outerX - wallLen;
      if (outerX + wallLen > maxX) maxX = outerX + wallLen;
      if (outerY - thick < minY) minY = outerY - thick;
      if (outerY + thick > maxY) maxY = outerY + thick;
    }

    parent.addChild(this.container);

    // 입/출구 포트 설정
    const entryAngleRad = 0;
    const exitAngleRad = totalAngle * dirSign;
    const channelW = outerR - innerR;
    const midR = (outerR + innerR) / 2;
    this.setEntry(
      this.originX + Math.cos(entryAngleRad) * midR,
      this.originY + Math.sin(entryAngleRad) * midR * 0.3,
      entryAngleRad + Math.PI / 2,
      channelW,
    );
    this.setExit(
      this.originX + Math.cos(exitAngleRad) * midR,
      this.originY + Math.sin(exitAngleRad) * midR * 0.3 + totalDrop,
      exitAngleRad + Math.PI / 2,
      channelW,
    );

    this.updateBounds(
      isFinite(minX) ? minX : this.originX - outerR,
      isFinite(minY) ? minY : this.originY,
      isFinite(maxX) ? maxX : this.originX + outerR,
      isFinite(maxY) ? maxY : this.originY + totalDrop,
    );
  }
}
