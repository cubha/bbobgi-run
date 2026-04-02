import { PhysicsWorld, type Body, type Contact } from '@core/PhysicsWorld';
import type { CheckpointDef, TrackLayout } from './types';
import type { Marble } from '@entities/Marble';

/**
 * 체크포인트 기반 진행도 추적 시스템.
 *
 * - 각 구슬의 checkpointIndex (통과한 마지막 체크포인트 번호, -1이면 미통과)
 * - 현재 섹션 내 로컬 진행도 (0.0 ~ 1.0)를 progressDir에 따라 계산
 * - getSortedByProgress()로 checkpointIndex → localProgress 복합 정렬 반환
 */
export class MarbleProgress {
  /** 각 구슬의 체크포인트 인덱스 (마지막으로 통과한 cp 인덱스, -1 = 미통과) */
  private readonly cpIndex_ = new Map<Marble, number>();

  /** 구슬의 마지막 통과 체크포인트 인덱스 (외부 조회용) */
  getCpIndex(marble: Marble): number {
    return this.cpIndex_.get(marble) ?? -1;
  }
  /** 체크포인트 센서 바디 목록 */
  private readonly sensors: Body[] = [];
  /** layout.checkpoints의 null-safe 사본 */
  private readonly checkpoints: CheckpointDef[];

  private readonly layout: TrackLayout;
  private readonly physics: PhysicsWorld;

  constructor(layout: TrackLayout, physics: PhysicsWorld) {
    this.layout = layout;
    this.physics = physics;
    this.checkpoints = layout.checkpoints ?? [];
  }

  /** 구슬 목록 등록 — 반드시 구슬 생성 후 호출 */
  registerMarbles(marbles: readonly Marble[]): void {
    for (const m of marbles) {
      this.cpIndex_.set(m, -1);
    }
  }

  /** 체크포인트 센서 바디 생성 및 물리 월드에 등록 */
  buildSensors(): void {
    for (const cp of this.checkpoints) {
      const sensor = this.physics.createSensor(cp.x, cp.y, cp.width, cp.height, `cp:${cp.id}`);
      this.sensors.push(sensor);
    }
  }

  /**
   * Planck.js begin-contact 콜백에서 호출.
   * Contact에서 fixture → body → userData.label 추출.
   */
  handleContact(contact: Contact, marbles: readonly Marble[]): void {
    const fixtureA = contact.getFixtureA();
    const fixtureB = contact.getFixtureB();
    const bodyA = fixtureA.getBody();
    const bodyB = fixtureB.getBody();

    const labelA = (bodyA.getUserData() as { label?: string } | null)?.label ?? '';
    const labelB = (bodyB.getUserData() as { label?: string } | null)?.label ?? '';

    const sensorLabel = labelA.startsWith('cp:') ? labelA
      : labelB.startsWith('cp:') ? labelB
        : null;
    const marbleBody = sensorLabel === labelA ? bodyB : bodyA;
    if (!sensorLabel || marbleBody.isStatic()) return;

    const cpId = sensorLabel.slice(3);
    const cpIdx = this.checkpoints.findIndex((c) => c.id === cpId);
    if (cpIdx === -1) return;

    const marble = marbles.find((m) => m.body === marbleBody);
    if (!marble) return;

    const current = this.cpIndex_.get(marble) ?? -1;
    if (cpIdx > current) {
      this.cpIndex_.set(marble, cpIdx);
    }
  }

  /**
   * 섹션 내 로컬 진행도 계산 (0.0 ~ 1.0).
   */
  getLocalProgress(marble: Marble): number {
    const cpIdx = this.cpIndex_.get(marble) ?? -1;
    const cps = this.checkpoints;
    const pos = marble.body.getPosition();

    if (cps.length === 0) {
      const range = this.layout.finishY - this.layout.startY;
      if (range === 0) return 1;
      return Math.max(0, Math.min(1, (pos.y - this.layout.startY) / range));
    }

    const sectionIdx = cpIdx + 1;
    const prevCp: CheckpointDef | undefined = cpIdx >= 0 ? cps[cpIdx] : undefined;
    const sectionStart = prevCp !== undefined ? prevCp.y : this.layout.startY;

    const nextCp: CheckpointDef | undefined = sectionIdx < cps.length ? cps[sectionIdx] : undefined;
    const sectionEnd = nextCp !== undefined ? nextCp.y : this.layout.finishY;

    const lastCp: CheckpointDef | undefined = cps[cps.length - 1];
    const dirCp: CheckpointDef | undefined = nextCp ?? lastCp;
    const dir: CheckpointDef['progressDir'] = dirCp !== undefined ? dirCp.progressDir : '+y';

    const sectionLen = Math.abs(sectionEnd - sectionStart);
    if (sectionLen === 0) return 1;

    let raw: number;
    if (dir === '+y') {
      raw = (pos.y - sectionStart) / sectionLen;
    } else if (dir === '-x') {
      raw = (this.layout.worldWidth - pos.x) / this.layout.worldWidth;
    } else {
      raw = (pos.x - (this.layout.startX ?? 0)) / this.layout.worldWidth;
    }

    return Math.max(0, Math.min(1, raw));
  }

  /** 복합 진행도 점수: checkpointIndex + 1 + localProgress */
  getScore(marble: Marble): number {
    const cpIdx = this.cpIndex_.get(marble) ?? -1;
    return cpIdx + 1 + this.getLocalProgress(marble);
  }

  /** 진행도 기준 정렬된 구슬 배열 (선두가 앞) */
  getSortedByProgress(marbles: readonly Marble[]): Marble[] {
    return [...marbles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return this.getScore(b) - this.getScore(a);
    });
  }

  /** 센서 바디 제거 */
  destroy(): void {
    for (const sensor of this.sensors) {
      this.physics.removeBodies(sensor);
    }
    this.sensors.length = 0;
    this.cpIndex_.clear();
  }
}
