/**
 * The DevTools inspector, served same-origin at `/devtools/`. It is a SECOND
 * browser page opened in the same context as the app under test — that
 * co-location is load-bearing, because the devtools transport is a same-origin
 * BroadcastChannel that only pairs with the app-side hub when both live in one
 * origin + context.
 *
 * This is the one page object that owns a page OTHER than the primary app page.
 * The Playwright impl spawns the inspector page from the app page's browser
 * context inside `open()`, so scenarios (and the spec body) never touch a raw
 * `page.*` handle. This capability is Playwright-only and the field is
 * optional on {@link PageObjects}.
 */
export interface InspectorPO {
  /** Open the inspector as a second page in the app's browser context and
   *  navigate it to `/devtools/`. Must be called before any other method. */
  open(): Promise<void>;
  /** Wait until the connection-rail badge reads exactly `expected` (the app id
   *  once the hello/welcome handshake lands, or "disconnected" before/after). */
  waitConnectionBadge(expected: string, timeoutMs: number): Promise<void>;
  /** Wait until a stream row whose text contains `streamId` is visible — the
   *  ContextPane's follow-mode state tree (the old State tab), one glance
   *  away regardless of which lens is active. */
  waitStreamRow(streamId: string, timeoutMs: number): Promise<void>;
  /** Wait until a machine row whose text contains `kind` is visible. */
  waitMachineRowOfKind(kind: string, timeoutMs: number): Promise<void>;
  /** Click the tree node whose `data-scope-id` is `nodeId` (e.g. "presenter:blotter",
   *  "machineKind:tileExecution", "all"). Waits for the node to exist first — machine
   *  nodes only appear once the app has birthed that machine. */
  selectNavNode(nodeId: string, timeoutMs: number): Promise<void>;
  /** Assert at least one timeline row is listed and EVERY listed row's text contains
   *  `text` — the scoped list shows only the selected node's rows. */
  waitTimelineRowsAllContain(text: string, timeoutMs: number): Promise<void>;
  /** Click Clear. Returns the highest `data-seq` among the rows listed just before the
   *  click — the watermark the caller asserts against. Under a live stream new rows
   *  arrive within ~66 ms of the click, so "the list is empty" is not a stable
   *  assertion; "every listed row is newer than the watermark" is. */
  clearTimeline(timeoutMs: number): Promise<number>;
  /** Assert the Unclear affordance is visible and that at least one row is listed whose
   *  `data-seq` exceeds `watermark`, with none at or below it. */
  waitTimelineClearedPast(watermark: number, timeoutMs: number): Promise<void>;
  /** Pin the inspector at the newest timeline row via the ArrowUp shortcut
   *  (from follow mode, one ArrowUp pins the tail row), freezing the
   *  inspector's selection at that moment. Keyboard on purpose: while
   *  following a live stream the rows repaint at ~15 Hz and slide through the
   *  500-row render window, so clicking any specific row's pin button is a
   *  race against detach/auto-scroll that flakes on slow CI runners — the
   *  shortcut pins atomically in state. The mouse pin-click path is covered
   *  at the RTL tier (TimelinePane.test.tsx). `timeoutMs` bounds the wait for
   *  a first timeline row to exist before the key is pressed. ArrowUp is one
   *  of the keys the tree owns while a node button has focus; blur first so
   *  the global step shortcut sees it. */
  pinLatestTimelineRow(timeoutMs: number): Promise<void>;
  /** Wait until the pinned-moment bar is visible (a pin is active). */
  waitPinnedBar(timeoutMs: number): Promise<void>;
  /** Wait until the pinned-moment bar is gone (back to following live). */
  waitNoPinnedBar(timeoutMs: number): Promise<void>;
  /** Press Escape on the inspector page, the keyboard shortcut that resumes
   *  from a pinned moment back to the live tail. */
  resumeViaEscape(): Promise<void>;
  /** Close the primary app page. This fires `pagehide` on the app window, the
   *  graceful-teardown path the app-side devtoolsHub turns into a `bye` over the
   *  channel — driving the inspector back to "disconnected". */
  closeAppPage(): Promise<void>;
}
