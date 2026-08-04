import { EMPTY, Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  AnalyticsPort,
  BlotterPort,
  PriceTick,
  PricingPort,
  ReferenceDataPort,
} from "@rtc/domain";
import type { PanelSpecV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import type { PanelStreamDeps } from "./composePanelStream.js";
import {
  createJarvisPanelsMachine,
  MAX_LIVE_PANELS,
  UNSUPPORTED_SENTINEL_SPEC,
} from "./JarvisPanelsMachine.js";
import { JarvisPanelsPresenter } from "./JarvisPanelsPresenter.js";

describe("JarvisPanelsPresenter", () => {
  it("projects live machine panels into JarvisPanelVm rows (title/rationale/status/vizKind)", () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const deps = makeDeps();
    const presenter = new JarvisPanelsPresenter(machine, deps);

    const spec = makeSpec({
      title: "GBP Vol",
      rationale: "Because sir",
      source: { kind: "blotter" },
      viz: { kind: "table" },
    });
    events$.next({ type: "panel", panelId: "p1", spec });

    const rows = latest(presenter.panels$);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      panelId: "p1",
      title: "GBP Vol",
      rationale: "Because sir",
      status: "live",
      vizKind: "table",
    });
  });

  it("a structurally-identical-but-different-reference spec stays 'live' — only the machine's actual sentinel (by reference) is 'unsupported'", () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const deps = makeDeps();
    const presenter = new JarvisPanelsPresenter(machine, deps);

    events$.next({
      type: "panel",
      panelId: "looks-like-sentinel",
      spec: unsupportedSentinelLike(),
    });

    const row = latest(presenter.panels$).find((r) => {
      return r.panelId === "looks-like-sentinel";
    });
    expect(row?.status).toBe("live");
  });

  it("an unsupported panel's data$ is EMPTY", () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const deps = makeDeps();
    const presenter = new JarvisPanelsPresenter(machine, deps);

    events$.next({
      type: "panel",
      panelId: "bad",
      spec: UNSUPPORTED_SENTINEL_SPEC,
    });

    const row = latest(presenter.panels$).find((r) => {
      return r.panelId === "bad";
    });
    expect(row?.status).toBe("unsupported");
    expect(row?.data$).toBe(EMPTY);
  });

  it("dismissing a panel unsubscribes its underlying port streams (the ws-effects #171 lesson)", () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const track = instrumentedTicks();
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: track.ticks$ }),
    });
    const presenter = new JarvisPanelsPresenter(machine, deps);

    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      viz: { kind: "line" },
    });
    events$.next({ type: "panel", panelId: "p1", spec });

    expect(track.subscribeCount).toBe(1);
    expect(track.unsubscribeCount).toBe(0);

    presenter.dismissPanel("p1");

    expect(track.unsubscribeCount).toBe(1);
  });

  it("FIFO-evicting a panel at MAX_LIVE_PANELS also unsubscribes its port streams", () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const track = instrumentedTicks();
    const deps = makeDeps({
      pricing: fakePricing({ EVICTME: track.ticks$ }),
    });
    // Constructed for its side-effecting warm subscription; this test only
    // asserts on the fake port spy below, never on the presenter directly.
    const presenter = new JarvisPanelsPresenter(machine, deps);
    expect(presenter.panels$).toBeDefined();

    events$.next({
      type: "panel",
      panelId: "evict-me",
      spec: makeSpec({
        source: { kind: "fxTicks", symbols: ["EVICTME"] },
        viz: { kind: "line" },
      }),
    });
    expect(track.unsubscribeCount).toBe(0);

    // Spawn MAX_LIVE_PANELS more distinct panels — the (MAX_LIVE_PANELS+1)th
    // live panel overall evicts "evict-me" (index 0) FIFO.
    for (let i = 0; i < MAX_LIVE_PANELS; i += 1) {
      events$.next({
        type: "panel",
        panelId: `filler-${i}`,
        spec: makeSpec({ source: { kind: "blotter" }, viz: { kind: "table" } }),
      });
    }

    expect(track.unsubscribeCount).toBe(1);
  });

  it("editing a panel's spec (restyle) tears down the old interpretation and starts a fresh one", () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const trackA = instrumentedTicks();
    const trackB = instrumentedTicks();
    const deps = makeDeps({
      pricing: fakePricing({ SYMA: trackA.ticks$, SYMB: trackB.ticks$ }),
    });
    // Constructed for its side-effecting warm subscription; this test only
    // asserts on the fake port spies below, never on the presenter directly.
    const presenter = new JarvisPanelsPresenter(machine, deps);
    expect(presenter.panels$).toBeDefined();

    events$.next({
      type: "panel",
      panelId: "p1",
      spec: makeSpec({
        source: { kind: "fxTicks", symbols: ["SYMA"] },
        viz: { kind: "line" },
      }),
    });
    expect(trackA.subscribeCount).toBe(1);
    expect(trackA.unsubscribeCount).toBe(0);
    expect(trackB.subscribeCount).toBe(0);

    // Same panelId, a NEW spec object (a restylePanel-style edit) — morphed
    // in place by the machine, not a fresh spawn.
    events$.next({
      type: "panel",
      panelId: "p1",
      spec: makeSpec({
        source: { kind: "fxTicks", symbols: ["SYMB"] },
        viz: { kind: "table" },
      }),
    });

    expect(trackA.unsubscribeCount).toBe(1);
    expect(trackB.subscribeCount).toBe(1);
  });

  it("multiple concurrent readers of the same live panel's data$ still cost the source ports exactly one subscription", async () => {
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const track = instrumentedTicks();
    const deps = makeDeps({ pricing: fakePricing({ EURUSD: track.ticks$ }) });
    const presenter = new JarvisPanelsPresenter(machine, deps);

    events$.next({
      type: "panel",
      panelId: "p1",
      spec: makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        viz: { kind: "line" },
      }),
    });

    const row = latest(presenter.panels$).find((r) => {
      return r.panelId === "p1";
    });
    expect(row).toBeDefined();

    const subA = row?.data$.subscribe();
    const subB = row?.data$.subscribe();
    // The presenter's own warm hold plus these two readers all share the
    // ONE composePanelStream subscription (shareReplay).
    expect(track.subscribeCount).toBe(1);

    subA?.unsubscribe();
    subB?.unsubscribe();
    // The presenter's own warm hold is still live — a UI reader unmounting
    // must not tear down a still-live panel's port stream.
    expect(track.unsubscribeCount).toBe(0);
  });
});

function makeSpec(
  overrides: Partial<PanelSpecV1> & Pick<PanelSpecV1, "source" | "viz">,
): PanelSpecV1 {
  return { v: 1, title: "Test panel", transforms: [], ...overrides };
}

/** Structurally identical to the machine's real `UNSUPPORTED_SENTINEL_SPEC`
 * but a DIFFERENT object reference — used to prove the machine's
 * by-reference detection, per its doc, before driving the real sentinel. */
function unsupportedSentinelLike(): PanelSpecV1 {
  return {
    v: 1,
    title: "Unsupported panel",
    source: { kind: "blotter" },
    transforms: [],
    viz: { kind: "table" },
  };
}

function fakeReferenceData(): ReferenceDataPort {
  return {
    getCurrencyPairs: () => {
      return of([]);
    },
  };
}

function fakePricing(
  overrides: Partial<Record<string, Observable<PriceTick>>> = {},
): PricingPort {
  return {
    getPriceUpdates: (symbol: string) => {
      return overrides[symbol] ?? EMPTY;
    },
    getPriceHistory: () => {
      return of([]);
    },
    getRfqQuote: () => {
      return EMPTY;
    },
  };
}

function fakeBlotter(): BlotterPort {
  return {
    getTradeStream: () => {
      return of([]);
    },
  };
}

function fakeAnalytics(): AnalyticsPort {
  return {
    getAnalytics: () => {
      return EMPTY;
    },
  };
}

function makeDeps(overrides: Partial<PanelStreamDeps> = {}): PanelStreamDeps {
  return {
    referenceData: fakeReferenceData(),
    pricing: fakePricing(),
    blotter: fakeBlotter(),
    analytics: fakeAnalytics(),
    ...overrides,
  };
}

/** A `instrumentedTicks()` result: a never-completing price-tick source
 * (mirrors a real live feed) alongside live subscribe/unsubscribe counters —
 * the spy this class's teardown contract is checked against. */
interface InstrumentedTicks {
  readonly ticks$: Observable<PriceTick>;
  readonly subscribeCount: number;
  readonly unsubscribeCount: number;
}

function instrumentedTicks(): InstrumentedTicks {
  const tracker = { subscribeCount: 0, unsubscribeCount: 0 };
  const ticks$ = new Observable<PriceTick>((subscriber) => {
    tracker.subscribeCount += 1;
    subscriber.next({
      symbol: "X",
      bid: 0,
      ask: 0,
      mid: 0,
      valueDate: "2026-08-04",
      creationTimestamp: 0,
    });
    return (): void => {
      tracker.unsubscribeCount += 1;
    };
  });
  return {
    ticks$,
    get subscribeCount(): number {
      return tracker.subscribeCount;
    },
    get unsubscribeCount(): number {
      return tracker.unsubscribeCount;
    },
  };
}

/** Synchronous "current value" read of a warm, replaying Observable
 * (`panels$` always has a current value once the machine has processed at
 * least one event, per JarvisPanelsMachine's own warm-subscription doc). */
function latest<T>(source: Observable<T>): T {
  let value: T | undefined;
  const sub = source.subscribe((v) => {
    value = v;
  });
  sub.unsubscribe();

  if (value === undefined) {
    throw new Error("expected a synchronous current value");
  }

  return value;
}
