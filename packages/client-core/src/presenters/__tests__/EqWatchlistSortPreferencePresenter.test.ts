import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type EqWatchlistSort,
  type PreferencesPort,
  PreferencesSimulator,
} from "@rtc/domain";

import { EqWatchlistSortPreferencePresenter } from "../EqWatchlistSortPreferencePresenter";

describe("EqWatchlistSortPreferencePresenter", () => {
  it("replays the current sort", async () => {
    const presenter = new EqWatchlistSortPreferencePresenter(
      new PreferencesSimulator({ eqWatchlistSort: "price" }),
    );
    expect(await firstValueFrom(presenter.sort$)).toBe("price");
  });

  it("setSort pushes to existing subscribers", () => {
    const presenter = new EqWatchlistSortPreferencePresenter(
      new PreferencesSimulator(),
    );
    const seen: EqWatchlistSort[] = [];
    const sub = presenter.sort$.subscribe((s) => {
      return seen.push(s);
    });
    presenter.setSort("sym");
    sub.unsubscribe();
    expect(seen).toEqual(["chg", "sym"]);
  });

  it("cycle() advances sym → chg → price → sym from the current persisted value", () => {
    const presenter = new EqWatchlistSortPreferencePresenter(
      new PreferencesSimulator({ eqWatchlistSort: "sym" }),
    );
    const seen: EqWatchlistSort[] = [];
    const sub = presenter.sort$.subscribe((s) => {
      return seen.push(s);
    });

    presenter.cycle();
    presenter.cycle();
    presenter.cycle();

    sub.unsubscribe();
    expect(seen).toEqual(["sym", "chg", "price", "sym"]);
  });

  it("cycle() twice calls eqWatchlistSort$() once (the stream is captured at construction)", () => {
    const { port, callCount } = createCountingEqWatchlistSortPort();
    const presenter = new EqWatchlistSortPreferencePresenter(port);

    presenter.cycle();
    presenter.cycle();

    expect(callCount()).toBe(1);
  });
});

/** A `PreferencesPort` fake whose `eqWatchlistSort$()` call count is
 * observable. */
interface CountingEqWatchlistSortPort {
  readonly port: PreferencesPort;
  readonly callCount: () => number;
}

/** Wraps a real `PreferencesSimulator` so `eqWatchlistSort$()` calls are
 * counted — a Proxy rather than a spread, since the simulator's methods
 * live on its prototype and a spread would drop them. */
function createCountingEqWatchlistSortPort(): CountingEqWatchlistSortPort {
  const sim = new PreferencesSimulator();
  let calls = 0;
  const port = new Proxy(sim, {
    get: (
      target: PreferencesSimulator,
      prop: string | symbol,
      receiver: unknown,
    ): unknown => {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "eqWatchlistSort$" && typeof value === "function") {
        return (...args: unknown[]) => {
          calls += 1;
          return Reflect.apply(
            value as (...a: unknown[]) => unknown,
            target,
            args,
          );
        };
      }

      return value;
    },
  });
  return {
    port,
    callCount: () => {
      return calls;
    },
  };
}
