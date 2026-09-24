import type {
  LayoutNode,
  LayoutState,
  Stream,
  WorkspaceTab,
} from "@rtc/core-api";

import { collect } from "#/harness/collect";
import type { CoreHarness } from "#/harness/harness";
import type {
  DriveCommand,
  JarvisEvent,
  PanelSpec,
} from "#/harness/jarvisTypes";
import { settle } from "#/harness/settle";

/* Shared by the slice-7 workspace suites: spawning desk panels through the
 * (scripted) Jarvis port, reading a stream's current value from a FRESH
 * subscriber, and walking a layout tree.
 *
 * A CONTRACT POINT these suites rely on, stated once here: the workspace's
 * STATE — the panels roster and every layout machine — is a synchronous
 * fold. An intent (`dockPanel`, `maximize`, `resetWorkspaceLayout`, a preset
 * `save`/`load`…) has changed that state by the time it returns, so the next
 * synchronous call sees it (the shared `createWorkspaceDock` reads the roster
 * and the recorded layout states right after calling into them, and a preset
 * `save` straight after a `maximize` must store the maximized tree). Only
 * DELIVERY to a subscriber may be scheduled — which is why every stream read
 * here goes through `readLatest`, after a pause. A core that folds on a
 * fiber must still commit the new state synchronously (the Effect core:
 * `SubscriptionRef` updates via `runSync`). */

/** Lets the core's scheduled deliveries land — `settle` on real timers,
 * `clock.settle` inside `withFakeClock`. */
export type Pause = () => Promise<void>;

export const PANEL_SPEC: PanelSpec = {
  v: 1,
  title: "P&L overview",
  rationale: "Your book at a glance",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

/** A desk panel reading live EURUSD ticks — its data follows the price port. */
export const FX_TICKS_SPEC: PanelSpec = {
  v: 1,
  title: "EURUSD ticks",
  source: { kind: "fxTicks", symbols: ["EURUSD"] },
  transforms: [],
  viz: { kind: "line" },
};

export function createPanelEvent(
  panelId: string,
  spec: PanelSpec = PANEL_SPEC,
): JarvisEvent {
  return { type: "panel", panelId, spec };
}

/** One Jarvis turn whose reply is `events` then `done`. */
export async function replyToTurn(
  h: CoreHarness,
  events: readonly JarvisEvent[],
  pause: Pause = settle,
): Promise<void> {
  h.app.presenters.jarvis.intents.send("turn");
  await pause();
  h.driver.replyJarvis([...events, { type: "done" }]);
  await pause();
}

/** Spawn one floating desk panel per id, in order, in ONE turn. */
export async function spawnPanels(
  h: CoreHarness,
  panelIds: readonly string[],
  pause: Pause = settle,
): Promise<void> {
  await replyToTurn(
    h,
    panelIds.map((panelId) => {
      return createPanelEvent(panelId);
    }),
    pause,
  );
}

/** One Jarvis turn replying with a drive batch of `commands`. The driver
 * staggers them; the caller advances time. */
export async function driveBatch(
  h: CoreHarness,
  commands: readonly DriveCommand[],
  pause: Pause = settle,
): Promise<void> {
  await replyToTurn(h, [{ type: "command", batch: { v: 1, commands } }], pause);
}

/** The stream's latest value, read through a FRESH subscriber (never one a
 * teardown may have cut). Throws when nothing arrived — absence must not
 * read as a value. */
export async function readLatest<T>(
  stream: Stream<T>,
  pause: Pause = settle,
): Promise<T> {
  const c = collect(stream);
  await pause();
  c.unsubscribe();

  if (c.values.length === 0) {
    throw new Error("readLatest: the stream delivered nothing");
  }

  return c.values[c.values.length - 1] as T;
}

export function readLayout(
  h: CoreHarness,
  tab: WorkspaceTab,
  pause: Pause = settle,
): Promise<LayoutState> {
  return readLatest(h.app.presenters.layoutFor(tab).state$, pause);
}

/** Every panel leaf id in a layout tree, depth-first. */
export function leafIds(node: LayoutNode): string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(leafIds);
}

/** The ids of the panels the app lists, in roster order. */
export async function panelIds(
  h: CoreHarness,
  pause: Pause = settle,
): Promise<string[]> {
  const rows = await readLatest(h.app.presenters.jarvisPanels.panels$, pause);
  return rows.map((row) => {
    return row.panelId;
  });
}

/** The ids of the panels the app lists as docked. */
export async function dockedIds(
  h: CoreHarness,
  pause: Pause = settle,
): Promise<string[]> {
  const rows = await readLatest(
    h.app.presenters.jarvisPanels.dockedPanels$,
    pause,
  );
  return rows.map((row) => {
    return row.panelId;
  });
}
