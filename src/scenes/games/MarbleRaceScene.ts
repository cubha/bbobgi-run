import { Container, Graphics, Text } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld, Vec2, type Contact } from '@core/PhysicsWorld';
import { CameraController } from '@core/CameraController';
import { Marble, resetDummyColorIndex } from '@entities/Marble';
import { V5TrackBuilder, V5_WORLD_W, V5_WORLD_H, V5_START_Y, V5_FINISH_Y, V5_MARBLE_RADIUS, V5_MARBLE_STARTS } from '@maps/v5/V5TrackBuilder';
import { MIN_MARBLES, DUMMY_SYMBOLS } from '@maps/TrackData';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { MiniMap } from '@ui/MiniMap';
import type { GameConfig, GameResult, Player, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  COUNTDOWN_SEC,
  FONT_DISPLAY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

type RacePhase = 'countdown' | 'racing' | 'slowmo' | 'done';

/** 정체 감지 상수 */
const STUCK_WARN_SEC = 3;      // 3초 정체 시 경고 로그
const STUCK_IMPULSE_SEC = 5;   // 5초 정체 시 impulse

/** 구슬 최대 속도 (px/s — Planck.js 스케일) */
const MAX_MARBLE_SPEED = 1800;

/** Race event triggers (seconds after racing phase starts) */
const RACE_EVT = { lastBooster: 8, leadLightning: 16 } as const;

/**
 * Marble Race game scene — V5 대형 맵 (2200×2900px)
 * V5TrackBuilder 직접 좌표 기반 + CameraController + 더미 구슬 시스템
 */
export class MarbleRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

  private physics: PhysicsWorld | null = null;
  private trackBuilder: V5TrackBuilder | null = null;
  private camera: CameraController | null = null;
  private marbles: Marble[] = [];
  private finishOrder: Marble[] = [];
  private totalElapsed = 0;
  private phase: RacePhase = 'countdown';

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();

  private readonly worldContainer = new Container();
  private readonly marbleContainer = new Container();
  private readonly hudContainer = new Container();
  private rankLabels: Text[] = [];

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private miniMap: MiniMap | null = null;
  private prevRankIds: number[] = [];

  // ─── Event system ─────────────────────────────
  private readonly eventsFired = {
    lastBooster: false,
    leadLightning: false,
  };
  private readonly flashes: Array<{ gfx: Graphics; framesLeft: number; total: number }> = [];

  // ─── Slowmo frame skip ──────────────────────────
  private slowmoFrameCounter = 0;

  // ─── Stuck detection ──────────────────────────
  // stuckTimers removed — V5 uses rescue teleport system
  /** 위치 변위 기반 stuck 감지: 10초 전 위치 기록 */
  private readonly stuckPositions = new Map<Marble, { x: number; y: number; time: number }>();

  // ─── Sections tracking ────────────────────────
  /** 구슬별 통과 섹션 기록 (Playwright T-03) */
  private readonly sectionsVisited = new Map<Marble, Set<string>>();

  // ─── Timer cleanup ────────────────────────────
  private readonly pendingTimers: ReturnType<typeof setTimeout>[] = [];

  // ─── Public API ───────────────────────────────

  setConfig(config: GameConfig): void { this.config = config; }
  setEndCallback(cb: (result: GameResult) => void): void { this.endCallback = cb; }
  setScaleInfo(s: ScaleInfo): void { this._scaleInfo = s; }

  async init(): Promise<void> {
    if (!this.config) return;

    this.physics = new PhysicsWorld({ x: 0, y: 980 });

    this.container.addChild(this.worldContainer);
    this.container.addChild(this.hudContainer);

    // 인터랙션 레이어 (드래그용 — hudContainer 위에)
    const interactionLayer = new Container();
    this.container.addChild(interactionLayer);

    this.trackBuilder = new V5TrackBuilder(this.physics, this.worldContainer);
    this.trackBuilder.build();

    this.worldContainer.addChild(this.marbleContainer);

    // 캔버스 참조 (줌용)
    const canvas = this.container.parent?.children
      ? (document.querySelector('canvas') as HTMLCanvasElement | null)
      : null;

    this.camera = new CameraController(
      this.worldContainer,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      V5_WORLD_W,
      V5_WORLD_H,
    );
    this.camera.setupDrag(interactionLayer, () => this._scaleInfo?.scale ?? 1, canvas ?? undefined);
    // SEC1 검증용: 깔때기+핀존 전체 영역 포커스 (x:600~1480, y:0~400)
    this.camera.setPosition(1040, 200);
    this.camera.setZoom(0.44);

    this.buildMarbles();

    this.buildHUD();
    this.buildRankLabels();
    this.setupCollisionDetection();

    // Playwright test helper: 구슬 수 사전 설정 (테스트에서 게임 로드 전 호출)
    const win = window as unknown as Record<string, unknown>;
    win.__SET_MARBLE_COUNT__ = (count: number) => {
      win.__MARBLE_COUNT_OVERRIDE__ = count;
    };

    this.miniMap = new MiniMap(this.hudContainer, V5_WORLD_W, V5_WORLD_H);

    this.startCountdown();
  }

  update(delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') {
      this.camera?.update();
      return;
    }

    // Phase transitions — 시간제한 없음, 완주 기반 종료
    const playerCount = this.config!.players.filter(p => !p.isDummy).length;

    // 전원 완주+retire 감지 (안전장치: 모든 구슬 처리 완료 시 종료)
    const allSettled = this.marbles.every(m => m.finished || m.retired);
    if (allSettled && this.marbles.length > 0) {
      this.endRace();
      return;
    }

    // 꼴등뽑기: N-1명 완주 시 슬로모 진입
    const lastPickSlowmo = this.config!.pickMode === 'last'
      && this.uniqueFinishedPlayerCount() >= playerCount - 1;
    if (this.phase !== 'slowmo' && lastPickSlowmo) {
      this.enterSlowmo();
    }

    this.tickEvents();

    // 1. Pre-physics: 속도 상한 + 벽 클램핑
    const bounds = this.trackBuilder!.getTrackBounds();
    const marbleR = V5_MARBLE_RADIUS;
    const boundsMinX = bounds.minX + marbleR + 2;
    const boundsMaxX = bounds.maxX - marbleR - 2;
    for (const marble of this.marbles) {
      if (marble.retired || marble.finished) continue;
      const vel = marble.body.getLinearVelocity();
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      if (speed > MAX_MARBLE_SPEED) {
        const scale = MAX_MARBLE_SPEED / speed;
        marble.body.setLinearVelocity(new Vec2(vel.x * scale, vel.y * scale));
      }
      marble.clampToBounds(boundsMinX, boundsMaxX);
    }

    // 2. Physics step — slowmo는 프레임 스킵 방식
    if (this.phase === 'slowmo') {
      this.slowmoFrameCounter++;
      if (this.slowmoFrameCounter % 3 === 0) {
        this.physics.update();
      }
    } else {
      this.physics.update();
    }

    // 3. Post-physics: 렌더 동기화 + Y좌표 기반 피니시 감지 + out-of-bounds retire
    for (const marble of this.marbles) {
      if (marble.retired || marble.finished) continue;
      marble.sync();

      const pos = marble.body.getPosition();

      // Out-of-bounds: FINISH 영역이 아닌 곳에서 월드 밖 이탈 시 retire
      if (pos.y < -100 || pos.y > V5_WORLD_H + 100 || pos.x < -50 || pos.x > V5_WORLD_W + 50) {
        // V5 FINISH 영역: x=1720~1800, y=2870~2910
        const inFinish = pos.x >= 1720 && pos.x <= 1800 && pos.y >= 2870 && pos.y <= 2910;
        if (!inFinish && !marble.finished) {
          marble.markRetired();
          // 물리 시뮬레이션에서 제거
          this.physics!.removeBodies(marble.body);
          // 렌더링에서 숨김
          marble.container.visible = false;
        }
      }
    }

    this.checkStuckMarbles(dt);

    // Expose marble state for Playwright testing (window.__MARBLE_STATE__)
    const win = window as unknown as Record<string, unknown>;
    win.__MARBLE_STATE__ = {
      phase: this.phase,
      elapsedTime: this.totalElapsed * 1000,
      marbles: this.marbles.map(m => {
        const p = m.body.getPosition();
        const v = m.body.getLinearVelocity();
        const stuckEntry = this.stuckPositions.get(m);
        const visited = this.sectionsVisited.get(m);
        const branchSec4 = visited?.has('sec4-fast') ? 'fast' : visited?.has('sec4-safe') ? 'safe' : null;
        const branchSec7 = visited?.has('sec7-vortex') ? 'vortex' : visited?.has('sec7-sprint') ? 'sprint' : null;
        return {
          id: m.player.id,
          name: m.player.name,
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(v.x),
          vy: Math.round(v.y),
          finished: m.finished,
          finishX: m.finished ? Math.round(p.x) : null,
          finishY: m.finished ? Math.round(p.y) : null,
          outOfBounds: m.retired,
          retired: m.retired,
          isDummy: m.isDummy,
          stuckTime: stuckEntry ? (this.totalElapsed - stuckEntry.time) * 1000 : 0,
          sectionsVisited: visited ? Array.from(visited) : [],
          branch: { sec4: branchSec4, sec7: branchSec7 },
        };
      }),
      finishedCount: this.finishOrder.length,
      outOfBoundsCount: this.marbles.filter(m => m.retired).length,
      stuckEvents: this.marbles.filter(m => {
        const entry = this.stuckPositions.get(m);
        return entry && (this.totalElapsed - entry.time) > 10;
      }).length,
      totalMarbles: this.marbles.length,
    };
    // Legacy debug alias
    win.__MARBLE_DEBUG__ = win.__MARBLE_STATE__;

    this.updateCameraTracking();
    this.camera!.update();

    if (this.miniMap && this.camera) {
      const marbleInfos = this.marbles
        .filter(m => !m.retired)
        .map(m => {
          const p = m.body.getPosition();
          return { x: p.x, y: p.y, color: m.color, isDummy: m.isDummy };
        });
      this.miniMap.update(marbleInfos, this.camera.getViewBounds(), V5_FINISH_Y);
    }

    this.tickFlashes();

    // 타이머 바: 완주 진행도 기반 (실제 플레이어 완주 비율)
    const finishedOrRetired = this.marbles.filter(m => !m.isDummy && (m.finished || m.retired)).length;
    const totalReal = this.marbles.filter(m => !m.isDummy).length;
    const progress = totalReal > 0 ? Math.max(0, 1 - finishedOrRetired / totalReal) : 1;
    this.updateTimerBar(progress);

    const sorted = this.getSortedByProgress();
    this.checkRankChanges(sorted);
    this.prevRankIds = sorted.map((m) => m.player.id);
    this.updateRankLabels(sorted);

    // 완주 기반 종료: 1등뽑기 = 1명 완주 시, 꼴등뽑기 = N-1명 완주 시 (꼴등만 남김)
    const endThreshold = this.config!.pickMode === 'last'
      ? playerCount - 1
      : 1;
    if (this.uniqueFinishedPlayerCount() >= endThreshold) {
      if (this.phase !== 'slowmo') {
        this.enterSlowmo();
        // 1등뽑기: 슬로모 5초 후 종료 (1등 결정 즉시)
        // 꼴등뽑기: 타이머 없음 — 꼴등 구슬이 자연스럽게 완주할 때까지 대기 (allSettled로 종료)
        if (this.config!.pickMode !== 'last') {
          this.pendingTimers.push(setTimeout(() => this.endRace(), 5000));
        }
      }
    }
  }

  override destroy(): void {
    this.miniMap?.destroy();
    this.miniMap = null;
    this.camera?.destroy();
    this.camera = null;
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.length = 0;
    // stuckTimers removed
    this.stuckPositions.clear();

    for (const marble of this.marbles) {
      if (this.physics) this.physics.removeBodies(marble.body);
      marble.destroy();
    }
    this.marbles.length = 0;
    this.rankLabels.length = 0;
    this.finishOrder.length = 0;

    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.trackBuilder?.destroy();
    this.trackBuilder = null;
    this.physics?.destroy();
    this.physics = null;
    super.destroy();
  }

  // ─── Build: Marbles ───────────────────────────

  private buildMarbles(): void {
    if (!this.config || !this.physics) return;

    resetDummyColorIndex();

    const { players } = this.config;
    const marbleCount = this.config.marbleCount ?? 1;

    const expandedPlayers: Player[] = [];
    for (const player of players) {
      for (let n = 0; n < marbleCount; n++) {
        expandedPlayers.push({
          ...player,
          name: marbleCount > 1 ? `${player.name}${n + 1}` : player.name,
        });
      }
    }

    const allPlayers = this.ensureMinMarbles(expandedPlayers);

    const totalMarbles = allPlayers.length;
    // V5: 명세서 정의 시작 위치 사용 (최대 9개, 초과 시 가운데 기준 간격 배치)
    allPlayers.forEach((player, idx) => {
      let sx: number, sy: number;
      if (idx < V5_MARBLE_STARTS.length) {
        sx = V5_MARBLE_STARTS[idx].x;
        sy = V5_MARBLE_STARTS[idx].y;
      } else {
        // 추가 구슬은 기존 위치 사이에 배치
        const cx = (V5_MARBLE_STARTS[0].x + V5_MARBLE_STARTS[V5_MARBLE_STARTS.length - 1].x) / 2;
        const spacing = Math.min(30, 320 / totalMarbles);
        sx = cx + (idx - (totalMarbles - 1) / 2) * spacing;
        sy = V5_START_Y;
      }
      const marble = new Marble(
        player,
        sx,
        sy,
        V5_MARBLE_RADIUS,
        this.physics!,
      );
      // V5: linearDamping 감소 — 더 긴 경사면에서 원활한 굴러감 보장
      marble.body.setLinearDamping(0.1);
      this.marbles.push(marble);
      this.marbleContainer.addChild(marble.container);
    });

    this.prevRankIds = allPlayers.map((p) => p.id);
  }

  private ensureMinMarbles(players: Player[]): Player[] {
    if (players.length >= MIN_MARBLES) return [...players];

    const result = [...players];
    const dummyCount = MIN_MARBLES - players.length;
    for (let i = 0; i < dummyCount; i++) {
      result.push({
        id: 100 + i,
        name: DUMMY_SYMBOLS[i % DUMMY_SYMBOLS.length],
        isDummy: true,
      });
    }
    return result;
  }

  // ─── Build: HUD ───────────────────────────────

  private buildHUD(): void {
    const hudH = 50;

    const hudBg = new Graphics();
    hudBg.rect(0, 0, DESIGN_WIDTH, hudH);
    hudBg.fill({ color: 0x080810, alpha: 0.9 });
    this.hudContainer.addChild(hudBg);

    const timerBgBar = new Graphics();
    timerBgBar.rect(14, 10, DESIGN_WIDTH - 28, 7);
    timerBgBar.fill({ color: COLORS.secondary, alpha: 0.9 });
    this.hudContainer.addChild(timerBgBar);

    this.timerBar = new Graphics();
    this.hudContainer.addChild(this.timerBar);
    this.updateTimerBar(1);

    const title = new Text({
      text: '구슬 레이스',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.textDim },
    });
    title.x = 14;
    title.y = 26;
    this.hudContainer.addChild(title);

    this.phaseLabel = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: COLORS.primary },
    });
    this.phaseLabel.anchor.set(1, 0);
    this.phaseLabel.x = DESIGN_WIDTH - 14;
    this.phaseLabel.y = 26;
    this.hudContainer.addChild(this.phaseLabel);
  }

  private buildRankLabels(): void {
    this.marbles.forEach(() => {
      const label = new Text({
        text: '',
        style: { fontFamily: FONT_DISPLAY, fontSize: 9, fill: COLORS.gold },
      });
      label.anchor.set(0.5, 1);
      this.marbleContainer.addChild(label);
      this.rankLabels.push(label);
    });
  }

  // ─── Collision ────────────────────────────────

  private setupCollisionDetection(): void {
    if (!this.physics) return;

    this.physics.onCollisionStart((contact: Contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();

      const labelA = (bodyA.getUserData() as { label?: string } | null)?.label ?? '';
      const labelB = (bodyB.getUserData() as { label?: string } | null)?.label ?? '';

      // FINISH sensor handling
      const isFinishA = labelA === 'finish';
      const isFinishB = labelB === 'finish';
      const sensorBody = isFinishA ? bodyA : isFinishB ? bodyB : null;
      const marbleBody = sensorBody ? (sensorBody === bodyA ? bodyB : bodyA) : null;

      if (sensorBody && marbleBody && !marbleBody.isStatic()) {
        const marble = this.marbles.find((m) => m.body === marbleBody);
        if (marble && !marble.finished) {
          marble.markFinished(this.totalElapsed);
          this.finishOrder.push(marble);

          // 물리 시뮬레이션에서 제거 (쌓이지 않도록)
          this.physics!.removeBodies(marbleBody);
          // 렌더링에서 숨김
          marble.container.visible = false;
        }
        return;
      }

      // Section sensor handling — sectionsVisited tracking (T-03, T-06)
      const sectionBodyA = labelA.startsWith('sec') && !isFinishA ? bodyA : null;
      const sectionBodyB = labelB.startsWith('sec') && !isFinishB ? bodyB : null;
      const secBody = sectionBodyA ?? sectionBodyB;
      const secLabel = sectionBodyA ? labelA : sectionBodyB ? labelB : null;
      const marbleBodySec = secBody ? (secBody === bodyA ? bodyB : bodyA) : null;

      if (secLabel && marbleBodySec && !marbleBodySec.isStatic()) {
        const marble = this.marbles.find((m) => m.body === marbleBodySec);
        if (marble && !marble.finished && !marble.retired) {
          if (!this.sectionsVisited.has(marble)) {
            this.sectionsVisited.set(marble, new Set<string>());
          }
          this.sectionsVisited.get(marble)!.add(secLabel);
        }
      }
    });
  }

  // ─── Camera ────────────────────────────────────

  private updateCameraTracking(): void {
    if (!this.camera) return;

    if (this.phase === 'slowmo' || this.phase === 'done') {
      const sorted = this.getSortedByProgress().filter(m => !m.retired);
      const leader = sorted[0];
      if (leader) {
        const p = leader.body.getPosition();
        this.camera.followLeader(p.x, p.y);
      }
      return;
    }

    const active = this.marbles.filter((m) => !m.finished && !m.retired);

    if (active.length > 0) {
      const sorted = active.sort((a, b) => b.body.getPosition().y - a.body.getPosition().y);
      const top = sorted.slice(0, 3).map(m => {
        const p = m.body.getPosition();
        return { x: p.x, y: p.y };
      });
      this.camera.followGroup(top);
    } else if (this.finishOrder.length > 0) {
      const last = this.finishOrder[this.finishOrder.length - 1];
      const p = last.body.getPosition();
      this.camera.followLeader(p.x, p.y);
    }
  }

  // ─── HUD Updates ─────────────────────────────

  private updateTimerBar(progress: number): void {
    if (!this.timerBar) return;
    const barWidth = DESIGN_WIDTH - 28;
    this.timerBar.clear();
    if (progress <= 0) return;
    const color = progress > 0.35 ? COLORS.gold : COLORS.primary;
    this.timerBar.rect(14, 10, barWidth * progress, 7);
    this.timerBar.fill({ color, alpha: 0.9 });
  }

  private setPhaseLabel(text: string): void {
    if (this.phaseLabel) this.phaseLabel.text = text;
  }

  // ─── Events ───────────────────────────────────

  private tickEvents(): void {
    const raceTime = this.totalElapsed - COUNTDOWN_SEC;

    if (!this.eventsFired.lastBooster && raceTime >= RACE_EVT.lastBooster) {
      this.eventsFired.lastBooster = true;
      if (Math.random() < 0.4) this.fireLastBooster();
    }
    if (!this.eventsFired.leadLightning && raceTime >= RACE_EVT.leadLightning) {
      this.eventsFired.leadLightning = true;
      if (Math.random() < 0.3) this.fireLeadLightning();
    }

  }

  private fireLastBooster(): void {
    const sorted = this.getSortedByProgress().filter(m => !m.isDummy);
    const last = sorted[sorted.length - 1];
    if (!last) return;

    const vel = last.body.getLinearVelocity();
    last.body.setLinearVelocity(new Vec2(vel.x * 1.1, vel.y + 150));

    const pos = last.body.getPosition();
    this.spawnWorldFlash(pos.x, pos.y, COLORS.brightGreen, 20);
    this.setPhaseLabel('🚀 꼴찌 부스터!');
    this.pendingTimers.push(setTimeout(() => { if (this.phase !== 'done') this.setPhaseLabel(''); }, 1500));
    this.shaker.shake(this.worldContainer, 2, 3);
  }

  private fireLeadLightning(): void {
    const sorted = this.getSortedByProgress().filter(m => !m.isDummy);
    const leader = sorted[0];
    if (!leader) return;

    const pos = leader.body.getPosition();
    leader.body.applyForce(
      new Vec2((Math.random() - 0.5) * 2, -1),
      pos,
      true,
    );

    this.spawnWorldFlash(pos.x, pos.y - 20, COLORS.gold, 20);
    this.setPhaseLabel('⚡ 선두 낙뢰!');
    this.pendingTimers.push(setTimeout(() => { if (this.phase !== 'done') this.setPhaseLabel(''); }, 1500));
    this.shaker.shake(this.worldContainer, 4, 5);
  }


  private spawnWorldFlash(x: number, y: number, color: number, frames: number): void {
    const g = new Graphics();
    g.circle(0, 0, 16);
    g.fill({ color, alpha: 0.7 });
    g.position.set(x, y);
    this.worldContainer.addChild(g);
    this.flashes.push({ gfx: g, framesLeft: frames, total: frames });
  }

  private tickFlashes(): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f) continue;
      f.framesLeft--;
      f.gfx.alpha = f.framesLeft / f.total;
      if (f.framesLeft <= 0) {
        f.gfx.parent?.removeChild(f.gfx);
        f.gfx.destroy();
        this.flashes.splice(i, 1);
      }
    }
  }

  // ─── Phase Handlers ──────────────────────────

  private startCountdown(): void {
    this.countdown = new CountdownEffect(this.container, this._scaleInfo ?? undefined);
    this.countdown.play(() => {
      this.phase = 'racing';
      this.countdown = null;
      this.totalElapsed = COUNTDOWN_SEC;
      this.sound?.play('race-start');
    });
  }

  private enterSlowmo(): void {
    this.phase = 'slowmo';
    this.setPhaseLabel('🎬 슬로우모션');
    this.sound?.play('slowmo');
    this.slowMo = new SlowMotionEffect(this.container, this._scaleInfo ?? undefined);
    this.slowMo.activate(0.4);
    this.shaker.shake(this.container, 7, 10);

    if (this.camera) this.camera.resumeAutoTracking();
  }

  private endRace(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    // Write final state for Playwright tests — update() exits early after phase='done'
    const win = window as unknown as Record<string, unknown>;
    win.__MARBLE_STATE__ = {
      phase: 'done',
      elapsedTime: this.totalElapsed * 1000,
      marbles: this.marbles.map(m => {
        const p = m.body.getPosition();
        const v = m.body.getLinearVelocity();
        const visited = this.sectionsVisited.get(m);
        const branchSec4 = visited?.has('sec4-fast') ? 'fast' : visited?.has('sec4-safe') ? 'safe' : null;
        const branchSec7 = visited?.has('sec7-vortex') ? 'vortex' : visited?.has('sec7-sprint') ? 'sprint' : null;
        return {
          id: m.player.id,
          name: m.player.name,
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(v.x),
          vy: Math.round(v.y),
          finished: m.finished,
          finishX: m.finished ? Math.round(p.x) : null,
          finishY: m.finished ? Math.round(p.y) : null,
          outOfBounds: m.retired,
          retired: m.retired,
          isDummy: m.isDummy,
          stuckTime: 0,
          sectionsVisited: visited ? Array.from(visited) : [],
          branch: { sec4: branchSec4, sec7: branchSec7 },
        };
      }),
      finishedCount: this.finishOrder.length,
      outOfBoundsCount: this.marbles.filter(m => m.retired).length,
      stuckEvents: 0,
      totalMarbles: this.marbles.length,
    };
    win.__MARBLE_DEBUG__ = win.__MARBLE_STATE__;
    this.slowMo?.deactivate();
    this.sound?.play('finish');

    const rankings = this.buildRankings();
    this.endCallback?.({
      mode: 'marble',
      rankings,
      seed: this.config?.seed ?? 0,
      pickMode: this.config!.pickMode,
    });
  }

  // ─── Runtime helpers ─────────────────────────

  private getSortedByProgress(): Marble[] {
    return [...this.marbles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.body.getPosition().y - a.body.getPosition().y;
    });
  }

  private checkRankChanges(sorted: Marble[]): void {
    if (this.prevRankIds.length !== sorted.length) return;
    for (let newRank = 0; newRank < sorted.length; newRank++) {
      const marble = sorted[newRank];
      if (!marble) continue;
      const oldRank = this.prevRankIds.indexOf(marble.player.id);
      if (oldRank !== -1 && Math.abs(oldRank - newRank) >= 2) {
        this.shaker.shake(this.worldContainer, 3, 4);
        break;
      }
    }
  }

  private updateRankLabels(sorted: Marble[]): void {
    let realRank = 0;
    let leaderId = -1;
    for (const marble of sorted) {
      const idx = this.marbles.indexOf(marble);
      const label = this.rankLabels[idx];
      if (!label) continue;

      if (marble.isDummy) {
        label.visible = false;
        marble.setLeader(false);
      } else {
        realRank++;
        label.text = `${realRank}위`;
        label.x = marble.container.x;
        label.y = marble.container.y - marble.radius - 4;
        label.visible = !marble.retired;

        // 1등 구슬 글로우
        if (realRank === 1 && !marble.retired) {
          leaderId = idx;
          marble.setLeader(true);
        } else {
          marble.setLeader(false);
        }
      }
    }
    void leaderId;
  }

  private uniqueFinishedPlayerCount(): number {
    return new Set(
      this.finishOrder
        .filter(m => !m.isDummy)
        .map((m) => m.player.id),
    ).size;
  }

  private checkStuckMarbles(_dt: number): void {
    if (this.phase === 'countdown' || this.phase === 'done') return;

    for (const marble of this.marbles) {
      if (marble.finished || marble.retired) {
        this.stuckPositions.delete(marble);
        continue;
      }

      const pos = marble.body.getPosition();

      const prev = this.stuckPositions.get(marble);
      if (!prev) {
        this.stuckPositions.set(marble, { x: pos.x, y: pos.y, time: this.totalElapsed });
        continue;
      }

      const elapsed = this.totalElapsed - prev.time;
      const dy = Math.abs(pos.y - prev.y);
      const dx = Math.abs(pos.x - prev.x);
      const moved = dy >= 40 || dx >= 80;

      if (moved) {
        // 충분히 이동 → 타이머 리셋
        this.stuckPositions.set(marble, { x: pos.x, y: pos.y, time: this.totalElapsed });
        continue;
      }

      // 5초 정체 → 경고 로그 (디버깅용)
      if (elapsed >= STUCK_WARN_SEC && elapsed < STUCK_WARN_SEC + 1) {
        console.warn(`Marble ${marble.player.name}(id:${marble.player.id}) stuck at (${Math.round(pos.x)}, ${Math.round(pos.y)}) for ${Math.round(elapsed)}s`);
      }

      // 5초 정체 → 약한 하방 impulse (강제이동 없음, 물리 흐름 유지)
      if (elapsed >= STUCK_IMPULSE_SEC) {
        // 순간이동 금지 — impulse만 적용 (T-01 요건)
        marble.body.applyLinearImpulse(
          new Vec2((Math.random() - 0.5) * 120000, 40000 + Math.random() * 20000),
          marble.body.getPosition(),
          true,
        );
        // 타이머 리셋
        this.stuckPositions.set(marble, { x: pos.x, y: pos.y, time: this.totalElapsed });
      }
    }
  }

  private buildRankings(): RankingEntry[] {
    const sorted = this.getSortedByProgress().filter(m => !m.isDummy);
    const seen = new Set<number>();
    const result: RankingEntry[] = [];
    for (const marble of sorted) {
      if (!seen.has(marble.player.id)) {
        seen.add(marble.player.id);
        result.push({
          player: marble.player,
          rank: result.length + 1,
          finishTime: marble.finished ? marble.finishTime : undefined,
        });
      }
    }
    return result;
  }
}
