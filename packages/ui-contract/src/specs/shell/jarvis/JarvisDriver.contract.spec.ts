/**
 * JarvisDriver contract spec (Task 12 of the app-driving/narrator round).
 *
 * Sociable tier, one notch wider than every sibling Jarvis spec: instead of
 * mounting a single leaf/synthetic composite, every scenario here mounts the
 * REAL `App` shell (`AppShell` token, `JarvisDriverPage`) — the driven-pulse
 * cue on the nav rail AND the workspace wrapper, the real
 * `useWorkspaceNav()`-backed tab switch, and the real per-tab
 * `InhouseLayoutEngine` a driven `"layout"` command targets are all owned by
 * `App.tsx` itself, so nothing shallower can witness them together (see
 * `JarvisDriverPage`'s own doc). `JarvisDriverPage` composes the SAME page
 * objects every other Jarvis spec already uses (`header`/`overlay`/`orb`/
 * `panels`), over one shared `World` this file keeps its own reference to
 * (via `mountWith`, mirroring `JarvisPanelLayer.contract.spec.ts`'s
 * documented pattern) so assertions can read `world.eqWorkspace` directly
 * alongside the DOM.
 *
 * Every scenario drives the SAME real interpreter chain a live brain's
 * (or the scripted engine's) `"command"` event would: `overlay.send(...)`
 * opens a turn, then `overlay.emitEvents([{ type: "command", batch }, ...])`
 * pushes it onto the shared `jarvis.events$` stream `JarvisDriverMachine`
 * folds over — exactly like `JarvisPanelLayer.contract.spec.ts` pushes
 * `"panel"` events. `JarvisDriverMachine` staggers a batch's commands
 * `DRIVE_STAGGER_MS` apart (0 under power-saver freeze), so every scenario
 * that drives a batch runs under `vi.useFakeTimers()` — switched on AFTER
 * any `userEvent`-backed interaction (`pressHotkey`/`send`), never before,
 * so those don't themselves stall on a fake timer.
 */

import { AppShell } from "@ui-contract/components";
import type { World } from "@ui-contract/harness/world";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EqWorkspaceState, JarvisEvent } from "@rtc/client-core";
import {
  DRIVE_STAGGER_MS,
  type UNSUPPORTED_SENTINEL_SPEC,
} from "@rtc/client-core";

/** Mirrors `ScriptedJarvisEngine`'s own canned `setupWorkspace` demo batch
 * (`SCRIPTED_VOL_WORKSPACE_BATCH`, module-private there) — a real scripted
 * turn's exact shape, not an invented fixture (same "mirror, don't invent"
 * doctrine `JarvisPanelLayer.contract.spec.ts` follows for its own
 * `GBP_VOLATILITY_SPEC`). */
const SETUP_WORKSPACE_BATCH: DriveBatchV1 = {
  v: 1,
  commands: [
    { kind: "switchTab", tab: "equities" },
    { kind: "layout", op: "maximize", tab: "equities", panelId: "eq-chart" },
    { kind: "eqTimeframe", tf: "1D" },
    { kind: "eqIndicator", id: "ema50", on: true },
    { kind: "eqPane", id: "rsi", on: true },
  ],
};

/** Generous settle time for a 5-command staggered batch (comfortably above
 * `4 * DRIVE_STAGGER_MS`, the worst case with the first command free). */
const DRIVE_SETTLE_MS: number = DRIVE_STAGGER_MS * 5 + 500;

afterEach(() => {
  vi.useRealTimers();
  cleanupMounted();
});

describe("JarvisDriver", () => {
  it("a scripted setupWorkspace turn switches to equities and maximizes eq-chart", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("set up the vol workspace");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      { type: "command", batch: SETUP_WORKSPACE_BATCH },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.header.isActive("equities")).toBe(true);
    expect(app.maximizedPanelId()).toBe("eq-chart");
    expect(app.isPanelMaximized("eq-chart")).toBe(true);

    const eq = eqState(world);
    expect(eq.timeframe).toBe("1D");
    expect(eq.indicators).toContain("ema50");
    expect(eq.panes).toContain("rsi");
  });

  it("an applied command genuinely pulses BOTH the nav rail and the workspace wrapper", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);
    expect(app.isNavDriven()).toBe(false);
    expect(app.isWorkspaceRegionDriven()).toBe(false);

    await app.overlay.pressHotkey();
    await app.overlay.send("switch to credit");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: { v: 1, commands: [{ kind: "switchTab", tab: "credit" }] },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    // jsdom has no real CSS animation engine, so the JS-side `pulsing` state
    // (cleared only by the CSS animation's `animationend`, never firing
    // here) stays observably true after the drive — the same "no fake
    // WAAPI" reasoning JarvisPanelLayer.contract.spec.ts's dismiss test
    // documents for its own animation-gated assertion.
    expect(app.header.isActive("credit")).toBe(true);
    expect(app.isNavDriven()).toBe(true);
    expect(app.isWorkspaceRegionDriven()).toBe(true);
  });

  it("does NOT pulse under power-saver freeze, even though the command still applies", async () => {
    const world = createWorld();
    world.powerSaverLevel.next("freeze");
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("switch to credit");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: { v: 1, commands: [{ kind: "switchTab", tab: "credit" }] },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    // The command still applies (freeze only collapses the VISUAL cue, per
    // useJarvisDrivenPulse's own JS-gate doc — the interpreter itself is
    // unaffected).
    expect(app.header.isActive("credit")).toBe(true);
    expect(app.isNavDriven()).toBe(false);
    expect(app.isWorkspaceRegionDriven()).toBe(false);
  });

  it("folds an applied command into a `drive: <kind>` transcript row", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("switch to admin");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: { v: 1, commands: [{ kind: "switchTab", tab: "admin" }] },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    const driveRows = app.overlay.entries().filter((e) => {
      return e.text.startsWith("drive:");
    });
    expect(driveRows).toEqual([
      expect.objectContaining({
        role: "jarvis",
        text: "drive: switchTab",
        done: true,
      }),
    ]);
  });

  it("an all-skipped batch (unknown panelId) applies nothing and never pulses", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("maximize a panel that doesn't exist");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: {
          v: 1,
          commands: [
            {
              kind: "layout",
              op: "maximize",
              tab: "equities",
              panelId: "not-a-real-panel",
            },
          ],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.isNavDriven()).toBe(false);
    expect(app.isWorkspaceRegionDriven()).toBe(false);
    expect(app.maximizedPanelId()).toBe("");
    const driveRows = app.overlay.entries().filter((e) => {
      return e.text.startsWith("drive:");
    });
    expect(driveRows).toEqual([]);
  });

  it("a skipped command inside a batch does not block its sibling commands from applying", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("do a mix of a bad command and a good one");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: {
          v: 1,
          commands: [
            {
              kind: "layout",
              op: "maximize",
              tab: "equities",
              panelId: "not-a-real-panel",
            },
            { kind: "switchTab", tab: "credit" },
          ],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.header.isActive("credit")).toBe(true);
    const driveRows = app.overlay.entries().filter((e) => {
      return e.text.startsWith("drive:");
    });
    // Only the APPLIED sibling folds a transcript row — the skip contributes
    // nothing (recordDriveOutcome's applied-only filter, JarvisMachine.ts's
    // own doc).
    expect(driveRows).toEqual([
      expect.objectContaining({ text: "drive: switchTab" }),
    ]);
  });

  // --- Pinned panels (GenUI L3): the dockPanel/undockPanel commands ---------
  // These ride the same interpreter chain as every scenario above, but their
  // effect is two machines deep (panels roster + the active tab's layout
  // tree), so each asserts the WORKSPACE, not just the roster: a docked panel
  // leaves the floating cascade (`app.panels`) and appears as an engine leaf
  // (`app.layout.isDocked`). The four SKIP paths are asserted by their
  // observable consequence — nothing moves, and no `drive: <kind>` transcript
  // row folds (only APPLIED outcomes do). The skip REASON strings themselves
  // (`unknown panelId "…"` / `already docked` / `dock full` / `not docked`)
  // are pinned verbatim by `JarvisDriverMachine.test.ts`; they reach no DOM
  // surface, so this tier cannot — and deliberately does not — re-assert them.
  it("a driven dockPanel command pins the panel into the active tab, and undockPanel floats it again", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("show me desk positions and pin it");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      { type: "panel", panelId: DRIVEN_PANEL_ID, spec: DESK_POSITIONS_SPEC },
      {
        type: "command",
        batch: {
          v: 1,
          commands: [{ kind: "dockPanel", panelId: DRIVEN_PANEL_ID }],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.layout.isDocked(DRIVEN_PANEL_ID)).toBe(true);
    expect(app.panels.isPresent()).toBe(false);
    expect(driveRowTexts(app.overlay.entries())).toEqual(["drive: dockPanel"]);

    // A second TURN — `done` completed the first one, and a completed turn
    // swallows every later event silently. Real timers around the
    // `userEvent`-backed send (the file doc's rule), fake ones again for the
    // stagger.
    vi.useRealTimers();
    await app.overlay.send("now unpin it");
    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: {
          v: 1,
          commands: [{ kind: "undockPanel", panelId: DRIVEN_PANEL_ID }],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.layout.isDocked(DRIVEN_PANEL_ID)).toBe(false);
    expect(app.panels.panelIds()).toEqual([DRIVEN_PANEL_ID]);
    expect(driveRowTexts(app.overlay.entries())).toEqual([
      "drive: dockPanel",
      "drive: undockPanel",
    ]);
  });

  it("dockPanel of an id no panel carries is skipped (unknown panelId) — nothing docks, nothing folds", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("pin a panel that doesn't exist");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: {
          v: 1,
          commands: [{ kind: "dockPanel", panelId: "panel-never-spawned" }],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.layout.isDocked("panel-never-spawned")).toBe(false);
    expect(driveRowTexts(app.overlay.entries())).toEqual([]);
  });

  it("dockPanel of an already-docked panel is skipped — it stays docked exactly once", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("pin it twice");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      { type: "panel", panelId: DRIVEN_PANEL_ID, spec: DESK_POSITIONS_SPEC },
      {
        type: "command",
        batch: {
          v: 1,
          commands: [
            { kind: "dockPanel", panelId: DRIVEN_PANEL_ID },
            { kind: "dockPanel", panelId: DRIVEN_PANEL_ID },
          ],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.layout.isDocked(DRIVEN_PANEL_ID)).toBe(true);
    // The second command applied nothing — one row, not two (and, crucially,
    // no second leaf: a duplicate insert would corrupt the persisted tree).
    expect(driveRowTexts(app.overlay.entries())).toEqual(["drive: dockPanel"]);
  });

  it("dockPanel past the cap is skipped (dock full) — the fifth panel keeps floating", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("pin everything");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      { type: "panel", panelId: "panel-1", spec: DESK_POSITIONS_SPEC },
      { type: "panel", panelId: "panel-2", spec: DESK_POSITIONS_SPEC },
      { type: "panel", panelId: "panel-3", spec: DESK_POSITIONS_SPEC },
      { type: "panel", panelId: "panel-4", spec: DESK_POSITIONS_SPEC },
      {
        type: "command",
        batch: {
          v: 1,
          commands: [
            { kind: "dockPanel", panelId: "panel-1" },
            { kind: "dockPanel", panelId: "panel-2" },
            { kind: "dockPanel", panelId: "panel-3" },
            { kind: "dockPanel", panelId: "panel-4" },
          ],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    // A second turn (see the dock/undock scenario's note on completed turns).
    vi.useRealTimers();
    await app.overlay.send("and pin one more");
    vi.useFakeTimers();
    app.overlay.emitEvents([
      { type: "panel", panelId: "panel-5", spec: DESK_POSITIONS_SPEC },
      {
        type: "command",
        batch: {
          v: 1,
          commands: [{ kind: "dockPanel", panelId: "panel-5" }],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.layout.isDocked("panel-5")).toBe(false);
    expect(app.panels.panelIds()).toEqual(["panel-5"]);
    expect(driveRowTexts(app.overlay.entries())).toEqual([
      "drive: dockPanel",
      "drive: dockPanel",
      "drive: dockPanel",
      "drive: dockPanel",
    ]);
  });

  it("undockPanel of a panel that is not docked is skipped — the floating panel is untouched", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("unpin something that was never pinned");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      { type: "panel", panelId: DRIVEN_PANEL_ID, spec: DESK_POSITIONS_SPEC },
      {
        type: "command",
        batch: {
          v: 1,
          commands: [{ kind: "undockPanel", panelId: DRIVEN_PANEL_ID }],
        },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.panels.panelIds()).toEqual([DRIVEN_PANEL_ID]);
    expect(app.layout.isDocked(DRIVEN_PANEL_ID)).toBe(false);
    expect(driveRowTexts(app.overlay.entries())).toEqual([]);
  });

  it("a narrate turn while the overlay is closed flares the orb's unread-narration attention state", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);
    expect(app.overlay.isOpen()).toBe(false);
    expect(app.orb.state()).toBe("idle");

    world.jarvis.narrate("[narration] EURUSD volatility is spiking, sir.");
    app.overlay.emitEvents([
      { type: "delta", text: "EURUSD volatility is spiking, sir." },
      { type: "done" },
    ]);

    expect(app.overlay.isOpen()).toBe(false);
    expect(app.orb.state()).toBe("attention");
  });

  it("a narrate turn renders the narrator-origin entry + badge once the overlay is open", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);
    await app.overlay.pressHotkey();
    expect(app.overlay.hasNarratorBadge()).toBe(false);

    world.jarvis.narrate("[narration] EURUSD volatility is spiking, sir.");
    app.overlay.emitEvents([
      { type: "delta", text: "EURUSD volatility is spiking, sir." },
      { type: "done" },
    ]);

    const userEntries = app.overlay.entries().filter((e) => {
      return e.role === "user";
    });
    expect(userEntries.at(-1)).toEqual(
      expect.objectContaining({ origin: "narrator" }),
    );
    expect(app.overlay.hasNarratorBadge()).toBe(true);
    // Open while the narrate turn completed — unreadNarration never latches
    // (JarvisOrb.tsx's own doc: it can only fire while the overlay is closed).
    expect(app.orb.state()).not.toBe("attention");
  });
});

/** No public export of `DriveBatchV1` reaches `@rtc/ui-contract` (it lives in
 * `@rtc/shared`, not a dependency of this package — only `@rtc/client-core`
 * is), so this borrows the type structurally off the already-exported
 * `JarvisEvent`'s own `"command"` variant — the identical trick
 * `JarvisPanelLayer.contract.spec.ts` uses to borrow `PanelSpecV1` off
 * `UNSUPPORTED_SENTINEL_SPEC` — instead of widening any package's public
 * surface just for test literals. Named-tag `Extract` (not an inline object
 * type argument), per this repo's `no-restricted-syntax` ban — the same
 * `CommandEventTag` idiom `JarvisDriverMachine.ts` itself uses. */
interface CommandEventTag {
  readonly type: "command";
}

type DriveBatchV1 = Extract<JarvisEvent, CommandEventTag>["batch"];

/** The panel the pinned-panel scenarios drive — an `analytics`-sourced table,
 * the cheapest spec whose body mounts without any seeded World data. */
const DRIVEN_PANEL_ID = "panel-desk-positions";

/** No public export of `PanelSpecV1` reaches `@rtc/ui-contract` — same
 * borrow-the-type-off-an-exported-const trick this file already uses for
 * `DriveBatchV1`, and `JarvisPanelLayer.contract.spec.ts` for its own specs. */
type PanelSpecV1 = typeof UNSUPPORTED_SENTINEL_SPEC;

const DESK_POSITIONS_SPEC: PanelSpecV1 = {
  v: 1,
  title: "Desk Positions",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

/** The transcript's `drive: <kind>` rows, in order — one per APPLIED command
 * (`recordDriveOutcome`'s applied-only filter), so this doubles as the
 * skipped-command assertion every pinned-panel scenario below leans on. */
function driveRowTexts(entries: readonly TranscriptEntry[]): string[] {
  return entries
    .map((entry) => {
      return entry.text;
    })
    .filter((text) => {
      return text.startsWith("drive:");
    });
}

/** Structural mirror of one `JarvisOverlayPage.entries()` row — only the
 * field `driveRowTexts` reads, so this stays a plain local shape rather than
 * importing the page object's own type. */
interface TranscriptEntry {
  readonly text: string;
}

/** Synchronous snapshot of the shared eqWorkspace machine's current state —
 * `World.eqWorkspace.state$` is always warm (a `StateObservable`), so a
 * subscribe-and-immediately-unsubscribe round trip is safe. */
function eqState(world: World): EqWorkspaceState {
  let value!: EqWorkspaceState;
  const sub = world.eqWorkspace.state$.subscribe((s) => {
    value = s;
  });
  sub.unsubscribe();
  return value;
}
