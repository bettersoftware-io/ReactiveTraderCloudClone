import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator, type ThemeSkin } from "@rtc/domain";

import { ThemeSkinPreferencePresenter } from "../ThemeSkinPreferencePresenter";

describe("ThemeSkinPreferencePresenter", () => {
  it("replays the current skin", async () => {
    const presenter = new ThemeSkinPreferencePresenter(
      new PreferencesSimulator({ themeSkin: "terminal" }),
    );
    expect(await firstValueFrom(presenter.skin$)).toBe("terminal");
  });

  it("setSkin pushes to existing subscribers", () => {
    const presenter = new ThemeSkinPreferencePresenter(
      new PreferencesSimulator(),
    );
    const seen: ThemeSkin[] = [];
    const sub = presenter.skin$.subscribe((s) => {
      return seen.push(s);
    });
    presenter.setSkin("neon");
    sub.unsubscribe();
    expect(seen).toEqual(["holo", "neon"]);
  });
});
