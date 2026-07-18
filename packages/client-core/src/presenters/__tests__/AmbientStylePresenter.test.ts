import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type AmbientStyle, PreferencesSimulator } from "@rtc/domain";

import { AmbientStylePresenter } from "../AmbientStylePresenter";

describe("AmbientStylePresenter", () => {
  it("replays the current style", async () => {
    const presenter = new AmbientStylePresenter(
      new PreferencesSimulator({ ambientStyle: "rays" }),
    );
    expect(await firstValueFrom(presenter.style$)).toBe("rays");
  });

  it("setStyle pushes to existing subscribers", () => {
    const presenter = new AmbientStylePresenter(new PreferencesSimulator());
    const seen: AmbientStyle[] = [];
    const sub = presenter.style$.subscribe((s) => {
      return seen.push(s);
    });
    presenter.setStyle("rays");
    sub.unsubscribe();
    expect(seen).toEqual(["aurora", "rays"]);
  });
});
