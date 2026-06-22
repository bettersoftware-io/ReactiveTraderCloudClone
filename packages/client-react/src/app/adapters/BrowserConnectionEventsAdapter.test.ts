import type { Subscription } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ConnectionEvent, IDLE_TIMEOUT_MS } from "@rtc/domain";

import { BrowserConnectionEventsAdapter } from "./BrowserConnectionEventsAdapter";

describe("BrowserConnectionEventsAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits userActivity on mousemove and resets the idle timer", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub: Subscription = adapter.events().subscribe((e) => events.push(e));

    window.dispatchEvent(new Event("mousemove"));
    expect(events.at(-1)).toEqual({ type: "userActivity" });

    // Almost-idle, then activity, then full idle window — should NOT see idleTimeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    window.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(events.some((e) => e.type === "idleTimeout")).toBe(false);

    sub.unsubscribe();
  });

  it("emits idleTimeout when there is no activity for IDLE_TIMEOUT_MS", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub = adapter.events().subscribe((e) => events.push(e));
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(events.some((e) => e.type === "idleTimeout")).toBe(true);
    sub.unsubscribe();
  });

  it("emits browserOffline / browserOnline on window events", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub = adapter.events().subscribe((e) => events.push(e));
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["browserOffline", "browserOnline"]),
    );
    sub.unsubscribe();
  });

  it("clears the idle timer on teardown so no idleTimeout fires after unsubscribe", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub = adapter.events().subscribe((e) => events.push(e));

    // Tear down before the idle window elapses, then advance well past it.
    sub.unsubscribe();
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);

    expect(events.some((e) => e.type === "idleTimeout")).toBe(false);
  });

  it("removes listeners on unsubscribe", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const eventsA: ConnectionEvent[] = [];
    const eventsB: ConnectionEvent[] = [];
    const subA = adapter.events().subscribe((e) => eventsA.push(e));
    const subB = adapter.events().subscribe((e) => eventsB.push(e));
    subA.unsubscribe();
    window.dispatchEvent(new Event("mousemove"));
    expect(eventsA.length).toBe(0); // unsubscribed before event fired
    expect(eventsB.length).toBe(1); // still subscribed
    subB.unsubscribe();
    window.dispatchEvent(new Event("mousemove"));
    expect(eventsB.length).toBe(1); // no further updates after unsubscribe
  });
});
