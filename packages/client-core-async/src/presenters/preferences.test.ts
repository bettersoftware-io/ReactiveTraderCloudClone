import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { createPowerSaverPresenter } from "#/presenters/preferences";

describe("createPowerSaverPresenter (async)", () => {
  it("isCalm$ re-publishes an unchanged true across a calm to freeze transition (map parity with the RxJS core)", () => {
    const preferences = new PreferencesSimulator({ powerSaverLevel: "off" });
    const presenter = createPowerSaverPresenter(preferences);
    const seen: boolean[] = [];
    const sub = presenter.isCalm$.subscribe((v) => {
      seen.push(v);
    });
    preferences.setPowerSaverLevel("calm");
    preferences.setPowerSaverLevel("freeze");
    expect(seen).toEqual([false, true, true]);
    sub.unsubscribe();
  });
});
