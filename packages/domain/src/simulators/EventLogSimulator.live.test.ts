import { skip } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LogEvent, Severity } from "../telemetry/log.js";
import { EventLogSimulator } from "./EventLogSimulator.js";

// The sibling EventLogSimulator.test.ts pins the six back-dated seed events.
// Everything after those seeds — the 500ms generator, its severity mix, and the
// errorBurst perturbation that the Admin incident controls drive — had no test
// at all. That generator is what the log panel shows for the entire rest of the
// session, and errorBurst is the only observable effect of the incident button.

const SEED_COUNT = 6;
const TICK_MS = 500;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EventLogSimulator live generator", () => {
  it("emits one event per 500ms tick after the seeds", () => {
    expect(generate(new EventLogSimulator(), 10)).toHaveLength(10);
  });

  it("only ever emits known services, severities and messages", () => {
    const services = new Set<string>();
    const severities = new Set<string>();

    for (const event of generate(new EventLogSimulator(), 200)) {
      services.add(event.service);
      severities.add(event.severity);
      expect(event.message).not.toBe("");
      expect(Number.isFinite(event.t)).toBe(true);
    }

    // The index lookups in generateEvent have `?? "kernel"` / `?? "Event
    // occurred"` fallbacks; an off-by-one in the index maths would surface here
    // as those placeholders leaking into the panel.
    expect([...severities].sort()).toEqual(["error", "info", "warn"]);
    expect(services).not.toContain("Event occurred");
    expect(services.size).toBeGreaterThan(1);
  });

  it("holds roughly the documented 70/20/10 mix when calm", () => {
    const events = generate(new EventLogSimulator(), 400);

    // Wide bands on purpose: this pins the SHAPE of the distribution (info
    // dominant, error rare), not the exact PRNG draw, so reseeding the
    // simulator does not spuriously fail it.
    expect(shareOf(events, "info")).toBeGreaterThan(0.55);
    expect(shareOf(events, "error")).toBeLessThan(0.2);
  });

  it("flips to an error-dominant mix under the errorBurst perturbation", () => {
    const sim = new EventLogSimulator();
    sim.perturb("errorBurst");

    const events = generate(sim, 400);

    // 80% error by design — the visible payoff of the Admin incident control.
    expect(shareOf(events, "error")).toBeGreaterThan(0.6);
    expect(shareOf(events, "info")).toBeLessThan(0.25);
  });

  it("returns to the calm mix after clearPerturbation", () => {
    const sim = new EventLogSimulator();
    sim.perturb("errorBurst");
    generate(sim, 50);
    sim.clearPerturbation();

    expect(shareOf(generate(sim, 400), "error")).toBeLessThan(0.2);
  });

  it("is deterministic for a given seed and divergent across seeds", () => {
    expect(trace(7)).toBe(trace(7));
    expect(trace(7)).not.toBe(trace(8));
  });
});

/** Drives the generator for `count` ticks and returns only the live events. */
function generate(sim: EventLogSimulator, count: number): LogEvent[] {
  const events: LogEvent[] = [];
  const sub = sim
    .events$()
    .pipe(skip(SEED_COUNT))
    .subscribe((event) => {
      events.push(event);
    });

  vi.advanceTimersByTime(TICK_MS * count);
  sub.unsubscribe();

  return events;
}

function shareOf(events: readonly LogEvent[], severity: Severity): number {
  const matching = events.filter((event) => {
    return event.severity === severity;
  });

  return matching.length / events.length;
}

function trace(seed: number): string {
  const events = generate(new EventLogSimulator(seed), 20).map((event) => {
    return [event.severity, event.service, event.message];
  });

  return JSON.stringify(events);
}
