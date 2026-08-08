import { BehaviorSubject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisUsageSnapshot } from "@rtc/shared";

import {
  applyGateToOffer,
  computeGateLevel,
  DEFAULT_JARVIS_BUDGET_SOFT_RATIO,
  DEFAULT_JARVIS_BUDGET_USD,
  JarvisGateService,
  parseJarvisGateConfig,
  spentWindowUsd,
} from "./jarvisGate.js";

const CONFIG = { budgetUsd: 1, softRatio: 0.8, forceLevel: null } as const;

describe("computeGateLevel", () => {
  it("reports none below the soft threshold", () => {
    expect(computeGateLevel(snapshotWith(0.79, 10_000), CONFIG, 5_000)).toBe(
      "none",
    );
  });

  it("trips soft at exactly budget × softRatio (>= boundary)", () => {
    expect(computeGateLevel(snapshotWith(0.8, 10_000), CONFIG, 5_000)).toBe(
      "soft",
    );
  });

  it("trips hard at exactly the budget (>= boundary)", () => {
    expect(computeGateLevel(snapshotWith(1, 10_000), CONFIG, 5_000)).toBe(
      "hard",
    );
  });

  it("reports none when the window has lazily elapsed, regardless of stale rows", () => {
    expect(computeGateLevel(snapshotWith(5, 10_000), CONFIG, 10_000)).toBe(
      "none",
    );
  });

  it("reports none on a fresh meter (windowEndMs 0)", () => {
    expect(computeGateLevel(snapshotWith(5, 0), CONFIG, 0)).toBe("none");
  });

  it("reports none always when the budget is off", () => {
    expect(
      computeGateLevel(
        snapshotWith(5, 10_000),
        { ...CONFIG, budgetUsd: "off" },
        5_000,
      ),
    ).toBe("none");
  });

  it("force wins over everything, including an elapsed window and off", () => {
    expect(
      computeGateLevel(
        snapshotWith(0, 0),
        { ...CONFIG, forceLevel: "soft" },
        99,
      ),
    ).toBe("soft");
    expect(
      computeGateLevel(
        snapshotWith(0, 0),
        { budgetUsd: "off", softRatio: 0.8, forceLevel: "hard" },
        99,
      ),
    ).toBe("hard");
  });
});

describe("spentWindowUsd", () => {
  it("sums estimatedCostUsd across the current window's rows", () => {
    const snap: JarvisUsageSnapshot = {
      windowStartMs: 0,
      windowEndMs: 10_000,
      currentWindow: [
        {
          brain: "claude-haiku-4-5",
          turns: 1,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          estimatedCostUsd: 0.1,
        },
        {
          brain: "claude-sonnet-5",
          turns: 1,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          estimatedCostUsd: 0.15,
        },
      ],
      sinceBoot: [],
    };
    expect(spentWindowUsd(snap)).toBeCloseTo(0.25);
  });
});

describe("applyGateToOffer", () => {
  const ALL = [
    "scripted",
    "claude-haiku-4-5",
    "claude-sonnet-5",
    "claude-opus-5",
  ] as const;

  it("none: passes the offer through untouched, nothing gated", () => {
    expect(applyGateToOffer(ALL, "claude-haiku-4-5", "none")).toEqual({
      brains: ALL,
      defaultBrain: "claude-haiku-4-5",
      gated: [],
    });
  });

  it("soft: drops sonnet+opus, keeps haiku default, gates only what was offered", () => {
    expect(applyGateToOffer(ALL, "claude-haiku-4-5", "soft")).toEqual({
      brains: ["scripted", "claude-haiku-4-5"],
      defaultBrain: "claude-haiku-4-5",
      gated: ["claude-sonnet-5", "claude-opus-5"],
    });
  });

  it("soft with a gated default falls back to haiku", () => {
    expect(applyGateToOffer(ALL, "claude-opus-5", "soft").defaultBrain).toBe(
      "claude-haiku-4-5",
    );
  });

  it("hard: scripted only", () => {
    expect(applyGateToOffer(ALL, "claude-haiku-4-5", "hard")).toEqual({
      brains: ["scripted"],
      defaultBrain: "scripted",
      gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
    });
  });

  it("never re-adds an env-removed brain: scripted-only offer stays scripted-only", () => {
    expect(applyGateToOffer(["scripted"], "scripted", "soft")).toEqual({
      brains: ["scripted"],
      defaultBrain: "scripted",
      gated: [],
    });
  });
});

describe("parseJarvisGateConfig", () => {
  it("defaults with an empty env", () => {
    expect(parseJarvisGateConfig({})).toEqual({
      budgetUsd: DEFAULT_JARVIS_BUDGET_USD,
      softRatio: DEFAULT_JARVIS_BUDGET_SOFT_RATIO,
      forceLevel: null,
    });
  });

  it("reads off, numeric budget, ratio, and force", () => {
    expect(
      parseJarvisGateConfig({
        RTC_JARVIS_BUDGET_USD: "off",
        RTC_JARVIS_BUDGET_SOFT_RATIO: "0.5",
        RTC_JARVIS_FORCE_GATE: "hard",
      }),
    ).toEqual({ budgetUsd: "off", softRatio: 0.5, forceLevel: "hard" });
  });

  it("falls back per-field on malformed values and warns once per field", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      parseJarvisGateConfig({
        RTC_JARVIS_BUDGET_USD: "banana",
        RTC_JARVIS_BUDGET_SOFT_RATIO: "2",
        RTC_JARVIS_FORCE_GATE: "sideways",
      }),
    ).toEqual({
      budgetUsd: DEFAULT_JARVIS_BUDGET_USD,
      softRatio: DEFAULT_JARVIS_BUDGET_SOFT_RATIO,
      forceLevel: null,
    });
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("JarvisGateService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at none, transitions on snapshot emissions, lifts on the armed timer", () => {
    let nowMs = 0;
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(
      snapshotWith(0, 0),
    );

    const service = new JarvisGateService({ snapshot$ }, CONFIG, () => {
      return nowMs;
    });

    const levels: string[] = [];
    const sub = service.state$.subscribe((s) => {
      levels.push(s.level);
    });

    // spend crosses hard inside a live window ending at t=10_000
    nowMs = 1_000;
    snapshot$.next(snapshotWith(1.2, 10_000));
    expect(service.current().level).toBe("hard");
    expect(service.current().resetsAtMs).toBe(10_000);

    // no new turns: the armed timer lifts the gate at windowEndMs
    nowMs = 10_000;
    vi.advanceTimersByTime(9_000);
    expect(service.current().level).toBe("none");
    expect(levels).toEqual(["none", "hard", "none"]);

    sub.unsubscribe();
    service.dispose();
  });

  it("does not arm a timer while ungated (no spurious emissions)", () => {
    let nowMs = 0;
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(
      snapshotWith(0, 0),
    );

    const service = new JarvisGateService({ snapshot$ }, CONFIG, () => {
      return nowMs;
    });

    const levels: string[] = [];
    const sub = service.state$.subscribe((s) => {
      levels.push(s.level);
    });

    nowMs = 1_000;
    snapshot$.next(snapshotWith(0.1, 10_000));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(levels).toEqual(["none"]);

    sub.unsubscribe();
    service.dispose();
  });

  it("forced gate: a later snapshot with a real windowEndMs updates resetsAtMs even though level stays hard", () => {
    let nowMs = 0;
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(
      snapshotWith(0, 0),
    );

    const forced = {
      budgetUsd: 1,
      softRatio: 0.8,
      forceLevel: "hard",
    } as const;

    const service = new JarvisGateService({ snapshot$ }, forced, () => {
      return nowMs;
    });

    const resetsAtMsSeen: number[] = [];
    const sub = service.state$.subscribe((s) => {
      resetsAtMsSeen.push(s.resetsAtMs);
    });

    // fresh meter: forced hard fires immediately, but resetsAtMs is stuck at 0
    expect(service.current().level).toBe("hard");
    expect(service.current().resetsAtMs).toBe(0);

    // a real turn re-anchors the meter's window; level stays forced-hard, but
    // resetsAtMs must still update so the availability push carries the real
    // reset time instead of freezing at 0 forever
    nowMs = 1_000;
    snapshot$.next(snapshotWith(0, 10_000));
    expect(service.current().level).toBe("hard");
    expect(service.current().resetsAtMs).toBe(10_000);
    expect(resetsAtMsSeen).toEqual([0, 10_000]);

    sub.unsubscribe();
    service.dispose();
  });
});

function snapshotWith(
  spentUsd: number,
  windowEndMs: number,
): JarvisUsageSnapshot {
  return {
    windowStartMs: windowEndMs === 0 ? 0 : windowEndMs - 18_000_000,
    windowEndMs,
    currentWindow: [
      {
        brain: "claude-haiku-4-5",
        turns: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: spentUsd,
      },
    ],
    sinceBoot: [],
  };
}
