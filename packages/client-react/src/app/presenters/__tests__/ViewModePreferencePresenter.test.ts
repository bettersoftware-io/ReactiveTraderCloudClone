import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator, type ViewMode } from "@rtc/domain";

import { ViewModePreferencePresenter } from "../ViewModePreferencePresenter";

describe("ViewModePreferencePresenter", () => {
  it("replays the current view mode", async () => {
    const presenter = new ViewModePreferencePresenter(
      new PreferencesSimulator({ viewMode: "price" }),
    );
    expect(await firstValueFrom(presenter.viewMode$)).toBe("price");
  });

  it("setViewMode pushes to existing subscribers", () => {
    const presenter = new ViewModePreferencePresenter(
      new PreferencesSimulator(),
    );
    const seen: ViewMode[] = [];
    const sub = presenter.viewMode$.subscribe((v) => seen.push(v));
    presenter.setViewMode("price");
    sub.unsubscribe();
    expect(seen).toEqual(["chart", "price"]);
  });
});
