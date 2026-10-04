import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type EqBlotterView, PreferencesSimulator } from "@rtc/domain";

import { EqBlotterViewPreferencePresenter } from "../EqBlotterViewPreferencePresenter";

describe("EqBlotterViewPreferencePresenter", () => {
  it("replays the current view", async () => {
    const presenter = new EqBlotterViewPreferencePresenter(
      new PreferencesSimulator({ eqBlotterView: "positions" }),
    );
    expect(await firstValueFrom(presenter.view$)).toBe("positions");
  });

  it("setView pushes to existing subscribers", () => {
    const presenter = new EqBlotterViewPreferencePresenter(
      new PreferencesSimulator(),
    );
    const seen: EqBlotterView[] = [];
    const sub = presenter.view$.subscribe((v) => {
      return seen.push(v);
    });
    presenter.setView("positions");
    sub.unsubscribe();
    expect(seen).toEqual(["orders", "positions"]);
  });
});
