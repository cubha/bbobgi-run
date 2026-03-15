/**
 * Unified touch/click input manager.
 * Normalizes pointer events across desktop and mobile.
 */
export class InputManager {
  private listeners: Array<{ el: EventTarget; type: string; fn: EventListener }> = [];

  /** Add a pointer down listener to an element */
  onPointerDown(el: EventTarget, callback: (x: number, y: number) => void): void {
    const fn = (e: Event) => {
      const pe = e as PointerEvent;
      callback(pe.clientX, pe.clientY);
    };
    el.addEventListener('pointerdown', fn);
    this.listeners.push({ el, type: 'pointerdown', fn });
  }

  /** Clean up all listeners */
  destroy(): void {
    for (const { el, type, fn } of this.listeners) {
      el.removeEventListener(type, fn);
    }
    this.listeners = [];
  }
}
