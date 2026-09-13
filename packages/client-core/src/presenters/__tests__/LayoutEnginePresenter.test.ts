import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type LayoutEngine, PreferencesSimulator } from "@rtc/domain";

import { LayoutEnginePresenter } from "../LayoutEnginePresenter";

describe("LayoutEnginePresenter", () => {
  it("replays the current engine", async () => {
    const presenter = new LayoutEnginePresenter(
      new PreferencesSimulator({ layoutEngine: "dockview" }),
    );
    expect(await firstValueFrom(presenter.engine$)).toBe("dockview");
  });

  it("setEngine pushes to existing subscribers", () => {
    const presenter = new LayoutEnginePresenter(new PreferencesSimulator());
    const seen: LayoutEngine[] = [];
    const sub = presenter.engine$.subscribe((e) => {
      return seen.push(e);
    });
    presenter.setEngine("dockview");
    sub.unsubscribe();
    expect(seen).toEqual(["inhouse", "dockview"]);
  });
});
