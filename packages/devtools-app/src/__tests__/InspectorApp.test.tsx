import { afterEach, expect, test, vi } from "vitest";

import type { AppToInspector, Recording } from "@rtc/devtools-core";
import {
  InspectorStore,
  PROTOCOL_VERSION,
  parseRecording,
  RECORDING_VERSION,
  serializeRecording,
} from "@rtc/devtools-core";

import { formatLogTime } from "#/panels/formatLogTime";
import { inspectorAppPage } from "#tests/pages/InspectorAppPage";

const app = inspectorAppPage();

afterEach(() => {
  app.unmountAll();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("connection badge reads disconnected before any welcome arrives", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  expect(app.text("connection-badge")).toBe("disconnected");
});

test("tree scoping, pin/Escape, Machine tab, Clear, and the wire probe — the full journey", () => {
  // jsdom lacks a real WAAPI; StateTreePanel's change-flash calls it.
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;

  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
          state: { phase: "idle" },
          disposed: false,
          createdAt: 0,
        },
      ],
    });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }

    store.apply({
      kind: "batch",
      events: [
        {
          kind: "machine:state",
          seq: 4,
          ts: 1004,
          machineId: "m1",
          state: { phase: "busy" },
          coalesced: 1,
        },
        {
          kind: "wire:in",
          seq: 5,
          ts: 1005,
          msgType: "PRICE",
          payload: null,
        },
      ],
    });
  });

  expect(app.text("connection-badge")).toBe("rtc-web");
  expect(app.timelineRowCount()).toBe(5);

  // Scope to the fx presenter: only its emissions remain, State narrows.
  app.clickNavNode("presenter:fx");
  expect(app.timelineRowCount()).toBe(3);
  expect(app.exists("devtools-machine-row")).toBe(false);

  // Pin via keyboard from follow mode; State@seq differs from live.
  app.pressKeyGlobal("ArrowUp");
  app.pressKeyGlobal("ArrowUp");
  app.pressKeyGlobal("ArrowUp");
  expect(app.exists("pinned-bar")).toBe(true);
  app.click("context-tab-state");
  expect(app.hasText("≠ live")).toBe(true);

  // Wire probe: scope jumps to All with a ±100ms radius; Esc restores fx.
  app.clickWireProbeButton();
  expect(app.navNodeIsSelected("all")).toBe(true);
  expect(app.hasText(`±100ms @ ${formatLogTime(PROBED_ROW_TS)} ✕`)).toBe(true);
  app.pressKeyGlobal("Escape");
  expect(app.navNodeIsSelected("presenter:fx")).toBe(true);
  expect(app.hasTextMatching(/^±100ms @ /)).toBe(false);
  expect(app.exists("pinned-bar")).toBe(true); // still pinned

  app.pressKeyGlobal("Escape");
  expect(app.exists("pinned-bar")).toBe(false);

  // Machines branch: the kind node scopes to machine rows; the Machine tab
  // appears for an instance.
  app.clickNavNode("machineKind:tileExecution");
  expect(app.timelineRowCount()).toBe(1);
  expect(app.text("devtools-machine-row")).toContain("tileExecution");
  app.clickExpandCaretOf("machineKind:tileExecution");
  app.clickNavNode("machine:m1");
  app.click("context-tab-machine");
  expect(app.hasText("Intents (0)")).toBe(true);

  // Wire branch: State is unavailable.
  app.clickNavNode("msgType:PRICE");
  expect(app.hasText("wire messages carry no state")).toBe(true);

  // Clear (keyboard) empties every scope and zeroes the All badge; Unclear
  // restores.
  app.clickNavNode("all");
  app.pressKeyGlobal("c");
  expect(app.timelineRowCount()).toBe(0);
  expect(app.navNodeText("all")).toContain("0");
  app.click("unclear-log");
  expect(app.timelineRowCount()).toBe(5);
});

test("wire probe from All strands no radius on Escape — pin survives, scope stays All", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  // Pin a row from the default (All) scope, then probe its wire — pushing
  // ALL_SCOPE onto the already-current All scope is a no-op in
  // useNavigation (no history recorded), so `popScope()` alone can't be
  // trusted to signal "a radius is active".
  app.clickPinButtonOfRow(0);
  app.clickWireProbeButton();
  expect(app.navNodeIsSelected("all")).toBe(true);
  expect(app.hasText(`±100ms @ ${formatLogTime(PROBED_ROW_TS)} ✕`)).toBe(true);

  app.pressKeyGlobal("Escape");
  expect(app.hasTextMatching(/^±100ms @ /)).toBe(false);
  expect(app.exists("pinned-bar")).toBe(true); // still pinned
  expect(app.navNodeIsSelected("all")).toBe(true);

  app.pressKeyGlobal("Escape");
  expect(app.exists("pinned-bar")).toBe(false);
});

test("dismissing the radius chip returns to the pre-probe scope, same as Escape", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  // Scope to the fx presenter, pin a row, then probe its wire — the chip's
  // dismiss must pop back to this scope exactly like Escape's radius branch.
  app.clickNavNode("presenter:fx");
  app.pressKeyGlobal("ArrowUp");
  app.pressKeyGlobal("ArrowUp");
  app.pressKeyGlobal("ArrowUp");
  app.clickWireProbeButton();
  expect(app.selectedNavScopeId()).toBe("all");
  expect(app.hasText(`±100ms @ ${formatLogTime(PROBED_ROW_TS)} ✕`)).toBe(true);

  app.clickTitle("Clear radius filter");
  expect(app.hasTextMatching(/^±100ms @ /)).toBe(false);
  expect(app.selectedNavScopeId()).toBe("presenter:fx");
  expect(app.exists("pinned-bar")).toBe(true); // still pinned

  // Nothing left to pop: Escape resumes the pin without moving the scope.
  app.pressKeyGlobal("Escape");
  expect(app.selectedNavScopeId()).toBe("presenter:fx");
  expect(app.exists("pinned-bar")).toBe(false);
});

test("shortcuts are ignored while the tree has focus, and the keydown listener is bound once", () => {
  const store = new InspectorStore({ coalesce: false });
  const addSpy = vi.spyOn(window, "addEventListener");
  const handle = app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  handle.rerenderSame();
  handle.rerenderSame();
  expect(
    addSpy.mock.calls.filter(([type]) => {
      return type === "keydown";
    }).length,
  ).toBe(1);

  // Focus-WITHIN, not a focused container: the tree's own nodes are what
  // take focus, and their keydown bubbles to the window listener carrying a
  // target inside `[data-nav-tree]` — which the router must swallow ONLY
  // for the keys the tree itself owns (Arrow*/Enter). ArrowUp is one of
  // those, so it stays swallowed here.
  app.focusNavNode("all");
  app.pressKeyOnNavNode("all", "ArrowUp");
  expect(app.exists("pinned-bar")).toBe(false);

  app.pressKeyGlobal("ArrowUp");
  expect(app.exists("pinned-bar")).toBe(true);

  // Every OTHER global shortcut stays live even while a tree node has focus
  // — the controller's amended focus model (§20.12): the tree owns only
  // Arrow*/Enter, `/`, `c` and `Escape` are global regardless of focus.
  app.focusNavNode("all");
  app.pressKeyOnNavNode("all", "c");
  expect(app.timelineRowCount()).toBe(0);
  expect(app.exists("unclear-log")).toBe(true);
  app.click("unclear-log");

  // Re-pin so Escape has a pin to resume from. This dispatches on `window`
  // (not a tree node) — ArrowUp IS one of the tree's own keys, so with the
  // tree focused it stays correctly swallowed, same as above.
  app.pressKeyGlobal("ArrowUp");
  expect(app.exists("pinned-bar")).toBe(true);

  app.focusNavNode("all");
  app.pressKeyOnNavNode("all", "Escape");
  expect(app.exists("pinned-bar")).toBe(false);

  app.focusNavNode("all");
  app.pressKeyOnNavNode("all", "/");
  expect(app.searchHasFocus()).toBe(true);
});

test("ArrowDown steps forward, / focuses the scoped search, and keys typed in an input stay the input's", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  app.pressKeyGlobal("ArrowUp"); // follow → the tail, seq 3
  app.pressKeyGlobal("ArrowUp"); // seq 2
  app.pressKeyGlobal("ArrowDown"); // back to seq 3
  app.click("context-tab-event");
  expect(app.pinnedEventSeq()).toBe("3");

  app.pressKeyGlobal("/");
  expect(app.searchHasFocus()).toBe(true);

  // Typing inside the search box is the box's business, not the timeline's.
  app.pressKeyOnSearch("ArrowUp");
  expect(app.pinnedEventSeq()).toBe("3");

  // …except Escape, which blurs it without also resuming the timeline.
  app.pressKeyOnSearch("Escape");
  expect(app.searchHasFocus()).toBe(false);
  expect(app.exists("pinned-bar")).toBe(true);
});

test("Escape re-attaches a detached tail once nothing is scoped or pinned", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  // jsdom lays nothing out, so every element reads 0 tall and every scroll
  // looks like "at the bottom" — the detached state has to be staged.
  const rows = app.timelineRowsList();

  Object.defineProperty(rows, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(rows, "clientHeight", {
    value: 100,
    configurable: true,
  });
  app.scroll("timeline-rows");
  expect(app.exists("live-chip")).toBe(true);

  app.pressKeyGlobal("Escape");
  expect(app.exists("live-chip")).toBe(false);
});

test("show in All widens the scope around a hidden pin; an intent-history click pins its own row", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: [],
          state: { phase: "idle" },
          disposed: false,
          createdAt: 0,
        },
      ],
    });
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "machine:intent",
          seq: 1,
          ts: 1001,
          machineId: "m1",
          name: "execute",
          args: [],
        },
        {
          kind: "stream:emission",
          seq: 2,
          ts: 1002,
          streamId: "fx.price$",
          value: 7,
          coalesced: 1,
        },
      ],
    });
  });

  // Pin the fx row under All, then scope to the machines branch: the pin
  // survives but is out of view, so the bar offers the way back.
  app.clickPinButtonOfRow(1);
  app.clickNavNode("machineKind:tileExecution");
  app.click("show-in-all");
  expect(app.navNodeIsSelected("all")).toBe(true);

  app.clickExpandCaretOf("machineKind:tileExecution");
  app.clickNavNode("machine:m1");
  app.click("context-tab-machine");
  app.click("intent-name");
  app.click("context-tab-event");
  expect(app.pinnedEventSeq()).toBe("1");
});

test("a held modifier hands the keystroke back to the browser — Cmd/Ctrl+C never clears", () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  // `e.key` is plain "c" for Cmd+C too, and a text selection leaves focus on
  // <body> — so without the modifier guard, copying a value out of the panel
  // would wipe the timeline.
  app.pressKeyGlobal("c", { metaKey: true });
  expect(app.timelineRowCount()).toBe(3);
  expect(app.exists("unclear-log")).toBe(false);

  app.pressKeyGlobal("c", { ctrlKey: true });
  expect(app.timelineRowCount()).toBe(3);
  expect(app.exists("unclear-log")).toBe(false);

  // Cmd/Ctrl+ArrowUp is "scroll to top", not "step the selection".
  app.pressKeyGlobal("ArrowUp", { ctrlKey: true });
  expect(app.exists("pinned-bar")).toBe(false);

  // Unmodified, the same keys still act.
  app.pressKeyGlobal("ArrowUp");
  expect(app.exists("pinned-bar")).toBe(true);
  app.pressKeyGlobal("c");
  expect(app.timelineRowCount()).toBe(0);
});

test("pinned selection resets when the datasource swaps (import lands, Back to live)", async () => {
  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  app.commit(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  // Scope away from All first: the swap must reset the SCOPE too, not only
  // the pin — an imported recording has none of the live app's stores, so a
  // surviving `presenter:fx` would scope the timeline to nothing.
  app.clickNavNode("presenter:fx");
  expect(app.navNodeIsSelected("presenter:fx")).toBe(true);

  app.clickPinButtonOfRow(0);
  expect(app.exists("pinned-bar")).toBe(true);

  // Clear (watermark = the live log's latest seq, 3) before importing: the
  // datasource-swap effect resets pin/radius/scope but must ALSO reset the
  // clearedBeforeSeq watermark, or the imported recording's own low seqs
  // (a fresh per-hub counter, per LogRow.seq) are hidden by a watermark
  // left over from an entirely different log.
  app.clickNavNode("all");
  app.pressKeyGlobal("c");
  expect(app.exists("unclear-log")).toBe(true);

  const file = new File([serializeRecording(sampleRecording())], "r.json", {
    type: "application/json",
  });

  app.changeFile("import", file);

  await app.waitFor(() => {
    expect(app.exists("recording-banner")).toBe(true);
  });
  // Importing swapped the datasource out from under the old pin — it must
  // not silently survive onto the imported timeline. The banner landing
  // only proves `imported` state committed; the reset effect that clears
  // the pin runs as a passive effect on a later tick, so this needs its
  // own wait rather than an assertion immediately following the banner's.
  // The stale watermark must be gone too: no dangling Unclear button, and
  // the imported recording's row (seq 1, which the old watermark of 3 would
  // have hidden) is listed rather than silently swallowed. The watermark
  // reset commits on its own tick after the pin/scope reset, so it sits
  // INSIDE the wait — asserted synchronously after it, this read a
  // still-mounted Unclear button on the CI coverage run (3× on 2026-08-30).
  await app.waitFor(() => {
    expect(app.exists("pinned-bar")).toBe(false);
    expect(app.navNodeIsSelected("all")).toBe(true);
    expect(app.exists("unclear-log")).toBe(false);
  });
  expect(app.timelineRowCount()).toBe(1);

  app.click("back-to-live");
  await app.waitFor(() => {
    expect(app.exists("recording-banner")).toBe(false);
  });
  // Back to live is itself a datasource swap — still following, not stuck
  // on whatever seq the import last had pinned. Same passive-effect gap as
  // above, so wait rather than assert immediately.
  // The live log was never cleared FROM THE STORE — Clear only ever hid
  // rows behind a watermark, which the swap back to live also resets (now
  // 0) — so all 3 live rows are visible again, not the pre-Clear state
  // stuck hidden. Same later-tick watermark reset as above: inside the wait.
  await app.waitFor(() => {
    expect(app.exists("pinned-bar")).toBe(false);
    expect(app.navNodeIsSelected("all")).toBe(true);
    expect(app.exists("unclear-log")).toBe(false);
  });
  expect(app.timelineRowCount()).toBe(3);
});

test("an imported recording names itself in the connection badge instead of 'disconnected'", async () => {
  // jsdom lacks a real WAAPI; StateTreePanel's change-flash calls it.
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;

  const store = new InspectorStore({ coalesce: false });
  app.mount(store);

  const file = new File([serializeRecording(sampleRecording())], "r.json", {
    type: "application/json",
  });

  app.changeFile("import", file);

  await app.waitFor(() => {
    expect(app.text("connection-badge")).toBe("recording · imported-app");
  });

  app.click("back-to-live");
  await app.waitFor(() => {
    expect(app.text("connection-badge")).not.toBe("recording · imported-app");
  });
});

test("liveHistory seeds pre-mount store state — a pinned row reconstructs a machine that only ever existed before mount", () => {
  const store = new InspectorStore({ coalesce: false });

  // Applied before InspectorApp (and its store.tap() tee) ever mounts.
  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
  store.apply({
    kind: "snapshot",
    streams: [],
    machines: [
      {
        machineId: "m-pre",
        machineKind: "testMachine",
        args: [],
        state: { phase: "pre-mount" },
        disposed: false,
        createdAt: 500,
      },
    ],
  });

  app.mount(store);

  // A log row generated only after mount — its reconstructed state must
  // still carry the pre-mount machine if the seed worked.
  app.commit(() => {
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq: 1,
          ts: 1000,
          streamId: "fx.price$",
          value: 1,
          coalesced: 1,
        },
      ],
    });
  });

  expect(app.timelineRowCount()).toBe(1);

  app.clickPinButtonOfRow(0);
  app.click("context-tab-state");

  expect(app.hasText("m-pre")).toBe(true);
});

test("re-renders do not re-tap the store — liveHistory keeps its identity across renders", () => {
  const store = new InspectorStore({ coalesce: false });
  const tapSpy = vi.spyOn(store, "tap");

  const handle = app.mount(store);

  handle.rerenderSame();
  handle.rerenderSame();

  expect(tapSpy).toHaveBeenCalledTimes(1);
});

test("re-renders inside React.StrictMode do not grow past its own double-invoke baseline", () => {
  const store = new InspectorStore({ coalesce: false });
  const tapSpy = vi.spyOn(store, "tap");

  const handle = app.mountInStrictMode(store);

  // StrictMode's dev-only mount check (mount effect, synthetic cleanup,
  // re-mount effect against the same committed closure) always tees this
  // exact effect twice, independent of whether liveHistory's identity is
  // stable — that pair alone can't distinguish the fix from the bug. What
  // it CAN'T explain is growth from further re-renders: only a real
  // re-render can hand the effect's dependency array a fresh liveHistory,
  // so the regression this guards against is the count climbing past the
  // StrictMode baseline as rerender() is called again.
  handle.rerenderSame();
  handle.rerenderSame();

  expect(tapSpy).toHaveBeenCalledTimes(2);
});

test("liveHistory seeds from an exact store clone, not the coalesced live snapshot — a pre-mount stream survives the seed even though no rAF has flushed the store", async () => {
  // A default store (coalescing on) only rebuilds getSnapshot() after
  // FRAMES_PER_FLUSH real rAF callbacks — and jsdom really does provide
  // requestAnimationFrame, so nothing here (not this test, not InspectorApp's
  // mount) ever ticks one. So getSnapshot() stays at its initial empty state
  // for the whole test, while the store's internal fold is already correct —
  // exactly the seam the mount-time seed must read through exactly, not
  // around.
  const store = new InspectorStore();

  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
  store.apply({
    kind: "batch",
    events: [
      {
        kind: "stream:emission",
        seq: 1,
        ts: 1000,
        streamId: PRE_MOUNT_STREAM_ID,
        value: 1.2345,
        coalesced: 1,
      },
    ],
  });

  const capture = stubDownloadCapture();
  app.mount(store);

  app.click("export-buffer");

  // toRecording() always prepends an empty base snapshot ahead of the real
  // frames, so this looks for the frame carrying the stream rather than
  // just the first "snapshot"-kind frame.
  const recording = parseRecording(await capture.blob().text());
  const seedFrame = recording.frames.find((frame) => {
    return (
      frame.kind === "snapshot" &&
      frame.streams.some((s) => {
        return s.streamId === PRE_MOUNT_STREAM_ID;
      })
    );
  });

  expect(seedFrame).toBeDefined();
});

const PRE_MOUNT_STREAM_ID = 'fx.price[["EURUSD"]]';

interface DownloadCapture {
  blob: () => Blob;
}

/** Stubs the object-URL globals `downloadRecording` reaches for (jsdom
 * implements neither) and hands back an accessor for whatever Blob a
 * download button handed to `createObjectURL` — lets a test read back what
 * a toolbar export actually downloaded without the DOM's real URL/anchor
 * machinery. */
function stubDownloadCapture(): DownloadCapture {
  let captured: Blob | null = null;

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      captured = blob;

      return "blob:fake";
    }),
    revokeObjectURL: vi.fn(),
  });

  return {
    blob: (): Blob => {
      if (captured === null) {
        throw new Error("no blob captured yet");
      }

      return captured;
    },
  };
}

function sampleRecording(): Recording {
  return {
    version: RECORDING_VERSION,
    appId: "imported-app",
    startedAt: 5000,
    frames: [
      {
        kind: "snapshot",
        streams: [{ streamId: "z.a$", value: 7 }],
        machines: [],
      },
      // A low seq (its own fresh per-hub counter, per LogRow.seq) — a Clear
      // watermark left over from the live session (seq 3, see
      // emissionBatches()) would hide this row if it survived the swap.
      {
        kind: "batch",
        events: [
          {
            kind: "stream:emission",
            seq: 1,
            ts: 5001,
            streamId: "z.a$",
            value: 8,
            coalesced: 1,
          },
        ],
      },
    ],
  };
}

// The row the wire-probe journeys pin before probing: seq 1 of
// emissionBatches() below, ts 1000 + 1.
const PROBED_ROW_TS = 1001;

function emissionBatches(): readonly AppToInspector[] {
  const frames: AppToInspector[] = [];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq,
          ts: 1000 + seq,
          streamId: "fx.price$",
          value: seq,
          coalesced: 1,
        },
      ],
    });
  }

  return frames;
}
