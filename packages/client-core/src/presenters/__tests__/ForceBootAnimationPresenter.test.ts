import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { ForceBootAnimationPresenter } from "../ForceBootAnimationPresenter";

describe("ForceBootAnimationPresenter", () => {
  it("exposes the port's replay-current flag (default false)", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ForceBootAnimationPresenter(prefs);
    expect(await firstValueFrom(presenter.enabled$)).toBe(false);
  });

  it("set(true) writes through to the port", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ForceBootAnimationPresenter(prefs);
    presenter.set(true);
    expect(await firstValueFrom(prefs.forceBootAnimation$())).toBe(true);
  });

  it("toggle(current) flips the stored value", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ForceBootAnimationPresenter(prefs);
    presenter.toggle(false);
    expect(await firstValueFrom(prefs.forceBootAnimation$())).toBe(true);
  });
});
