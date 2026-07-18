/**
 * Header power-saver cycling control (PowerSaverToggle: off → calm → freeze →
 * off) plus the document-level `data-power-saver` level it drives
 * (PowerSaverRoot mirrors the preference onto `<html>` for e2e observability
 * — same rationale as the theme preference's root class).
 *
 * Playwright-only: like {@link InspectorPO} and the `login` field, this
 * capability has no Cypress implementation, so the field is optional on
 * {@link PageObjects}.
 */
export interface PowerSaverPO {
  /** Click the header's power-saver cycling control (advances one level). */
  click(): Promise<void>;
  /** The document root's `data-power-saver` attribute value ("off" | "calm" | "freeze"). */
  documentFlag(): Promise<string>;
  /**
   * The computed `animation-duration` of the connection-status dot (an
   * infinite `pulseDot` animation while CONNECTED). Proves the Freeze
   * tier's CSS catch-all (`[data-power-saver="freeze"] * { animation-duration:
   * 0.01ms !important; }` in index.css) actually fires in a real browser —
   * jsdom never loads index.css or resolves the `!important` cascade, so
   * this is deliberately real-browser-only, unlike the cycle/persistence
   * assertions above which are DOM-flag reads.
   */
  connectionDotAnimationDuration(): Promise<string>;
}
