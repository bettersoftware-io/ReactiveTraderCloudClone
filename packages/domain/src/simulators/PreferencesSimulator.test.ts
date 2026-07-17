import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "./PreferencesSimulator.js";

describe("PreferencesSimulator powerSaver", () => {
  it("defaults off, replays current, and honours the seed", () => {
    const seen: boolean[] = [];
    const sim = new PreferencesSimulator();
    const sub = sim.powerSaver$().subscribe((on) => {
      seen.push(on);
    });
    sim.setPowerSaver(true);
    sim.setPowerSaver(true); // distinctUntilChanged: no re-emit
    sim.setPowerSaver(false);
    sub.unsubscribe();
    expect(seen).toEqual([false, true, false]);

    const seeded = new PreferencesSimulator({ powerSaver: true });
    let current = false;
    seeded
      .powerSaver$()
      .subscribe((on) => {
        current = on;
      })
      .unsubscribe();
    expect(current).toBe(true);
  });
});
