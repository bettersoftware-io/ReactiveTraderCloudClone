import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "./PreferencesSimulator.js";

describe("PreferencesSimulator powerSaverLevel", () => {
  it("defaults off, replays current, and honours the seed", () => {
    const seen: string[] = [];
    const sim = new PreferencesSimulator();
    const sub = sim.powerSaverLevel$().subscribe((level) => {
      seen.push(level);
    });
    sim.setPowerSaverLevel("calm");
    sim.setPowerSaverLevel("calm"); // distinctUntilChanged: no re-emit
    sim.setPowerSaverLevel("freeze");
    sim.setPowerSaverLevel("off");
    sub.unsubscribe();
    expect(seen).toEqual(["off", "calm", "freeze", "off"]);

    const seeded = new PreferencesSimulator({ powerSaverLevel: "freeze" });
    let current = "off";
    seeded
      .powerSaverLevel$()
      .subscribe((level) => {
        current = level;
      })
      .unsubscribe();
    expect(current).toBe("freeze");
  });
});
