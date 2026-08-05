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
   * Only reachable when the panel's `source`/`transforms` produce a
   * `"table"`-shaped frame (`analytics`/`blotter`, optionally `topN`) — a
   * `heatmap` restyle over a `"series"`-shaped frame (e.g. `priceHistory` +
   * `rollingVol`) is a real, intentional "no data" state instead (see
   * `composePanelStream.ts`'s totality doc comment) — use
   * `waitForPanelEmptyState` for that case.
   */
  waitForPanelHeatmapRenderer(panelId: string): Promise<void>;
  /**
   * Wait for the given panel body to show its viz-agnostic "No data yet"
   * placeholder, with its line-chart renderer gone — the correct, documented
   * outcome of restyling to a viz whose renderer needs a frame shape the
   * panel's `source`/`transforms` don't produce (e.g. a `priceHistory`-
   * sourced panel restyled to `heatmap`/`table`, both of which need a
   * `"table"`-shaped frame that only `analytics`/`blotter` sources yield).
   */
  waitForPanelEmptyState(panelId: string): Promise<void>;
  /** Click the given panel's own dismiss (✕) button. */
  dismissPanel(panelId: string): Promise<void>;
  /**
   * Wait for every desk panel to be gone (the layer itself unmounts) — polls
   * rather than snapshotting once, since dismiss plays a short exit
   * animation before the underlying intent fires.
   */
  waitForNoPanels(): Promise<void>;
}
