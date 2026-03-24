import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from '@core/BaseScene';
import type { GameApplication } from '@core/Application';
import type { GameMode, GameConfig, Player, PickMode } from '@/types';
import { GAME_MODES } from '@/types';
import { COLORS, DESIGN_WIDTH, MIN_PLAYERS, FONT_DISPLAY, FONT_BODY } from '@utils/constants';
import { Button } from '@ui/Button';
import { PickModeCard } from '@ui/PickModeCard';
import { ModeCard } from '@ui/ModeCard';
import { NameInput } from '@ui/NameInput';
import { DotGridBackground } from '@ui/DotGridBackground';
import { SectionLabel } from '@ui/SectionLabel';

/**
 * Main menu scene — pick mode → game mode → name input → start.
 */
export class MainMenuScene extends BaseScene {
  private readonly app: GameApplication;
  private selectedPickMode: PickMode = 'first';
  private selectedGameMode: GameMode = 'horse';
  private selectedBallCount: number = 1;
  private selectedLapCount: number = 2;
  private players: Player[] = [];
  private onStart: ((config: GameConfig) => void) | null = null;

  private pickCards: PickModeCard[] = [];
  private modeCards: ModeCard[] = [];
  private ballCountContainer: Container | null = null;
  private ballCountBtns: Graphics[] = [];
  private lapCountContainer: Container | null = null;
  private lapDropdown: HTMLSelectElement | null = null;
  private nameInput: NameInput | null = null;
  private startBtn: Button | null = null;
  private initialPlayers: Player[] = [];
  private initialConfig: GameConfig | null = null;

  constructor(app: GameApplication) {
    super();
    this.app = app;
  }

  setStartCallback(cb: (config: GameConfig) => void): void {
    this.onStart = cb;
  }

  setInitialPlayers(players: Player[]): void {
    this.initialPlayers = players;
  }

  setInitialConfig(config: GameConfig): void {
    this.initialConfig = config;
  }

  async init(): Promise<void> {
    if (this.initialConfig) {
      this.selectedPickMode = this.initialConfig.pickMode;
      this.selectedGameMode = this.initialConfig.mode;
      if (this.initialConfig.ballCount != null) this.selectedBallCount = this.initialConfig.ballCount;
      if (this.initialConfig.lapCount != null) this.selectedLapCount = this.initialConfig.lapCount;
    }
    this.buildBackground();
    this.buildTitle();
    this.buildPickModeSection();
    this.buildGameModeSection();
    this.buildBallCountSection();
    this.buildLapCountSection();
    this.buildNameInputSection();
    this.buildStartButton();
    this.updateStartButton();
    this.animateIn();
  }

  update(_delta: number): void {
    // event-driven; no per-frame updates
  }

  override destroy(): void {
    gsap.killTweensOf(this.container);
    this.nameInput?.destroy();
    this.nameInput = null;
    this.lapDropdown?.remove();
    this.lapDropdown = null;
    super.destroy();
  }

  // ─── Background ──────────────────────────────

  private buildBackground(): void {
    const bg = new DotGridBackground({ showBottomBar: true });
    this.container.addChild(bg.container);
  }

  // ─── Title ───────────────────────────────────

  private buildTitle(): void {
    // Title glow backdrop
    const titleGlow = new Graphics();
    titleGlow.ellipse(DESIGN_WIDTH / 2, 42, 130, 32);
    titleGlow.fill({ color: COLORS.primary, alpha: 0.08 });
    this.container.addChild(titleGlow);

    const title = new Text({
      text: '뽑기런',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 44,
        fill: COLORS.text,
        dropShadow: {
          color: COLORS.primary,
          blur: 0,
          distance: 2,
          angle: Math.PI / 2,
          alpha: 0.6,
        },
      },
    });
    title.anchor.set(0.5, 0);
    title.x = DESIGN_WIDTH / 2;
    title.y = 16;
    this.container.addChild(title);

    const subtitle = new Text({
      text: '누가 당할까? 지금 뽑아보자!',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: '700',
        fill: COLORS.textDim,
        letterSpacing: 1,
      },
    });
    subtitle.anchor.set(0.5, 0);
    subtitle.x = DESIGN_WIDTH / 2;
    subtitle.y = 68;
    this.container.addChild(subtitle);

    // Decorative divider under title
    const divider = new Graphics();
    divider.rect(DESIGN_WIDTH / 2 - 30, 88, 60, 2);
    divider.fill({ color: COLORS.primary, alpha: 0.5 });
    this.container.addChild(divider);
  }

  // ─── Pick Mode Section ────────────────────────

  private buildPickModeSection(): void {
    this.container.addChild(new SectionLabel({ text: '뽑기 모드', y: 96 }).container);

    const picksContainer = new Container();
    picksContainer.y = 114;
    picksContainer.x = 8;

    const modes: PickMode[] = ['first', 'last'];
    modes.forEach((mode, i) => {
      const card = new PickModeCard({
        pickMode: mode,
        selected: mode === this.selectedPickMode,
        onClick: (m) => this.selectPickMode(m),
      });
      card.container.x = i * 187 + 3;
      picksContainer.addChild(card.container);
      this.pickCards.push(card);
    });

    this.container.addChild(picksContainer);
  }

  private selectPickMode(mode: PickMode): void {
    this.selectedPickMode = mode;
    this.pickCards.forEach((c, i) =>
      c.setSelected((['first', 'last'] as PickMode[])[i] === mode),
    );
  }

  // ─── Game Mode Section ────────────────────────

  private buildGameModeSection(): void {
    this.container.addChild(new SectionLabel({ text: '게임 모드', y: 290 }).container);

    const modesContainer = new Container();
    modesContainer.y = 308;
    modesContainer.x = 8;

    GAME_MODES.forEach((modeInfo, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const card = new ModeCard({
        modeInfo,
        selected: modeInfo.mode === this.selectedGameMode,
        active: true,
        onClick: (m) => this.selectGameMode(m),
      });
      card.container.x = col * 187 + 3;
      card.container.y = row * 138;
      modesContainer.addChild(card.container);
      this.modeCards.push(card);
    });

    this.container.addChild(modesContainer);
  }

  private selectGameMode(mode: GameMode): void {
    this.selectedGameMode = mode;
    GAME_MODES.forEach((m, i) =>
      this.modeCards[i]?.setSelected(m.mode === mode),
    );
    if (this.ballCountContainer) {
      this.ballCountContainer.visible = mode === 'pachinko';
    }
    if (this.lapCountContainer) {
      this.lapCountContainer.visible = mode === 'horse';
    }
    if (this.lapDropdown) {
      this.lapDropdown.style.display = mode === 'horse' ? '' : 'none';
    }
  }

  // ─── Ball Count Section ───────────────────────

  private buildBallCountSection(): void {
    const ctr = new Container();
    ctr.visible = this.selectedGameMode === 'pachinko';
    this.container.addChild(ctr);
    this.ballCountContainer = ctr;

    ctr.addChild(new SectionLabel({ text: '공 개수', y: 584 }).container);

    const counts = [1, 2, 3];
    counts.forEach((n, i) => {
      const bg = new Graphics();
      bg.x = 16 + i * 110;
      bg.y = 604;
      bg.eventMode = 'static';
      bg.cursor = 'pointer';
      bg.on('pointertap', () => this.selectBallCount(n));
      ctr.addChild(bg);
      this.ballCountBtns.push(bg);

      this.drawBallCountBtn(bg, n, n === this.selectedBallCount);
    });
  }

  private drawBallCountBtn(bg: Graphics, n: number, selected: boolean): void {
    bg.clear();
    bg.rect(0, 0, 100, 36);
    bg.fill({ color: selected ? COLORS.primary : COLORS.secondary, alpha: selected ? 1 : 0.7 });
    bg.rect(0, 0, 100, 36);
    bg.stroke({ color: selected ? COLORS.pink : COLORS.darkGray, width: 2, alpha: 0.8 });

    const label = new Text({
      text: `${n}개`,
      style: { fontFamily: FONT_DISPLAY, fontSize: 16, fill: COLORS.text, fontWeight: 'bold' },
    });
    label.anchor.set(0.5);
    label.x = 50;
    label.y = 18;
    bg.addChild(label);
  }

  private selectBallCount(n: number): void {
    this.selectedBallCount = n;
    this.ballCountBtns.forEach((bg, i) => {
      // Remove old label children before redraw
      while (bg.children.length > 0) bg.removeChildAt(0);
      this.drawBallCountBtn(bg, i + 1, i + 1 === n);
    });
  }

  // ─── Lap Count Section (Horse Racing) ─────────

  private buildLapCountSection(): void {
    const ctr = new Container();
    ctr.visible = this.selectedGameMode === 'horse';
    this.container.addChild(ctr);
    this.lapCountContainer = ctr;

    ctr.addChild(new SectionLabel({ text: '바퀴 수', y: 584 }).container);

    const { scale, offsetX, offsetY } = this.app.scaleInfo;
    const designX = 16;
    const designY = 604;
    const designW = 358;
    const designH = 38;

    const select = document.createElement('select');
    select.style.cssText = [
      `position: fixed`,
      `left: ${Math.round(designX * scale + offsetX)}px`,
      `top: ${Math.round(designY * scale + offsetY)}px`,
      `width: ${Math.round(designW * scale)}px`,
      `height: ${Math.round(designH * scale)}px`,
      `font-size: ${Math.round(16 * scale)}px`,
      `font-family: monospace`,
      `background: #1a1a2e`,
      `color: #ffffff`,
      `border: 2px solid #ff2d78`,
      `border-radius: ${Math.round(6 * scale)}px`,
      `padding: 0 ${Math.round(8 * scale)}px`,
      `cursor: pointer`,
      `outline: none`,
      `appearance: none`,
      `-webkit-appearance: none`,
      `z-index: 10`,
    ].join(';');

    for (let n = 1; n <= 10; n++) {
      const opt = document.createElement('option');
      opt.value = `${n}`;
      opt.text = `${n}바퀴`;
      if (n === this.selectedLapCount) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      this.selectedLapCount = parseInt(select.value, 10);
    });

    const gameContainer = document.getElementById('game-container');
    (gameContainer ?? document.body).appendChild(select);
    this.lapDropdown = select;

    if (this.selectedGameMode !== 'horse') select.style.display = 'none';
  }

  // ─── Name Input Section ───────────────────────

  private buildNameInputSection(): void {
    this.container.addChild(new SectionLabel({ text: '참가자 입력', y: 648 }).container);

    const { scale, offsetY } = this.app.scaleInfo;
    const designY = 668;
    const screenY = Math.round(designY * scale + offsetY);

    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;

    this.nameInput = new NameInput({
      container: gameContainer,
      canvasOffsetY: screenY,
      initialPlayers: this.initialPlayers,
      onChange: (players) => {
        this.players = players;
        this.updateStartButton();
      },
    });
  }

  // ─── Start Button ─────────────────────────────

  private buildStartButton(): void {
    const btn = new Button({
      label: '게임 시작!',
      width: 366,
      height: 54,
      color: COLORS.primary,
      onClick: () => this.handleStart(),
    });
    btn.container.x = 12;
    btn.container.y = 770;
    btn.disable();
    this.container.addChild(btn.container);
    this.startBtn = btn;
  }

  private updateStartButton(): void {
    if (this.players.length >= MIN_PLAYERS) {
      this.startBtn?.enable();
    } else {
      this.startBtn?.disable();
    }
  }

  private handleStart(): void {
    if (this.players.length < MIN_PLAYERS) return;
    this.startGame();
  }

  private startGame(): void {
    this.onStart?.({
      mode: this.selectedGameMode,
      players: this.players,
      pickMode: this.selectedPickMode,
      ballCount: this.selectedBallCount,
      lapCount: this.selectedLapCount,
      seed: Date.now(),
    });
  }

  // ─── Entrance Animation ───────────────────────

  private animateIn(): void {
    this.container.alpha = 0;
    gsap.to(this.container, { alpha: 1, duration: 0.35, ease: 'power2.out' });
  }

}
