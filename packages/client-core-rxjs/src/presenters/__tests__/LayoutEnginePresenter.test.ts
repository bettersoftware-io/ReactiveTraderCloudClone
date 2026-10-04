import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT_ENGINE,
  type LayoutEngine,
  PreferencesSimulator,
} from "@rtc/domain";

import { LayoutEnginePresenter } from "../LayoutEnginePresenter";

describe("LayoutEnginePresenter", () => {
  it("replays the current engine", async () => {
    const presenter = new LayoutEnginePresenter(
      new PreferencesSimulator({ layoutEngine: NON_DEFAULT_ENGINE }),
    );
    expect(await firstValueFrom(presenter.engine$)).toBe(NON_DEFAULT_ENGINE);
  });

  it("setEngine pushes to existing subscribers", () => {
    const presenter = new LayoutEnginePresenter(new PreferencesSimulator());
    const seen: LayoutEngine[] = [];
    const sub = presenter.engine$.subscribe((e) => {
      return seen.push(e);
    });
    presenter.setEngine(NON_DEFAULT_ENGINE);
    sub.unsubscribe();
    expect(seen).toEqual([DEFAULT_LAYOUT_ENGINE, NON_DEFAULT_ENGINE]);
  });
});

/** Whichever engine the domain default is NOT.
 *
 * Both cases above must exercise a value that DIFFERS from the default, or
 * they assert nothing: a seed equal to the default proves no seeding, and a
 * setEngine to the engine already reported is de-duplicated, so no push
 * happens. Deriving it keeps them honest across a default flip instead of
 * pinning the literal that happens to be non-default today — this file broke
 * on exactly that when the default moved to "dockview". */
const NON_DEFAULT_ENGINE: LayoutEngine =
  DEFAULT_LAYOUT_ENGINE === "inhouse" ? "dockview" : "inhouse";
