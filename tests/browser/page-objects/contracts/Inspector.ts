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
 * `page.*` handle. There is no Cypress impl: Cypress cannot drive a second
 * same-origin tab, so this capability is Playwright-only and the field is
 * optional on {@link PageObjects}.
 */
export interface InspectorPO {
  /** Open the inspector as a second page in the app's browser context and
   *  navigate it to `/devtools/`. Must be called before any other method. */
  open(): Promise<void>;
  /** Wait until the connection-rail badge reads exactly `expected` (the app id
   *  once the hello/welcome handshake lands, or "disconnected" before/after). */
  waitConnectionBadge(expected: string, timeoutMs: number): Promise<void>;
  /** Wait until a State-tab stream row whose text contains `streamId` is
   *  visible. */
  waitStreamRow(streamId: string, timeoutMs: number): Promise<void>;
  /** Switch to the Machines tab. Takes an explicit click timeout because the
   *  inspector is a live-stream view whose main thread is busy under load —
   *  the click's actionability polling needs a bounded-but-generous budget
   *  (see the devtools spec's timing note). */
  openMachinesTab(timeoutMs: number): Promise<void>;
  /** Wait until a machine row whose text contains `kind` is visible. */
  waitMachineRowOfKind(kind: string, timeoutMs: number): Promise<void>;
  /** Close the primary app page. This fires `pagehide` on the app window, the
   *  graceful-teardown path the app-side devtoolsHub turns into a `bye` over the
   *  channel — driving the inspector back to "disconnected". */
  closeAppPage(): Promise<void>;
}
