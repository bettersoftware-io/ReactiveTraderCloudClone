import { NEVER, type Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type JarvisEvent,
  type PanelStreamDeps,
  UNSUPPORTED_SENTINEL_SPEC,
} from "@rtc/client-core";
import type { PanelData, PanelInstance } from "@rtc/core-api";
import type { PositionUpdates, PriceTick, Trade } from "@rtc/domain";

import {
  createJarvisPanelsMachine,
  createJarvisPanelsPresenter,
} from "#/presenters/jarvisPanels";

describe("jarvisPanels (async)", () => {
  it("an unsupported panel lists with no viz and data that completes empty", () => {
    const { events$, presenter } = createFixture();
    events$.next({
      type: "panel",
      panelId: "bad",
      spec: UNSUPPORTED_SENTINEL_SPEC,
    });

    const rows = latest(presenter.panels$);
    expect(rows[0]).toMatchObject({
      panelId: "bad",
      status: "unsupported",
      vizKind: null,
    });
    let completed = false;
    rows[0].data$.subscribe({
      complete: () => {
        completed = true;
      },
    });
    expect(completed).toBe(true);
    expect(latest(presenter.panelData$("bad"))).toBe(null);
  });

  it("a priceHistory panel renders once every symbol has a history", () => {
    const eur = new Subject<readonly PriceTick[]>();
    const gbp = new Subject<readonly PriceTick[]>();
    const { events$, presenter } = createFixture({
      getPriceHistory: (symbol: string) => {
        return symbol === "EURUSD" ? eur : gbp;
      },
    });
    events$.next(
      createPanelEvent("hist", {
        v: 1,
        title: "History",
        source: { kind: "priceHistory", symbols: ["EURUSD", "GBPUSD"] },
        transforms: [],
        viz: { kind: "line" },
      }),
    );
    const seen = collectData(presenter.panelData$("hist"));

    eur.next([createTick("EURUSD", 1.1)]);
    expect(seen.filter(isData)).toEqual([]);
    gbp.next([createTick("GBPUSD", 1.3)]);
    expect(seen.filter(isData)).toHaveLength(1);
    expect(JSON.stringify(seen.at(-1))).toContain("1.3");
  });

  it("a blotter panel renders the trades; an analytics panel renders the positions", () => {
    const trades = new Subject<readonly Trade[]>();
    const positions = new Subject<PositionUpdates>();
    const { events$, presenter } = createFixture({
      blotter: trades,
      analytics: positions,
    });
    events$.next(
      createPanelEvent("trades", {
        v: 1,
        title: "Trades",
        source: { kind: "blotter" },
        transforms: [],
        viz: { kind: "table" },
      }),
    );
    const seen = collectData(presenter.panelData$("trades"));
    trades.next([createTrade()]);
    expect(seen.at(-1)).toMatchObject({ kind: "table" });
    expect(JSON.stringify(seen.at(-1))).toContain("EURUSD");
  });

  it("an unknown source renders its empty frame at once", () => {
    const { events$, presenter } = createFixture();
    events$.next(
      createPanelEvent("odd", {
        v: 1,
        title: "Odd",
        source: { kind: "no-such-source" } as unknown as PanelSpec["source"],
        transforms: [],
        viz: { kind: "table" },
      }),
    );
    expect(latest(presenter.panelData$("odd"))).toMatchObject({
      kind: "table",
    });
  });

  it("panelData$ follows the roster: null once its panel is dismissed", () => {
    const { events$, presenter } = createFixture();
    events$.next(createPanelEvent("p"));
    const seen = collectData(presenter.panelData$("p"));
    presenter.dismissPanel("p");
    expect(seen.at(-1)).toBe(null);
  });

  it("an edit to a panel's spec rebuilds its data; the same spec keeps it", () => {
    const { events$, presenter } = createFixture();
    const spec = createAnalyticsSpec("A");
    events$.next(createPanelEvent("p", spec));
    const first = latest(presenter.panels$)[0].data$;
    events$.next(createPanelEvent("p", spec));
    expect(latest(presenter.panels$)[0].data$).toBe(first);
    events$.next(createPanelEvent("p", createAnalyticsSpec("B")));
    expect(latest(presenter.panels$)[0].data$).not.toBe(first);
  });

  it("the lifetime's end stops the roster following its events", () => {
    const lifetime = new AbortController();
    const { events$, presenter } = createFixture({}, lifetime.signal);
    lifetime.abort();
    events$.next(createPanelEvent("late"));
    expect(latest(presenter.panels$)).toEqual([]);
  });
});

interface Overrides {
  readonly getPriceHistory?: (symbol: string) => Subject<readonly PriceTick[]>;
  readonly blotter?: Subject<readonly Trade[]>;
  readonly analytics?: Subject<PositionUpdates>;
}

interface Fixture {
  readonly events$: Subject<JarvisEvent>;
  readonly presenter: ReturnType<typeof createJarvisPanelsPresenter>;
}

function createFixture(
  overrides: Overrides = {},
  lifetime: AbortSignal = new AbortController().signal,
): Fixture {
  const events$ = new Subject<JarvisEvent>();
  const deps = {
    referenceData: { getCurrencyPairs: createNever },
    pricing: {
      getPriceUpdates: createNever,
      getPriceHistory: overrides.getPriceHistory ?? createNever,
      getRfqQuote: createNever,
    },
    blotter: {
      getTradeStream: (): Observable<readonly Trade[]> => {
        return overrides.blotter ?? NEVER;
      },
    },
    analytics: {
      getAnalytics: (): Observable<PositionUpdates> => {
        return overrides.analytics ?? NEVER;
      },
    },
  } as unknown as PanelStreamDeps;
  const machine = createJarvisPanelsMachine(events$, lifetime);
  return {
    events$,
    presenter: createJarvisPanelsPresenter(machine, deps, lifetime),
  };
}

function createPanelEvent(
  panelId: string,
  spec: PanelSpec = createAnalyticsSpec("P&L"),
): JarvisEvent {
  return { type: "panel", panelId, spec };
}

function createAnalyticsSpec(title: string): PanelSpec {
  return {
    v: 1,
    title,
    source: { kind: "analytics" },
    transforms: [],
    viz: { kind: "table" },
  };
}

function createTick(symbol: string, mid: number): PriceTick {
  return {
    symbol,
    bid: mid,
    ask: mid,
    mid,
    valueDate: "2026-01-03",
    creationTimestamp: 1,
  } as PriceTick;
}

function createTrade(): Trade {
  return {
    tradeId: 1,
    tradeName: "T1",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    spotRate: 1.1,
    status: "Done",
  } as unknown as Trade;
}

interface Unsubscribable {
  unsubscribe(): void;
}

interface Subscribable<T> {
  subscribe(next: (value: T) => void): Unsubscribable;
}

function latest<T>(stream: Subscribable<T>): T {
  const seen: T[] = [];
  stream
    .subscribe((value) => {
      seen.push(value);
    })
    .unsubscribe();
  return seen[seen.length - 1] as T;
}

function collectData(
  stream: Subscribable<PanelData | null>,
): (PanelData | null)[] {
  const seen: (PanelData | null)[] = [];
  stream.subscribe((value) => {
    seen.push(value);
  });
  return seen;
}

function isData(value: PanelData | null): value is PanelData {
  return value !== null;
}

type PanelSpec = NonNullable<PanelInstance["spec"]>;

function createNever(): Observable<never> {
  return NEVER;
}
