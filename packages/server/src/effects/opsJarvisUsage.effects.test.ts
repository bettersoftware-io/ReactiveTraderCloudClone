import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisUsage, JarvisUsageSnapshot } from "@rtc/domain";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import {
  combineEffects,
  createWsListener,
  type Inbound,
  type Outbound,
  type Socket,
} from "@rtc/ws-effects";

import { createInMemorySpendStore } from "../services/jarvisBudget/InMemorySpendStore.js";
import { JarvisBudgetService } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { JarvisTier } from "../services/jarvisBudget/jarvisTier.js";
import type { SpendStore } from "../services/jarvisBudget/SpendStore.js";
import type { Caller } from "../services/serviceContainer.js";
import { UsageMeter } from "../services/UsageMeter.js";
import type { Ctx } from "./context.js";
import { opsJarvisUsageEffects } from "./opsJarvisUsage.effects.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ops jarvis usage effects", () => {
  it("replays the current snapshot immediately on subscribe (leading emission)", () => {
    const initial = createSnapshot({ windowStartMs: 1 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const { messages$, sent } = harness(snapshot$);

    messages$.next({
      type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });

    expect(sent).toEqual([
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(initial) },
    ]);
  });

  it("throttles a burst of emissions within the 1s window: intermediate values are dropped, only the final (trailing) one follows the immediate (leading) replay", () => {
    const initial = createSnapshot({ windowStartMs: 0 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const { messages$, sent } = harness(snapshot$);

    messages$.next({
      type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });
    expect(sent).toHaveLength(1);

    const mid = createSnapshot({ windowStartMs: 100 });
    const last = createSnapshot({ windowStartMs: 900 });
    snapshot$.next(mid);
    snapshot$.next(last);

    // Still inside the 1s throttle window opened by the leading emission —
    // neither burst value has been pushed yet.
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(1_000);

    expect(sent).toEqual([
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(initial) },
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(last) },
    ]);
  });

  it("a snapshot published well after the previous throttle window closed is pushed immediately again", () => {
    const initial = createSnapshot({ windowStartMs: 0 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const { messages$, sent } = harness(snapshot$);

    messages$.next({
      type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });
    vi.advanceTimersByTime(2_000);

    const later = createSnapshot({ windowStartMs: 5_000 });
    snapshot$.next(later);

    expect(sent).toEqual([
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(initial) },
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(later) },
    ]);
  });

  it("two connections subscribing get independent throttle windows over the SAME snapshot$", () => {
    const initial = createSnapshot({ windowStartMs: 0 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const a = harness(snapshot$);

    a.messages$.next({
      type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });
    vi.advanceTimersByTime(500);

    // A second connection subscribing mid-window still gets its own
    // immediate leading replay — throttleTime state is per-subscription.
    const b = harness(snapshot$);
    b.messages$.next({
      type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });

    expect(a.sent).toEqual([
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(initial) },
    ]);
    expect(b.sent).toEqual([
      { type: SERVER_MSG.OPS_JARVIS_USAGE, payload: unspentPayload(initial) },
    ]);
  });

  describe("the house budget envelope", () => {
    it("reports today's house-wide spend against the house cap, read from the store after a restart, over today's UTC day", async () => {
      const store = createInMemorySpendStore();
      await store.record("account:someone-else", TODAY, "house", 1.25);
      const { messages$, sent } = harnessForBudget(store);

      messages$.next({
        type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(sent).toEqual([
        {
          type: SERVER_MSG.OPS_JARVIS_USAGE,
          payload: {
            windowStartMs: DAY_START,
            windowEndMs: NEXT_MIDNIGHT,
            currentWindow: [],
            sinceBoot: [],
            budgetUsd: 3,
            softBudgetUsd: null,
            spentWindowUsd: 1.25,
            gateLevel: "none",
          },
        },
      ]);
    });

    it('reports gateLevel "hard" once the house spend reaches the cap', async () => {
      const store = createInMemorySpendStore();
      await store.record("account:someone-else", TODAY, "house", 3);
      const { messages$, sent } = harnessForBudget(store);

      messages$.next({
        type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });
      await vi.advanceTimersByTimeAsync(0);

      const payload = lastPayloadOf(sent);
      expect(payload.spentWindowUsd).toBe(3);
      expect(payload.gateLevel).toBe("hard");
    });

    it("pushes a fresh payload carrying the new house total when a turn spends, without waiting for a usage snapshot", async () => {
      const { messages$, sent, jarvisBudget } = harnessForBudget(
        createInMemorySpendStore(),
      );

      messages$.next({
        type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(sent).toHaveLength(1);

      // $0.60 on Sonnet ($3/Mtok input).
      jarvisBudget.meterFor(VIEWER, "operator").record("claude-sonnet-5", {
        inputTokens: 200_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(lastPayloadOf(sent).spentWindowUsd).toBe(0.6);
    });

    it("after midnight with no record since, shows the new day's bounds, an empty current window and a zero spend", async () => {
      const store = createInMemorySpendStore();
      await store.record("account:someone-else", TODAY, "house", 1);
      const { messages$, sent, usageMeter } = harnessForBudget(store);
      usageMeter.recordTurn("claude-haiku-4-5");

      messages$.next({
        type: CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(lastPayloadOf(sent).currentWindow).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(NEXT_MIDNIGHT - NOON);
      await vi.advanceTimersByTimeAsync(0);

      const payload = lastPayloadOf(sent);
      expect(payload.windowStartMs).toBe(NEXT_MIDNIGHT);
      expect(payload.windowEndMs).toBe(NEXT_MIDNIGHT + DAY_MS);
      expect(payload.currentWindow).toEqual([]);
      expect(payload.sinceBoot).toHaveLength(1);
      expect(payload.spentWindowUsd).toBe(0);
    });
  });
});

interface Harness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

interface BudgetHarness extends Harness {
  readonly jarvisBudget: JarvisBudgetService;
  readonly usageMeter: UsageMeter;
}

/** A connection with no caller (nothing to prime) over a caller-supplied
 * `snapshot$` — a bare `BehaviorSubject` stand-in for `UsageMeter` — and an
 * unspent budget, so the throttle-timing tests see the envelope unchanged. */
function harness(snapshot$: BehaviorSubject<JarvisUsageSnapshot>): Harness {
  const jarvisBudget = new JarvisBudgetService({
    store: createInMemorySpendStore(),
    config: DEFAULT_CONFIG,
  });

  return wire({ usageMeter: { snapshot$ }, jarvisBudget, caller: null });
}

/** A signed-in operator's connection over a real `UsageMeter` and a fresh
 * `JarvisBudgetService` on `store` — as after a restart: the service has
 * read nothing yet. */
function harnessForBudget(store: SpendStore): BudgetHarness {
  const jarvisBudget = new JarvisBudgetService({
    store,
    config: DEFAULT_CONFIG,
  });
  const usageMeter = new UsageMeter();
  const wired = wire({
    usageMeter,
    jarvisBudget,
    caller: VIEWER,
    jarvisTier: (): Promise<JarvisTier> => {
      return Promise.resolve("operator");
    },
  });

  return { ...wired, jarvisBudget, usageMeter };
}

function wire(ctxFields: Record<string, unknown>): Harness {
  const ctx = ctxFields as unknown as Ctx;
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound): void => {
      sent.push(m);
    },
  };
  createWsListener(combineEffects(...opsJarvisUsageEffects), ctx)(socket);
  return { messages$, sent };
}

function lastPayloadOf(sent: readonly Outbound[]): JarvisUsage {
  const frame = sent.at(-1);

  if (frame === undefined) {
    throw new Error("expected an ops.jarvisUsage frame");
  }

  return frame.payload as JarvisUsage;
}

/** The payload over a snapshot of today with nothing spent on the house
 * key: the default $3 cap, no soft stage. */
function unspentPayload(snapshot: JarvisUsageSnapshot): JarvisUsage {
  return {
    ...snapshot,
    budgetUsd: 3,
    softBudgetUsd: null,
    spentWindowUsd: 0,
    gateLevel: "none",
  };
}

/** A snapshot of today's window; tests tell snapshots apart by
 * `windowStartMs`. */
function createSnapshot(
  overrides: Partial<JarvisUsageSnapshot> = {},
): JarvisUsageSnapshot {
  return {
    windowStartMs: DAY_START,
    windowEndMs: NEXT_MIDNIGHT,
    currentWindow: [],
    sinceBoot: [],
    ...overrides,
  };
}

const DAY_START = Date.UTC(2026, 9, 25);

const NOON = Date.UTC(2026, 9, 25, 12);

const TODAY = "2026-10-25";

const NEXT_MIDNIGHT = Date.UTC(2026, 9, 26);

const DAY_MS = 86_400_000;

const DEFAULT_CONFIG = {
  userDailyUsd: 0.2,
  houseDailyUsd: 3,
  forceExhausted: false,
};

const VIEWER: Caller = { username: "demo", accountId: null, issuedAt: null };
