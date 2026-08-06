/**
 * J.A.R.V.I.S assistant (JarvisOrb / JarvisOverlay / JarvisConfirmCard).
 * Driver-free — see contracts/ThemeToggle.ts for the pattern this follows.
 */
export interface JarvisPO {
  /** Click the header orb to open the overlay. */
  openViaOrb(): Promise<void>;
  /** Click the overlay's own close (✕) button. */
  closeViaButton(): Promise<void>;
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
  /**
   * Wait for the desk panel with this id to be mounted with
   * `data-status="live"` — the panel layer is the chat overlay's SIBLING, so
   * this polls independently of overlay open/close state.
   */
  waitForPanelLive(panelId: string): Promise<void>;
  /** Snapshot: is a panel with this id currently in the DOM (any status). */
  isPanelPresent(panelId: string): Promise<boolean>;
  /** Wait for the given panel's line-chart body renderer to mount. */
  waitForPanelLineRenderer(panelId: string): Promise<void>;
  /**
   * Wait for the given panel's heatmap body renderer to mount AND its
   * line-chart renderer to be gone — the two are mutually exclusive (only
   * the renderer matching the panel's current `viz.kind` is ever mounted).
   */
  waitForPanelHeatmapRenderer(panelId: string): Promise<void>;
  /** Click the given panel's own dismiss (✕) button. */
  dismissPanel(panelId: string): Promise<void>;
  /**
   * Wait for every desk panel to be gone (the layer itself unmounts) — polls
   * rather than snapshotting once, since dismiss plays a short exit
   * animation before the underlying intent fires.
   */
  waitForNoPanels(): Promise<void>;
  /**
   * Wait for the header orb to flare into "attention" — set once a
   * narrator-origin turn completes while the chat overlay is still closed
   * (see `NarratorMachine`/`JarvisMachine`'s `unreadNarration` fold).
   * Entries only render once the overlay is open, so this is the one
   * witness available for a narration BEFORE opening it. Requires the
   * dev-only `?narratorThresholds=test` seam (see
   * `WorkspacePO.openWithNarratorThresholds`) to have relaxed the anomaly
   * detector, else this could take the simulator's natural ~14 min interval.
   */
  waitForNarrationFlare(): Promise<void>;
  /**
   * Wait for exactly `count` "drive: <kind>" timeline rows to have
   * accumulated (JarvisDriverMachine's applied outcomes, folded into the
   * transcript by `JarvisMachine.recordDriveOutcome`) — polls rather than
   * snapshotting once, since the driver stages each command's application
   * ~350ms apart (`DRIVE_STAGGER_MS`).
   */
  waitForDriveRowCount(count: number): Promise<void>;
  /**
   * Snapshot: how many transcript entries currently carry
   * `data-origin="narrator"` — the witness for the narration cooldown
   * holding (`NARRATION_COOLDOWN_MS` is 5 minutes, far longer than one e2e
   * ride, so a bounded post-ride count is the honest assertion rather than
   * a long wait for a cooldown that cannot have expired).
   */
  narrationEntryCount(): Promise<number>;
}
