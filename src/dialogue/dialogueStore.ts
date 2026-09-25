import { create } from 'zustand';
import type { TopicId } from '../data/nodes';
import type { Line } from '../data/types';

/**
 * UI-only dialogue state. Written by the director, read by the overlay.
 * (The shared app/scene state lives in src/state/store.ts.)
 */

export type DialogueMode = 'idle' | 'speaking' | 'waiting' | 'walking' | 'choosing';

export interface DialogueState {
  mode: DialogueMode;
  /** Line currently in the speech bubble. */
  line: Line | null;
  /** Increments for every new bubble (animation key). */
  lineId: number;
  /** Characters (Array.from units) revealed so far. */
  typed: number;
  /** Line fully typed. */
  done: boolean;
  /** Waiting for the visitor to advance (show "weiter" hint). */
  awaiting: boolean;
  /** Topic being walked through (shows "Andere Frage"). */
  inTopic: TopicId | null;
  /** Last free-text question, echoed as a "Du: …" bubble. */
  userText: { text: string; id: number } | null;
  cvOpen: boolean;
  setCvOpen: (open: boolean) => void;
}

export const useDialogue = create<DialogueState>()((set) => ({
  mode: 'idle',
  line: null,
  lineId: 0,
  typed: 0,
  done: false,
  awaiting: false,
  inTopic: null,
  userText: null,
  cvOpen: false,
  setCvOpen: (cvOpen) => set({ cvOpen }),
}));
