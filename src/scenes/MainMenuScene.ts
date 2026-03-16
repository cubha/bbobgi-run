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
  private players: Player[] = [];
  private onStart: ((config: GameConfig) => void) | null = null;

  private pickCards: PickModeCard[] = [];
  private modeCards: ModeCard[] = [];
  private nameInput: NameInput | null = null;
  private startBtn: Button | null = null;

  constructor(app: GameApplication) {
    super();
    this.app = app;
  }

  setStartCallback(cb: (config: GameConfig) => void): void {
    this.onStart = cb;
  }

  async init(): Promise<void> {
    this.buildBackground();
    this.buildTitle();
    this.buildPickModeSection();
    this.buildGameModeSection();
    this.buildNameInputSection();
    this.buildStartButton();
    this.animateIn();
  }

  update(_delta: number): void {
    // event-driven; no per-frame updates
  }

  override destroy(): void {
    this.nameInput?.destroy();
    this.nameInput = null;
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
          blur: 16,
          distance: 0,
          angle: 0,
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
        active: modeInfo.mode === 'horse', // Phase 1: horse only
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
  }

  // ─── Name Input Section ───────────────────────

  private buildNameInputSection(): void {
    this.container.addChild(new SectionLabel({ text: '참가자 입력', y: 586 }).container);

    const { scale, offsetY } = this.app.scaleInfo;
    const designY = 608;
    const screenY = Math.round(designY * scale + offsetY);

    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;

    this.nameInput = new NameInput({
      container: gameContainer,
      canvasOffsetY: screenY,
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
      colorEnd: 0xff6080,
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
    this.nameInput?.destroy();
    this.nameInput = null;
    this.onStart?.({
      mode: this.selectedGameMode,
      players: this.players,
      pickMode: this.selectedPickMode,
    });
  }

  // ─── Entrance Animation ───────────────────────

  private animateIn(): void {
    this.container.alpha = 0;
    gsap.to(this.container, { alpha: 1, duration: 0.35, ease: 'power2.out' });
  }

}
