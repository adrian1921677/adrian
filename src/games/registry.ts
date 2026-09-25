import type { GameId } from '../data/types';

export interface GameInfo {
  id: GameId;
  title: string;
  /** One line under the title in the menu. */
  pitch: string;
  emoji: string;
}

export const GAMES: GameInfo[] = [
  { id: 'keepy', title: 'Keepy-Uppy', pitch: 'Halt den Ball in der Luft. Wie viele Kicks schaffst du?', emoji: '⚽' },
  { id: 'fix', title: 'Entstörung!', pitch: 'Rote Ports flicken, bevor das Netz fällt.', emoji: '🔌' },
  { id: 'memory', title: 'Zimmer-Memory', pitch: 'Finde die Paare aus Momos Zimmer.', emoji: '🧠' },
];

const KEY = 'adrian-room:best:';

export function readBest(id: GameId): number | null {
  try {
    const v = window.localStorage.getItem(KEY + id);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/** Stores the score if it beats the old one; `lowerIsBetter` for time/move based games. Returns true on a new record. */
export function saveBest(id: GameId, score: number, lowerIsBetter = false): boolean {
  const old = readBest(id);
  const better = old === null || (lowerIsBetter ? score < old : score > old);
  if (!better) return false;
  try {
    window.localStorage.setItem(KEY + id, String(score));
  } catch {
    /* storage unavailable — the record just isn't remembered */
  }
  return true;
}
