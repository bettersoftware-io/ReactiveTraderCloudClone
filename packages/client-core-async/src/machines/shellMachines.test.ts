import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BootSequenceState, WorkspaceNavState } from "@rtc/core-api";
import {
  BOOT_DURATION_MS,
  BOOT_TICK_MS,
  BOOT_VARIANTS,
  type BootVariant,
} from "@rtc/domain";

import { createBootMachine } from "#/machines/boot";
import { createWorkspaceNavMachine } from "#/machines/workspaceNav";

describe("createWorkspaceNavMachine (async)", () => {
  it("drops a switch to the tab already active and moves on a new one", () => {
    const nav = createWorkspaceNavMachine(new AbortController().signal);
    const seen: WorkspaceNavState[] = [];
    const sub = nav.state$.subscribe((s) => {
      seen.push(s);
    });
    nav.intents.switchTab("fx");
    nav.intents.switchTab("credit");

    expect(seen).toEqual([{ activeTab: "fx" }, { activeTab: "credit" }]);
    sub.unsubscribe();
  });

  // Read from a FRESH subscriber's seed after the abort: a subscriber made
  // before it stays attached to the shared source and would not tell.
  it("after the lifetime aborts, switchTab changes nothing", () => {
    const lifetime = new AbortController();
    const nav = createWorkspaceNavMachine(lifetime.signal);
    lifetime.abort();
    nav.intents.switchTab("credit");
    const fresh: WorkspaceNavState[] = [];
    nav.state$
      .subscribe((s) => {
        fresh.push(s);
      })
      .unsubscribe();

    expect(fresh).toEqual([{ activeTab: "fx" }]);
  });
});

describe("createBootMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances the persisted variant at creation and finishes after the ramp, calling onDone once", async () => {
    const advanced: string[] = [];
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: (next: BootVariant) => {
        advanced.push(next);
      },
      onDone: () => {
        done += 1;
      },
    });

    expect(advanced).toEqual([BOOT_VARIANTS[1]]);
    await vi.advanceTimersByTimeAsync(BOOT_DURATION_MS + BOOT_TICK_MS);
    expect(m.state$.getValue()).toMatchObject({ progress: 100, done: true });
    m.intents.skip();
    expect(done).toBe(1);
    m.dispose();
  });

  it("dispose stops the ramp itself — no later state for an attached subscriber — and onDone never runs", async () => {
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: () => {},
      onDone: () => {
        done += 1;
      },
    });
    const seen: BootSequenceState[] = [];
    const sub = m.state$.subscribe((s) => {
      seen.push(s);
    });
    await vi.advanceTimersByTimeAsync(BOOT_TICK_MS * 3);
    m.dispose();
    const count = seen.length;
    await vi.advanceTimersByTimeAsync(BOOT_DURATION_MS * 2);
    m.intents.skip();

    expect(seen.length).toBe(count);
    expect(done).toBe(0);
    sub.unsubscribe();
  });
});
