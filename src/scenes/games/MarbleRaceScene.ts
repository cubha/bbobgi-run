import { Container, Graphics, Text } from 'pixi.js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld, Vec2, type Body, type Contact } from '@core/PhysicsWorld';
import { CameraController } from '@core/CameraController';
import { Marble, resetDummyColorIndex } from '@entities/Marble';
import { TrackBuilder } from '@maps/TrackBuilder';
import { MarbleProgress } from '@maps/MarbleProgress';
import { TRACK_V3, MARBLE_RADIUS_V3, MIN_MARBLES, DUMMY_SYMBOLS } from '@maps/TrackData';
import { CountdownEffect } from '@effects/CountdownEffect';
import { SlowMotionEffect } from '@effects/SlowMotionEffect';
import { ShakeEffect } from '@effects/ShakeEffect';
import { ChaosEffect } from '@effects/ChaosEffect';
import { MiniMap } from '@ui/MiniMap';
import type { GameConfig, GameResult, Player, RankingEntry } from '@/types';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  COLORS,
  COUNTDOWN_SEC,
  CHAOS_SEC,
  TENSION_SEC,
  FONT_DISPLAY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

type RacePhase = 'countdown' | 'racing' | 'chaos' | 'tension' | 'slowmo' | 'done';

/** Stuck marble detection thresholds (Planck.js 픽셀 스케일) */
const STUCK = {
  speedThreshold: 60,
  time1: 1.5,
  time2: 3.0,
  time3: 4.5,
  retire: 7.0,
  wallFastTime: 0.8,
} as const;

/** 구슬 최대 속도 (px/s — Planck.js 스케일) */
const MAX_MARBLE_SPEED = 1800;

/** Pre-chaos event triggers (seconds after racing phase starts) */
const RACE_EVT = { lastBooster: 8, leadLightning: 16 } as const;
/** Post-chaos event triggers (seconds after chaos starts) */
const CHAOS_EVT = { lastBooster: 4, leadLightning: 7 } as const;

/**
 * Marble Race game scene — V3 대형 맵 (2400×3200px)
 * 모듈러 세그먼트 + CameraController + 더미 구슬 시스템
 */
export class MarbleRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

  private physics: PhysicsWorld | null = null;
  private trackBuilder: TrackBuilder | null = null;
  private marbleProgress: MarbleProgress | null = null;
  private camera: CameraController | null = null;
  private marbles: Marble[] = [];
  private finishOrder: Marble[] = [];
  private totalElapsed = 0;
  private phase: RacePhase = 'countdown';

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();
  private chaos: ChaosEffect | null = null;

  private readonly worldContainer = new Container();
  private readonly marbleContainer = new Container();
  private readonly hudContainer = new Container();
  private rankLabels: Text[] = [];

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private miniMap: MiniMap | null = null;
  private chaosApplied = false;
  private chaosObstacles: Body[] = [];
  private prevRankIds: number[] = [];

  // ─── Event system ─────────────────────────────
  private chaosStartTime = 0;
  private readonly eventsFired = {
    lastBooster: false,
    leadLightning: false,
    postChaosBooster: false,
    postChaosLightning: false,
  };
  private readonly flashes: Array<{ gfx: Graphics; framesLeft: number; total: number }> = [];

  // ─── Slowmo frame skip ──────────────────────────
  private slowmoFrameCounter = 0;

  // ─── Stuck detection ──────────────────────────
  private readonly stuckTimers = new Map<Marble, number>();
  /** 위치 변위 기반 stuck 감지: 10초 전 위치 기록 */
  private readonly stuckPositions = new Map<Marble, { x: number; y: number; time: number }>();

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

    this.trackBuilder = new TrackBuilder(TRACK_V3, this.physics, this.worldContainer);
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
      TRACK_V3.worldWidth,
      TRACK_V3.worldHeight,
    );
    this.camera.setupDrag(interactionLayer, () => this._scaleInfo?.scale ?? 1, canvas ?? undefined);
    this.camera.setPosition(TRACK_V3.worldWidth / 2, TRACK_V3.startY + DESIGN_HEIGHT / 2 - 100);

    this.buildMarbles();

    this.marbleProgress = new MarbleProgress(TRACK_V3, this.physics);
    this.marbleProgress.registerMarbles(this.marbles);
    this.marbleProgress.buildSensors();

    this.buildHUD();
    this.buildRankLabels();
    this.setupCollisionDetection();

    this.miniMap = new MiniMap(this.hudContainer, TRACK_V3.worldWidth, TRACK_V3.worldHeight);

    // 초기 culling (모든 세그먼트 가시 설정)
    this.cullSegments();
    this.startCountdown();
  }

  update(delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') {
      this.camera?.update();
      this.cullSegments();
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
    } else if (this.phase === 'chaos' && this.totalElapsed >= TENSION_SEC) {
      this.phase = 'tension';
      this.setPhaseLabel('');
      this.removeChaosObstacles();
    } else if (!this.chaosApplied && this.totalElapsed >= CHAOS_SEC) {
      this.applyChaos();
    }

    this.tickEvents();

    // 1. Pre-physics: 속도 상한 + 벽 클램핑
    const bounds = this.trackBuilder!.getTrackBounds();
    const marbleR = MARBLE_RADIUS_V3;
    const boundsMinX = bounds.minX + marbleR + 2;
    const boundsMaxX = bounds.maxX - marbleR - 2;
    for (const marble of this.marbles) {
      if (marble.retired) continue;
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

    // 3. Post-physics: 렌더 동기화 + out-of-bounds retire
    for (const marble of this.marbles) {
      if (marble.retired) continue;
      marble.sync();

      const pos = marble.body.getPosition();
      if (pos.y < -100 || pos.y > TRACK_V3.worldHeight + 100) {
        marble.markRetired();
      }
    }

    this.checkStuckMarbles(dt);

    this.updateCameraTracking();
    this.camera!.update();

    this.cullSegments();

    if (this.miniMap && this.camera) {
      const marbleInfos = this.marbles
        .filter(m => !m.retired)
        .map(m => {
          const p = m.body.getPosition();
          return { x: p.x, y: p.y, color: m.color, isDummy: m.isDummy };
        });
      this.miniMap.update(marbleInfos, this.camera.getViewBounds(), TRACK_V3.finishY);
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
      // 1등뽑기: 1등 결정 즉시 → 슬로모 → 잠시 후 종료
      // 꼴등뽑기: N-1명 완주 → 슬로모 → 꼴등 결정 후 종료
      if (this.phase !== 'slowmo') {
        this.enterSlowmo();
        // 슬로모 5초 후 종료 (나머지 구슬 도착 대기)
        this.pendingTimers.push(setTimeout(() => this.endRace(), 5000));
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
    this.stuckTimers.clear();
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
    this.chaos?.destroy();
    this.marbleProgress?.destroy();
    this.marbleProgress = null;
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

    const cx = TRACK_V3.worldWidth / 2;
    const startY = TRACK_V3.startY;
    const totalMarbles = allPlayers.length;
    const spacing = Math.min(24, (TRACK_V3.worldWidth * 0.4) / totalMarbles);

    allPlayers.forEach((player, idx) => {
      const offset = (idx - (totalMarbles - 1) / 2) * spacing;
      const marble = new Marble(
        player,
        cx + offset,
        startY + 10,
        MARBLE_RADIUS_V3,
        this.physics!,
      );
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
      // 체크포인트 센서 처리
      this.marbleProgress?.handleContact(contact, this.marbles);

      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();

      const labelA = (bodyA.getUserData() as { label?: string } | null)?.label ?? '';
      const labelB = (bodyB.getUserData() as { label?: string } | null)?.label ?? '';

      const isFinishA = labelA === 'finish';
      const isFinishB = labelB === 'finish';
      const sensorBody = isFinishA ? bodyA : isFinishB ? bodyB : null;
      const marbleBody = sensorBody ? (sensorBody === bodyA ? bodyB : bodyA) : null;

      if (sensorBody && marbleBody && !marbleBody.isStatic()) {
        const marble = this.marbles.find((m) => m.body === marbleBody);
        if (marble && !marble.finished) {
          marble.markFinished(this.totalElapsed);
          this.finishOrder.push(marble);
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

  // ─── Culling ──────────────────────────────────

  private cullSegments(): void {
    if (!this.camera || !this.trackBuilder) return;

    const view = this.camera.getViewBounds();
    const margin = 150;
    const viewL = view.left - margin;
    const viewR = view.right + margin;
    const viewT = view.top - margin;
    const viewB = view.bottom + margin;

    for (const seg of this.trackBuilder.getSegments()) {
      const b = seg.bounds;
      seg.container.visible =
        b.right > viewL && b.left < viewR &&
        b.bottom > viewT && b.top < viewB;
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

    if (this.chaosApplied && this.chaosStartTime > 0) {
      const chaosElapsed = this.totalElapsed - this.chaosStartTime;
      if (!this.eventsFired.postChaosBooster && chaosElapsed >= CHAOS_EVT.lastBooster) {
        this.eventsFired.postChaosBooster = true;
        if (Math.random() < 0.7) this.fireLastBooster();
      }
      if (!this.eventsFired.postChaosLightning && chaosElapsed >= CHAOS_EVT.leadLightning) {
        this.eventsFired.postChaosLightning = true;
        if (Math.random() < 0.6) this.fireLeadLightning();
      }
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

  private fireExplosion(): void {
    if (!this.camera) return;
    const center = this.camera.getCenter();

    for (const marble of this.marbles) {
      if (marble.finished) continue;
      const pos = marble.body.getPosition();
      const dx = pos.x - center.x;
      const dy = pos.y - center.y;
      const dist = Math.max(10, Math.sqrt(dx * dx + dy * dy));
      const force = Math.min(5, 12 / dist);
      marble.body.applyForce(
        new Vec2(dx * force, dy * force),
        pos,
        true,
      );
    }

    const flash = new Graphics();
    flash.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    flash.fill({ color: COLORS.primary, alpha: 0.35 });
    this.hudContainer.addChild(flash);
    this.flashes.push({ gfx: flash, framesLeft: 12, total: 12 });

    this.shaker.shake(this.container, 8, 8);
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

  private applyChaos(): void {
    if (!this.physics || !this.camera) return;
    this.chaosApplied = true;
    this.chaosStartTime = this.totalElapsed;
    this.phase = 'chaos';
    this.setPhaseLabel('💥 카오스!');
    this.sound?.play('chaos');

    this.chaos = new ChaosEffect();
    this.chaos.play(this.hudContainer, 25);
    this.shaker.shake(this.worldContainer, 5, 6);

    if (Math.random() < 0.5) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.physics.setGravity(dir * 300, 980);
      this.pendingTimers.push(setTimeout(() => {
        if (this.physics && this.phase !== 'done') this.physics.setGravity(0, 980);
      }, 600));
    } else {
      this.fireExplosion();

      const center = this.camera.getCenter();
      const obstPositions = [
        { x: center.x - 120, y: center.y - 100, angle: 0.5 },
        { x: center.x + 120, y: center.y - 50,  angle: -0.5 },
        { x: center.x - 60,  y: center.y + 80,  angle: 0.3 },
        { x: center.x + 60,  y: center.y + 150, angle: -0.3 },
      ];

      for (const pos of obstPositions) {
        const body = this.physics.createWall(pos.x, pos.y, 100, 12, {
          angle: pos.angle,
          restitution: 0.8,
        });
        this.chaosObstacles.push(body);

        const g = new Graphics();
        g.rect(-50, -6, 100, 12);
        g.fill({ color: COLORS.primary, alpha: 0.7 });
        g.position.set(pos.x, pos.y);
        g.rotation = pos.angle;
        g.label = `chaos-obstacle-${this.chaosObstacles.length - 1}`;
        this.worldContainer.addChild(g);
      }
    }
  }

  private removeChaosObstacles(): void {
    if (!this.physics) return;
    this.physics.setGravity(0, 980);

    for (const body of this.chaosObstacles) this.physics.removeBodies(body);
    this.chaosObstacles = [];

    const toRemove = this.worldContainer.children.filter(
      (c) => typeof c.label === 'string' && c.label.startsWith('chaos-obstacle'),
    );
    for (const child of toRemove) {
      this.worldContainer.removeChild(child);
      child.destroy();
    }
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
    if (this.marbleProgress) {
      return this.marbleProgress.getSortedByProgress(this.marbles);
    }
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

  private checkStuckMarbles(dt: number): void {
    if (this.phase === 'countdown' || this.phase === 'done') return;

    const bounds = this.trackBuilder!.getTrackBounds();
    const minX = bounds.minX + 10;
    const maxX = bounds.maxX - 10;
    const cx = TRACK_V3.worldWidth / 2;
    const wallZone = 30;

    for (const marble of this.marbles) {
      if (marble.finished) {
        this.stuckTimers.delete(marble);
        continue;
      }

      const vel = marble.body.getLinearVelocity();
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

      const pos = marble.body.getPosition();

      // ── 위치 변위 기반 stuck 감지 (속도 무관) ──
      const prevPos = this.stuckPositions.get(marble);
      if (!prevPos) {
        this.stuckPositions.set(marble, { x: pos.x, y: pos.y, time: this.totalElapsed });
      } else {
        const elapsed = this.totalElapsed - prevPos.time;
        if (elapsed >= 8) {
          const dx = pos.x - prevPos.x;
          const dy = pos.y - prevPos.y;
          const displacement = Math.sqrt(dx * dx + dy * dy);
          if (displacement < 100) {
            // 8초간 100px 미만 이동 → 전진 리포지션
            const cpIdx = this.marbleProgress?.getCpIndex(marble) ?? -1;
            const cps = TRACK_V3.checkpoints ?? [];
            const nextCp = cps[cpIdx + 1];
            let newX: number, newY: number;
            if (nextCp) {
              newX = nextCp.x + (Math.random() - 0.5) * 60;
              newY = nextCp.y - 30;
            } else {
              newX = cx + (Math.random() - 0.5) * 200;
              newY = Math.min(TRACK_V3.finishY - 100, pos.y + 150);
            }
            marble.body.setPosition(new Vec2(newX, newY));
            marble.body.setLinearVelocity(new Vec2((Math.random() - 0.5) * 200, 200));
          }
          this.stuckPositions.set(marble, { x: pos.x, y: pos.y, time: this.totalElapsed });
        }
      }

      // ── 속도 기반 stuck 감지 (기존 로직) ──
      if (speed < STUCK.speedThreshold) {
        const prev = this.stuckTimers.get(marble) ?? 0;
        const next = prev + dt;
        this.stuckTimers.set(marble, next);

        const nearWall = pos.x < minX + wallZone || pos.x > maxX - wallZone;

        if (nearWall && next >= STUCK.wallFastTime && prev < STUCK.wallFastTime) {
          const dir = pos.x < cx ? 1 : -1;
          marble.body.setLinearVelocity(new Vec2(dir * 300, 200));
        }

        if (next >= STUCK.retire) {
          marble.markRetired();
          this.stuckTimers.delete(marble);
          continue;
        } else if (next >= STUCK.time3) {
          // 리포지션: 다음 체크포인트 방향으로 전진
          const cpIdx = this.marbleProgress?.getCpIndex(marble) ?? -1;
          const cps = TRACK_V3.checkpoints ?? [];
          const nextCp = cps[cpIdx + 1];
          let newX: number, newY: number;
          if (nextCp) {
            newX = nextCp.x + (Math.random() - 0.5) * 80;
            newY = nextCp.y - 40;
          } else {
            newX = cx + (Math.random() - 0.5) * 150;
            newY = Math.min(TRACK_V3.finishY - 50, pos.y + 100);
          }
          marble.body.setPosition(new Vec2(newX, newY));
          marble.body.setLinearVelocity(new Vec2(
            (Math.random() - 0.5) * 300,
            250,
          ));
          this.stuckTimers.set(marble, 0);
        } else if (next >= STUCK.time2 && prev < STUCK.time2) {
          const dir = pos.x < cx ? 1 : -1;
          marble.body.setLinearVelocity(new Vec2(dir * 250, 350));
        } else if (next >= STUCK.time1 && prev < STUCK.time1) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          marble.body.applyForce(
            new Vec2(dir * 0.5, 0.8),
            pos,
            true,
          );
        }
      } else {
        this.stuckTimers.delete(marble);
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
