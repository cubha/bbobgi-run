import { Container, Graphics, Text } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS, FONT_DISPLAY } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 삼각 격자 핀 배치 세그먼트 (파친코 핀존).
 * params:
 *   cols    — 열 수
 *   rows    — 행 수
 *   spacing — 핀 간격 (px)
 *   width   — 유효 폭 (px, 벽 근처 핀 스킵 기준)
 */
export class PinZoneSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const cols = Number(this.params['cols'] ?? 6);
    const rows = Number(this.params['rows'] ?? 5);
    const spacing = Number(this.params['spacing'] ?? 36);
    const width = Number(this.params['width'] ?? 300);
    const pinRadius = 6;

    const halfW = width / 2;
    const wallMin = this.originX - halfW + pinRadius + 4;
    const wallMax = this.originX + halfW - pinRadius - 4;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let row = 0; row < rows; row++) {
      // 삼각 격자: 홀수 행은 spacing / 2 오프셋
      const xOffset = row % 2 === 1 ? spacing / 2 : 0;
      const startX = this.originX - ((cols - 1) * spacing) / 2 + xOffset;
      const y = this.originY + row * spacing;

      for (let col = 0; col < cols; col++) {
        const x = startX + col * spacing;

        // 벽 근처 핀 스킵
        if (x < wallMin || x > wallMax) continue;

        this.addPin(physics, x, y, pinRadius, COLORS.textDim);

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    // 구역 라벨
    const zoneHeight = (rows - 1) * spacing;
    const label = new Text({
      text: '▼ PIN ZONE ▼',
      style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.textDim },
    });
    label.anchor.set(0.5, 0.5);
    label.alpha = 0.5;
    label.x = this.originX;
    label.y = this.originY + zoneHeight / 2;
    this.container.addChild(label);

    // 구역 경계 표시 (미세한 배경 사각형)
    const zoneBg = new Graphics();
    zoneBg.rect(
      this.originX - halfW,
      this.originY - spacing / 2,
      width,
      zoneHeight + spacing,
    );
    zoneBg.fill({ color: 0x0a1a2a, alpha: 0.4 });
    this.container.addChildAt(zoneBg, 0);

    parent.addChild(this.container);

    this.updateBounds(
      isFinite(minX) ? minX - pinRadius : this.originX - halfW,
      isFinite(minY) ? minY - pinRadius : this.originY,
      isFinite(maxX) ? maxX + pinRadius : this.originX + halfW,
      isFinite(maxY) ? maxY + pinRadius : this.originY + (rows - 1) * spacing,
    );
  }
}
