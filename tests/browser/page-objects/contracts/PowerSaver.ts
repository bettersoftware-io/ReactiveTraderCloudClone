import type { MotionSample, MotionSampleOptions } from "#/browser/motionProbe";

/**
 * Header power-saver cycling control (PowerSaverToggle: off → calm → freeze →
 * off) plus the document-level `data-power-saver` level it drives
 * (PowerSaverRoot mirrors the preference onto `<html>` for e2e observability
 * — same rationale as the theme preference's root class).
 *
 * Playwright-only: like {@link InspectorPO} and the `login` field, this
 * capability is only implemented by the Playwright factory, so the field is
 * optional on {@link PageObjects}.
 */
export interface PowerSaverPO {
  /** Click the header's power-saver cycling control (advances one level). */
  click(): Promise<void>;
  /** The document root's `data-power-saver` attribute value ("off" | "calm" | "freeze"). */
  documentFlag(): Promise<string>;
  /**
   * The computed `animation-duration` of the connection-status dot (an
   * infinite `pulseDot` animation while CONNECTED). Proves freeze's CSS is
   * applied in a real browser: under freeze the dot's animation is dropped
   * entirely (`animation: none` in ConnectionStatusBar.module.css), which
   * computes to `0s` — jsdom never loads index.css or module CSS or resolves
   * the `!important` cascade, so this is deliberately real-browser-only,
   * unlike the cycle/persistence assertions above which are DOM-flag reads.
   */
  connectionDotAnimationDuration(): Promise<string>;
  /**
   * Runs the shared motion probe (see `tests/browser/motionProbe.ts`) in the
   * live page: counts `requestAnimationFrame` registrations and censuses
   * non-`finished` animations across repeated `document.getAnimations()`
   * snapshots. Under freeze both must come back empty/zero even while quotes
   * stream — the churn channels (manufactured transitions, retriggered flash
   * keyframes, paused resident loops, ungated rAF) are invisible to every
   * other tier.
   */
  sampleMotion(options: MotionSampleOptions): Promise<MotionSample>;
}
