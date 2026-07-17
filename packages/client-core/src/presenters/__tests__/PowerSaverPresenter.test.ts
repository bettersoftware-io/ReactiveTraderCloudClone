import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { PowerSaverPresenter } from "../PowerSaverPresenter";

describe("PowerSaverPresenter", () => {
  it("defaults to off and toggles", () => {
    const presenter = new PowerSaverPresenter(new PreferencesSimulator());
    const seen: boolean[] = [];
    const sub = presenter.enabled$.subscribe((on) => {
      return seen.push(on);
    });
    presenter.toggle(false);
    presenter.set(false);
    sub.unsubscribe();
    expect(seen).toEqual([false, true, false]);
  });
});
