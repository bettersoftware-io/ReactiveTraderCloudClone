import { Effect, Exit, Scope } from "effect";
import { NEVER, Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  type JarvisEvent,
  type PanelStreamDeps,
  UNSUPPORTED_SENTINEL_SPEC,
} from "@rtc/client-core";
import type { PanelData, PanelInstance } from "@rtc/core-api";
import type { PositionUpdates, PriceTick, Trade } from "@rtc/domain";

import { createDetachedHost, type EffectHost } from "#/bridge/out";
import {
  createJarvisPanelsMachine,
  createJarvisPanelsPresenter,
} from "#/presenters/jarvisPanels";

describe("jarvisPanels (effect)", () => {
  afterEach(async () => {
    for (const host of hosts.splice(0)) {
      await Effect.runPromise(Scope.close(host.scope, Exit.void));
    }
  });

  it("an unsupported panel lists with no viz and data that completes empty", async () => {
    const { events$, presenter } = await createFixture();
    events$.next({
      type: "panel",
      panelId: "bad",
      spec: UNSUPPORTED_SENTINEL_SPEC,
    });
    await tick();

    const rows = await latest(presenter.panels$);
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
    // Synchronously, as the RxJS presenter's `of(null)`: no tick first.
    const immediate: (PanelData | null)[] = [];
    presenter
      .panelData$("bad")
      .subscribe((value) => {
        immediate.push(value);
      })
      .unsubscribe();
    expect(immediate).toEqual([null]);
  });

  it("a priceHistory panel renders once every symbol has a history", async () => {
    const eur = new Subject<readonly PriceTick[]>();
    const gbp = new Subject<readonly PriceTick[]>();
    const { events$, presenter } = await createFixture({
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
    await tick();
    const seen = collectData(presenter.panelData$("hist"));
    await tick();

    eur.next([createTick("EURUSD", 1.1)]);
    await tick();
    expect(seen.filter(isData)).toEqual([]);
    gbp.next([createTick("GBPUSD", 1.3)]);
    await tick();
    expect(seen.filter(isData)).toHaveLength(1);
    expect(JSON.stringify(seen.at(-1))).toContain("1.3");
  });

  it("an fxTicks panel waits for EVERY symbol, then accumulates each symbol's points", async () => {
    const prices = new Map<string, Subject<PriceTick>>([
      ["EURUSD", new Subject<PriceTick>()],
      ["GBPUSD", new Subject<PriceTick>()],
    ]);

    const { events$, presenter } = await createFixture({
      getPriceUpdates: (symbol: string) => {
        return prices.get(symbol) ?? new Subject<PriceTick>();
      },
    });
    events$.next(
      createPanelEvent("ticks", {
        v: 1,
        title: "Ticks",
        source: { kind: "fxTicks", symbols: ["EURUSD", "GBPUSD"] },
        transforms: [],
        viz: { kind: "line" },
      }),
    );
    await tick();
    const seen = collectData(presenter.panelData$("ticks"));
    await tick();

    prices.get("EURUSD")?.next(createTick("EURUSD", 1.11));
    await tick();
    prices.get("EURUSD")?.next(createTick("EURUSD", 1.12));
    await tick();
    expect(seen.filter(isData)).toEqual([]);
    prices.get("GBPUSD")?.next(createTick("GBPUSD", 1.31));
    await tick();
    const frame = JSON.stringify(seen.at(-1));
    expect(frame).toContain("1.11");
    expect(frame).toContain("1.12");
    expect(frame).toContain("1.31");
  });

  it("a blotter panel renders the trades; an analytics panel renders the positions", async () => {
    const trades = new Subject<readonly Trade[]>();
    const positions = new Subject<PositionUpdates>();
    const { events$, presenter } = await createFixture({
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
    events$.next(createPanelEvent("book", createAnalyticsSpec("Book")));
    await tick();
    const seen = collectData(presenter.panelData$("trades"));
    const book = collectData(presenter.panelData$("book"));
    await tick();
    trades.next([createTrade()]);
    positions.next(createPositions());
    await tick();
    expect(seen.at(-1)).toMatchObject({ kind: "table" });
    expect(JSON.stringify(seen.at(-1))).toContain("T1");
    expect(book.at(-1)).toMatchObject({ kind: "table" });
    expect(JSON.stringify(book.at(-1))).toContain("GBPJPY");
  });

  it("an unknown source renders its empty frame at once", async () => {
    const { events$, presenter } = await createFixture();
    events$.next(
      createPanelEvent("odd", {
        v: 1,
        title: "Odd",
        source: { kind: "no-such-source" } as unknown as PanelSpec["source"],
        transforms: [],
        viz: { kind: "table" },
      }),
    );
    await tick();
    expect(await latest(presenter.panelData$("odd"))).toMatchObject({
      kind: "table",
    });
  });

  it("panelData$ follows the roster: data while the panel lives, null once it is dismissed", async () => {
    const positions = new Subject<PositionUpdates>();
    const { events$, presenter } = await createFixture({
      analytics: positions,
    });
    events$.next(createPanelEvent("p"));
    await tick();
    const seen = collectData(presenter.panelData$("p"));
    await tick();
    positions.next(createPositions());
    await tick();
    expect(seen.at(-1)).toMatchObject({ kind: "table" });
    presenter.dismissPanel("p");
    await tick();
    expect(seen.at(-1)).toBe(null);
  });

  it("an edit to a panel's spec rebuilds its data; the same spec keeps it", async () => {
    const { events$, presenter } = await createFixture();
    const spec = createAnalyticsSpec("A");
    events$.next(createPanelEvent("p", spec));
    await tick();
    const first = (await latest(presenter.panels$))[0].data$;
    events$.next(createPanelEvent("p", spec));
    await tick();
    expect((await latest(presenter.panels$))[0].data$).toBe(first);
    events$.next(createPanelEvent("p", createAnalyticsSpec("B")));
    await tick();
    expect((await latest(presenter.panels$))[0].data$).not.toBe(first);
  });

  it("a live panel holds its port ONCE, however many read its data; dismissal, a spec edit and the scope's close release it", async () => {
    const positions = new Subject<PositionUpdates>();
    let open = 0;
    const counted = new Observable<PositionUpdates>((subscriber) => {
      open += 1;
      const inner = positions.subscribe(subscriber);

      return (): void => {
        open -= 1;
        inner.unsubscribe();
      };
    });

    const { events$, presenter, host } = await createFixture({
      analytics: counted,
    });
    events$.next(createPanelEvent("p", createAnalyticsSpec("A")));
    await tick();
    const first = presenter.panelData$("p").subscribe(() => {});
    const second = presenter.panelData$("p").subscribe(() => {});
    await tick();
    expect(open).toBe(1);

    presenter.dismissPanel("p");
    await tick();
    expect(open).toBe(0);

    events$.next(createPanelEvent("p", createAnalyticsSpec("A")));
    await tick();
    events$.next(createPanelEvent("p", createAnalyticsSpec("B")));
    await tick();
    expect(open).toBe(1);

    first.unsubscribe();
    second.unsubscribe();
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(open).toBe(0);
  });

  it("the host scope's close stops the roster following its events", async () => {
    const { events$, presenter, host } = await createFixture();
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    events$.next(createPanelEvent("late"));
    await tick();
    expect(await latest(presenter.panels$)).toEqual([]);
  });

  const hosts: EffectHost[] = [];

  interface Overrides {
    readonly getPriceUpdates?: (symbol: string) => Subject<PriceTick>;
    readonly getPriceHistory?: (
      symbol: string,
    ) => Subject<readonly PriceTick[]>;
    readonly blotter?: Subject<readonly Trade[]>;
    readonly analytics?: Observable<PositionUpdates>;
  }

  interface Fixture {
    readonly events$: Subject<JarvisEvent>;
    readonly presenter: ReturnType<
      typeof createJarvisPanelsPresenter
    >["presenter"];
    readonly host: EffectHost;
  }

  async function createFixture(overrides: Overrides = {}): Promise<Fixture> {
    const host = createDetachedHost();
    hosts.push(host);
    const events$ = new Subject<JarvisEvent>();
    const deps = {
      referenceData: { getCurrencyPairs: createNever },
      pricing: {
        getPriceUpdates: overrides.getPriceUpdates ?? createNever,
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
    const machine = createJarvisPanelsMachine(host, events$);
    const owned = createJarvisPanelsPresenter(host, machine, deps);
    await tick();
    return { events$, presenter: owned.presenter, host };
  }
});

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

function createPositions(): PositionUpdates {
  return {
    currentPositions: [
      {
        symbol: "GBPJPY",
        basePnl: 1200,
        baseTradedAmount: 1_000_000,
        counterTradedAmount: 150_000_000,
      },
    ],
    history: [],
  } as unknown as PositionUpdates;
}

interface Unsubscribable {
  unsubscribe(): void;
}

interface Subscribable<T> {
  subscribe(next: (value: T) => void): Unsubscribable;
}

async function latest<T>(stream: Subscribable<T>): Promise<T> {
  const seen: T[] = [];
  const subscription = stream.subscribe((value) => {
    seen.push(value);
  });
  await tick();
  subscription.unsubscribe();
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

function createNever(): Observable<never> {
  return NEVER;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

type PanelSpec = NonNullable<PanelInstance["spec"]>;
