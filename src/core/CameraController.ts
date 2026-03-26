import { Container, Graphics } from 'pixi.js';
import type { CameraMode } from '@maps/types';

/**
 * 2축 카메라 컨트롤러 — worldContainer의 position을 조작하여 뷰포트 이동.
 *
 * 모드:
 * - group: 상위 1~3등 평균 위치 추적 (레이싱 페이즈)
 * - leader: 1등 단독 추적 (슬로모 페이즈)
 * - free: 드래그 모드 (유저 수동 조작)
 */
export class CameraController {
  private targetX = 0;
  private targetY = 0;
  private currentX = 0;
  private currentY = 0;
  private _mode: CameraMode = 'group';

  // 드래그 카메라 상태
  private dragging = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private dragResumeTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DRAG_RESUME_DELAY = 2000;

  // 히트 영역 (포인터 이벤트 수신용)
  private hitArea: Graphics | null = null;

  private readonly worldContainer: Container;
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly worldW: number;
  private readonly worldH: number;

  constructor(
    worldContainer: Container,
    screenW: number,
    screenH: number,
    worldW: number,
    worldH: number,
  ) {
    this.worldContainer = worldContainer;
    this.screenW = screenW;
    this.screenH = screenH;
    this.worldW = worldW;
    this.worldH = worldH;
  }

  get mode(): CameraMode { return this._mode; }

  // ─── Follow 메서드 ──────────────────────────

  /** 상위 marbles의 평균 위치 추적 (인자: {x,y} 위치 배열) */
  followGroup(positions: Array<{ x: number; y: number }>): void {
    if (positions.length === 0) return;
    const count = Math.min(3, positions.length);
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < count; i++) {
      sumX += positions[i].x;
      sumY += positions[i].y;
    }
    this.targetX = sumX / count;
    this.targetY = sumY / count;
    if (this._mode !== 'free') this._mode = 'group';
  }

  /** 1등 단독 추적 */
  followLeader(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
    if (this._mode !== 'free') this._mode = 'leader';
  }

  /** 드래그 모드 해제 → 자동 추적 복귀 */
  resumeAutoTracking(): void {
    this._mode = 'group';
  }

  // ─── Update ─────────────────────────────────

  /**
   * 매 프레임 호출 — lerp 보간 + 경계 클램프.
   *
   * Adaptive lerp: 거리가 크면 빠르게 보정, 가까우면 부드럽게.
   */
  update(): void {
    // 드래그 중이거나 복귀 대기 중이면 자동 추적 스킵
    if (this.dragging || this.dragResumeTimer !== null) {
      this.applyPosition();
      return;
    }

    const dx = Math.abs(this.targetX - this.currentX);
    const dy = Math.abs(this.targetY - this.currentY);
    const dist = Math.sqrt(dx * dx + dy * dy);

    let lerpFactor: number;
    if (dist > this.screenH * 0.8) {
      lerpFactor = 0.25;
    } else if (dist > this.screenH * 0.5) {
      lerpFactor = 0.15;
    } else {
      lerpFactor = 0.06;
    }

    this.currentX += (this.targetX - this.currentX) * lerpFactor;
    this.currentY += (this.targetY - this.currentY) * lerpFactor;

    this.applyPosition();
  }

  /** 현재 카메라 위치를 worldContainer에 적용 */
  private applyPosition(): void {
    const halfW = this.screenW / 2;
    const halfH = this.screenH / 2;

    // 월드 경계 클램프
    const cx = Math.max(halfW, Math.min(this.worldW - halfW, this.currentX));
    const cy = Math.max(halfH, Math.min(this.worldH - halfH, this.currentY));

    this.worldContainer.x = halfW - cx;
    this.worldContainer.y = halfH - cy;
  }

  // ─── Drag Camera ────────────────────────────

  /**
   * 드래그 카메라 셋업 — hitArea를 parent(보통 hudContainer)에 추가.
   * X+Y 모두 드래그 가능.
   *
   * @param parent hitArea를 추가할 컨테이너 (화면 고정 UI 위)
   * @param getScale 현재 캔버스 스케일 반환 함수 (드래그 보정용)
   */
  setupDrag(parent: Container, getScale: () => number): void {
    this.hitArea = new Graphics();
    this.hitArea.rect(0, 0, this.screenW, this.screenH);
    this.hitArea.fill({ color: 0x000000, alpha: 0.001 });
    this.hitArea.eventMode = 'static';
    this.hitArea.cursor = 'grab';
    parent.addChildAt(this.hitArea, 0);

    this.hitArea.on('pointerdown', (e) => {
      this.dragging = true;
      this._mode = 'free';
      this.dragLastX = e.globalX;
      this.dragLastY = e.globalY;
      if (this.hitArea) this.hitArea.cursor = 'grabbing';

      if (this.dragResumeTimer !== null) {
        clearTimeout(this.dragResumeTimer);
        this.dragResumeTimer = null;
      }
    });

    this.hitArea.on('pointermove', (e) => {
      if (!this.dragging) return;

      const scale = getScale();
      const ddx = (e.globalX - this.dragLastX) / scale;
      const ddy = (e.globalY - this.dragLastY) / scale;
      this.dragLastX = e.globalX;
      this.dragLastY = e.globalY;

      // 드래그 방향과 카메라 이동은 반대 (drag left → camera right)
      this.currentX = Math.max(0, Math.min(this.worldW, this.currentX - ddx));
      this.currentY = Math.max(0, Math.min(this.worldH, this.currentY - ddy));
    });

    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.hitArea) this.hitArea.cursor = 'grab';

      this.dragResumeTimer = setTimeout(() => {
        this.dragResumeTimer = null;
        this._mode = 'group';
      }, CameraController.DRAG_RESUME_DELAY);
    };

    this.hitArea.on('pointerup', endDrag);
    this.hitArea.on('pointerupoutside', endDrag);
  }

  // ─── Getters (Culling용) ────────────────────

  /** 현재 뷰포트의 월드 좌표 영역 */
  getViewBounds(): { left: number; top: number; right: number; bottom: number } {
    return {
      left: this.currentX - this.screenW / 2,
      top: this.currentY - this.screenH / 2,
      right: this.currentX + this.screenW / 2,
      bottom: this.currentY + this.screenH / 2,
    };
  }

  /** 현재 카메라 중심 좌표 */
  getCenter(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  // ─── Cleanup ────────────────────────────────

  destroy(): void {
    if (this.dragResumeTimer !== null) {
      clearTimeout(this.dragResumeTimer);
      this.dragResumeTimer = null;
    }
    this.hitArea?.destroy();
    this.hitArea = null;
  }
}
