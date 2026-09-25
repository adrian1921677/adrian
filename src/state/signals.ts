/**
 * Mutable per-frame channels between the UI layer and the 3D scene.
 * Written and read inside requestAnimationFrame / useFrame loops.
 * Never put these in React state — they change every frame.
 */

/** UI → scene. The babble synth writes this on every syllable it plays. */
export const talkSignal = {
  /** performance.now() of the most recent syllable blip */
  lastBlipAt: 0,
  /** 0..1 loudness/openness of that syllable (vowels open wider) */
  intensity: 0,
};

/** Scene → UI. Screen position of Char_BubbleAnchor, in CSS pixels of the canvas. */
export const bubbleAnchor = {
  x: 0,
  y: 0,
  /** false while the scene hasn't projected it yet or it's off-screen */
  visible: false,
};
