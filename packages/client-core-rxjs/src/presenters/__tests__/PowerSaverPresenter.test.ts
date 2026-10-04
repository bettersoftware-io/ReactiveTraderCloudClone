import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { PowerSaverPresenter } from "../PowerSaverPresenter";

describe("PowerSaverPresenter", () => {
  it("defaults to off and setLevel drives level$/isCalm$/isFreeze$", () => {
    const presenter = new PowerSaverPresenter(new PreferencesSimulator());
    const levels: string[] = [];
    const calm: boolean[] = [];
    const freeze: boolean[] = [];
    const subs = [
      presenter.level$.subscribe((level) => {
        return levels.push(level);
      }),
      presenter.isCalm$.subscribe((on) => {
        return calm.push(on);
      }),
      presenter.isFreeze$.subscribe((on) => {
        return freeze.push(on);
      }),
    ];
    presenter.setLevel("calm");
    presenter.setLevel("freeze");
    presenter.setLevel("off");
    subs.forEach((sub) => {
      sub.unsubscribe();
    });
    expect(levels).toEqual(["off", "calm", "freeze", "off"]);
    expect(calm).toEqual([false, true, true, false]);
    expect(freeze).toEqual([false, false, true, false]);
  });
});
