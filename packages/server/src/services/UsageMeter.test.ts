import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  JARVIS_PRICE_TABLE,
  JARVIS_USAGE_WINDOW_MS,
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

  it("recordTurn increments turn counts in both windows", async () => {
    const clock = 10_000;
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
    expect(snapshot.windowStartMs).toBe(10_000);
    expect(snapshot.windowEndMs).toBe(10_000 + JARVIS_USAGE_WINDOW_MS);
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
    // sonnet: input $3/Mtok, output $15/Mtok. Cache reads bill at 10% of
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

    // (1e6*3 + 1e6*15 + 1e6*3*0.1 + 1e6*3*1.25) / 1e6 = 3 + 15 + 0.3 + 3.75 = 22.05
    expect(snapshot.currentWindow[0]?.estimatedCostUsd).toBeCloseTo(22.05, 10);
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

  it("rolls the current window when now() reaches windowEndMs, while sinceBoot keeps accumulating", async () => {
    let clock = 0;
    const meter = new UsageMeter(() => {
      return clock;
    });

    meter.recordTurn("claude-haiku-4-5");
    let snapshot = await firstValueFrom(meter.snapshot$);
    expect(snapshot.windowStartMs).toBe(0);
    expect(snapshot.windowEndMs).toBe(JARVIS_USAGE_WINDOW_MS);
    expect(snapshot.currentWindow[0]?.turns).toBe(1);
    expect(snapshot.sinceBoot[0]?.turns).toBe(1);

    // Still inside the window: no roll.
    clock = JARVIS_USAGE_WINDOW_MS - 1;
    meter.recordTurn("claude-haiku-4-5");
    snapshot = await firstValueFrom(meter.snapshot$);
    expect(snapshot.windowStartMs).toBe(0);
    expect(snapshot.currentWindow[0]?.turns).toBe(2);
    expect(snapshot.sinceBoot[0]?.turns).toBe(2);

    // Exactly at windowEndMs: rolls over and re-anchors.
    clock = JARVIS_USAGE_WINDOW_MS;
    meter.recordTurn("claude-haiku-4-5");
    snapshot = await firstValueFrom(meter.snapshot$);
    expect(snapshot.windowStartMs).toBe(JARVIS_USAGE_WINDOW_MS);
    expect(snapshot.windowEndMs).toBe(2 * JARVIS_USAGE_WINDOW_MS);
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

    expect(snapshot.windowStartMs).toBeGreaterThanOrEqual(before);
    expect(snapshot.windowStartMs).toBeLessThanOrEqual(Date.now());
  });

  it("exposes the documented price table", () => {
    expect(JARVIS_PRICE_TABLE).toEqual({
      "claude-haiku-4-5": { inputUsdPerMtok: 1, outputUsdPerMtok: 5 },
      "claude-sonnet-5": { inputUsdPerMtok: 3, outputUsdPerMtok: 15 },
      "claude-opus-5": { inputUsdPerMtok: 5, outputUsdPerMtok: 25 },
    });
  });

  it("JARVIS_USAGE_WINDOW_MS is 5 hours", () => {
    expect(JARVIS_USAGE_WINDOW_MS).toBe(5 * 60 * 60 * 1000);
  });
});
