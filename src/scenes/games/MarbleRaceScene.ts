import { Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';
import { BaseScene } from '@core/BaseScene';
import { PhysicsWorld } from '@core/PhysicsWorld';
import { CameraController } from '@core/CameraController';
import { Marble, resetDummyColorIndex } from '@entities/Marble';
import { TrackBuilder } from '@maps/TrackBuilder';
import { TRACK_V2, MARBLE_RADIUS_V2, MIN_MARBLES, DUMMY_SYMBOLS } from '@maps/TrackData';
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
  SLOWMO_SEC,
  GAME_DURATION_SEC,
  FONT_DISPLAY,
} from '@utils/constants';
import type { ScaleInfo } from '@utils/responsive';

type RacePhase = 'countdown' | 'racing' | 'chaos' | 'tension' | 'slowmo' | 'done';

/** Stuck marble detection thresholds */
const STUCK = {
  speedThreshold: 0.6,   // V2 대형 맵: 속도 임계 낮춰 빠른 감지
  time1: 1.5,            // Level 1: 빠른 부드러운 힘
  time2: 3.0,            // Level 2: 강한 속도 리셋
  time3: 4.5,            // Level 3: 텔레포트
  retire: 7.0,           // Level 4: 리타이어 (8→7: 대형 맵 끼임 장기화 방지)
  wallFastTime: 0.8,     // 벽 근처 빠른 구제 (1.0→0.8)
} as const;

/** Pre-chaos event triggers (seconds after racing phase starts) */
const RACE_EVT = { lastBooster: 8, leadLightning: 16 } as const;
/** Post-chaos event triggers (seconds after chaos starts) */
const CHAOS_EVT = { lastBooster: 4, leadLightning: 7 } as const;

/**
 * Marble Race game scene — V2 대형 맵 (1200×4000px)
 * 모듈러 세그먼트 + CameraController + 더미 구슬 시스템
 */
export class MarbleRaceScene extends BaseScene {
  protected config: GameConfig | null = null;
  protected endCallback: ((result: GameResult) => void) | null = null;
  private _scaleInfo: ScaleInfo | null = null;

  private physics: PhysicsWorld | null = null;
  private trackBuilder: TrackBuilder | null = null;
  private camera: CameraController | null = null;
  private marbles: Marble[] = [];
  private finishOrder: Marble[] = [];
  private totalElapsed = 0;
  private phase: RacePhase = 'countdown';

  private countdown: CountdownEffect | null = null;
  private slowMo: SlowMotionEffect | null = null;
  private readonly shaker = new ShakeEffect();
  private chaos: ChaosEffect | null = null;

  // 컨테이너 구조: container > worldContainer (카메라 이동) + hudContainer (고정)
  private readonly worldContainer = new Container();
  private readonly marbleContainer = new Container();
  private readonly hudContainer = new Container();
  private rankLabels: Text[] = [];

  private timerBar: Graphics | null = null;
  private phaseLabel: Text | null = null;
  private miniMap: MiniMap | null = null;
  private chaosApplied = false;
  private chaosObstacles: Matter.Body[] = [];
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

  // ─── Timer cleanup ────────────────────────────
  private readonly pendingTimers: ReturnType<typeof setTimeout>[] = [];

  // ─── Public API ───────────────────────────────

  setConfig(config: GameConfig): void { this.config = config; }
  setEndCallback(cb: (result: GameResult) => void): void { this.endCallback = cb; }
  setScaleInfo(s: ScaleInfo): void { this._scaleInfo = s; }

  async init(): Promise<void> {
    if (!this.config) return;

    this.physics = new PhysicsWorld({ x: 0, y: 0.6 });

    // 컨테이너 구조 설정
    this.container.addChild(this.worldContainer);
    this.worldContainer.addChild(this.marbleContainer);
    this.container.addChild(this.hudContainer);

    // TrackBuilder로 트랙 빌드
    this.trackBuilder = new TrackBuilder(TRACK_V2, this.physics, this.worldContainer);
    this.trackBuilder.build();

    // CameraController 설정
    this.camera = new CameraController(
      this.worldContainer,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      TRACK_V2.worldWidth,
      TRACK_V2.worldHeight,
    );
    this.camera.setupDrag(this.hudContainer, () => this._scaleInfo?.scale ?? 1);

    this.buildMarbles();
    this.buildHUD();
    this.buildRankLabels();
    this.setupCollisionDetection();

    // 미니맵 (hudContainer에 추가 — 화면 고정)
    this.miniMap = new MiniMap(this.hudContainer, TRACK_V2.worldWidth, TRACK_V2.worldHeight);

    this.startCountdown();
  }

  update(delta: number): void {
    if (this.phase === 'done' || !this.physics) return;

    const dt = delta / 60;
    this.totalElapsed += dt;

    if (this.phase === 'countdown') return;

    // Phase transitions
    if (this.totalElapsed >= GAME_DURATION_SEC) {
      this.endRace();
      return;
    }
    const playerCount = this.config!.players.filter(p => !p.isDummy).length;
    const lastPickSlowmo = this.config!.pickMode === 'last'
      && this.uniqueFinishedPlayerCount() >= playerCount - 1;
    if (this.phase !== 'slowmo' && (this.totalElapsed >= SLOWMO_SEC || lastPickSlowmo)) {
      this.enterSlowmo();
    } else if (this.phase === 'chaos' && this.totalElapsed >= TENSION_SEC) {
      this.phase = 'tension';
      this.setPhaseLabel('');
      this.removeChaosObstacles();
    } else if (!this.chaosApplied && this.totalElapsed >= CHAOS_SEC) {
      this.applyChaos();
    }

    // Event scheduler
    this.tickEvents();

    // 1. Pre-physics: 벽 클램핑
    const bounds = this.trackBuilder!.getTrackBounds();
    const marbleR = MARBLE_RADIUS_V2;
    const boundsMinX = bounds.minX + marbleR + 2;
    const boundsMaxX = bounds.maxX - marbleR - 2;
    for (const marble of this.marbles) {
      if (!marble.retired) marble.clampToBounds(boundsMinX, boundsMaxX);
    }

    // 2. Physics step — slowmo는 프레임 스킵 방식 (Issue #303 회피)
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

      const pos = marble.body.position;
      if (pos.y < -100 || pos.y > TRACK_V2.worldHeight + 100) {
        marble.markRetired();
      }
    }

    // Stuck marble detection & rescue
    this.checkStuckMarbles(dt);

    // Camera — 상위 구슬 위치로 추적
    this.updateCameraTracking();
    this.camera!.update();

    // Culling
    this.cullSegments();

    // 미니맵 업데이트
    if (this.miniMap && this.camera) {
      const marbleInfos = this.marbles
        .filter(m => !m.retired)
        .map(m => ({
          x: m.body.position.x,
          y: m.body.position.y,
          color: m.color,
          isDummy: m.isDummy,
        }));
      this.miniMap.update(marbleInfos, this.camera.getViewBounds(), TRACK_V2.finishY);
    }

    // Fade flash overlays
    this.tickFlashes();

    // Timer bar
    const raceElapsed = this.totalElapsed - COUNTDOWN_SEC;
    const raceTotal = GAME_DURATION_SEC - COUNTDOWN_SEC;
    const progress = Math.max(0, Math.min(1, 1 - raceElapsed / raceTotal));
    this.updateTimerBar(progress);

    // Rankings
    const sorted = this.getSortedByProgress();
    this.checkRankChanges(sorted);
    this.prevRankIds = sorted.map((m) => m.player.id);
    this.updateRankLabels(sorted);

    // 종료 조건: 꼴등뽑기 N-1명, 그 외 전원 완주
    const endThreshold = this.config!.pickMode === 'last'
      ? playerCount - 1
      : playerCount;
    if (this.uniqueFinishedPlayerCount() >= endThreshold) this.endRace();
  }

  override destroy(): void {
    this.miniMap?.destroy();
    this.miniMap = null;
    this.camera?.destroy();
    this.camera = null;
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.length = 0;
    this.countdown?.destroy();
    this.slowMo?.destroy();
    this.chaos?.destroy();
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
    const realPlayers = players.filter(p => !p.isDummy);
    const allPlayers = this.ensureMinMarbles(realPlayers);

    const cx = TRACK_V2.worldWidth / 2;
    const startY = TRACK_V2.startY;
    const totalMarbles = allPlayers.length;
    const spacing = Math.min(24, (TRACK_V2.worldWidth * 0.4) / totalMarbles);

    allPlayers.forEach((player, idx) => {
      const offset = (idx - (totalMarbles - 1) / 2) * spacing;
      const marble = new Marble(
        player,
        cx + offset,
        startY + 10,
        MARBLE_RADIUS_V2,
      );
      this.physics!.addBodies(marble.body);
      this.marbles.push(marble);
      this.marbleContainer.addChild(marble.container);
    });

    this.prevRankIds = allPlayers.map((p) => p.id);
  }

  /** 최소 구슬 수 보장 — 부족하면 더미 구슬 추가 */
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

    this.physics.onCollisionStart((event) => {
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const sensor = bodies.find((b) => b.label === 'finish');
        const marbleBody = bodies.find((b) => b !== sensor && !b.isStatic);

        if (sensor && marbleBody) {
          const marble = this.marbles.find((m) => m.body === marbleBody);
          if (marble && !marble.finished) {
            marble.markFinished(this.totalElapsed);
            this.finishOrder.push(marble);
          }
        }
      }
    });
  }

  // ─── Camera ────────────────────────────────────

  private updateCameraTracking(): void {
    if (!this.camera) return;

    const active = this.marbles.filter((m) => !m.finished && !m.retired);

    if (active.length > 0) {
      // 진행도 상위 3개 구슬 위치로 그룹 추적
      const sorted = active.sort((a, b) => b.body.position.y - a.body.position.y);
      const top = sorted.slice(0, 3).map(m => ({
        x: m.body.position.x,
        y: m.body.position.y,
      }));
      this.camera.followGroup(top);
    } else if (this.finishOrder.length > 0) {
      const last = this.finishOrder[this.finishOrder.length - 1];
      this.camera.followLeader(last.body.position.x, last.body.position.y);
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

  /** 꼴찌 구슬에 속도 부스터 적용 (더미 제외) */
  private fireLastBooster(): void {
    const sorted = this.getSortedByProgress().filter(m => !m.isDummy);
    const last = sorted[sorted.length - 1];
    if (!last) return;

    const vel = last.body.velocity;
    Matter.Body.setVelocity(last.body, { x: vel.x * 1.1, y: vel.y + 1.5 });

    this.spawnWorldFlash(last.body.position.x, last.body.position.y, COLORS.brightGreen, 20);
    this.setPhaseLabel('🚀 꼴찌 부스터!');
    this.pendingTimers.push(setTimeout(() => { if (this.phase !== 'done') this.setPhaseLabel(''); }, 1500));
    this.shaker.shake(this.worldContainer, 2, 3);
  }

  /** 선두 구슬에 상방 충격량 적용 (더미 제외) */
  private fireLeadLightning(): void {
    const sorted = this.getSortedByProgress().filter(m => !m.isDummy);
    const leader = sorted[0];
    if (!leader) return;

    Matter.Body.applyForce(leader.body, leader.body.position, { x: (Math.random() - 0.5) * 0.02, y: -0.01 });

    this.spawnWorldFlash(leader.body.position.x, leader.body.position.y - 20, COLORS.gold, 20);
    this.setPhaseLabel('⚡ 선두 낙뢰!');
    this.pendingTimers.push(setTimeout(() => { if (this.phase !== 'done') this.setPhaseLabel(''); }, 1500));
    this.shaker.shake(this.worldContainer, 4, 5);
  }

  /** 화면 중심에서 방사형 힘 + 플래시 */
  private fireExplosion(): void {
    if (!this.camera) return;
    const center = this.camera.getCenter();

    for (const marble of this.marbles) {
      if (marble.finished) continue;
      const dx = marble.body.position.x - center.x;
      const dy = marble.body.position.y - center.y;
      const dist = Math.max(10, Math.sqrt(dx * dx + dy * dy));
      const force = Math.min(0.05, 0.12 / dist);
      Matter.Body.applyForce(marble.body, marble.body.position, {
        x: dx * force,
        y: dy * force,
      });
    }

    // Screen-space flash overlay
    const flash = new Graphics();
    flash.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    flash.fill({ color: COLORS.primary, alpha: 0.35 });
    this.hudContainer.addChild(flash);
    this.flashes.push({ gfx: flash, framesLeft: 12, total: 12 });

    this.shaker.shake(this.container, 8, 8);
  }

  /** Dot flash at a world-space position (scrolls with track) */
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

    // 카오스 이벤트: 50% 횡풍 OR 50% 폭발+장애물
    if (Math.random() < 0.5) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.physics.setGravity(dir * 0.3, 0.6);
      this.pendingTimers.push(setTimeout(() => {
        if (this.physics && this.phase !== 'done') this.physics.setGravity(0, 0.6);
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
        const body = PhysicsWorld.createWall(pos.x, pos.y, 100, 12, {
          angle: pos.angle,
          restitution: 0.8,
        });
        this.physics.addBodies(body);
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
    this.physics.setGravity(0, 0.6);

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

    // 슬로모 진입 시 리더 추적으로 전환
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

  /** 진행도 정렬 (더미 포함, finished 우선) */
  private getSortedByProgress(): Marble[] {
    return [...this.marbles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.body.position.y - a.body.position.y;
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
    // 더미가 아닌 구슬만 순위 표시, 더미 포함 전체 인덱스 유지
    let realRank = 0;
    for (const marble of sorted) {
      const idx = this.marbles.indexOf(marble);
      const label = this.rankLabels[idx];
      if (!label) continue;

      if (marble.isDummy) {
        label.visible = false;
      } else {
        realRank++;
        label.text = `${realRank}위`;
        label.x = marble.container.x;
        label.y = marble.container.y - marble.radius - 4;
        label.visible = !marble.retired;
      }
    }
  }

  /** 완주한 고유 플레이어 수 (더미 제외, marbleCount > 1 중복 제거) */
  private uniqueFinishedPlayerCount(): number {
    return new Set(
      this.finishOrder
        .filter(m => !m.isDummy)
        .map((m) => m.player.id),
    ).size;
  }

  /**
   * 끼임 구슬 감지 및 단계별 해소.
   */
  private checkStuckMarbles(dt: number): void {
    if (this.phase === 'countdown' || this.phase === 'done') return;

    const bounds = this.trackBuilder!.getTrackBounds();
    const minX = bounds.minX + 10;
    const maxX = bounds.maxX - 10;
    const cx = TRACK_V2.worldWidth / 2;
    const wallZone = 30;

    for (const marble of this.marbles) {
      if (marble.finished) {
        this.stuckTimers.delete(marble);
        continue;
      }

      const vel = marble.body.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

      if (speed < STUCK.speedThreshold) {
        const prev = this.stuckTimers.get(marble) ?? 0;
        const next = prev + dt;
        this.stuckTimers.set(marble, next);

        const pos = marble.body.position;
        const nearWall = pos.x < minX + wallZone || pos.x > maxX - wallZone;

        // 벽 근처 빠른 구제
        if (nearWall && next >= STUCK.wallFastTime && prev < STUCK.wallFastTime) {
          const dir = pos.x < cx ? 1 : -1;
          Matter.Body.setVelocity(marble.body, { x: dir * 3, y: 2 });
        }

        if (next >= STUCK.retire) {
          marble.markRetired();
          this.stuckTimers.delete(marble);
          continue;
        } else if (next >= STUCK.time3) {
          // 분기 구간 인식: 좌/우 경로 중 현재 위치에 가까운 쪽으로 재배치
          const inSplit1 = pos.y >= 640 && pos.y <= 1400;  // Zone 3: 1차 분기
          const inSplit2 = pos.y >= 2880 && pos.y <= 3400; // Zone 6: 2차 분기
          let newX: number;
          if (inSplit1 || inSplit2) {
            // 분기 구간: 현재 위치에서 가까운 경로 중심으로 재배치
            newX = pos.x < cx ? cx - 200 : cx + 200;
            newX += (Math.random() - 0.5) * 60;
          } else {
            newX = cx + (Math.random() - 0.5) * 150;
          }
          const newY = Math.max(TRACK_V2.startY, pos.y - 60);
          Matter.Body.setPosition(marble.body, { x: newX, y: newY });
          Matter.Body.setVelocity(marble.body, {
            x: (Math.random() - 0.5) * 3,
            y: 2.5,
          });
          this.stuckTimers.set(marble, 0);
        } else if (next >= STUCK.time2 && prev < STUCK.time2) {
          const dir = pos.x < cx ? 1 : -1;
          Matter.Body.setVelocity(marble.body, { x: dir * 2.5, y: 3.5 });
        } else if (next >= STUCK.time1 && prev < STUCK.time1) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          Matter.Body.applyForce(marble.body, marble.body.position, {
            x: dir * 0.005,
            y: 0.008,
          });
        }
      } else {
        this.stuckTimers.delete(marble);
      }
    }
  }

  /**
   * 플레이어별 최고 결과로 중복 제거한 최종 랭킹 (더미 제외).
   */
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
