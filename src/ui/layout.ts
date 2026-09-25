/**
 * Mutable layout facts shared between overlay parts. Read inside rAF loops,
 * written by ResizeObservers — never React state.
 */
export const uiLayout = {
  /** Space taken by the top bar (px from the top edge). */
  topInset: 76,
  /** Height of the bottom stack (chips, input, …) in px. */
  bottomInset: 0,
};
