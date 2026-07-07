import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type EqWatchlistSort, PreferencesSimulator } from "@rtc/domain";

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
});
