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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAgentLoop", () => {
  it("returns null when RTC_JARVIS_FAKE is not set", () => {
    const services = createServices();

    expect(createAgentLoop({}, services)).toBeNull();
  });

  it("returns a scripted loop when RTC_JARVIS_FAKE=1, streaming the paced help reply then completing", async () => {
    const services = createServices();
    const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

    expect(loop).not.toBeNull();

    if (!loop) {
      throw new Error("expected a non-null AgentLoop");
    }

    const events: JarvisEvent[] = [];
    const done = new Promise<void>((resolve) => {
      loop.runTurn("what can you do?").subscribe({
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

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    const events: JarvisEvent[] = [];
    const done = new Promise<void>((resolve) => {
      loop.runTurn("buy 5M EURUSD").subscribe({
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

    loop.resolveConfirmation(confirmRequest.confirmationId, true);

    // ExecutionSimulator delays EURUSD fills 0-2s.
    await vi.advanceTimersByTimeAsync(2_500);
    await done;

    expect(events.at(-1)).toEqual({ type: "done" });
    expect(tradeCounts.at(-1)).toBe(seededCount + 1);
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
