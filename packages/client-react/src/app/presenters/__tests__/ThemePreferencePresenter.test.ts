import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator, type ThemeMode } from "@rtc/domain";

import { ThemePreferencePresenter } from "../ThemePreferencePresenter";

describe("ThemePreferencePresenter", () => {
  it("replays the current theme mode", async () => {
    const presenter = new ThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "light" }),
    );
    expect(await firstValueFrom(presenter.mode$)).toBe("light");
  });

  it("setMode pushes to existing subscribers", () => {
    const presenter = new ThemePreferencePresenter(new PreferencesSimulator());
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((t) => {
      return seen.push(t);
    });
    presenter.setMode("light");
    sub.unsubscribe();
    expect(seen).toEqual(["dark", "light"]);
  });

  it("toggle flips light↔dark", () => {
    const presenter = new ThemePreferencePresenter(new PreferencesSimulator());
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((t) => {
      return seen.push(t);
    });
    presenter.toggle("dark");
    presenter.toggle("light");
    sub.unsubscribe();
    expect(seen).toEqual(["dark", "light", "dark"]);
  });
});
