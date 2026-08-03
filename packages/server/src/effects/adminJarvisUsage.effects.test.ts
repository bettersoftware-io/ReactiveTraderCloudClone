import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisUsageSnapshot } from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { adminJarvisUsageEffects } from "./adminJarvisUsage.effects.js";
import type { Ctx } from "./context.js";

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
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: initial },
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
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: initial },
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: last },
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
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: initial },
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: later },
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
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: initial },
    ]);
    expect(b.sent).toEqual([
      { type: SERVER_MSG.ADMIN_JARVIS_USAGE, payload: initial },
    ]);
  });
});

interface Harness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

function harness(snapshot$: BehaviorSubject<JarvisUsageSnapshot>): Harness {
  const ctx = { usageMeter: { snapshot$ } } as unknown as Ctx;
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
