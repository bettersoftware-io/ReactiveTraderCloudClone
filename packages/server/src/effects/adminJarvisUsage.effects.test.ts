import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminJarvisUsagePayload, JarvisUsageSnapshot } from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type { JarvisGateConfig } from "../services/jarvisGate.js";
import { JarvisGateService, spentWindowUsd } from "../services/jarvisGate.js";
import { UsageMeter } from "../services/UsageMeter.js";
import { adminJarvisUsageEffects } from "./adminJarvisUsage.effects.js";
import type { Ctx } from "./context.js";

/** The default stand-in gate config for every test below that doesn't
 * itself exercise the budget-gate envelope — never gates, so the pushed
 * payload's `budgetUsd`/`softBudgetUsd` read `null` and `gateLevel` reads
 * `"none"` throughout. */
const UNGATED_CONFIG: JarvisGateConfig = {
  budgetUsd: "off",
  softRatio: 0.8,
  forceLevel: null,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("admin jarvis usage effects", () => {
  it("replays the current snapshot immediately on subscribe (leading emission)", () => {
    const initial = makeSnapshot({ windowStartMs: 1 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const { messages$, sent } = harness(snapshot$);

    messages$.next({
      type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });

    expect(sent).toEqual([
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(initial) },
    ]);
  });

  it("throttles a burst of emissions within the 1s window: intermediate values are dropped, only the final (trailing) one follows the immediate (leading) replay", () => {
    const initial = makeSnapshot({ windowStartMs: 0 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const { messages$, sent } = harness(snapshot$);

    messages$.next({
      type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });
    expect(sent).toHaveLength(1);

    const mid = makeSnapshot({ windowStartMs: 100 });
    const last = makeSnapshot({ windowStartMs: 900 });
    snapshot$.next(mid);
    snapshot$.next(last);

    // Still inside the 1s throttle window opened by the leading emission —
    // neither burst value has been pushed yet.
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(1_000);

    expect(sent).toEqual([
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(initial) },
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(last) },
    ]);
  });

  it("a snapshot published well after the previous throttle window closed is pushed immediately again", () => {
    const initial = makeSnapshot({ windowStartMs: 0 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const { messages$, sent } = harness(snapshot$);

    messages$.next({
      type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });
    vi.advanceTimersByTime(2_000);

    const later = makeSnapshot({ windowStartMs: 5_000 });
    snapshot$.next(later);

    expect(sent).toEqual([
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(initial) },
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(later) },
    ]);
  });

  it("two connections subscribing get independent throttle windows over the SAME snapshot$", () => {
    const initial = makeSnapshot({ windowStartMs: 0 });
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(initial);
    const a = harness(snapshot$);

    a.messages$.next({
      type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });
    vi.advanceTimersByTime(500);

    // A second connection subscribing mid-window still gets its own
    // immediate leading replay — throttleTime state is per-subscription.
    const b = harness(snapshot$);
    b.messages$.next({
      type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
      payload: {},
    });

    expect(a.sent).toEqual([
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(initial) },
    ]);
    expect(b.sent).toEqual([
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: ungatedPayload(initial) },
    ]);
  });

  describe("budget-gate envelope", () => {
    it("carries budgetUsd/softBudgetUsd/spentWindowUsd/gateLevel from a live gate and meter", () => {
      const meter = new UsageMeter();
      // $0.30: claude-sonnet-5 prices input at $3/Mtok, so 100,000 input
      // tokens costs exactly 100_000 * 3 / 1e6 = 0.3.
      meter.recordTokens("claude-sonnet-5", {
        inputTokens: 100_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      const config: JarvisGateConfig = {
        budgetUsd: 2,
        softRatio: 0.8,
        forceLevel: null,
      };
      const gate = new JarvisGateService(meter, config);
      const { messages$, sent } = harnessFor(meter, gate);

      messages$.next({
        type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });

      expect(sent).toHaveLength(1);
      const payload = sent[0]?.payload as AdminJarvisUsagePayload;
      expect(payload.budgetUsd).toBe(2);
      expect(payload.softBudgetUsd).toBe(1.6);
      expect(payload.spentWindowUsd).toBeCloseTo(0.3, 10);
      expect(payload.gateLevel).toBe("none");
    });

    it('budgetUsd: "off" (gating disabled) reports budgetUsd/softBudgetUsd as null', () => {
      const meter = new UsageMeter();
      const gate = new JarvisGateService(meter, UNGATED_CONFIG);
      const { messages$, sent } = harnessFor(meter, gate);

      messages$.next({
        type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });

      expect(sent).toHaveLength(1);
      const payload = sent[0]?.payload as AdminJarvisUsagePayload;
      expect(payload.budgetUsd).toBeNull();
      expect(payload.softBudgetUsd).toBeNull();
      expect(payload.gateLevel).toBe("none");
    });

    it('a forced hard gate reports gateLevel: "hard" regardless of actual spend', () => {
      const meter = new UsageMeter();
      const config: JarvisGateConfig = {
        budgetUsd: 2,
        softRatio: 0.8,
        forceLevel: "hard",
      };
      const gate = new JarvisGateService(meter, config);
      const { messages$, sent } = harnessFor(meter, gate);

      messages$.next({
        type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });

      expect(sent).toHaveLength(1);
      const payload = sent[0]?.payload as AdminJarvisUsagePayload;
      expect(payload.gateLevel).toBe("hard");
      expect(payload.budgetUsd).toBe(2);
      expect(payload.softBudgetUsd).toBe(1.6);
    });

    it("a recordTokens call that crosses the budget WHILE the snapshot leg is mid-throttle-window pairs the immediate hard gate with the FRESH spend, never the stale pre-recordTokens one", () => {
      const meter = new UsageMeter();
      const config: JarvisGateConfig = {
        budgetUsd: 1,
        softRatio: 0.8,
        forceLevel: null,
      };
      // Constructed before the socket subscribes, exactly like production
      // (`JarvisGateService` lives in the shared `ServiceContainer`,
      // constructed once at server/test-harness startup) — this is what
      // makes `ctx.jarvisGate`'s internal subscription to `meter.snapshot$`
      // earlier-registered than the effect's own, and so the source of the
      // reentrant-notification-order race this test targets.
      const gate = new JarvisGateService(meter, config);
      const { messages$, sent } = harnessFor(meter, gate);

      // Opens the 1s throttle window: leading emission, zero spend, "none".
      messages$.next({
        type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
        payload: {},
      });
      expect(sent).toHaveLength(1);
      expect((sent[0]?.payload as AdminJarvisUsagePayload).gateLevel).toBe(
        "none",
      );

      // Still well inside the throttle window (no leading edge available,
      // trailing not due for another second) — record $1.50 in one shot:
      // claude-sonnet-5 prices input at $3/Mtok, so 500,000 input tokens
      // costs exactly 500_000 * 3 / 1e6 = 1.5, crossing the $1 hard budget.
      // This is the reviewer's exact repro shape: a single recordTokens
      // that both produces a fresh snapshot AND flips the gate, with the
      // snapshot leg unable to emit its own fresh value yet.
      vi.advanceTimersByTime(500);
      meter.recordTokens("claude-sonnet-5", {
        inputTokens: 500_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });

      // The gate-transition leg must have pushed a SECOND frame immediately
      // (still mid-throttle-window — the routine leg's trailing frame is
      // not due for another 500ms) — and it must carry the FRESH spend
      // alongside the fresh gate level, never `{gateLevel:"hard",
      // spentWindowUsd:0}` (the bug: a stale snapshot cached before the
      // recordTokens that caused the very flip being reported).
      expect(sent).toHaveLength(2);
      const transitionFrame = sent[1]?.payload as AdminJarvisUsagePayload;
      expect(transitionFrame.gateLevel).toBe("hard");
      expect(transitionFrame.spentWindowUsd).toBeCloseTo(1.5, 10);

      // The bounded duplicate the fix accepts: once the throttle window
      // closes, the routine leg's trailing frame follows — internally
      // consistent with the same fresh pairing, never the stale one.
      vi.advanceTimersByTime(500);
      expect(sent).toHaveLength(3);
      const trailingFrame = sent[2]?.payload as AdminJarvisUsagePayload;
      expect(trailingFrame.gateLevel).toBe("hard");
      expect(trailingFrame.spentWindowUsd).toBeCloseTo(1.5, 10);
    });
  });
});

interface Harness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

/** Builds a harness over a caller-supplied `snapshot$` (a bare
 * `BehaviorSubject` stand-in for `UsageMeter`, matching the pre-existing
 * throttle-behavior tests above) paired with an `UNGATED_CONFIG` gate
 * wired to the same stream, so `gateLevel` reads `"none"` throughout and
 * the throttle-timing assertions are unaffected by the enrichment. */
function harness(snapshot$: BehaviorSubject<JarvisUsageSnapshot>): Harness {
  const gate = new JarvisGateService({ snapshot$ }, UNGATED_CONFIG);

  return harnessFor({ snapshot$ }, gate);
}

/** Builds a harness over a caller-supplied usage-meter-shaped object and
 * gate — the shared wiring for both the throttle-behavior tests (a bare
 * `{ snapshot$ }` stand-in) and the budget-gate-envelope tests (a real
 * `UsageMeter`). */
function harnessFor(
  usageMeter: Pick<UsageMeter, "snapshot$">,
  jarvisGate: JarvisGateService,
): Harness {
  const ctx = { usageMeter, jarvisGate } as unknown as Ctx;
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
  createWsListener(combineEffects(...adminJarvisUsageEffects), ctx)(socket);
  return { messages$, sent };
}

/** The enriched payload the effect produces over `UNGATED_CONFIG`, for the
 * pre-existing throttle-behavior tests above (which predate the budget-gate
 * envelope and only assert the snapshot fields carry through unchanged). */
function ungatedPayload(
  snapshot: JarvisUsageSnapshot,
): AdminJarvisUsagePayload {
  return {
    ...snapshot,
    budgetUsd: null,
    softBudgetUsd: null,
    spentWindowUsd: spentWindowUsd(snapshot),
    gateLevel: "none",
  };
}

function makeSnapshot(
  overrides: Partial<JarvisUsageSnapshot> = {},
): JarvisUsageSnapshot {
  return {
    windowStartMs: 0,
    windowEndMs: 0,
    currentWindow: [],
    sinceBoot: [],
    ...overrides,
  };
}
