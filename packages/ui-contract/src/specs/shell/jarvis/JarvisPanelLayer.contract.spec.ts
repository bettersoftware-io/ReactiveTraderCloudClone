/**
 * JarvisPanelLayer contract spec (Task 9 of the generative-UI round).
 *
 * Sociable tier: the REAL `JarvisPanelsPresenter` (fed by the REAL
 * `createJarvisMachine`'s `events$`, mirroring `composition.ts`'s own
 * wiring) drives the real `JarvisPanelLayer` UI — only the Jarvis port is
 * faked. Every scenario mounts a `JarvisOverlay` alongside `JarvisPanelLayer`
 * on one shared World (`JarvisOrbPage`'s own documented pattern for anything
 * needing `send()`, since only the overlay's rendered input can open a
 * turn): `overlay.send(...)` opens the turn, then `overlay.emitEvents([{
 * type: "panel", panelId, spec }, …])` pushes `"panel"` events onto it —
 * panel events ride the identical per-turn `JarvisEvent` stream as every
 * other reply event `ask()` emits, exactly like a real `ScriptedJarvisAdapter`
 * (or a live brain's `render_panel` tool call) would.
 *
 * `composePanelStream` is TOTAL by construction (see that file's doc): every
 * `PanelSpecV1` — regardless of whether its underlying World subject has
 * been seeded with data — resolves to SOME `PanelData` of the requested viz
 * kind. But `PanelTable`/`PanelSparkGrid`/`PanelHeatmap` early-return a plain
 * "No data yet" placeholder with NO testid when their resolved data is
 * genuinely empty (zero rows / zero series / zero points) — so scenarios
 * that assert a specific renderer testid seed real World data first
 * (`setHistory` for line/gauge, `push({ useAnalytics })` for table/heatmap);
 * scenarios that only assert chrome/count/eviction do not need to. Since
 * f52a1992c, `renderHeatmap` also consumes `series` frames (not just
 * `table` ones) — a `priceHistory`+`rollingVol` spec restyled to `heatmap`
 * (the real scripted "make it a heatmap" turn) now resolves non-empty rows
 * too, given seeded history.
 *
 * Per Task 8's review, this spec deliberately does NOT assert field-level
 * flash-isolation granularity on any renderer — that legitimately differs
 * between the React and Solid ports (react: per-span; solid: per-row/cell).
 */

import { JarvisOverlay, JarvisPanelLayer } from "@ui-contract/components";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { MAX_LIVE_PANELS, UNSUPPORTED_SENTINEL_SPEC } from "@rtc/client-core";
import type { PriceTick } from "@rtc/domain";

/** Mirrors `ScriptedJarvisEngine`'s own canned demo panel (`GBP_VOLATILITY_
 * PANEL_SPEC` / `SCRIPTED_PANEL_ID`, module-private there) — a real showPanel
 * turn's exact shape, not an invented fixture. */
const SCRIPTED_PANEL_ID = "panel-scripted-1";
const GBP_VOLATILITY_SPEC: PanelSpecV1 = {
  v: 1,
  title: "GBP Volatility",
  rationale: "Rolling volatility across the GBP majors, sir.",
  source: { kind: "priceHistory", symbols: ["GBPUSD", "GBPJPY"] },
  transforms: [{ kind: "rollingVol", samples: 20 }],
  viz: { kind: "line" },
};
/** `rollingVol({samples: 20})` needs at least 20 points before it emits its
 * first output point — seeded history must clear that bar for the line
 * renderer's testid to actually appear (see the file doc's totality note). */
const ROLLING_VOL_SAMPLES = 20;

const BASE_TIMESTAMP_MS = 1_700_000_000_000;

const ANALYTICS_SEED = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 12_000,
      baseTradedAmount: 1_000_000,
      counterTradedAmount: 1_080_000,
    },
  ],
  history: [],
};

afterEach(() => {
  cleanupMounted();
});

describe("JarvisPanelLayer", () => {
  it("renders nothing while no panels are live", () => {
    const world = createWorld();
    const layer = mountWith(world, JarvisPanelLayer);

    expect(layer.isPresent()).toBe(false);
  });

  it("spawn renders chrome + the line renderer for a real showPanel-shaped turn", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    layer.setHistory("GBPUSD", buildTicks("GBPUSD", ROLLING_VOL_SAMPLES + 5));
    layer.setHistory("GBPJPY", buildTicks("GBPJPY", ROLLING_VOL_SAMPLES + 5));

    await overlay.pressHotkey();
    await overlay.send("show me gbp volatility");
    overlay.emitEvents([
      { type: "panel", panelId: SCRIPTED_PANEL_ID, spec: GBP_VOLATILITY_SPEC },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.isPresent()).toBe(true);
    expect(layer.panelIds()).toEqual([SCRIPTED_PANEL_ID]);
    expect(layer.title(SCRIPTED_PANEL_ID)).toBe("GBP Volatility");
    expect(layer.status(SCRIPTED_PANEL_ID)).toBe("live");
    expect(layer.rendererTestId(SCRIPTED_PANEL_ID)).toBe("jarvis-panel-line");
  });

  it("the real scripted restyle turn (viz-only swap, same priceHistory source) morphs line into heatmap in place", async () => {
    // The genuine demo path: "show me gbp volatility" (showPanel) then "make
    // it a heatmap" (restylePanel) as TWO separate scripted turns —
    // ScriptedJarvisEngine.streamRestylePanelReply re-emits `lastPanel` with
    // ONLY `viz` swapped, keeping the same panelId/source/transforms. Fixed
    // by f52a1992c (composePanelStream's renderHeatmap now also consumes
    // `series` frames, not just `table` ones) — before that fix this exact
    // restyle rendered an empty heatmap with no testid at all.
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    layer.setHistory("GBPUSD", buildTicks("GBPUSD", ROLLING_VOL_SAMPLES + 5));
    layer.setHistory("GBPJPY", buildTicks("GBPJPY", ROLLING_VOL_SAMPLES + 5));

    await overlay.pressHotkey();
    await overlay.send("show me gbp volatility");
    overlay.emitEvents([
      { type: "panel", panelId: SCRIPTED_PANEL_ID, spec: GBP_VOLATILITY_SPEC },
    ]);
    expect(layer.rendererTestId(SCRIPTED_PANEL_ID)).toBe("jarvis-panel-line");
    // Complete the first turn before opening a second one — send$'s
    // concatMap only advances once the in-flight turn's Observable
    // completes, and world.jarvis.emit() throws if called before ask()
    // opens a fresh turn (see world.ts's JarvisWorld.emit doc).
    overlay.emitEvents([{ type: "done" }]);

    await overlay.send("make it a heatmap");
    overlay.emitEvents([
      {
        type: "panel",
        panelId: SCRIPTED_PANEL_ID,
        spec: { ...GBP_VOLATILITY_SPEC, viz: { kind: "heatmap" } },
      },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.panelIds()).toEqual([SCRIPTED_PANEL_ID]);
    expect(layer.status(SCRIPTED_PANEL_ID)).toBe("live");
    expect(
      layer.hasRendererTestId(SCRIPTED_PANEL_ID, "jarvis-panel-line"),
    ).toBe(false);
    expect(layer.rendererTestId(SCRIPTED_PANEL_ID)).toBe(
      "jarvis-panel-heatmap",
    );
  });

  it("an edit can also swap the WHOLE spec (source + viz), not just viz — JarvisPanelsMachine.applyPanelEvent has no such restriction", async () => {
    // A real brain's render_panel tool call isn't limited to the scripted
    // engine's own viz-only restyle shape — this proves the machine's
    // in-place-replace fold (same panelId → same array index, whatever the
    // new spec looks like) holds for a source change too, using the
    // analytics source's own table→heatmap path (untouched by f52a1992c).
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    layer.emit({ useAnalytics: ANALYTICS_SEED });

    await overlay.pressHotkey();
    await overlay.send("show me desk positions, then heat them up");
    overlay.emitEvents([
      {
        type: "panel",
        panelId: "panel-positions",
        spec: {
          v: 1,
          title: "Desk Positions",
          source: { kind: "analytics" },
          transforms: [],
          viz: { kind: "table" },
        },
      },
    ]);
    expect(layer.rendererTestId("panel-positions")).toBe("jarvis-panel-table");

    overlay.emitEvents([
      {
        type: "panel",
        panelId: "panel-positions",
        spec: {
          v: 1,
          title: "Desk P&L Heat",
          source: { kind: "analytics" },
          transforms: [],
          viz: { kind: "heatmap" },
        },
      },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.panelIds()).toEqual(["panel-positions"]);
    expect(
      layer.hasRendererTestId("panel-positions", "jarvis-panel-table"),
    ).toBe(false);
    expect(layer.rendererTestId("panel-positions")).toBe(
      "jarvis-panel-heatmap",
    );
  });

  it("dismiss removes the panel — the layer goes null again once the last one is gone", async () => {
    // Frozen power-saver: dismissThisPanel's WAAPI transition is skipped
    // entirely under freeze (mirrors useFlipGrid's exit-ghost gating), so
    // this exercises the real dismiss INTENT without needing jsdom's absent
    // Element.animate (see WatchlistPanel.contract.spec.ts's own fake-WAAPI
    // describe block for the alternative this deliberately avoids — out of
    // scope here, since the animation itself isn't this layer's own concern).
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "freeze",
    );
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    await overlay.pressHotkey();
    await overlay.send("show me gbp volatility");
    overlay.emitEvents([
      { type: "panel", panelId: SCRIPTED_PANEL_ID, spec: GBP_VOLATILITY_SPEC },
    ]);
    overlay.emitEvents([{ type: "done" }]);
    expect(layer.panelIds()).toEqual([SCRIPTED_PANEL_ID]);

    await layer.dismiss(SCRIPTED_PANEL_ID);

    expect(layer.isPresent()).toBe(false);
  });

  it(`evicts the oldest panel once a 5th spawns (FIFO, capped at MAX_LIVE_PANELS = ${MAX_LIVE_PANELS})`, async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    await overlay.pressHotkey();
    await overlay.send("spawn five panels");
    overlay.emitEvents([
      { type: "panel", panelId: "panel-1", spec: minimalBlotterSpec("One") },
      { type: "panel", panelId: "panel-2", spec: minimalBlotterSpec("Two") },
      {
        type: "panel",
        panelId: "panel-3",
        spec: minimalBlotterSpec("Three"),
      },
      { type: "panel", panelId: "panel-4", spec: minimalBlotterSpec("Four") },
      { type: "panel", panelId: "panel-5", spec: minimalBlotterSpec("Five") },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.panelIds()).toHaveLength(MAX_LIVE_PANELS);
    expect(layer.panelIds()).toEqual([
      "panel-2",
      "panel-3",
      "panel-4",
      "panel-5",
    ]);
  });

  it("a spec that fails the client-side parse re-check renders the unsupported card", async () => {
    // Seeded directly with the machine's own UNSUPPORTED_SENTINEL_SPEC (the
    // by-reference sentinel JarvisPanelsMachine detects) rather than routing
    // through a WsJarvisAdapter — this World has no wire-parsing layer to
    // drive (that substitution is WsJarvisAdapter's own concern, covered by
    // wsRealJarvis.contract.test.ts); JarvisPanelsMachine's by-reference
    // detection is the REAL logic this exercises either way.
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    await overlay.pressHotkey();
    await overlay.send("show me something this build can't render");
    overlay.emitEvents([
      {
        type: "panel",
        panelId: "panel-bad",
        spec: UNSUPPORTED_SENTINEL_SPEC,
      },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.status("panel-bad")).toBe("unsupported");
    expect(layer.rendererTestId("panel-bad")).toBe("jarvis-panel-unsupported");
    expect(layer.unsupportedCopy("panel-bad")).toContain("UNSUPPORTED PANEL");
  });

  it("the spawned panel's chrome carries the spec's rationale as its tooltip", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    await overlay.pressHotkey();
    await overlay.send("show me gbp volatility");
    overlay.emitEvents([
      { type: "panel", panelId: SCRIPTED_PANEL_ID, spec: GBP_VOLATILITY_SPEC },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.rationale(SCRIPTED_PANEL_ID)).toBe(
      "Rolling volatility across the GBP majors, sir.",
    );
  });

  it("renders gauge/table/spark-grid bodies for their respective viz kinds", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    const layer = mountWith(world, JarvisPanelLayer);

    layer.emit({ useAnalytics: ANALYTICS_SEED });

    await overlay.pressHotkey();
    await overlay.send("spawn a variety of panels");
    overlay.emitEvents([
      {
        type: "panel",
        panelId: "panel-gauge",
        spec: priceHistorySpec("EURUSD Gauge", "EURUSD", "gauge"),
      },
      {
        type: "panel",
        panelId: "panel-table",
        spec: {
          v: 1,
          title: "Desk Positions",
          source: { kind: "analytics" },
          transforms: [],
          viz: { kind: "table" },
        },
      },
      {
        type: "panel",
        panelId: "panel-spark",
        spec: priceHistorySpec("EURUSD Spark", "EURUSD", "sparkGrid"),
      },
    ]);
    overlay.emitEvents([{ type: "done" }]);

    expect(layer.rendererTestId("panel-gauge")).toBe("jarvis-panel-gauge");
    expect(layer.rendererTestId("panel-table")).toBe("jarvis-panel-table");
    expect(layer.rendererTestId("panel-spark")).toBe("jarvis-panel-spark-grid");
  });
});

/** No public export of `PanelSpecV1` reaches `@rtc/ui-contract` (it isn't a
 * dependency of `@rtc/shared` — only `@rtc/client-core` is, and that package
 * never re-exports the type by name), so this borrows the type off the one
 * already-exported `PanelSpecV1`-typed const instead of widening any
 * package's public surface just for test literals. */
type PanelSpecV1 = typeof UNSUPPORTED_SENTINEL_SPEC;

/** A deterministic, mildly-wiggling PriceTick series — enough for
 * `rollingVol` to emit non-degenerate (nonzero-variance) points. */
function buildTicks(symbol: string, count: number): PriceTick[] {
  const ticks: PriceTick[] = [];

  for (let i = 0; i < count; i += 1) {
    const mid = 1.27 + (i % 2 === 0 ? 1 : -1) * i * 0.0003;
    ticks.push({
      symbol,
      bid: mid - 0.0002,
      ask: mid + 0.0002,
      mid,
      valueDate: "2026-08-05",
      creationTimestamp: BASE_TIMESTAMP_MS + i * 1_000,
    });
  }

  return ticks;
}

/** A minimal, cheap-to-construct spec for scenarios that only care about
 * chrome/count (eviction) — `source: blotter` with the World's default
 * (empty) `useTrades` renders the table body's "No data yet" placeholder,
 * which is fine: nothing here reads the renderer. */
function minimalBlotterSpec(title: string): PanelSpecV1 {
  return {
    v: 1,
    title,
    source: { kind: "blotter" },
    transforms: [],
    viz: { kind: "table" },
  };
}

/** A minimal `priceHistory`-sourced spec for a given viz kind — used for the
 * gauge/sparkGrid renderer-variety cases, which (unlike table/heatmap) render
 * their testid even over a zero-point series (see the file doc). */
function priceHistorySpec(
  title: string,
  symbol: string,
  viz: "gauge" | "sparkGrid",
): PanelSpecV1 {
  return {
    v: 1,
    title,
    source: { kind: "priceHistory", symbols: [symbol] },
    transforms: [],
    viz: { kind: viz },
  };
}
