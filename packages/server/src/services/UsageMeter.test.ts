import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  estimateUsageCostUsd,
  JARVIS_PRICE_TABLE,
  UsageMeter,
} from "./UsageMeter.js";

describe("UsageMeter", () => {
  it("starts with an empty snapshot shape", async () => {
    const meter = new UsageMeter(() => {
      return 1_000;
    });

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot).toEqual({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
    });
  });

  it("recordTurn increments turn counts in both windows, the current one being the UTC day", async () => {
    const clock = NOON;
    const meter = new UsageMeter(() => {
      return clock;
    });

    meter.recordTurn("claude-haiku-4-5");
    meter.recordTurn("claude-haiku-4-5");

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.currentWindow).toEqual([
      {
        brain: "claude-haiku-4-5",
        turns: 2,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: 0,
      },
    ]);
    expect(snapshot.sinceBoot).toEqual(snapshot.currentWindow);
    expect(snapshot.windowStartMs).toBe(DAY_START);
    expect(snapshot.windowEndMs).toBe(NEXT_MIDNIGHT);
  });

  it("recordTokens accumulates tokens and computes cost — haiku 1,000,000 input tokens = $1.00", async () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTokens("claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.currentWindow).toEqual([
      {
        brain: "claude-haiku-4-5",
        turns: 0,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: 1,
      },
    ]);
  });

  it("computes cost across input, output, cache-read, and cache-creation tokens for sonnet", async () => {
    // sonnet: input $2/Mtok, output $10/Mtok. Cache reads bill at 10% of
    // input ($0.30/Mtok), cache writes at 125% of input ($3.75/Mtok).
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTokens("claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });

    const snapshot = await firstValueFrom(meter.snapshot$);

    // (1e6*2 + 1e6*10 + 1e6*2*0.1 + 1e6*2*1.25) / 1e6 = 2 + 10 + 0.2 + 2.5 = 14.7
    expect(snapshot.currentWindow[0]?.estimatedCostUsd).toBeCloseTo(14.7, 10);
  });

  it("scripted brain always reports zero cost regardless of token volume", async () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTokens("scripted", {
      inputTokens: 5_000_000,
      outputTokens: 5_000_000,
      cacheReadTokens: 5_000_000,
      cacheCreationTokens: 5_000_000,
    });

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.currentWindow[0]?.estimatedCostUsd).toBe(0);
  });

  it("accumulates recordTurn and recordTokens together for the same brain", async () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTurn("claude-opus-5");
    meter.recordTokens("claude-opus-5", {
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    meter.recordTurn("claude-opus-5");

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.currentWindow).toEqual([
      {
        brain: "claude-opus-5",
        turns: 2,
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        // (100*5 + 200*25) / 1e6 = (500 + 5000) / 1e6 = 0.0055
        estimatedCostUsd: 0.0055,
      },
    ]);
  });

  it("rows follow JARVIS_BRAINS picker order, not record order", async () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTurn("claude-opus-5");
    meter.recordTurn("scripted");
    meter.recordTurn("claude-sonnet-5");
    meter.recordTurn("claude-haiku-4-5");

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(
      snapshot.currentWindow.map((row) => {
        return row.brain;
      }),
    ).toEqual([
      "scripted",
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-5",
    ]);
  });

  it("only includes rows for brains with activity", async () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTurn("claude-haiku-4-5");

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.currentWindow).toHaveLength(1);
    expect(snapshot.sinceBoot).toHaveLength(1);
  });

  it("rolls the current window at 00:00 UTC, while sinceBoot keeps accumulating", async () => {
    let clock = NOON;
    const meter = new UsageMeter(() => {
      return clock;
    });

    meter.recordTurn("claude-haiku-4-5");
    let snapshot = await firstValueFrom(meter.snapshot$);
    expect(snapshot.windowStartMs).toBe(DAY_START);
    expect(snapshot.windowEndMs).toBe(NEXT_MIDNIGHT);
    expect(snapshot.currentWindow[0]?.turns).toBe(1);
    expect(snapshot.sinceBoot[0]?.turns).toBe(1);

    // Still inside the day: no roll.
    clock = NEXT_MIDNIGHT - 1;
    meter.recordTurn("claude-haiku-4-5");
    snapshot = await firstValueFrom(meter.snapshot$);
    expect(snapshot.windowStartMs).toBe(DAY_START);
    expect(snapshot.currentWindow[0]?.turns).toBe(2);
    expect(snapshot.sinceBoot[0]?.turns).toBe(2);

    // Exactly at midnight: rolls over to the new day.
    clock = NEXT_MIDNIGHT;
    meter.recordTurn("claude-haiku-4-5");
    snapshot = await firstValueFrom(meter.snapshot$);
    expect(snapshot.windowStartMs).toBe(NEXT_MIDNIGHT);
    expect(snapshot.windowEndMs).toBe(NEXT_MIDNIGHT + DAY_MS);
    expect(snapshot.currentWindow[0]?.turns).toBe(1); // reset
    expect(snapshot.sinceBoot[0]?.turns).toBe(3); // kept accumulating
  });

  it("snapshot$ replays the current snapshot to a late subscriber", async () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    meter.recordTurn("claude-haiku-4-5");
    meter.recordTurn("claude-haiku-4-5");

    // Subscribe AFTER both records were made — BehaviorSubject replay.
    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.currentWindow[0]?.turns).toBe(2);
  });

  it("emits a fresh snapshot on every record", () => {
    const meter = new UsageMeter(() => {
      return 0;
    });

    const seen: number[] = [];
    const subscription = meter.snapshot$.subscribe((snapshot) => {
      seen.push(snapshot.currentWindow[0]?.turns ?? -1);
    });

    meter.recordTurn("claude-haiku-4-5");
    meter.recordTurn("claude-haiku-4-5");

    subscription.unsubscribe();

    expect(seen).toEqual([-1, 1, 2]);
  });

  it("defaults its clock to Date.now when none is injected", async () => {
    const before = Date.now();
    const meter = new UsageMeter();

    meter.recordTurn("claude-haiku-4-5");

    const snapshot = await firstValueFrom(meter.snapshot$);

    expect(snapshot.windowStartMs).toBeLessThanOrEqual(before);
    expect(snapshot.windowEndMs).toBeGreaterThan(Date.now());
    expect(snapshot.windowEndMs - snapshot.windowStartMs).toBe(DAY_MS);
  });

  it("exposes the documented price table", () => {
    expect(JARVIS_PRICE_TABLE).toEqual({
      "claude-haiku-4-5": { inputUsdPerMtok: 1, outputUsdPerMtok: 5 },
      "claude-sonnet-5": { inputUsdPerMtok: 2, outputUsdPerMtok: 10 },
      "claude-opus-5": { inputUsdPerMtok: 5, outputUsdPerMtok: 25 },
    });
  });
});

describe("estimateUsageCostUsd", () => {
  it("prices one request's usage on sonnet, cache reads at 10% and writes at 125% of input", () => {
    expect(
      estimateUsageCostUsd("claude-sonnet-5", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
      }),
    ).toBeCloseTo(2 + 10 + 0.2 + 2.5, 10);
  });

  it("prices the scripted brain at zero", () => {
    expect(
      estimateUsageCostUsd("scripted", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBe(0);
  });
});

const DAY_START = Date.UTC(2026, 9, 25);

const NOON = Date.UTC(2026, 9, 25, 12);

const NEXT_MIDNIGHT = Date.UTC(2026, 9, 26);

const DAY_MS = 86_400_000;
