import { useAppStore } from '../state/store';
import type { AppState } from '../state/store';

export type HoverTarget = AppState['hovered'];

let pointerCursor = false;

/** Report hover to the store (only on change) and keep the cursor in sync. */
export function setHover(next: HoverTarget): void {
  const s = useAppStore.getState();
  if (s.hovered !== next) s.setHovered(next);
  const want = next !== null;
  if (want !== pointerCursor) {
    pointerCursor = want;
    document.body.style.cursor = want ? 'pointer' : '';
  }
}

export function isRunning(): boolean {
  return useAppStore.getState().phase === 'running';
}
