import { describe, expect, it } from "vitest";

import {
  DEMO_STEP_BEAT_MS,
  DEMO_STEP_TIMEOUT_MS,
  JARVIS_CONFIRM_TIMEOUT_MS,
  JARVIS_GREETING,
  JARVIS_NARRATION_PREFIX,
  MAX_NARRATIONS_PER_SESSION,
  NARRATION_COOLDOWN_MS,
} from "./jarvisConstants.js";

describe("jarvis constants", () => {
  it("pins the timing the contract suites assert", () => {
    expect(JARVIS_CONFIRM_TIMEOUT_MS).toBe(60_000);
    expect(NARRATION_COOLDOWN_MS).toBe(300_000);
    expect(DEMO_STEP_BEAT_MS).toBe(1200);
    expect(DEMO_STEP_TIMEOUT_MS).toBe(30_000);
  });

  it("pins the narrator cap and the copy both ends of a turn share", () => {
    expect(MAX_NARRATIONS_PER_SESSION).toBe(4);
    expect(JARVIS_NARRATION_PREFIX).toBe("[narration] ");
    expect(JARVIS_GREETING).toBe(
      "Good morning, sir. J.A.R.V.I.S online — all trading systems nominal. " +
        "I can quote the majors, report the movers, brief you on the desk, or execute FX orders. How may I assist?",
    );
  });
});
