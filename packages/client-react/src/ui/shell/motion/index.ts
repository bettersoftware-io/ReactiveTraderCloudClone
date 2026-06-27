import { animate } from "motion";

/**
 * The single Motion One import site. Everything else in the UI animates through
 * this wrapper so the engine stays swappable (the planned SolidJS client swaps
 * this file for `solid-motionone`; CSS-keyframe/Canvas effects don't touch it).
 */
export type AnimateTarget = Element;

export async function animateOnce(
  el: AnimateTarget,
  keyframes: Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<void> {
  await animate(el, keyframes, options).finished;
}
