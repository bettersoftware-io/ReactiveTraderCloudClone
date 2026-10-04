import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { AnimatedBackgroundPresenter } from "../AnimatedBackgroundPresenter";

describe("AnimatedBackgroundPresenter", () => {
  it("defaults to on and toggles", () => {
    const presenter = new AnimatedBackgroundPresenter(
      new PreferencesSimulator(),
    );
    const seen: boolean[] = [];
    const sub = presenter.enabled$.subscribe((on) => {
      return seen.push(on);
    });
    presenter.toggle(true); // → set(false)
    presenter.set(true);
    sub.unsubscribe();
    expect(seen).toEqual([true, false, true]);
  });
});
