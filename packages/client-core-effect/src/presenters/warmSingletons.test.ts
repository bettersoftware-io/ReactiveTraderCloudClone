import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AnalyticsPort,
  CurrencyPair,
  PositionUpdates,
  ReferenceDataPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import {
  createAnalyticsPresenter,
  createCurrencyPairsPresenter,
} from "#/presenters/warmSingletons";

describe("warm singletons", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("currencyPairs: the port is called once at construction, stays subscribed across zero subscribers, and is released with the host scope", async () => {
    const roster = new Subject<readonly CurrencyPair[]>();
    let calls = 0;
    const referenceData: ReferenceDataPort = {
      getCurrencyPairs: () => {
        calls += 1;
        return roster;
      },
    };
    const host = useHost();
    const p = createCurrencyPairsPresenter(host, referenceData);
    expect(calls).toBe(1);
    const first: (readonly CurrencyPair[])[] = [];
    const sub = p.pairs$.subscribe((pairs: readonly CurrencyPair[]) => {
      first.push(pairs);
    });
    roster.next([]);
    await tick();
    sub.unsubscribe();
    await tick();
    expect(roster.observed).toBe(true);
    expect(calls).toBe(1);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(roster.observed).toBe(false);
  });

  it("analytics: the same retained shape — a resubscribe replays the last update synchronously", async () => {
    const updates = new Subject<PositionUpdates>();
    const analytics: AnalyticsPort = {
      getAnalytics: () => {
        return updates;
      },
    };
    const p = createAnalyticsPresenter(useHost(), analytics);
    const sub = p.position$.subscribe(() => {});
    const update: PositionUpdates = { currentPositions: [], history: [] };
    updates.next(update);
    await tick();
    sub.unsubscribe();
    await tick();
    const again: PositionUpdates[] = [];
    p.position$.subscribe((value: PositionUpdates) => {
      again.push(value);
    });
    expect(again).toEqual([update]);
  });

  it("retained is not eager: the port Observable stays unsubscribed until the first subscriber", async () => {
    const roster = new Subject<readonly CurrencyPair[]>();
    const p = createCurrencyPairsPresenter(useHost(), {
      getCurrencyPairs: () => {
        return roster;
      },
    });
    await tick();
    expect(roster.observed).toBe(false);
    p.pairs$.subscribe(() => {});
    await tick();
    expect(roster.observed).toBe(true);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
