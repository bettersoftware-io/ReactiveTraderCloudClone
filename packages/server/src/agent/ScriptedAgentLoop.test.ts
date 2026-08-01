import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisEvent } from "@rtc/shared";

import {
  createServices,
  type ServiceContainer,
} from "../services/serviceContainer.js";
import { createAgentLoop } from "./agentLoop.js";

const HELP_REPLY =
  "At your service, sir. I can quote the majors, report the movers, brief you on the desk, " +
  "or execute FX orders. Sentinels, widgets and drills arrive in a later build, sir.";

beforeEach(() => {
  vi.useFakeTimers();
  // ExecutionSimulator's fill delay derives from Math.random() — left
  // unmocked here it was genuinely random (0-2000ms) every run. Pinning it
  // closes a real intermittent HANG (not just a slow pass): the fill delay
  // plus the fill reply's speech-reveal pacing (FILL_REPLY paces at ~700ms,
  // 27 chunks x 26ms) can together exceed a test's fixed
  // `advanceTimersByTimeAsync` window on an unlucky high draw (worst case
  // ~2000ms + ~700ms = ~2700ms against a 2500ms window) — the still-pending
  // reveal timer is then registered with nothing left to advance the fake
  // clock to reach it, so `await done` hangs for real until vitest's test
  // timeout kills it. See jarvis.effects.test.ts's identical pin for the
  // same rationale applied to the effects-layer equivalent of these tests.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createAgentLoop", () => {
  it("returns null when neither RTC_JARVIS_FAKE nor ANTHROPIC_API_KEY is set", () => {
    const services = createServices();

    expect(createAgentLoop({}, services)).toBeNull();
  });

  it("returns null and warns once when ANTHROPIC_API_KEY is set but no builder is wired", () => {
    const services = createServices();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loop = createAgentLoop({ ANTHROPIC_API_KEY: "sk-test" }, services);

    expect(loop).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "ANTHROPIC_API_KEY set but the Anthropic loop is not wired",
    );
    warn.mockRestore();
  });

  it("RTC_JARVIS_FAKE=1 wins even when ANTHROPIC_API_KEY is also set", () => {
    const services = createServices();
    const buildAnthropicLoop = vi.fn();

    const loop = createAgentLoop(
      { RTC_JARVIS_FAKE: "1", ANTHROPIC_API_KEY: "sk-test" },
      services,
      buildAnthropicLoop,
    );

    expect(loop).not.toBeNull();
    expect(buildAnthropicLoop).not.toHaveBeenCalled();
  });

  it("ANTHROPIC_API_KEY alone (no RTC_JARVIS_FAKE) invokes the injected builder and returns its loop — Task 6's key branch", () => {
    const services = createServices();
    const fakeLoop = { createSession: vi.fn() };
    const buildAnthropicLoop = vi.fn().mockReturnValue(fakeLoop);

    const loop = createAgentLoop(
      { ANTHROPIC_API_KEY: "sk-test" },
      services,
      buildAnthropicLoop,
    );

    expect(buildAnthropicLoop).toHaveBeenCalledExactlyOnceWith(
      { ANTHROPIC_API_KEY: "sk-test" },
      services,
    );
    expect(loop).toBe(fakeLoop);
  });

  it("returns a scripted loop when RTC_JARVIS_FAKE=1, streaming the paced help reply then completing", async () => {
    const services = createServices();
    const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

    expect(loop).not.toBeNull();

    if (!loop) {
      throw new Error("expected a non-null AgentLoop");
    }

    const session = loop.createSession();
    const events: JarvisEvent[] = [];
    const done = new Promise<void>((resolve) => {
      session.runTurn("what can you do?", []).subscribe({
        next: (event: JarvisEvent): void => {
          events.push(event);
        },
        complete: resolve,
      });
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await done;

    // Paced deltas: more than one chunk, none of them the whole reply at once.
    const deltas = events.filter((e) => {
      return e.type === "delta";
    });
    expect(deltas.length).toBeGreaterThan(1);
    expect(fullText(events)).toBe(HELP_REPLY);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("a trade turn's confirmRequest, once resolved true, executes through the container and grows the blotter's trade stream", async () => {
    const services: ServiceContainer = createServices();
    const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

    if (!loop) {
      throw new Error("expected a non-null AgentLoop");
    }

    const session = loop.createSession();
    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    const events: JarvisEvent[] = [];
    const done = new Promise<void>((resolve) => {
      session.runTurn("buy 5M EURUSD", []).subscribe({
        next: (event: JarvisEvent): void => {
          events.push(event);
        },
        complete: resolve,
      });
    });

    // ReferenceDataSimulator.getCurrencyPairs() carries a fixed 1s delay
    // before the reference-data snapshot resolves and the confirmRequest
    // is pushed.
    await vi.advanceTimersByTimeAsync(1_000);

    const confirmRequest = events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    session.resolveConfirmation(confirmRequest.confirmationId, true);

    // ExecutionSimulator delays EURUSD fills 0-2s.
    await vi.advanceTimersByTimeAsync(2_500);
    await done;

    expect(events.at(-1)).toEqual({ type: "done" });
    expect(tradeCounts.at(-1)).toBe(seededCount + 1);
  });

  it("a confirmation issued by one session cannot be resolved via a different session from the same loop (P2 cross-socket-forgery guard)", async () => {
    const services: ServiceContainer = createServices();
    const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

    if (!loop) {
      throw new Error("expected a non-null AgentLoop");
    }

    const sessionA = loop.createSession();
    const sessionB = loop.createSession();
    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    const eventsA: JarvisEvent[] = [];
    const doneA = new Promise<void>((resolve) => {
      sessionA.runTurn("buy 5M EURUSD", []).subscribe({
        next: (event: JarvisEvent): void => {
          eventsA.push(event);
        },
        complete: resolve,
      });
    });

    await vi.advanceTimersByTimeAsync(1_000);

    const confirmRequest = eventsA.find((e) => {
      return e.type === "confirmRequest";
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected session A's confirmRequest event");
    }

    // Forged: session B (a different socket's session) attempts to resolve
    // session A's confirmation. The underlying engine's pending-confirmation
    // map is process-wide, so without the per-session ownership guard this
    // would silently succeed.
    sessionB.resolveConfirmation(confirmRequest.confirmationId, true);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(tradeCounts.at(-1)).toBe(seededCount);

    // The rightful session can still resolve it afterwards.
    sessionA.resolveConfirmation(confirmRequest.confirmationId, true);
    await vi.advanceTimersByTimeAsync(2_500);
    await doneA;

    expect(eventsA.at(-1)).toEqual({ type: "done" });
    expect(tradeCounts.at(-1)).toBe(seededCount + 1);
  });

  it("cancelTurn makes a late resolveConfirmation a no-op and does not execute", async () => {
    const services: ServiceContainer = createServices();
    const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

    if (!loop) {
      throw new Error("expected a non-null AgentLoop");
    }

    const session = loop.createSession();
    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    const events: JarvisEvent[] = [];
    session.runTurn("buy 5M EURUSD", []).subscribe((event) => {
      events.push(event);
    });

    await vi.advanceTimersByTimeAsync(1_000);

    const confirmRequest = events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    session.cancelTurn();
    session.resolveConfirmation(confirmRequest.confirmationId, true);
    await vi.advanceTimersByTimeAsync(2_500);

    expect(tradeCounts.at(-1)).toBe(seededCount);
  });
});

function fullText(events: readonly JarvisEvent[]): string {
  let text = "";

  for (const event of events) {
    if (event.type === "delta") {
      text += event.text;
    }
  }

  return text;
}
