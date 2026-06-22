import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator, type Theme } from "@rtc/domain";

import { ThemePreferencePresenter } from "../ThemePreferencePresenter";

describe("ThemePreferencePresenter", () => {
  it("replays the current theme", async () => {
    const presenter = new ThemePreferencePresenter(
      new PreferencesSimulator({ theme: "light" }),
    );
    expect(await firstValueFrom(presenter.theme$)).toBe("light");
  });

  it("setTheme pushes to existing subscribers", () => {
    const presenter = new ThemePreferencePresenter(new PreferencesSimulator());
    const seen: Theme[] = [];
    const sub = presenter.theme$.subscribe((t) => {
      return seen.push(t);
    });
    presenter.setTheme("light");
    sub.unsubscribe();
    expect(seen).toEqual(["dark", "light"]);
  });

  it("toggle flips light↔dark", () => {
    const presenter = new ThemePreferencePresenter(new PreferencesSimulator());
    const seen: Theme[] = [];
    const sub = presenter.theme$.subscribe((t) => {
      return seen.push(t);
    });
    presenter.toggle("dark");
    presenter.toggle("light");
    sub.unsubscribe();
    expect(seen).toEqual(["dark", "light", "dark"]);
  });
});
