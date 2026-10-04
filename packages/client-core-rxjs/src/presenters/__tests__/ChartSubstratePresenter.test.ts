import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type ChartSubstrate, PreferencesSimulator } from "@rtc/domain";

import { ChartSubstratePresenter } from "../ChartSubstratePresenter";

describe("ChartSubstratePresenter", () => {
  it("replays the current substrate", async () => {
    const presenter = new ChartSubstratePresenter(
      new PreferencesSimulator({ chartSubstrate: "canvas" }),
    );
    expect(await firstValueFrom(presenter.substrate$)).toBe("canvas");
  });

  it("setSubstrate pushes to existing subscribers", () => {
    const presenter = new ChartSubstratePresenter(new PreferencesSimulator());
    const seen: ChartSubstrate[] = [];
    const sub = presenter.substrate$.subscribe((s) => {
      return seen.push(s);
    });
    presenter.setSubstrate("canvas");
    sub.unsubscribe();
    expect(seen).toEqual(["dom", "canvas"]);
  });
});
