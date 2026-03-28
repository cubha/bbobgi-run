import { Container } from 'pixi.js';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { COLORS } from '@utils/constants';
import { BaseSegment } from './BaseSegment';
import type { TrackSegmentDef } from '@maps/types';

/**
 * 밀폐 경사 채널 세그먼트 — 구슬이 절대 이탈 불가.
 * params:
 *   width      — 채널 길이 (px, default 600)
 *   angle      — 경사 각도 절댓값 (radians, default 0.15)
 *   direction  — 기울기 방향: 1 = 좌→우(오른쪽이 낮음), -1 = 반대 (default 1)
 *   channelGap — 채널 내부 높이: 상벽~하벽 간격 (px, default 50)
 */
export class ChannelRampSegment extends BaseSegment {
  constructor(def: TrackSegmentDef) {
    super(def);
  }

  build(physics: PhysicsWorld, parent: Container): void {
    const width = Number(this.params['width'] ?? 600);
    const angle = Number(this.params['angle'] ?? 0.15);
    const direction = Number(this.params['direction'] ?? 1);
    const channelGap = Number(this.params['channelGap'] ?? 50);

    const noCeiling = Boolean(this.params['noCeiling'] ?? false);
    const thick = 14;
    const signedAngle = angle * direction;

    // 하단 벽 (바닥 레일) — 구슬이 굴러가는 면
    this.addWall(
      physics,
      this.originX,
      this.originY,
      width,
      thick,
      {
        angle: signedAngle,
        restitution: 0.12,
        friction: 0.05,
        label: 'channel-floor',
      },
      COLORS.secondary,
    );

    // 상단 벽 (천장 레일) — noCeiling=true 시 생략 (상부 진입 허용)
    if (!noCeiling) {
      this.addWall(
        physics,
        this.originX,
        this.originY - channelGap,
        width,
        thick,
        {
          angle: signedAngle,
          restitution: 0.1,
          friction: 0.05,
          label: 'channel-ceiling',
        },
        COLORS.secondary,
      );

      // 천장 Graphics에 alpha 0.7 적용
      this.container.children[this.container.children.length - 1].alpha = 0.7;
    }

    // 낮은 쪽 끝 범퍼 — 수직 벽, 높이 = channelGap
    const bumperW = thick;
    const halfW = width / 2;
    const dropY = Math.sin(angle) * halfW;

    // direction=1: 오른쪽이 낮음 → 오른쪽 끝에 범퍼
    // direction=-1: 왼쪽이 낮음 → 왼쪽 끝에 범퍼
    const bumperX = this.originX + direction * halfW;
    // 바닥 레일 낮은 끝 중심 Y, 범퍼 중심 = 바닥 상면 ~ 천장 하면 사이 중간
    const floorTopY = this.originY + dropY - thick / 2;
    const ceilingBottomY = this.originY - channelGap + dropY + thick / 2;
    const bumperCenterY = (floorTopY + ceilingBottomY) / 2;

    this.addWall(
      physics,
      bumperX,
      bumperCenterY,
      bumperW,
      channelGap,
      {
        restitution: 0.4,
        friction: 0.05,
        label: 'channel-bumper',
      },
      COLORS.gold,
    );

    // 높은쪽 입구는 열려 있음 (구슬 진입용)

    // 입/출구 포트 설정
    // 입구 = 높은쪽(open side), 출구 = 낮은쪽(bumper side)
    const entryX = this.originX - direction * halfW;
    const entryY = this.originY - dropY;
    const exitX = this.originX + direction * halfW;
    const exitY = this.originY + dropY;
    const flowAngle = Math.atan2(exitY - entryY, exitX - entryX);
    this.setEntry(entryX, entryY - channelGap / 2, flowAngle, channelGap);
    this.setExit(exitX, exitY - channelGap / 2, flowAngle, channelGap);

    // Bounds 계산
    this.updateBounds(
      this.originX - halfW - thick / 2,
      this.originY - channelGap - dropY - thick / 2,
      this.originX + halfW + thick / 2,
      this.originY + dropY + thick / 2,
    );

    parent.addChild(this.container);
  }
}
