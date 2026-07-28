/**
 * J.A.R.V.I.S assistant (JarvisOrb / JarvisOverlay / JarvisConfirmCard).
 * Driver-free — see contracts/ThemeToggle.ts for the pattern this follows.
 */
export interface JarvisPO {
  /** Click the header orb to open the overlay. */
  openViaOrb(): Promise<void>;
  /** Snapshot: is the full-screen overlay currently visible. */
  isOverlayVisible(): Promise<boolean>;
  /** Type `text` into the input and send it (click SEND). */
  ask(text: string): Promise<void>;
  /** innerText of the last `jarvis`-role entry (the current/most recent reply). */
  lastReplyText(): Promise<string>;
  /**
   * Wait for the last `jarvis`-role entry's `data-done` attribute to flip to
   * "true" — the typed reveal takes a few seconds, so this polls with a
   * generous internal timeout rather than accepting a caller-supplied one.
   */
  waitForReplyDone(): Promise<void>;
  /** Snapshot: is the trade confirmation card currently visible. */
  isConfirmCardVisible(): Promise<boolean>;
  /** Click APPROVE on the pending confirmation card. */
  approveConfirmation(): Promise<void>;
}
