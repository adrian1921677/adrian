import { create } from 'zustand';
import { NODES } from '../data/nodes';
import type { TopicId } from '../data/nodes';

/**
 * CONTRACT: shared app state.
 *
 * Ownership rule — the UI/dialogue layer DECIDES, the 3D scene EXECUTES and REPORTS.
 *  - UI writes: phase, targetSpot, action/actionNonce, talking, facing, focus,
 *    highlight, screenTitle, activeTopic, visited, muted.
 *  - Scene writes: sceneReady, currentSpot, walking, hovered, topicRequest, pokeNonce.
 * Scene code should read per-frame values with `useAppStore.getState()` inside
 * useFrame instead of subscribing, to avoid React re-renders every frame.
 */

export type Phase = 'loading' | 'gate' | 'running';

export type CharacterAction =
  | 'idle'
  | 'wave' // raise an arm and wave (greeting)
  | 'jump' // squash → hop → squash (poked / excited)
  | 'think' // tilt, hand to chin-ish, antenna droops
  | 'point' // arm toward the active hotspot
  | 'celebrate' // both arms up, little hop
  | 'shrug'; // both arms out briefly

/** Where the character looks while standing. */
export type Facing = 'camera' | 'hotspot';

export interface AppState {
  // lifecycle
  phase: Phase;
  sceneReady: boolean;

  // character — requested by UI
  targetSpot: string;
  action: CharacterAction;
  actionNonce: number;
  talking: boolean;
  facing: Facing;
  // character — reported by scene
  currentSpot: string;
  walking: boolean;

  // camera / room
  focus: TopicId | 'home';
  highlight: TopicId | null;
  hovered: TopicId | 'character' | null;
  screenTitle: string;

  // dialogue
  activeTopic: TopicId | null;
  visited: TopicId[];

  // scene → UI events (nonce pattern: react to changes of the nonce)
  topicRequest: { id: TopicId; nonce: number } | null;
  pokeNonce: number;

  // settings
  muted: boolean;

  // ---- UI actions ----
  setPhase: (phase: Phase) => void;
  walkTo: (spot: string) => void;
  play: (action: CharacterAction) => void;
  setTalking: (talking: boolean) => void;
  setFacing: (facing: Facing) => void;
  setFocus: (focus: TopicId | 'home') => void;
  setHighlight: (topic: TopicId | null) => void;
  setScreenTitle: (title: string) => void;
  setActiveTopic: (topic: TopicId | null) => void;
  markVisited: (topic: TopicId) => void;
  setMuted: (muted: boolean) => void;

  // ---- scene actions ----
  setSceneReady: () => void;
  arrive: (spot: string) => void;
  setWalking: (walking: boolean) => void;
  setHovered: (hovered: TopicId | 'character' | null) => void;
  requestTopic: (id: TopicId) => void;
  poke: () => void;
}

const MUTED_KEY = 'adrian-room:muted';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export const useAppStore = create<AppState>()((set) => ({
  phase: 'loading',
  sceneReady: false,

  targetSpot: NODES.homeSpot,
  action: 'idle',
  actionNonce: 0,
  talking: false,
  facing: 'camera',
  currentSpot: NODES.homeSpot,
  walking: false,

  focus: 'home',
  highlight: null,
  hovered: null,
  screenTitle: 'HALLO!',

  activeTopic: null,
  visited: [],

  topicRequest: null,
  pokeNonce: 0,

  muted: readMuted(),

  setPhase: (phase) => set({ phase }),
  walkTo: (spot) => set({ targetSpot: spot }),
  play: (action) => set((s) => ({ action, actionNonce: s.actionNonce + 1 })),
  setTalking: (talking) => set({ talking }),
  setFacing: (facing) => set({ facing }),
  setFocus: (focus) => set({ focus }),
  setHighlight: (highlight) => set({ highlight }),
  setScreenTitle: (screenTitle) => set({ screenTitle }),
  setActiveTopic: (activeTopic) => set({ activeTopic }),
  markVisited: (topic) =>
    set((s) => (s.visited.includes(topic) ? s : { visited: [...s.visited, topic] })),
  setMuted: (muted) => {
    try {
      window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {
      /* storage unavailable — keep in memory only */
    }
    set({ muted });
  },

  setSceneReady: () => set({ sceneReady: true }),
  arrive: (spot) => set({ currentSpot: spot, walking: false }),
  setWalking: (walking) => set({ walking }),
  setHovered: (hovered) => set({ hovered }),
  requestTopic: (id) =>
    set((s) => ({ topicRequest: { id, nonce: (s.topicRequest?.nonce ?? 0) + 1 } })),
  poke: () => set((s) => ({ pokeNonce: s.pokeNonce + 1 })),
}));
