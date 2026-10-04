import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type CreditRfqFilter, PreferencesSimulator } from "@rtc/domain";

import { CreditRfqFilterPreferencePresenter } from "../CreditRfqFilterPreferencePresenter";

describe("CreditRfqFilterPreferencePresenter", () => {
  it("replays the current filter", async () => {
    const presenter = new CreditRfqFilterPreferencePresenter(
      new PreferencesSimulator({ creditRfqFilter: "closed" }),
    );
    expect(await firstValueFrom(presenter.filter$)).toBe("closed");
  });

  it("setFilter pushes to existing subscribers", () => {
    const presenter = new CreditRfqFilterPreferencePresenter(
      new PreferencesSimulator(),
    );
    const seen: CreditRfqFilter[] = [];
    const sub = presenter.filter$.subscribe((f) => {
      return seen.push(f);
    });
    presenter.setFilter("all");
    sub.unsubscribe();
    expect(seen).toEqual(["live", "all"]);
  });
});
