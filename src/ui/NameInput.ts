import { MIN_PLAYERS, MAX_PLAYERS, PLAYER_COLORS } from '@utils/constants';
import type { Player } from '@/types';

export interface NameInputOptions {
  container: HTMLElement;
  canvasOffsetY: number;
  onChange: (players: Player[]) => void;
  initialPlayers?: Player[];
}

const toCSS = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * HTML overlay-based name input with IME support.
 * Chip-style tags with player-indexed color coding.
 */
export class NameInput {
  private readonly hostContainer: HTMLElement;
  private readonly wrapper: HTMLDivElement;
  private readonly chipContainer: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly counter: HTMLDivElement;
  private readonly onChange: (players: Player[]) => void;
  private players: Player[] = [];
  private nextId = 1;

  constructor(options: NameInputOptions) {
    this.hostContainer = options.container;
    this.onChange = options.onChange;

    // Wrapper element
    this.wrapper = document.createElement('div');
    Object.assign(this.wrapper.style, {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      top: `${options.canvasOffsetY}px`,
      width: '348px',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);

    // Chip container (scrollable when many players)
    this.chipContainer = document.createElement('div');
    Object.assign(this.chipContainer.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      marginBottom: '8px',
      maxHeight: '72px',
      overflowY: 'auto',
      scrollbarWidth: 'thin',
    } satisfies Partial<CSSStyleDeclaration>);
    this.wrapper.appendChild(this.chipContainer);

    // Input element
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = '이름 입력 후 Enter';
    this.input.maxLength = 10;
    this.input.setAttribute('autocomplete', 'off');
    Object.assign(this.input.style, {
      width: '100%',
      padding: '11px 16px',
      fontSize: '16px',
      fontFamily: 'Noto Sans KR, sans-serif',
      fontWeight: '700',
      border: '2px solid #ff2d55',
      borderRadius: '12px',
      background: '#16213e',
      color: '#ffffff',
      outline: 'none',
      boxSizing: 'border-box',
      boxShadow: '0 0 12px rgba(255,45,85,0.25), inset 0 1px 4px rgba(0,0,0,0.4)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    } satisfies Partial<CSSStyleDeclaration>);

    // Focus / blur effects
    this.input.addEventListener('focus', () => {
      this.input.style.borderColor = '#ff6080';
      this.input.style.boxShadow = '0 0 18px rgba(255,45,85,0.45), inset 0 1px 4px rgba(0,0,0,0.4)';
    });
    this.input.addEventListener('blur', () => {
      this.input.style.borderColor = '#ff2d55';
      this.input.style.boxShadow = '0 0 12px rgba(255,45,85,0.25), inset 0 1px 4px rgba(0,0,0,0.4)';
    });
    this.wrapper.appendChild(this.input);

    // Counter / hint row
    this.counter = document.createElement('div');
    Object.assign(this.counter.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '6px',
      fontSize: '12px',
      fontFamily: 'Noto Sans KR, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    const hint = document.createElement('span');
    hint.textContent = `최소 ${MIN_PLAYERS}명`;
    hint.style.color = '#aaaaaa';

    const count = document.createElement('span');
    count.style.color = '#ff2d55';
    count.style.fontWeight = '700';
    count.textContent = `0 / ${MAX_PLAYERS}명`;
    this.counter.appendChild(hint);
    this.counter.appendChild(count);
    this.wrapper.appendChild(this.counter);

    // Events
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        this.addName();
        count.textContent = `${this.players.length} / ${MAX_PLAYERS}명`;
        count.style.color = this.players.length >= MIN_PLAYERS ? '#2ecc71' : '#ff2d55';
      }
    });

    this.input.addEventListener('compositionend', () => {
      // Allow IME composition to complete
    });

    this.hostContainer.appendChild(this.wrapper);

    // Pre-populate with initial players (e.g., from replay)
    if (options.initialPlayers && options.initialPlayers.length > 0) {
      for (const player of options.initialPlayers) {
        if (this.players.length >= MAX_PLAYERS) break;
        this.players.push({ ...player });
        this.nextId = Math.max(this.nextId, player.id + 1);
        this.renderChip(player);
      }
      count.textContent = `${this.players.length} / ${MAX_PLAYERS}명`;
      count.style.color = this.players.length >= MIN_PLAYERS ? '#2ecc71' : '#ff2d55';
      this.updateInputState();
      this.onChange([...this.players]);
    }

    this.input.focus();
  }

  private addName(): void {
    const raw = this.input.value.replace(/,/g, '').trim();
    if (!raw || this.players.length >= MAX_PLAYERS) return;
    if (this.players.some((p) => p.name === raw)) {
      this.input.value = '';
      return;
    }

    const player: Player = { id: this.nextId++, name: raw };
    this.players.push(player);
    this.input.value = '';

    this.renderChip(player);
    this.updateInputState();
    this.onChange([...this.players]);
  }

  private renderChip(player: Player): void {
    const colorHex = toCSS(PLAYER_COLORS[(player.id - 1) % PLAYER_COLORS.length]);

    const chip = document.createElement('span');
    chip.dataset.playerId = String(player.id);
    Object.assign(chip.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '5px 11px',
      background: `${colorHex}22`,
      border: `1.5px solid ${colorHex}99`,
      color: '#ffffff',
      borderRadius: '20px',
      fontSize: '13px',
      fontFamily: 'Noto Sans KR, sans-serif',
      fontWeight: '700',
      animation: 'chipPop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    } satisfies Partial<CSSStyleDeclaration>);

    // Inject keyframe if not already present
    if (!document.getElementById('chip-style')) {
      const style = document.createElement('style');
      style.id = 'chip-style';
      style.textContent = `
        @keyframes chipPop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    // Rank dot
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 8px; height: 8px;
      border-radius: 50%;
      background: ${colorHex};
      flex-shrink: 0;
    `;
    chip.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    chip.appendChild(nameSpan);

    const removeBtn = document.createElement('span');
    removeBtn.textContent = '×';
    Object.assign(removeBtn.style, {
      cursor: 'pointer',
      marginLeft: '1px',
      fontSize: '15px',
      lineHeight: '1',
      color: '#aaaaaa',
      transition: 'color 0.15s',
    } satisfies Partial<CSSStyleDeclaration>);
    removeBtn.addEventListener('mouseover', () => { removeBtn.style.color = '#ff2d55'; });
    removeBtn.addEventListener('mouseout', () => { removeBtn.style.color = '#aaaaaa'; });
    removeBtn.addEventListener('click', () => this.removePlayer(player.id));
    chip.appendChild(removeBtn);

    this.chipContainer.appendChild(chip);
  }

  private removePlayer(id: number): void {
    this.players = this.players.filter((p) => p.id !== id);

    const chip = this.chipContainer.querySelector<HTMLElement>(`[data-player-id="${id}"]`);
    if (chip) {
      chip.style.transform = 'scale(0.8)';
      chip.style.opacity = '0';
      chip.style.transition = 'transform 0.15s, opacity 0.15s';
      setTimeout(() => chip.remove(), 150);
    }

    const countEl = this.counter.querySelector<HTMLElement>('span:last-child');
    if (countEl) {
      countEl.textContent = `${this.players.length} / ${MAX_PLAYERS}명`;
      countEl.style.color = this.players.length >= MIN_PLAYERS ? '#2ecc71' : '#ff2d55';
    }

    this.updateInputState();
    this.onChange([...this.players]);
  }

  private updateInputState(): void {
    if (this.players.length >= MAX_PLAYERS) {
      this.input.disabled = true;
      this.input.placeholder = `최대 ${MAX_PLAYERS}명`;
      this.input.style.borderColor = '#555555';
      this.input.style.boxShadow = 'none';
      this.input.style.opacity = '0.5';
    } else {
      this.input.disabled = false;
      this.input.placeholder = `이름 입력 후 Enter (${MIN_PLAYERS}~${MAX_PLAYERS}명)`;
      this.input.style.opacity = '1';
      this.input.focus();
    }
  }

  getPlayers(): Player[] {
    return [...this.players];
  }

  destroy(): void {
    if (this.wrapper.parentElement) {
      this.wrapper.parentElement.removeChild(this.wrapper);
    }
  }
}
