import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT_ENGINE,
  type LayoutEngine,
  PreferencesSimulator,
} from "@rtc/domain";

import { LayoutEnginePresenter } from "../LayoutEnginePresenter";

// Both cases deliberately seed/write "inhouse" — the NON-default engine since
// the 2026-09 flip. A case that writes the default value proves nothing: the
// port swallows it as a no-op and the assertion passes even if the presenter
// ignored the call entirely. Asserting against DEFAULT_LAYOUT_ENGINE rather
// than a literal keeps both meaningful through any future flip.
describe("LayoutEnginePresenter", () => {
  it("replays the current engine", async () => {
    const presenter = new LayoutEnginePresenter(
      new PreferencesSimulator({ layoutEngine: "inhouse" }),
    );
    expect(await firstValueFrom(presenter.engine$)).toBe("inhouse");
  });

  it("setEngine pushes to existing subscribers", () => {
    const presenter = new LayoutEnginePresenter(new PreferencesSimulator());
    const seen: LayoutEngine[] = [];
    const sub = presenter.engine$.subscribe((e) => {
      return seen.push(e);
    });
    presenter.setEngine("inhouse");
    sub.unsubscribe();
    expect(seen).toEqual([DEFAULT_LAYOUT_ENGINE, "inhouse"]);
  });
});
