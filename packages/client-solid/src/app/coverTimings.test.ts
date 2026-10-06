import { describe, expect, it } from "vitest";

import { chooseCoverTimings, type MotionSettings } from "./coverTimings";

describe("chooseCoverTimings", () => {
  it("fades in, holds and fades out when nothing asks for less motion", () => {
    expect(chooseCoverTimings(createMotion())).toEqual({
      enterMs: 160,
      holdMs: 500,
      exitMs: 200,
    });
  });

  it("under reduced motion the fades are jump cuts and the hold stays", () => {
    expect(chooseCoverTimings(createMotion({ reducedMotion: true }))).toEqual({
      enterMs: 0,
      holdMs: 500,
      exitMs: 0,
    });
  });

  it("under power-saver freeze the fades are jump cuts and the hold stays", () => {
    expect(chooseCoverTimings(createMotion({ freeze: true }))).toEqual({
      enterMs: 0,
      holdMs: 500,
      exitMs: 0,
    });
  });

  it("under webdriver nothing waits, whatever else is set", () => {
    const none = { enterMs: 0, holdMs: 0, exitMs: 0 };

    expect(chooseCoverTimings(createMotion({ webdriver: true }))).toEqual(none);
    expect(
      chooseCoverTimings(
        createMotion({ webdriver: true, reducedMotion: true, freeze: true }),
      ),
    ).toEqual(none);
  });
});

function createMotion(overrides: Partial<MotionSettings> = {}): MotionSettings {
  return {
    webdriver: false,
    reducedMotion: false,
    freeze: false,
    ...overrides,
  };
}
