/**
 * The full-screen boot splash (BootSequence, mounted by BootGate OUTSIDE
 * AuthGate — see packages/client-{react,solid}/src/AppRoot.tsx) and the
 * `forceBootAnimation` preference's real-browser effect on it: under
 * `prefers-reduced-motion: reduce`, the preference forces the boot canvas to
 * keep rendering instead of the reduced-motion CSS hiding it
 * (`.boot:not([data-force-anim="true"]) .canvas { display: none }` in
 * BootSequence.module.css).
 *
 * `open()` navigates to `/?splash` — the force-on override in
 * bootSplashGate.ts that beats the `navigator.webdriver` suppression, so the
 * splash actually mounts under Playwright automation. Runs pre-auth (BootGate
 * sits outside AuthGate), so it's identical on react and solid without
 * touching the divergent login flow.
 *
 * Playwright-only: like {@link LoginScreenPO} and {@link PowerSaverPO}, this
 * capability is only implemented by the Playwright factory, so the field is
 * optional on {@link PageObjects}.
 */
/** Options for {@link BootPO.open}. */
export interface BootOpenOptions {
  /** Seed the `forceBootAnimation` preference into localStorage BEFORE any
   *  page script runs, via `page.addInitScript` — otherwise the preference is
   *  left at its default (off). */
  forceAnimation?: boolean;
}

export interface BootPO {
  /** Navigate to "/?splash", optionally forcing the preference on first. */
  open(options?: BootOpenOptions): Promise<void>;
  /** Wait until the boot-sequence root's `data-force-anim` attribute reads
   *  `expected`. */
  waitForceAnimAttr(
    expected: "true" | "false",
    timeoutMs: number,
  ): Promise<void>;
  /** Wait until the boot canvas is visible (actively rendering). */
  waitCanvasVisible(timeoutMs: number): Promise<void>;
  /** Wait until the boot canvas reports CSS `display: none` (the
   *  reduced-motion, not-forced case). */
  waitCanvasHidden(timeoutMs: number): Promise<void>;
}
